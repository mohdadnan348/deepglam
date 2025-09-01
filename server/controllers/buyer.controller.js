// server/controllers/buyer.controller.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Buyer = require("../models/buyer.model");
const User = require("../models/user.model");
const Staff = require("../models/staff.model");      // for auto-linking to staff
const Order = require("../models/order.model");      // for buyerOrders
const { generateToken } = require("../utils/token.utils");

// ---------- Helpers ----------
const maybeJSON = (v) => {
  if (v == null) return undefined;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return undefined; }
};
const toImageObj = (url) => (url ? { url, public_id: undefined } : undefined);
const normalizeDocType = (t = "") => {
  const x = String(t).trim().toLowerCase();
  if (["aadhaar","aadhaar card","aadhar","aadhar card"].includes(x)) return "AADHAAR";
  if (["pan","pan card"].includes(x)) return "PAN";
  if (["udyam","udyam certificate"].includes(x)) return "UDYAM";
  if (["gst","gst certificate"].includes(x)) return "GST";
  return "OTHER";
};
async function getStaffFromRequest(req, session) {
  // Prefer userId -> staff link
  if (req.user?._id) {
    const byUser = await Staff.findOne({ userId: req.user._id }).session(session);
    if (byUser) return byUser;
  }
  // Fallbacks by phone/email
  if (req.user?.phone) {
    const byPhone = await Staff.findOne({ phone: req.user.phone }).session(session);
    if (byPhone) return byPhone;
  }
  if (req.user?.email) {
    const byEmail = await Staff.findOne({ email: (req.user.email || "").toLowerCase() }).session(session);
    if (byEmail) return byEmail;
  }
  return null;
}

// ---------- Controllers ----------

/**
 * POST /buyers
 * Body (minimal required): { name, mobile, gender, shopName, shopAddress }
 * Optional: { email, password, documents, bank..., employeeCode, staffId, shopImageUrl, country/state/city/postalCode }
 * Behavior:
 *  - Auto-resolve staff from req.user (logged-in staff). Fallback: staffId/employeeCode if provided.
 *  - Find-or-create User for buyer on mobile/email (random password fallback).
 *  - Create Buyer with isApproved=true (no approval flow).
 */
exports.createBuyer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      // minimal required
      name, mobile, gender, shopName,

      // optional
      email, password,
      shopAddress, country, state, city, postalCode,
      documents, shopImageUrl,
      bankName, branchName, accountHolderName, accountNumber, ifscCode, beneficiaryName,

      // OPTIONAL fallbacks if not logged-in as staff
      employeeCode, staffId,
    } = req.body;

    if (!name || !mobile || !gender || !shopName) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ message: "name, mobile, gender, shopName are required" });
    }

    // 1) Resolve staff: prefer logged-in staff, else fallback to provided staffId/employeeCode
    let staff = await getStaffFromRequest(req, session);
    if (!staff && staffId) staff = await Staff.findById(staffId).session(session);
    if (!staff && employeeCode) {
      staff = await Staff.findOne({ employeeCode: String(employeeCode).trim() }).session(session);
    }
    if (!staff) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ message: "Staff not resolved. Login as staff or provide valid employeeCode/staffId." });
    }

    // 2) Address normalize
    const addr = maybeJSON(shopAddress) || (typeof shopAddress === "string"
      ? { line1: shopAddress, state, city, postalCode, country }
      : shopAddress);
    if (!addr || !addr.line1 || !addr.state || !addr.city || !addr.postalCode) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ message: "shopAddress must include line1, state, city, postalCode" });
    }

    // 3) Avoid duplicate Buyer
    const emailNorm = email ? String(email).trim().toLowerCase() : undefined;
    const dup = await Buyer.findOne({
      $or: [{ mobile }, ...(emailNorm ? [{ email: emailNorm }] : [])]
    }).session(session);
    if (dup) {
      await session.abortTransaction(); session.endSession();
      return res.status(409).json({ message: "Buyer already exists with same mobile/email" });
    }

    // 4) Find-or-create User for buyer (mobile/email)
    let buyerUser = await User.findOne({
      $or: [{ phone: mobile }, ...(emailNorm ? [{ email: emailNorm }] : [])],
    }).session(session);

    if (!buyerUser) {
      const hash = await bcrypt.hash(password || Math.random().toString(36).slice(-8), 10);
      buyerUser = await User.create([{
        name,
        phone: mobile,
        email: emailNorm,
        password: hash,
        role: "buyer",
        isActive: true,
      }], { session }).then(a => a[0]);
    } else {
      if (!buyerUser.name) buyerUser.name = name;
      if (emailNorm && !buyerUser.email) buyerUser.email = emailNorm;
      if (!buyerUser.password) buyerUser.password = await bcrypt.hash(password || Math.random().toString(36).slice(-8), 10);
      if (!buyerUser.role) buyerUser.role = "buyer";
      await buyerUser.save({ session });
    }

    // 5) Documents normalize
    let docs = maybeJSON(documents) ?? documents ?? [];
    if (!Array.isArray(docs)) docs = [docs];
    const mappedDocs = docs.filter(Boolean).map(d => ({
      type: normalizeDocType(d.type),
      number: d.number,
      file: toImageObj(d.fileUrl),
    }));

    // 6) Create Buyer (auto-approved) & link to staff + user
    const buyerDoc = await Buyer.create([{
      // ownership
      staffId: staff._id,
      staffCode: staff.employeeCode,
      assignedAt: new Date(),
      employeeCode: staff.employeeCode, // legacy mirror if used elsewhere

      // user link
      userId: buyerUser._id,

      // identity
      name,
      mobile,
      email: emailNorm,
      gender,
      passwordHash: password ? await bcrypt.hash(password, 10) : undefined,

      // shop
      shopName,
      shopImage: toImageObj(shopImageUrl),
      shopAddress: {
        line1: addr.line1,
        line2: addr.line2,
        country: addr.country || country || "India",
        state: addr.state,
        city: addr.city,
        postalCode: addr.postalCode,
      },

      // mirrors (quick filters)
      country: addr.country || country || "India",
      state: addr.state,
      city: addr.city,
      postalCode: addr.postalCode,

      documents: mappedDocs,

      bank: { bankName, branchName, accountHolderName, accountNumber, ifscCode, beneficiaryName },

      // 🚫 No approval flow
      isApproved: true,
    }], { session }).then(a => a[0]);

    // Optional auth token if you want to log buyer in immediately
    const token = generateToken({ id: buyerUser._id, role: buyerUser.role || "buyer" });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: "Buyer created (auto-linked to staff & user)",
      buyer: buyerDoc,
      user: { _id: buyerUser._id, name: buyerUser.name, phone: buyerUser.phone, email: buyerUser.email, role: buyerUser.role },
      token
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err?.code === 11000) {
      const msg =
        (err.keyPattern?.phone && "Phone already exists") ||
        (err.keyPattern?.email && "Email already exists") ||
        "Duplicate key";
      return res.status(409).json({ message: msg });
    }
    console.error("createBuyer error:", err);
    return res.status(500).json({ message: "Failed to create buyer", error: err.message });
  }
};

/**
 * PATCH /buyers/:id
 * - Replaces docs if provided
 * - Replaces shopImage if provided (via URL param here)
 */
exports.updateBuyer = async (req, res) => {
  try {
    const {
      name, mobile, email, gender,
      shopName, shopAddress, country, state, city, postalCode,
      documents,
      bankName, branchName, accountHolderName, accountNumber, ifscCode, beneficiaryName,
      shopImageUrl,
      password,
    } = req.body;

    const up = {};
    if (name) up.name = name;
    if (mobile) up.mobile = mobile;
    if (email) up.email = String(email).trim().toLowerCase();
    if (gender) up.gender = gender;
    if (shopName) up.shopName = shopName;
    if (shopImageUrl) up.shopImage = toImageObj(shopImageUrl);

    // address (object or JSON)
    const addr = maybeJSON(shopAddress);
    if (addr && typeof addr === "object") {
      up.shopAddress = {
        line1: addr.line1,
        line2: addr.line2,
        country: addr.country || country || "India",
        state: addr.state,
        city: addr.city,
        postalCode: addr.postalCode,
      };
      up.country = up.shopAddress.country;
      up.state = up.shopAddress.state;
      up.city = up.shopAddress.city;
      up.postalCode = up.shopAddress.postalCode;
    } else {
      if (country) up.country = country;
      if (state) up.state = state;
      if (city) up.city = city;
      if (postalCode) up.postalCode = postalCode;
    }

    // password reset
    if (password) {
      const salt = await bcrypt.genSalt(10);
      up.passwordHash = await bcrypt.hash(password, salt);
    }

    // documents (replace if sent)
    if (typeof documents !== "undefined") {
      let docs = maybeJSON(documents) ?? documents ?? [];
      if (!Array.isArray(docs)) docs = [docs];
      up.documents = docs.filter(Boolean).map(d => ({
        type: normalizeDocType(d.type),
        number: d.number,
        file: toImageObj(d.fileUrl),
      }));
    }

    // bank partial update
    if (bankName || branchName || accountHolderName || accountNumber || ifscCode || beneficiaryName) {
      up.bank = {
        ...(bankName ? { bankName } : {}),
        ...(branchName ? { branchName } : {}),
        ...(accountHolderName ? { accountHolderName } : {}),
        ...(accountNumber ? { accountNumber } : {}),
        ...(ifscCode ? { ifscCode } : {}),
        ...(beneficiaryName ? { beneficiaryName } : {}),
      };
    }

    const buyer = await Buyer.findByIdAndUpdate(req.params.id, up, { new: true });
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    res.json({ message: "Buyer updated", buyer });
  } catch (err) {
    console.error("updateBuyer error:", err);
    res.status(500).json({ message: "Failed to update buyer", error: err.message });
  }
};



// 📌 Update Buyer Address
exports.updateBuyerAddress = async (req, res) => {
  try {
    const { id } = req.params; // Buyer._id
    const { address, city, state, pincode, country = "India", fullAddress } = req.body;

    // ✅ Buyer find
    const buyer = await Buyer.findById(id);
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    // ✅ Update address fields
    buyer.shopAddress = {
      line1: address || buyer.shopAddress?.line1 || "",
      city: city || buyer.shopAddress?.city || "",
      state: state || buyer.shopAddress?.state || "",
      postalCode: pincode || buyer.shopAddress?.postalCode || "",
      country: country || buyer.shopAddress?.country || "India",
    };

    // ✅ Optional: Save fullAddress as a separate field
    if (fullAddress) buyer.fullAddress = fullAddress;

    await buyer.save();

    res.json({ ok: true, message: "Address updated successfully", buyer });
  } catch (err) {
    console.error("updateBuyerAddress error:", err);
    res.status(500).json({ message: "Failed to update address", error: err.message });
  }
};

/**
 * GET /buyers/:id
 */
exports.getBuyerById = async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.params.id);
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });
    res.json(buyer);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch buyer", error: err.message });
  }
};

/**
 * GET /buyers
 * Query:
 *  - search: text
 *  - mine=true : only buyers created/owned by logged-in staff
 *  - page, limit
 */
exports.getAllBuyers = async (req, res) => {
  try {
    const { search, mine, page = 1, limit = 20 } = req.query;
    const q = {};

    if (mine === "true" && (req.user?.role === "staff" || req.auth?.role === "staff")) {
      const staff = await getStaffFromRequest(req);
      if (staff) q.$or = [{ staffId: staff._id }, { staffCode: staff.employeeCode }];
      // If no staff resolved (shouldn't happen for staff role), return empty
      if (!staff) return res.json({ items: [], total: 0, page: Number(page), pages: 1 });
    }

    if (search) {
      q.$or = (q.$or || []).concat([
        { shopName: new RegExp(search, "i") },
        { name: new RegExp(search, "i") },
        { mobile: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
      ]);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Buyer.find(q).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Buyer.countDocuments(q),
    ]);
    res.json({ items, total, page: Number(page), pages: Math.max(1, Math.ceil(total / Number(limit))) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch buyers", error: err.message });
  }
};

/**
 * DELETE /buyers/:id
 */
exports.deleteBuyer = async (req, res) => {
  try {
    const deleted = await Buyer.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Buyer not found" });
    res.json({ message: "Buyer deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete buyer", error: err.message });
  }
};

/**
 * GET /buyers/:id/orders
 * (Optional helper) — list all orders for a buyer
 */
exports.getBuyerOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 20, from, to, q } = req.query;

    const filter = { buyerId: id };
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to + "T23:59:59.999Z");
    }
    if (q) {
      const regex = new RegExp(q, "i");
      filter.$or = [{ orderNo: regex }, { buyerName: regex }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Order.countDocuments(filter),
    ]);
    res.json({ items, total, page: Number(page), pages: Math.max(1, Math.ceil(total / Number(limit))) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch buyer orders", error: err.message });
  }
};
