// models/buyerProfile.model.js
const mongoose = require("mongoose");

const int = v => (v == null ? v : Math.round(Number(v) || 0));

const buyerProfileSchema = new mongoose.Schema({
  // User reference
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true, 
    unique: true 
  },
  
  // Staff relationship
  staffUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User",
    required: true,
    index: true
  },
  
  employeeCode: { 
    type: String, 
    required: true,
    uppercase: true,
    index: true
  },
  
  // Personal info
  gender: { 
    type: String, 
    enum: ["male", "female", "other"], 
    required: true 
  },

  // Shop information
  shopName: { 
    type: String, 
    required: true,
    trim: true,
    index: "text"
  },
  
  shopImage: {
    url: { type: String },
    public_id: { type: String }
  },
  
  // Shop address
  shopAddress: {
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, default: "India" }
  },

  // Documents
  documents: [{
    type: { 
      type: String, 
      required: true, 
      enum: ["AADHAAR", "PAN", "GST", "UDYAM", "SHOP_LICENSE", "OTHER"] 
    },
    number: { type: String, required: true },
    file: {
      url: { type: String },
      public_id: { type: String }
    },
    isVerified: { type: Boolean, default: false }
  }],

  // Bank details (matching your form)
  bankDetails: {
    bankName: { type: String },
    branchName: { type: String },
    accountHolderName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    upiId: { type: String }
  },

  // Credit management
  creditLimitPaise: { type: Number, set: int, default: 0 },
  currentDuePaise: { type: Number, set: int, default: 0 },
  allowCredit: { type: Boolean, default: false },
  riskTier: { type: String, enum: ["low", "medium", "high"], default: "low" },

  // Approval status
  approvalStatus: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
    index: true
  },
  rejectReason: { type: String },
  
  kycVerified: { type: Boolean, default: false }

}, { 
  timestamps: true,
  index: [
    { staffUserId: 1, createdAt: -1 },
    { employeeCode: 1 },
    { approvalStatus: 1 }
  ]
});

// Search index
buyerProfileSchema.index({
  shopName: "text",
  "shopAddress.city": "text", 
  "shopAddress.state": "text"
});

module.exports = mongoose.model("BuyerProfile", buyerProfileSchema);
