// controllers/seller.controller.js
const bcrypt = require("bcryptjs");
const dayjs = require("dayjs");
const mongoose = require("mongoose");
const Seller = require("../models/seller.model");
const User = require("../models/user.model");
const Product = require("../models/product.model");
const Order = require("../models/order.model");

/* ---------------- Helpers ---------------- */
const parseMaybeJSON = (val) => {
  if (!val) return undefined;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return undefined; }
};

const normEmail = (e) => (e ? String(e).trim().toLowerCase() : undefined);

function buildAddress({ fullAddress, line1, line2, postalCode, city, state, country }) {
  let addr = parseMaybeJSON(fullAddress);
  if (!addr) addr = { line1, line2, postalCode, city, state, country: country || "India" };
  if (!addr?.line1 || !addr?.postalCode || !addr?.city || !addr?.state) return null;
  if (!addr.country) addr.country = "India";
  return addr;
}

// ✅ ADDED: Missing resolveSellerId function
const resolveSellerId = async (req) => {
  // Fast path from verifyJWT middleware
  if (req.user?.sellerId) {
    return req.user.sellerId;
  }

  if (!req.user?._id) {
    throw new Error("User not authenticated");
  }

  // Fallback: find seller by userId
  const seller = await Seller.findOne({ userId: req.user._id });
  if (!seller) {
    throw new Error("Seller not found for this user");
  }

  return seller._id;
};

/* ---------------- Create Seller ---------------- */
exports.createSeller = async (req, res) => {
  try {
    const {
      name, phone, mobile, email, password,
      brandName, gstNumber,
      fullAddress, line1, line2, postalCode, city, state, country,
      aadhaarFrontUrl, aadhaarBackUrl,
    } = req.body;

    const sellerName = name;
    const sellerPhone = mobile || phone;
    const emailNorm = normEmail(email);

    if (!sellerName || !sellerPhone || !emailNorm || !password || !brandName) {
      return res.status(400).json({ 
        ok: false, // ✅ Changed to ok for consistency
        message: "Missing required fields" 
      });
    }

    const addr = buildAddress({ fullAddress, line1, line2, postalCode, city, state, country });
    if (!addr) {
      return res.status(400).json({ 
        ok: false, 
        message: "Please provide complete address (line1, postalCode, city, state)." 
      });
    }

    let user = await User.findOne({ $or: [{ email: emailNorm }, { phone: sellerPhone }] });
    if (user) {
      return res.status(409).json({ 
        ok: false, 
        message: "Email or Phone already registered" 
      });
    }

    const hash = await bcrypt.hash(password, 10);
    user = await User.create({
      name: sellerName,
      email: emailNorm,
      phone: sellerPhone,
      passwordHash: hash, // ✅ Fixed: passwordHash not password
      role: "seller",
      fullAddress: addr,
      isApproved: false,
    });

    const seller = await Seller.create({
      userId: user._id,
      brandName,
      gstNumber,
      fullAddress: addr,
      aadhaarCard: {
        front: { url: aadhaarFrontUrl || undefined },
        back: { url: aadhaarBackUrl || undefined },
      },
      isActive: false,
    });

    res.status(201).json({ 
      ok: true, // ✅ Changed to ok for consistency
      message: "Seller created, waiting for approval", 
      data: seller 
    });
  } catch (error) {
    console.error("Seller creation failed:", error);
    res.status(500).json({ 
      ok: false, 
      message: "Seller creation failed", 
      error: error.message 
    });
  }
};

/* ---------------- Get All Sellers (Admin) ---------------- */
exports.getAllSellers = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    
    const filter = {};
    if (status === "approved") filter.isActive = true;
    if (status === "pending") filter.isActive = false;
    if (status === "rejected") filter.isRejected = true;

    // ✅ Added search functionality
    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { brandName: regex },
        { gstNumber: regex },
        { "fullAddress.city": regex },
        { "fullAddress.state": regex }
      ];
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [sellers, total] = await Promise.all([
      Seller.find(filter)
        .populate("userId", "name email phone isApproved")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Seller.countDocuments(filter)
    ]);

    res.json({
      ok: true,
      data: sellers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({ 
      ok: false, 
      message: "Failed to fetch sellers", 
      error: err.message 
    });
  }
};

/* ---------------- Approve / Reject Seller ---------------- */
exports.approveSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ ok: false, message: "Seller not found" });
    }

    const user = await User.findById(seller.userId);
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found for this seller" });
    }

    seller.isActive = true;
    seller.isRejected = false; // ✅ Clear rejection status
    seller.rejectReason = undefined; // ✅ Clear reject reason
    await seller.save();
    
    user.isApproved = true;
    await user.save();

    res.json({ 
      ok: true, 
      message: "Seller approved successfully", 
      data: { seller, user } 
    });
  } catch (err) {
    res.status(500).json({ 
      ok: false, 
      message: "Failed to approve seller", 
      error: err.message 
    });
  }
};

exports.rejectSeller = async (req, res) => {
  try {
    const { reason } = req.body;
    const seller = await Seller.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ ok: false, message: "Seller not found" });
    }

    seller.isActive = false;
    seller.isRejected = true;
    seller.rejectReason = reason;
    await seller.save();

    await User.findByIdAndUpdate(seller.userId, { isApproved: false });
    
    res.json({ ok: true, message: "Seller rejected successfully" });
  } catch (err) {
    res.status(500).json({ 
      ok: false, 
      message: "Rejection failed", 
      error: err.message 
    });
  }
};

/* ---------------- Update Seller (by logged-in seller) ---------------- */
exports.updateSeller = async (req, res) => {
  try {
    const {
      name, fullName, phone, mobile, email,
      brandName, gstNumber,
      fullAddress, line1, line2, postalCode, city, state, country,
      aadhaarFrontUrl, aadhaarBackUrl
    } = req.body;

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

    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ 
        ok: false, 
        message: "Seller not found for this user" 
      });
    }

    const seller = await Seller.findByIdAndUpdate(sellerId, up, { new: true });
    if (!seller) {
      return res.status(404).json({ ok: false, message: "Seller not found" });
    }

    // Sync user fields
    if (name || fullName || phone || mobile || email) {
      const userPatch = {};
      if (name || fullName) userPatch.name = fullName || name;
      if (phone || mobile) userPatch.phone = mobile || phone;
      if (email) userPatch.email = normEmail(email);
      await User.findByIdAndUpdate(seller.userId, userPatch, { new: true });
    }

    res.json({ ok: true, message: "Seller updated successfully", data: seller });
  } catch (err) {
    res.status(500).json({ 
      ok: false, 
      message: "Update failed", 
      error: err.message 
    });
  }
};

/* ---------------- My Stats ---------------- */
exports.getMyStats = async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(400).json({ 
        ok: false, 
        message: "Seller not found for this user" 
      });
    }

    // ✅ Updated to use correct field names for new schema
    const productIds = await Product.find({ sellerUserId: sellerId }).distinct("_id");
    const start = dayjs().startOf("day").toDate();
    const end = dayjs().endOf("day").toDate();

    const [totalProducts, totalOrders, todayOrders, cancelledOrders, returnedOrders, deliveredOrders] = await Promise.all([
      Product.countDocuments({ sellerUserId: sellerId }),
      Order.countDocuments({ "products.sellerUserId": sellerId }),
      Order.countDocuments({ "products.sellerUserId": sellerId, createdAt: { $gte: start, $lte: end } }),
      Order.countDocuments({ "products.sellerUserId": sellerId, status: "cancelled" }),
      Order.countDocuments({ "products.sellerUserId": sellerId, status: "returned" }),
      Order.countDocuments({ "products.sellerUserId": sellerId, status: "delivered" }),
    ]);

    res.json({ 
      ok: true, 
      data: { 
        sellerId, 
        stats: { 
          totalProducts, 
          totalOrders, 
          todayOrders, 
          cancelledOrders, 
          returnedOrders, 
          deliveredOrders 
        } 
      }
    });
  } catch (err) {
    res.status(500).json({ 
      ok: false, 
      message: "Failed to load seller stats", 
      error: err.message 
    });
  }
};

/* ---------------- Get Disapproved Sellers (Admin) ---------------- */
exports.getDisapprovedSellers = async (req, res) => {
  try {
    const { search, city, state, from, to, sort = "createdAt", dir = "desc", page = 1, limit = 20 } = req.query;

    const filter = { $or: [{ isRejected: true }, { isActive: false }] };

    if (search) {
      const rx = new RegExp(String(search).trim(), "i");
      filter.$and = (filter.$and || []).concat([{
        $or: [
          { brandName: rx },
          { gstNumber: rx },
          { "fullAddress.city": rx },
          { "fullAddress.state": rx },
        ]
      }]);
    }
    if (city) filter["fullAddress.city"] = new RegExp(String(city).trim(), "i");
    if (state) filter["fullAddress.state"] = new RegExp(String(state).trim(), "i");

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

    res.json({ 
      ok: true,
      data: items, 
      pagination: {
        total, 
        page: Number(page), 
        pages: Math.max(1, Math.ceil(total / Number(limit))),
        limit: Number(limit)
      }
    });
  } catch (err) {
    res.status(500).json({ 
      ok: false, 
      message: "Failed to fetch disapproved sellers", 
      error: err.message 
    });
  }
};

/* ---------------- Get Seller by Id (Admin/Support) ---------------- */
exports.getSellerById = async (req, res) => {
  try {
    const { id } = req.params;

    const seller = await Seller.findById(id)
      .populate("userId", "email phone role isActive isApproved")
      .lean();

    if (!seller) {
      return res.status(404).json({ ok: false, message: "Seller not found" });
    }

    return res.json({
      ok: true,
      data: {
        ...seller,
        sellerId: seller._id,
        userId: seller.userId?._id,
        email: seller.userId?.email,
        phone: seller.userId?.phone,
        role: seller.userId?.role,
      },
    });
  } catch (err) {
    console.error("getSellerById error:", err);
    return res.status(500).json({ 
      ok: false, 
      message: "Failed to fetch seller",
      error: err.message 
    });
  }
};
// ✅ Get currently logged-in seller's profile
exports.getMyProfile = async (req, res) => {
  try {
    // Agar aapke paas helper hai:
    // const sellerId = await resolveSellerId(req);
    // use kar sakte ho; warna niche direct logic bhi kaam karega.

    let sellerId;

    // Check if sellerId is in req.user (depends on your JWT structure)
    if (req.user?.sellerId) {
      sellerId = req.user.sellerId;
    } else {
      // Fallback: find seller by userId (user._id from JWT)
      const seller = await Seller.findOne({ userId: req.user._id });
      if (!seller) {
        return res.status(404).json({
          ok: false,
          message: "Seller not found for this user",
        });
      }
      sellerId = seller._id;
    }

    const seller = await Seller.findById(sellerId)
      .populate("userId", "name email phone role")
      .lean();

    if (!seller) {
      return res.status(404).json({
        ok: false,
        message: "Seller not found",
      });
    }

    // ✅ Structure matches what your frontend expects
    return res.json({
      ok: true,
      data: {
        sellerId: seller._id,
        userId: seller.userId?._id,
        name: seller.userId?.name,
        email: seller.userId?.email,
        phone: seller.userId?.phone,
        brandName: seller.brandName,
        gstNumber: seller.gstNumber,
        status: seller.status,
        createdAt: seller.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ Error in getMyProfile:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch seller profile",
      error: error.message,
    });
  }
};
