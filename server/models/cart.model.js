// models/cart.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const CartItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  quantity:  { type: Number, default: 1, min: 1 },
  // price per unit (in rupees) at the time item was added to cart
  unitPrice: { type: Number, default: null }, // e.g. 266
}, { _id: false });

const CartSchema = new Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  items: { type: [CartItemSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model("Cart", CartSchema);
