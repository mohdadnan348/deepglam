const bcrypt = require("bcryptjs");
const Seller = require("../models/seller.model");
const User = require("../models/user.model");

// ---------- Helpers ----------
const parseMaybeJSON = (val) => {
  if (!val) return undefined;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return undefined; }
};

const normEmail = (e) => (e ? String(e).trim().toLowerCase() : undefined);

function buildAddress({ fullAddress, line1, line2, postalCode, city, state, country }) {
  let addr = parseMaybeJSON(fullAddress);
  if (!addr) {
    addr = { line1, line2, postalCode, city, state, country: country || "India" };
  }
  if (!addr?.line1 || !addr?.postalCode || !addr?.city || !addr?.state) return null;
  if (!addr.country) addr.country = "India";
  return addr;
}
// ---------- Create Seller ----------
exports.createSeller = async (req, res) => {
  try {
    const {
      name,
      phone, mobile,
      email, password,
      brandName, gstNumber,
      fullAddress, line1, line2, postalCode, city, state, country,
      aadhaarFrontUrl, aadhaarBackUrl,
    } = req.body;

    const sellerName = name;
    const sellerPhone = mobile || phone;
    const emailNorm = normEmail(email);

    if (!sellerName || !sellerPhone || !emailNorm || !password || !brandName || !gstNumber) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const addr = buildAddress({ fullAddress, line1, line2, postalCode, city, state, country });
    if (!addr) {
      return res.status(400).json({ success: false, message: "Please provide complete address (line1, postalCode, city, state)." });
    }

    // Check duplicate user
    let user = await User.findOne({ $or: [{ email: emailNorm }, { phone: sellerPhone }] });
    if (user) {
      return res.status(409).json({ success: false, message: "Email or Phone already registered" });
    }

    // Create user
    const hash = await bcrypt.hash(password, 10);
    user = await User.create({
      name: sellerName,
      email: emailNorm,
      phone: sellerPhone,
      password: hash,
      role: "seller",
      fullAddress: addr,
      isApproved: false, // approval pending
    });

    // Create seller profile
    const seller = await Seller.create({
      userId: user._id,
      brandName,
      gstNumber,
      fullAddress: addr,
      aadhaarCard: {
        front: { url: aadhaarFrontUrl || undefined },
        back: { url: aadhaarBackUrl || undefined },
      },
      isActive: false // waiting for admin approval
    });

    res.status(201).json({ success: true, message: "Seller created, waiting for approval", seller });
  } catch (error) {
    console.error("Seller creation failed:", error);
    res.status(500).json({ success: false, message: "Seller creation failed", error: error.message });
  }
};


// ---------- Get All Sellers ----------
exports.getAllSellers = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status === "approved") filter.isActive = true;
    if (status === "pending") filter.isActive = false;

    const sellers = await Seller.find(filter)
      .populate("userId", "name email phone isApproved")
      .sort({ createdAt: -1 });

    res.json(sellers);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch sellers", error: err.message });
  }
};

// ---------- Approve Seller ----------
exports.approveSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    const user = await User.findById(seller.userId);
    if (!user) return res.status(404).json({ message: "User not found for this seller" });

    seller.isActive = true;
    await seller.save();

    user.isApproved = true;
    await user.save();

    res.status(200).json({ message: "Seller approved successfully", seller, user });
  } catch (err) {
    console.error("approveSeller error:", err);
    res.status(500).json({ message: "Failed to approve seller", error: err.message });
  }
};

// ---------- Reject Seller ----------
exports.rejectSeller = async (req, res) => {
  try {
    const { reason } = req.body;
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    seller.isActive = false;
    seller.isRejected = true;
    seller.rejectReason = reason;
    await seller.save();

    await User.findByIdAndUpdate(seller.userId, { isApproved: false });

    res.json({ message: "Seller rejected" });
  } catch (err) {
    res.status(500).json({ message: "Rejection failed", error: err.message });
  }
};

// ---------- Update Seller ----------
exports.updateSeller = async (req, res) => {
  try {
    const { name, fullName, phone, mobile, email, brandName, gstNumber, fullAddress, line1, line2, postalCode, city, state, country, aadhaarFrontUrl, aadhaarBackUrl } = req.body;

    const up = {};
    if (brandName) up.brandName = brandName;
    if (gstNumber) up.gstNumber = gstNumber;

    const addr = buildAddress({ fullAddress, line1, line2, postalCode, city, state, country });
    if (addr) up.fullAddress = addr;

    if (aadhaarFrontUrl || aadhaarBackUrl) {
      up.aadhaarCard = {
        ...(aadhaarFrontUrl ? { front: { url: aadhaarFrontUrl } } : {}),
        ...(aadhaarBackUrl ? { back: { url: aadhaarBackUrl } } : {}),
      };
    }

    const seller = await Seller.findByIdAndUpdate(req.params.id, up, { new: true });
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    // Sync with User
    if (name || fullName || phone || mobile || email) {
      const userPatch = {};
      if (name || fullName) userPatch.name = fullName || name;
      if (phone || mobile) userPatch.phone = mobile || phone;
      if (email) userPatch.email = normEmail(email);
      await User.findByIdAndUpdate(seller.userId, userPatch, { new: true });
    }

    res.json({ message: "Seller updated", seller });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
};
exports.getDisapprovedSellers = async (req, res) => {
  try {
    const {
      search,
      city,
      state,
      from,
      to,
      sort = "createdAt",
      dir = "desc",
      page = 1,
      limit = 20,
    } = req.query;

    // Disapproved = either rejected (explicit) OR inactive (not approved / disabled)
    const filter = {
      $or: [{ isRejected: true }, { isActive: false }],
    };

    // Search across brandName/gstNumber/address + user fields
    if (search) {
      const rx = new RegExp(String(search).trim(), "i");
      filter.$and = (filter.$and || []).concat([
        {
          $or: [
            { brandName: rx },
            { gstNumber: rx },
            { "fullAddress.city": rx },
            { "fullAddress.state": rx },
            // user fields via populate can't be directly queried here;
            // If you want to query user fields, you can denormalize on Seller,
            // or do a two-step lookup. For now, we keep Seller-side search.
          ],
        },
      ]);
    }

    if (city) {
      filter["fullAddress.city"] = new RegExp(String(city).trim(), "i");
    }
    if (state) {
      filter["fullAddress.state"] = new RegExp(String(state).trim(), "i");
    }

    // Date range (inclusive "to")
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate)) {
          toDate.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = toDate;
        }
      }
    }

    const sortSpec = { [sort]: String(dir).toLowerCase() === "asc" ? 1 : -1 };
    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Seller.find(filter)
        .populate("userId", "name email phone isApproved")
        .sort(sortSpec)
        .skip(skip)
        .limit(Number(limit)),
      Seller.countDocuments(filter),
    ]);

    return res.json({
      items,
      total,
      page: Number(page),
      pages: Math.max(1, Math.ceil(total / Number(limit))),
    });
  } catch (err) {
    console.error("getDisapprovedSellers error:", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch disapproved sellers", error: err.message });
  }
};
// ---------- Get Seller by ID ----------
exports.getSellerById = async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id).populate("userId");
    if (!seller) return res.status(404).json({ message: "Seller not found" });
    res.json(seller);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
};
