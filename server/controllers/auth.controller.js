// controllers/auth.controller.js
const mongoose = require("mongoose"); 
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");

// ---------- Helpers ----------
const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

// ---------- REGISTER ----------
exports.register = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    const { name, phone, email, password, role = "buyer" } = req.body;
    
    // Validation
    if (!name || !phone || !email || !password) {
      return res.status(400).json({ 
        ok: false, 
        message: "name, phone, email, password are required" 
      });
    }

    const emailNorm = email.trim().toLowerCase();
    const phoneNorm = phone.trim();

    // Check existing user
    const exist = await User.findOne({ 
      $or: [{ phone: phoneNorm }, { email: emailNorm }] 
    });
    
    if (exist) {
      return res.status(400).json({ 
        ok: false, 
        message: "User already exists with this phone or email" 
      });
    }

    // Create user (no profile handling)
    const userData = {
      name,
      phone: phoneNorm,
      email: emailNorm,
      role,
      isActive: true,
      isVerified: false
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
        isActive: user.isActive
      }
    });

  } catch (err) {
    await session.abortTransaction();
    console.error("Registration error:", err);
    return res.status(500).json({ 
      ok: false, 
      message: "Registration failed", 
      error: err.message 
    });
  } finally {
    session.endSession();
  }
};

// ---------- LOGIN ----------
// ---------- LOGIN ----------
exports.login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    // Validation
    if (!password) {
      return res.status(400).json({ 
        ok: false, 
        message: "Password is required" 
      });
    }

    const loginField = email || phone;
    if (!loginField) {
      return res.status(400).json({ 
        ok: false, 
        message: "Email or phone is required" 
      });
    }

    // ✅ Case-insensitive user search using regex
    const isEmail = loginField.includes("@");
    let user;

    if (isEmail) {
      // Case-insensitive email search
      user = await User.findOne({ 
        email: { 
          $regex: new RegExp(`^${loginField.trim()}$`, 'i') 
        } 
      });
    } else {
      // Phone search
      user = await User.findOne({ phone: loginField.trim() });
    }

    console.log("Login attempt:", { loginField, userFound: !!user }); // Debug log

    if (!user) {
      return res.status(404).json({ 
        ok: false, 
        message: "User not found" 
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ 
        ok: false, 
        message: "Invalid password" 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ 
        ok: false, 
        message: "Account is deactivated" 
      });
    }

    // Create token
    const tokenPayload = {
      userId: user._id,
      role: user.role
    };
    
    const token = signToken(tokenPayload);

    // Response
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
        isVerified: user.isVerified
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ 
      ok: false, 
      message: "Login failed", 
      error: err.message 
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
        pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error("Admin users fetch error:", err);
    return res.status(500).json({ 
      ok: false, 
      message: "Failed to fetch users" 
    });
  }
};
