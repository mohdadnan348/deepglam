const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  // Core identity fields (common to all roles)
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String },
  
  // Role and status
  role: {
    type: String,
    enum: ["buyer", "seller", "staff", "admin"],
    required: true,
    index: true
  },
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  
  // OTP fields
  otpCode: { type: String },
  otpExpiresAt: { type: Date },
  fcmToken: { type: String },
  
  // Profile reference (role-specific data)
  profileId: { type: mongoose.Schema.Types.ObjectId, refPath: 'profileModel' },
  profileModel: {
    type: String,
    enum: ['BuyerProfile', 'SellerProfile', 'StaffProfile', 'AdminProfile']
  }
}, { timestamps: true });

// Password methods
userSchema.methods.setPassword = async function(password) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(password, salt);
};

userSchema.methods.validatePassword = async function(password) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model("User", userSchema);
