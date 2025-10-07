// server/models/coupon.model.js  (updated)
const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },
    value: { type: Number, required: true }, // 10 (percent) or 100 (₹)
    minOrderAmount: { type: Number, default: 0 },
    maxDiscount: { type: Number }, // optional cap on discount

    validFrom: { type: Date, required: true },
    validTill: { type: Date, required: true },

    applicableTo: {
      type: String,
      enum: ["buyer", "seller", "all"],
      default: "buyer",
    },

    isActive: { type: Boolean, default: true },

    // ---- new fields ----
    maxUses: { type: Number, default: null }, // null = unlimited
    usedCount: { type: Number, default: 0 },
    usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // optional per-user control
  },
  { timestamps: true }
);

module.exports = mongoose.model("Coupon", couponSchema);
