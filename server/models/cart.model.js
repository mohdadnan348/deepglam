// models/cart.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const CartItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  quantity:  { type: Number, default: 1, min: 1 },
}, { _id: false });

const CartSchema = new Schema({
user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  items:   { type: [CartItemSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model("Cart", CartSchema);
