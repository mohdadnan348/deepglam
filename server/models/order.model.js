// models/order.model.js - UPDATED WITH GST FIELDS
const mongoose = require("mongoose");

const int = v => (v == null ? v : Math.round(Number(v) || 0));
const float = v => (v == null ? v : parseFloat(Number(v) || 0));

// ✅ UPDATED LineItemSchema with GST fields
const LineItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  productName: { type: String, required: true },
  
  // ✅ Seller & Brand info per product
  sellerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  brand: { type: String, required: true },
  
  // ✅ Quantity and pricing
  quantity: { type: Number, set: int, default: 1 },
  pricePerUnitPaise: { type: Number, set: int },
  totalPaise: { type: Number, set: int },
  
  // ✅ CRITICAL: GST & Purchase Price Fields
  purchasePricePerUnitPaise: { type: Number, set: int, default: 0 },
  hsnCode: { type: String, default: '6203' },
  gstPercentage: { type: Number, set: float, default: 0 },
  gstType: { 
    type: String, 
    enum: ['exclusive', 'inclusive'], 
    default: 'exclusive' 
  },
  gstAmount: { type: Number, set: float, default: 0 },
  gstAmountPerUnitPaise: { type: Number, set: int, default: 0 }
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
    postalCode: { type: String, required: true },
    country: { type: String, default: "India" }
  },

  // ✅ Products with seller & brand info + GST
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
    enum: ["confirmed", "processing", "packed", "shipped", "delivered", "cancelled", "returned"],
    default: "confirmed",
    index: true
  },
  
  // ✅ Dispatch info
  dispatch: {
    courier: String,
    awb: String,
    note: String,
    dispatchedAt: Date,
    dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  
  // ✅ Status logs
  statusLogs: [{
    timestamp: { type: Date, default: Date.now },
    actionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    action: String,
    note: String
  }],
  
  notes: { type: String }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ✅ Indexes for performance
orderSchema.index({ buyerUserId: 1, createdAt: -1 });
orderSchema.index({ staffUserId: 1, createdAt: -1 });
orderSchema.index({ "products.sellerUserId": 1, createdAt: -1 });
orderSchema.index({ "brandBreakdown.sellerUserId": 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });

// ✅ UPDATED: Calculate brand-wise breakdown with proper GST
orderSchema.methods.calculateBrandBreakdown = function() {
  const brandMap = new Map();
  
  // Group products by brand and seller
  this.products.forEach(item => {
    const key = `${item.brand}-${item.sellerUserId}`;
    
    if (!brandMap.has(key)) {
      brandMap.set(key, {
        brand: item.brand,
        sellerUserId: item.sellerUserId,
        subtotalPaise: 0,
        gstPaise: 0
      });
    }
    
    const entry = brandMap.get(key);
    entry.subtotalPaise += item.totalPaise || 0;
    
    // Calculate GST for this product
    const gstPct = item.gstPercentage || 0;
    const gstType = item.gstType || 'exclusive';
    
    if (gstType === 'exclusive') {
      // GST is additional
      const lineGst = Math.round((item.totalPaise * gstPct) / 100);
      entry.gstPaise += lineGst;
    } else {
      // GST is included
      const basePrice = Math.round((item.totalPaise * 100) / (100 + gstPct));
      const lineGst = item.totalPaise - basePrice;
      entry.gstPaise += lineGst;
    }
  });
  
  // Convert to breakdown array with proper GST
  this.brandBreakdown = Array.from(brandMap.values()).map(item => ({
    brand: item.brand,
    sellerUserId: item.sellerUserId,
    subtotalPaise: item.subtotalPaise,
    taxPaise: item.gstPaise,
    totalPaise: item.subtotalPaise + item.gstPaise
  }));
  
  return this;
};

// ✅ Virtual for rupees amounts (convenience)
orderSchema.virtual('subtotal').get(function() {
  return (this.subtotalPaise || 0) / 100;
});

orderSchema.virtual('discount').get(function() {
  return (this.discountPaise || 0) / 100;
});

orderSchema.virtual('tax').get(function() {
  return (this.taxPaise || 0) / 100;
});

orderSchema.virtual('finalAmount').get(function() {
  return (this.finalAmountPaise || 0) / 100;
});

orderSchema.virtual('paidAmount').get(function() {
  return (this.paidAmountPaise || 0) / 100;
});

orderSchema.virtual('remainingAmount').get(function() {
  return ((this.finalAmountPaise || 0) - (this.paidAmountPaise || 0)) / 100;
});

module.exports = mongoose.model("Order", orderSchema);