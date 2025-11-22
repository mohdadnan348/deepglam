// controllers/buyer.controller.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const BuyerProfile = require("../models/buyer.model");
const Order = require("../models/order.model");
const ReturnRequest = require("../models/return.model");

// helper
const toInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

const isAdmin = (req) => ["admin", "superadmin"].includes(req.user?.role);
const isStaff = (req) => req.user?.role === "staff";

/**
 * CREATE BUYER (robust, defensive)
 */
exports.createBuyer = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      password,
      employeeCode,
      gender,
      shopName,
      shopImage,
      shopAddressLine1,
      shopAddressLine2,
      city,
      state,
      postalCode,
      country = "India",
      documentType,
      documentNumber,
      documentImage,
      bankName,
      branchName,
      accountHolderName,
      accountNumber,
      ifscCode,
      upiId
    } = req.body;

    // Basic validation
    if (!name || !phone || !password || !employeeCode || !gender || !shopName) {
      return res.status(400).json({
        ok: false,
        message: "Name, phone, password, employee code, gender, and shop name are required"
      });
    }
    if (!shopAddressLine1 || !city || !state || !postalCode) {
      return res.status(400).json({
        ok: false,
        message: "Complete shop address is required"
      });
    }

    console.debug("createBuyer:start", { phone, employeeCode });

    // Normalize
    const phoneNorm = phone.toString().trim();
    const emailNorm = email ? email.toString().trim().toLowerCase() : undefined;

    // Check existing user
    const existingUser = await User.findOne({
      $or: [
        { phone: phoneNorm },
        ...(emailNorm ? [{ email: emailNorm }] : [])
      ]
    });

    if (existingUser) {
      const existingProfile = await BuyerProfile.findOne({ userId: existingUser._id });
      if (existingProfile) {
        return res.status(400).json({
          ok: false,
          message: "Buyer already exists with this phone or email"
        });
      }
    }

    // --------------------------
    // Robust staff lookup
    // --------------------------
    const code = (employeeCode || "").toString().trim().toUpperCase();
    let staffUser = null;

    try {
      // 1) Try User collection (some apps store staff as users)
      staffUser = await User.findOne({ role: "staff", employeeCode: code });
      if (staffUser) {
        console.debug("createBuyer: staff found in User collection", { userId: staffUser._id.toString(), code });
      }
    } catch (err) {
      console.warn("createBuyer: User.findOne error:", err?.message || err);
    }

    if (!staffUser) {
      // 2) Fallback: try Staff model if exists (separate collection)
      try {
        const StaffModel = require("../models/staff.model"); // may throw if file missing
        const staffDoc = await StaffModel.findOne({ employeeCode: code }).lean();
        if (staffDoc && staffDoc.userId) {
          staffUser = await User.findById(staffDoc.userId);
          if (staffUser) {
            console.debug("createBuyer: found staff via StaffModel -> linked User", { staffDocId: staffDoc._id?.toString(), linkedUserId: staffUser._id?.toString() });
          } else {
            console.warn("createBuyer: StaffModel found but linked User not found", { staffDocId: staffDoc._id?.toString(), linkedUserId: staffDoc.userId });
          }
        } else {
          console.debug("createBuyer: StaffModel returned no doc for code", code);
        }
      } catch (err) {
        // model missing or lookup failed
        console.warn("createBuyer: StaffModel require/lookup failed (ok if no Staff model):", err?.message || err);
      }
    }

    if (!staffUser) {
      return res.status(400).json({
        ok: false,
        message: "Staff not found for employee code: " + employeeCode
      });
    }

    // --------------------------
    // Create user + buyer profile (transaction if supported)
    // --------------------------
    let session = null;
    let useTransactions = true;
    try {
      session = await mongoose.startSession();
      // some Mongo setups (standalone) might not support transactions; try-catch below will fallback
      session.startTransaction();
    } catch (txErr) {
      useTransactions = false;
      if (session) session.endSession();
      console.warn("createBuyer: transactions not supported, will use non-transactional flow:", txErr?.message || txErr);
    }

    const doSave = async () => {
      // Create user if not exist
      let user = existingUser;
      if (!user) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = new User({
          name: name.trim(),
          phone: phoneNorm,
          email: emailNorm,
          passwordHash: hashedPassword,
          role: "buyer",
          isActive: true,
          isVerified: false
        });

        if (useTransactions) await user.save({ session });
        else await user.save();
        console.debug("createBuyer: new User created", { userId: user._id.toString() });
      }

      // Defensive: normalize images if present
      const safeShopImage = (shopImage && typeof shopImage === "object" && shopImage.url) ? { url: shopImage.url, public_id: shopImage.public_id || "" } : undefined;
      const safeDocImage = (documentImage && typeof documentImage === "object" && documentImage.url) ? { url: documentImage.url, public_id: documentImage.public_id || "" } : undefined;

      // Build buyer profile
      const buyerProfile = new BuyerProfile({
        userId: user._id,
        staffUserId: staffUser._id,
        employeeCode: code,
        gender: (gender || "").toString().trim(),

        shopName: shopName.toString().trim(),
        shopImage: safeShopImage,

        shopAddress: {
          line1: shopAddressLine1.toString().trim(),
          line2: shopAddressLine2 ? shopAddressLine2.toString().trim() : "",
          city: city.toString().trim(),
          state: state.toString().trim(),
          postalCode: postalCode.toString().trim(),
          country: country || "India"
        },

        documents: (documentType && documentNumber && safeDocImage) ? [{
          type: (documentType || "").toString().toUpperCase(),
          number: (documentNumber || "").toString().trim(),
          file: safeDocImage,
          isVerified: false
        }] : [],

        bankDetails: {
          bankName: bankName ? bankName.toString().trim() : "",
          branchName: branchName ? branchName.toString().trim() : "",
          accountHolderName: accountHolderName ? accountHolderName.toString().trim() : "",
          accountNumber: accountNumber ? accountNumber.toString().trim() : "",
          ifscCode: ifscCode ? ifscCode.toString().trim().toUpperCase() : "",
          upiId: upiId ? upiId.toString().trim() : ""
        },

        creditLimitPaise: 0,
        currentDuePaise: 0,
        allowCredit: false,
        riskTier: "low",
        approvalStatus: "pending",
        kycVerified: false
      });

      if (useTransactions) await buyerProfile.save({ session });
      else await buyerProfile.save();

      // Link profile to user
      user.profileId = buyerProfile._id;
      user.profileModel = "BuyerProfile";
      if (useTransactions) await user.save({ session });
      else await user.save();

      return { user, buyerProfile };
    };

    try {
      const result = await doSave();

      if (useTransactions && session) {
        await session.commitTransaction();
        session.endSession();
      }

      return res.status(201).json({
        ok: true,
        message: "Buyer created successfully",
        data: {
          user: {
            _id: result.user._id,
            name: result.user.name,
            phone: result.user.phone,
            email: result.user.email,
            role: result.user.role
          },
          profile: result.buyerProfile
        }
      });
    } catch (innerErr) {
      if (useTransactions && session) {
        try { await session.abortTransaction(); } catch (e) { console.warn("abortTransaction failed:", e?.message || e); }
        session.endSession();
      }
      console.error("createBuyer: transaction/save error:", innerErr);
      return res.status(500).json({
        ok: false,
        message: "Failed to create buyer (save error)",
        error: innerErr?.message || String(innerErr),
        errorType: innerErr?.name || "SaveError"
      });
    }
  } catch (err) {
    console.error("createBuyer: outer error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to create buyer",
      error: err?.message || String(err),
      errorType: err?.name || "UnknownError"
    });
  }
};



/**
 * ✅ 2. GET BUYER PROFILE
 */
exports.getBuyerProfile = async (req, res) => {
  try {
    const { id } = req.params;
    let targetUserId;

    if (id) {
      targetUserId = id;

      if (req.user.role === "buyer" && req.user.id.toString() !== id) {
        return res.status(403).json({ ok: false, message: "Access denied" });
      }

      if (isStaff(req)) {
        const buyerProfile = await BuyerProfile.findOne({ userId: id });
        if (buyerProfile && buyerProfile.staffUserId.toString() !== req.user.id.toString()) {
          return res.status(403).json({ ok: false, message: "Access denied - not your assigned buyer" });
        }
      }
    } else {
      if (req.user.role !== "buyer") {
        return res.status(400).json({ ok: false, message: "Only buyers can access their own profile this way" });
      }
      targetUserId = req.user.id;
    }

    const user = await User.findById(targetUserId).select("-passwordHash");
    if (!user || user.role !== "buyer") {
      return res.status(404).json({ ok: false, message: "Buyer not found" });
    }

    const profile = await BuyerProfile.findOne({ userId: targetUserId })
      .populate("staffUserId", "name phone email")
      .lean();

    if (!profile) {
      return res.status(404).json({ ok: false, message: "Buyer profile not found" });
    }

    res.json({
      ok: true,
      data: {
        user,
        profile,
        creditLimit: Math.round((profile.creditLimitPaise || 0) / 100),
        currentDue: Math.round((profile.currentDuePaise || 0) / 100)
      }
    });
  } catch (error) {
    console.error("Get buyer profile error:", error);
    res.status(500).json({ ok: false, message: "Failed to fetch buyer profile", error: error.message });
  }
};

/**///✅ 3. UPDATE BUYER PROFILE (robust id handling)

exports.updateBuyerProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Normalize current user id (accept both req.user.id and req.user._id)
    const currentUserId = req.user && (req.user.id || req.user._id);
    // If buyer role, ensure they can only update their own profile
    if (req.user.role === "buyer" && currentUserId && currentUserId.toString() !== id.toString()) {
      return res.status(403).json({ ok: false, message: "Access denied" });
    }

    const user = await User.findById(id);
    if (!user || user.role !== "buyer") {
      return res.status(404).json({ ok: false, message: "Buyer not found" });
    }

    // Update user fields
    const userUpdates = {};
    if (updates.name) userUpdates.name = updates.name.trim();
    if (updates.email) userUpdates.email = updates.email.trim().toLowerCase();
    if (updates.phone) userUpdates.phone = updates.phone.trim();

    // ✅ handle password updates (if provided)
    if (updates.password) {
      const salt = await bcrypt.genSalt(10);
      userUpdates.passwordHash = await bcrypt.hash(updates.password, salt);
    }

    if (Object.keys(userUpdates).length > 0) {
      // Ensure email uniqueness
      if (userUpdates.email) {
        const emailExists = await User.findOne({ email: userUpdates.email, _id: { $ne: id } });
        if (emailExists) {
          return res.status(400).json({ ok: false, message: "Email already in use" });
        }
      }
      await User.findByIdAndUpdate(id, userUpdates);
    }

    // Profile updates
    const profileUpdates = {};
    if (updates.gender) profileUpdates.gender = updates.gender;
    if (updates.shopName) profileUpdates.shopName = updates.shopName.trim();
    if (updates.shopImage) profileUpdates.shopImage = updates.shopImage;
    if (updates.shopAddress) profileUpdates.shopAddress = updates.shopAddress;
    if (updates.documents) profileUpdates.documents = updates.documents;
    if (updates.bankDetails) profileUpdates.bankDetails = updates.bankDetails;

    const updatedProfile = await BuyerProfile.findOneAndUpdate(
      { userId: id },
      profileUpdates,
      { new: true }
    ).populate("staffUserId", "name phone email");

    res.json({
      ok: true,
      message: "Profile updated successfully",
      data: { profile: updatedProfile }
    });
  } catch (error) {
    console.error("Update buyer profile error:", error);
    res.status(500).json({ ok: false, message: "Failed to update profile", error: error.message });
  }
};

/**
 * ✅ 4. GET ALL BUYERS
 */
exports.getAllBuyers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", status = "", staffId = "" } = req.query;

    const pageNum = Math.max(1, toInt(page));
    const limitNum = Math.min(100, Math.max(1, toInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (isStaff(req)) {
      filter.staffUserId = req.user.id;
    } else if (isAdmin(req) && staffId) {
      filter.staffUserId = staffId;
    }

    if (status) {
      filter.approvalStatus = status;
    }

    if (search && search.length > 1) {
      const users = await User.find({
        role: "buyer",
        $or: [
          { name: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } }
        ]
      }).select("_id");

      const userIds = users.map((u) => u._id);

      if (userIds.length > 0) {
        filter.$or = [
          { userId: { $in: userIds } },
          { shopName: { $regex: search, $options: "i" } }
        ];
      } else {
        filter.shopName = { $regex: search, $options: "i" };
      }
    }

    const [profiles, total] = await Promise.all([
      BuyerProfile.find(filter)
        .populate("userId", "name phone email isActive")
        .populate("staffUserId", "name phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      BuyerProfile.countDocuments(filter)
    ]);

    const transformedProfiles = profiles.map((profile) => ({
      ...profile,
      creditLimit: Math.round((profile.creditLimitPaise || 0) / 100),
      currentDue: Math.round((profile.currentDuePaise || 0) / 100)
    }));

    res.json({
      ok: true,
      data: transformedProfiles,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error("Get all buyers error:", error);
    res.status(500).json({ ok: false, message: "Failed to fetch buyers", error: error.message });
  }
};

/**
 * ✅ 5. GET BUYER ORDERS
 */
exports.getBuyerOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    if (req.user.role === "buyer" && req.user.id.toString() !== id) {
      return res.status(403).json({ ok: false, message: "Access denied" });
    }

    const pageNum = Math.max(1, toInt(page));
    const limitNum = Math.min(50, Math.max(1, toInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = { buyerUserId: id };
    if (status) filter.status = status;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("products.product", "name price")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(filter)
    ]);

    res.json({
      ok: true,
      data: orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error("Get buyer orders error:", error);
    res.status(500).json({ ok: false, message: "Failed to fetch orders", error: error.message });
  }
};
exports.getReturnRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    // buyers can only see their own returns
    const filter = { buyerUserId: userId };

    const returns = await ReturnRequest.find(filter)
      .populate("orderId", "orderNumber totalAmount status")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      ok: true,
      data: returns
    });
  } catch (error) {
    console.error("Get return requests error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to fetch return requests",
      error: error.message
    });
  }
};

/**
 * ✅ 7. CREATE RETURN REQUEST
 * POST /api/returns
 */
exports.createReturnRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, reason, items } = req.body;

    if (!orderId || !reason) {
      return res.status(400).json({ ok: false, message: "Order ID and reason are required" });
    }

    const order = await Order.findOne({ _id: orderId, buyerUserId: userId });
    if (!order) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    const returnRequest = new ReturnRequest({
      buyerUserId: userId,
      orderId,
      reason,
      items: items || [], // [{ productId, quantity }]
      status: "pending"
    });

    await returnRequest.save();

    res.status(201).json({
      ok: true,
      message: "Return request submitted successfully",
      data: returnRequest
    });
  } catch (error) {
    console.error("Create return request error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to create return request",
      error: error.message
    });
  }
};
