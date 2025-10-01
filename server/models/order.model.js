// models/order.model.js
const mongoose = require("mongoose");

const int = v => (v == null ? v : Math.round(Number(v) || 0));

const LineItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  productName: { type: String, required: true },
  
  // ✅ Seller & Brand info per product
  sellerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  brand: { type: String, required: true },
  
  quantity: { type: Number, set: int, default: 1 },
  pricePerUnitPaise: { type: Number, set: int },
  totalPaise: { type: Number, set: int }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  // ✅ Core references
  buyerUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true,
    index: true
  },
  
  staffUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User",
    required: true,
    index: true
  },
  
  employeeCode: { 
    type: String, 
    required: true,
    index: true 
  },

  // ✅ Order details
  orderNumber: { 
    type: String, 
    unique: true,
    index: true
  },

  deliveryAddress: {
    shopName: { type: String, required: true },
    fullAddress: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true }
  },

  // ✅ Products with seller & brand info
  products: [LineItemSchema],

  // ✅ Brand-wise breakdown (for billing)
  brandBreakdown: [{
    brand: { type: String, required: true },
    sellerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    subtotalPaise: { type: Number, set: int },
    taxPaise: { type: Number, set: int },
    totalPaise: { type: Number, set: int }
  }],

  // ✅ Amounts
  subtotalPaise: { type: Number, set: int },
  discountPaise: { type: Number, set: int, default: 0 },
  taxPaise: { type: Number, set: int, default: 0 },
  finalAmountPaise: { type: Number, set: int },

  // ✅ Payment & Status
  paidAmountPaise: { type: Number, set: int, default: 0 },
  paymentStatus: {
    type: String,
    enum: ["unpaid", "partially_paid", "paid"],
    default: "unpaid",
    index: true
  },
 status: {
    type: String,
    enum: ["confirmed","packed", "processing", "shipped", "delivered", "cancelled"],
    default: "confirmed",
    index: true
  },
  notes: { type: String }
}, { 
  timestamps: true,
  index: [
    { buyerUserId: 1, createdAt: -1 },
    { staffUserId: 1, createdAt: -1 },
    { "products.sellerUserId": 1, createdAt: -1 },
    { "brandBreakdown.sellerUserId": 1, createdAt: -1 }
  ]
});

// ✅ Method to calculate brand-wise breakdown
orderSchema.methods.calculateBrandBreakdown = function() {
  const brandMap = new Map();
  
  // Group products by brand and seller
  this.products.forEach(item => {
    const key = `${item.brand}-${item.sellerUserId}`;
    
    if (!brandMap.has(key)) {
      brandMap.set(key, {
        brand: item.brand,
        sellerUserId: item.sellerUserId,
        subtotalPaise: 0
      });
    }
  
    brandMap.get(key).subtotalPaise += item.totalPaise;
  });
  // Convert to breakdown array with tax calculation
  this.brandBreakdown = Array.from(brandMap.values()).map(item => ({
    ...item,
    taxPaise: Math.round(item.subtotalPaise * 0.18), // 18% GST
    totalPaise: Math.round(item.subtotalPaise * 1.18)
  }));
  return this;
};

module.exports = mongoose.model("Order", orderSchema);
