const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    
    mainCategory: { type: String, required: true },
    subCategory: { type: String, required: true },
    
    productType: {
      type: String,
      enum: ['Simple', 'Attribute'],
      required: true,
    },
    
    productName: { type: String, required: true },
    hsnCode: { type: String }, 
    brand: { type: String },
    
    // Pricing Fields
    purchasePrice: { type: Number, required: true },
    includedPercentage: { type: Number, default: 0 },
    price: { type: Number, default: 0 }, 
    
    discountPercentage: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    
    gstPercentage: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    gstType: {
      type: String,
      enum: ['inclusive', 'exclusive'],
      default: 'exclusive',
    },
    
    salePrice: { type: Number, default: 0 },
    MOQ: { type: Number, required: true },
    
    // Variations - Unified structure for both Simple and Attribute
    variations: [{
      size: { type: String, required: true },
      color: { type: String, required: true },
      pieces: { type: String } // Only for Attribute type
    }],
    
    productDescription: { type: String },
    
    // Images
    mainImage: {
      url: String,
      public_id: String,
    },
    images: [{
      url: String,
      public_id: String,
    }],
    
    // Status Management
    status: {
      type: String,
      enum: ['disapproved', 'Packed', 'approved', 'rejected'],
      default: 'disapproved',
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Product', productSchema);
