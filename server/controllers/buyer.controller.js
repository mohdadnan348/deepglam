// controllers/buyer.controller.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const BuyerProfile = require("../models/buyer.model");
const Order = require("../models/order.model");
const ReturnRequest = require("../models/return.model");
const Staff = require("../models/staff.model"); // added

const toInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

const isAdmin = (req) => ["admin", "superadmin"].includes(req.user?.role);
const isStaff = (req) => req.user?.role === "staff";

/**
 * ✅ 1. CREATE BUYER
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

    // Validation
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

    // Normalize
    const phoneNorm = phone.trim();
    const emailNorm = email ? email.trim().toLowerCase() : undefined;
    const codeNorm = employeeCode.trim().toUpperCase();

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

    // ---------------- Robust Staff lookup by employeeCode ----------------
    // Try: 1) User collection (role: staff, employeeCode)
    //      2) Staff collection and populate linked userId
    let staffUser = null;

    try {
      staffUser = await User.findOne({ role: "staff", employeeCode: codeNorm }).select("_id name phone email role");
    } catch (uErr) {
      console.warn("User lookup error for employeeCode:", uErr && uErr.message ? uErr.message : uErr);
      staffUser = null;
    }

    if (!staffUser) {
      try {
        const staffRecord = await Staff.findOne({ employeeCode: codeNorm }).populate("userId", "_id name phone email role");
        if (staffRecord && staffRecord.userId) {
          staffUser = staffRecord.userId;
        }
      } catch (sErr) {
        console.warn("Staff collection lookup error for employeeCode:", sErr && sErr.message ? sErr.message : sErr);
      }
    }

    if (!staffUser) {
      return res.status(400).json({
        ok: false,
        message: "Staff not found for employee code: " + codeNorm
      });
    }
    // --------------------------------------------------------------------

    // Transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create user
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

        await user.save({ session });
      }

      // Create buyer profile
      const buyerProfile = new BuyerProfile({
        userId: user._id,
        staffUserId: staffUser._id,
        employeeCode: codeNorm,
        gender: gender.trim(),

        shopName: shopName.trim(),
        shopImage: shopImage ? {
          url: shopImage.url || "",
          public_id: shopImage.public_id || ""
        } : undefined,

        shopAddress: {
          line1: shopAddressLine1.trim(),
          line2: shopAddressLine2 ? shopAddressLine2.trim() : "",
          city: city.trim(),
          state: state.trim(),
          postalCode: postalCode.trim(),
          country: country || "India"
        },

        documents: (documentType && documentNumber && documentImage) ? [{
          type: documentType.toUpperCase(),
          number: documentNumber.trim(),
          file: {
            url: documentImage.url || "",
            public_id: documentImage.public_id || ""
          },
          isVerified: false
        }] : [],

        bankDetails: {
          bankName: bankName ? bankName.trim() : "",
          branchName: branchName ? branchName.trim() : "",
          accountHolderName: accountHolderName ? accountHolderName.trim() : "",
          accountNumber: accountNumber ? accountNumber.trim() : "",
          ifscCode: ifscCode ? ifscCode.trim().toUpperCase() : "",
          upiId: upiId ? upiId.trim() : ""
        },

        creditLimitPaise: 0,
        currentDuePaise: 0,
        allowCredit: false,
        riskTier: "low",
        approvalStatus: "pending",
        kycVerified: false
      });

      await buyerProfile.save({ session });

      // Link
      user.profileId = buyerProfile._id;
      user.profileModel = "BuyerProfile";
      await user.save({ session });

      await session.commitTransaction();

      res.status(201).json({
        ok: true,
        message: "Buyer created successfully",
        data: {
          user: {
            _id: user._id,
            name: user.name,
            phone: user.phone,
            email: user.email,
            role: user.role
          },
          profile: buyerProfile
        }
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Buyer creation error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to create buyer",
      error: error.message
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
