// controllers/auth.controller.js
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");

// ---------- Helpers ----------
const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

// OTP store (demo ke liye memory me, production me Redis ya DB use karein)
const otpStore = {};

// ---------- REGISTER ----------
exports.register = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const { name, phone, email, password, role = "buyer" } = req.body;

    if (!name || !phone || !email || !password) {
      return res.status(400).json({
        ok: false,
        message: "name, phone, email, password are required",
      });
    }

    const emailNorm = email.trim().toLowerCase();
    const phoneNorm = phone.trim();

    const exist = await User.findOne({
      $or: [{ phone: phoneNorm }, { email: emailNorm }],
    });

    if (exist) {
      return res.status(400).json({
        ok: false,
        message: "User already exists with this phone or email",
      });
    }

    const userData = {
      name,
      phone: phoneNorm,
      email: emailNorm,
      role,
      isActive: true,
      isVerified: false,
    };

    const user = new User(userData);
    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save({ session });

    await session.commitTransaction();

    return res.status(201).json({
      ok: true,
      message: "Registration successful",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("Registration error:", err);
    return res.status(500).json({
      ok: false,
      message: "Registration failed",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};

// ---------- LOGIN ----------
exports.login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    if (!password) {
      return res.status(400).json({ ok: false, message: "Password is required" });
    }

    const loginField = email || phone;
    if (!loginField) {
      return res
        .status(400)
        .json({ ok: false, message: "Email or phone is required" });
    }

    const isEmail = loginField.includes("@");
    let user;

    if (isEmail) {
      user = await User.findOne({
        email: {
          $regex: new RegExp(`^${loginField.trim()}$`, "i"),
        },
      });
    } else {
      user = await User.findOne({ phone: loginField.trim() });
    }

    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ ok: false, message: "Invalid password" });
    }

    if (!user.isActive) {
      return res
        .status(403)
        .json({ ok: false, message: "Account is deactivated" });
    }

    const tokenPayload = {
      userId: user._id,
      role: user.role,
    };

    const token = signToken(tokenPayload);

    return res.status(200).json({
      ok: true,
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      ok: false,
      message: "Login failed",
      error: err.message,
    });
  }
};

// ---------- CHANGE PASSWORD ----------
exports.changePassword = async (req, res) => {
  try {
    const { userId } = req.user; // from auth middleware
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ ok: false, message: "Both fields required" });
    }

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ ok: false, message: "User not found" });

    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ ok: false, message: "Old password incorrect" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res
      .status(200)
      .json({ ok: true, message: "Password updated successfully" });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to update password",
      error: err.message,
    });
  }
};

// ---------- SEND OTP (Forgot Password) ----------
exports.sendOtp = async (req, res) => {
  try {
    const { emailOrMobile } = req.body;
    if (!emailOrMobile) {
      return res
        .status(400)
        .json({ ok: false, message: "Email or mobile required" });
    }

    const user = await User.findOne({
      $or: [
        { email: emailOrMobile.trim().toLowerCase() },
        { phone: emailOrMobile.trim() },
      ],
    });
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[user._id] = { otp, expires: Date.now() + 5 * 60 * 1000 };

    console.log("OTP for user:", user.email, otp); // TODO: send via Email/SMS

    return res
      .status(200)
      .json({ ok: true, message: "OTP sent successfully" });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Failed to send OTP",
      error: err.message,
    });
  }
};

// ---------- VERIFY OTP ----------
exports.verifyOtp = async (req, res) => {
  try {
    const { emailOrMobile, otp } = req.body;
    if (!emailOrMobile || !otp) {
      return res
        .status(400)
        .json({ ok: false, message: "Email/phone and OTP required" });
    }

    const user = await User.findOne({
      $or: [
        { email: emailOrMobile.trim().toLowerCase() },
        { phone: emailOrMobile.trim() },
      ],
    });
    if (!user)
      return res.status(404).json({ ok: false, message: "User not found" });

    const saved = otpStore[user._id];
    if (!saved)
      return res
        .status(400)
        .json({ ok: false, message: "OTP expired or not requested" });

    if (saved.expires < Date.now()) {
      delete otpStore[user._id];
      return res.status(400).json({ ok: false, message: "OTP expired" });
    }

    if (saved.otp !== otp) {
      return res.status(400).json({ ok: false, message: "Invalid OTP" });
    }

    otpStore[user._id].verified = true;

    return res
      .status(200)
      .json({ ok: true, message: "OTP verified successfully" });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "OTP verification failed",
      error: err.message,
    });
  }
};

// ---------- RESET PASSWORD ----------
exports.resetPassword = async (req, res) => {
  try {
    const { emailOrMobile, newPassword } = req.body;
    if (!emailOrMobile || !newPassword) {
      return res
        .status(400)
        .json({ ok: false, message: "All fields required" });
    }

    const user = await User.findOne({
      $or: [
        { email: emailOrMobile.trim().toLowerCase() },
        { phone: emailOrMobile.trim() },
      ],
    });
    if (!user)
      return res.status(404).json({ ok: false, message: "User not found" });

    const saved = otpStore[user._id];
    if (!saved || !saved.verified) {
      return res.status(400).json({ ok: false, message: "OTP not verified" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    delete otpStore[user._id];

    return res
      .status(200)
      .json({ ok: true, message: "Password reset successful" });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Password reset failed",
      error: err.message,
    });
  }
};

// ---------- ADMIN FUNCTIONS ----------
exports.getAllUsersAdmin = async (req, res) => {
  try {
    const { role, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (role) filter.role = role;

    const users = await User.find(filter)
      .select("name phone email role isActive isVerified createdAt")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filter);

    return res.status(200).json({
      ok: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Admin users fetch error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Failed to fetch users" });
  }
};
