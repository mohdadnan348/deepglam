const mongoose = require('mongoose');
const Product = require('../models/product.model');
const User = require('../models/user.model'); 

/* ---------- helpers ---------- */
const toNum = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toInt = v => Math.round(toNum(v));

// Updated price calculator for new model
const calc = ({ purchasePrice, includedPercentage=0, discountPercentage=0, discountAmount=0, gstPercentage=0, gstType='exclusive' }) => {
  const _purchasePrice = toNum(purchasePrice);
  const _includedPct = toNum(includedPercentage);
  
  // Calculate price based on purchasePrice + includedPercentage
  const basePrice = _purchasePrice + (_purchasePrice * _includedPct / 100);
  
  // Apply discount
  const discPctAmt = basePrice * (toNum(discountPercentage)/100);
  const theDisc = Math.max(toNum(discountAmount), discPctAmt);
  const afterDisc = Math.max(basePrice - theDisc, 0);

  // Calculate GST
  const inclusive = String(gstType).toLowerCase() === 'inclusive';
  const gstAmtFloat = inclusive
    ? (afterDisc - (afterDisc / (1 + toNum(gstPercentage)/100)))
    : (afterDisc * toNum(gstPercentage)/100);

  const salePrice = inclusive ? afterDisc : (afterDisc + gstAmtFloat);

  return { 
    price: Math.round(basePrice * 100) / 100,
    priceAfterDiscount: Math.round(afterDisc * 100) / 100, 
    gstAmount: Math.round(gstAmtFloat * 100) / 100, 
    salePrice: Math.round(salePrice * 100) / 100,
    discountApplied: Math.round(theDisc * 100) / 100 
  };
};

// images
const toImageObj = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return { url: v, public_id: '' };
  if (v && typeof v === 'object') return { 
    url: v.url || v.uri || '', 
    public_id: v.public_id || v.fileName || '' 
  };
  return null;
};

const toImageObjArray = (arr) => (Array.isArray(arr) ? arr.map(toImageObj).filter(Boolean) : []);

// Variations handler
const processVariations = (simpleVariations, attributeVariations, productType) => {
  if (productType === 'Simple') {
    return Array.isArray(simpleVariations) 
      ? simpleVariations.filter(v => v.size && v.color).map(v => ({
          size: String(v.size).trim(),
          color: String(v.color).trim()
        }))
      : [];
  } else if (productType === 'Attribute') {
    return Array.isArray(attributeVariations)
      ? attributeVariations.filter(v => v.size && v.color).map(v => ({
          size: String(v.size).trim(),
          color: String(v.color).trim(),
          pieces: v.pieces ? String(v.pieces).trim() : ''
        }))
      : [];
  }
  return [];
};

/** ✅ FIXED - Resolve userId from authenticated user */
function resolveUserId(req) {
  console.log('🔍 Resolving userId from:', {
    user: req.user ? { id: req.user._id, role: req.user.role } : 'No user object'
  });
  return req.user?._id || req.user?.id || null;
}

/* ---------------------------------------
   CREATE PRODUCT
----------------------------------------*/
exports.createProduct = async (req, res) => {
  try {
    const {
      mainCategory, subCategory, productType, productName,
      hsnCode, MOQ, purchasePrice, 
      includedPercentage = 0,
      discountPercentage = 0, discountAmount = 0, 
      gstPercentage = 0, gstType = 'exclusive',
      simpleVariations, attributeVariations,
      brand, mainImage, images = [], productDescription,
    } = req.body;

    // Validation
    if (!productName) return res.status(400).json({ message: 'productName is required' });
    if (!mainCategory) return res.status(400).json({ message: 'mainCategory is required' });
    if (!subCategory) return res.status(400).json({ message: 'subCategory is required' });
    if (purchasePrice === undefined || purchasePrice === null)
      return res.status(400).json({ message: 'purchasePrice is required' });
    if (!productType) return res.status(400).json({ message: 'productType is required' });
    if (!mainImage) return res.status(400).json({ message: 'mainImage is required' });

    // Get userId from authenticated user
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'User not authenticated' });

    // Price calculations using new model
    const { price, priceAfterDiscount, gstAmount, salePrice, discountApplied } = calc({
      purchasePrice, includedPercentage, discountPercentage, discountAmount, gstPercentage, gstType
    });

    // Process variations based on product type
    const variations = processVariations(simpleVariations, attributeVariations, productType);

    const payload = {
      userId: new mongoose.Types.ObjectId(userId),
      mainCategory, subCategory, productType, productName,
      hsnCode, brand,
      purchasePrice: toNum(purchasePrice),
      includedPercentage: toNum(includedPercentage),
      price,
      discountPercentage: toNum(discountPercentage),
      discountAmount: discountApplied,
      gstPercentage: toNum(gstPercentage),
      gstAmount, gstType, salePrice,
      MOQ: toInt(MOQ),
      variations,
      productDescription: productDescription ? String(productDescription).trim() : "",
      mainImage: toImageObj(mainImage),
      images: toImageObjArray(images),
      status: "disapproved",
      isActive: true,
    };

    if (!payload.mainImage) return res.status(400).json({ message: 'mainImage must be a valid image object' });

    const saved = await Product.create(payload);
    return res.status(201).json({ message: 'Product created (pending approval)', product: saved });
  } catch (err) {
    console.error('❌ Product creation error:', err);
    return res.status(500).json({ message: 'Product creation failed', error: err.message });
  }
};

/* ---------------------------------------
   UPDATE PRODUCT
----------------------------------------*/
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const up = { ...req.body };

    // Convert numeric fields
    ['purchasePrice','includedPercentage','price','discountAmount','gstAmount','salePrice','MOQ','gstPercentage','discountPercentage']
      .forEach(k => { if (up[k] != null) up[k] = toNum(up[k]); });

    // Fields that trigger price recalculation
    const priceInputs = ['purchasePrice','includedPercentage','discountPercentage','discountAmount','gstPercentage','gstType'];
    const shouldRecalc = priceInputs.some(k => k in up);

    if (shouldRecalc) {
      const current = await Product.findById(id)
        .select('purchasePrice includedPercentage gstType gstPercentage discountPercentage discountAmount');
      if (!current) return res.status(404).json({ message: "Product not found" });

      const purchasePrice = up.purchasePrice != null ? toNum(up.purchasePrice) : toNum(current.purchasePrice);
      const includedPercentage = up.includedPercentage != null ? toNum(up.includedPercentage) : toNum(current.includedPercentage);
      const discountPercentage = up.discountPercentage != null ? toNum(up.discountPercentage) : toNum(current.discountPercentage);
      const discountAmount = up.discountAmount != null ? toNum(up.discountAmount) : toNum(current.discountAmount);
      const gstPercentage = up.gstPercentage != null ? toNum(up.gstPercentage) : toNum(current.gstPercentage);
      const gstType = up.gstType != null ? up.gstType : current.gstType;

      const { price, priceAfterDiscount, gstAmount, salePrice, discountApplied } = calc({
        purchasePrice, includedPercentage, discountPercentage, discountAmount, gstPercentage, gstType
      });

      up.price = price;
      up.discountAmount = discountApplied;
      up.gstAmount = gstAmount;
      up.salePrice = salePrice;
    }

    // Handle variations update
    if (up.simpleVariations || up.attributeVariations) {
      const currentProduct = await Product.findById(id).select('productType');
      if (currentProduct) {
        up.variations = processVariations(up.simpleVariations, up.attributeVariations, currentProduct.productType);
      }
      delete up.simpleVariations;
      delete up.attributeVariations;
    }

    // Handle images
    if (up.mainImage) up.mainImage = toImageObj(up.mainImage);
    if (up.images) up.images = toImageObjArray(up.images);

    const updated = await Product.findByIdAndUpdate(id, up, { new: true });
    if (!updated) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product updated", product: updated });
  } catch (err) {
    console.error('❌ Update product error:', err);
    res.status(500).json({ message: "Failed to update product", error: err.message });
  }
};

/* ---------------------------------------
   LIST / FILTER PRODUCTS
----------------------------------------*/
exports.getAllProducts = async (req, res) => {
  try {
    const { approved, status, isActive } = req.query;
    const filter = {};

    if (approved === "true") filter.status = "approved";
    if (approved === "false") filter.status = "disapproved";
    if (status) filter.status = status;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const products = await Product.find(filter)
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    console.error('❌ Get all products error:', err);
    res.status(500).json({ message: "Failed to fetch products", error: err.message });
  }
};

/* ---------------------------------------
   GET PRODUCT BY ID
----------------------------------------*/
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ ok: false, message: "Product ID is required" });

    const product = await Product.findById(id)
      .populate("userId", "name email role")
      .lean();

    if (!product) return res.status(404).json({ ok: false, message: "Product not found" });
    
    res.json({ ok: true, product });
  } catch (err) {
    console.error("❌ Get product by ID error:", err);
    res.status(500).json({ ok: false, message: "Failed to fetch product", error: err.message });
  }
};

/* ---------------------------------------
   GET PRODUCTS BY USER (seller)
----------------------------------------*/
exports.getProductsByUser = async (req, res) => {
  try {
    console.log('🔍 getProductsByUser called with user:', req.user ? { id: req.user._id, role: req.user.role } : 'No user');
    
    const userId = resolveUserId(req);
    if (!userId) {
      console.log('❌ No userId found');
      return res.status(401).json({ message: 'User not authenticated' });
    }

    console.log('✅ Finding products for userId:', userId);
    const products = await Product.find({ userId }).sort({ createdAt: -1 });
    
    console.log(`📦 Found ${products.length} products`);
    res.json(products);
  } catch (err) {
    console.error('❌ Get user products error:', err);
    res.status(500).json({ message: "Failed to fetch user products", error: err.message });
  }
};

/* ---------------------------------------
   ✅ FIXED DELETE PRODUCT
----------------------------------------*/
// controllers/product.controller.js - DELETE PRODUCT (SIMPLIFIED)
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = resolveUserId(req);
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // ✅ Simple: If user can see it, user can delete it
    // Same logic as getProductsByUser
    const deleted = await Product.findOneAndDelete({ 
      _id: id, 
      userId: userId  // Only user's own products
    });
    
    if (!deleted) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ message: "Failed to delete product", error: err.message });
  }
};


/* ---------------------------------------
   ✅ FIXED CLONE PRODUCT
----------------------------------------*/
exports.cloneProduct = async (req, res) => {
  try {
    console.log('📋 Clone product called:', {
      productId: req.params.id,
      user: req.user ? { id: req.user._id, role: req.user.role } : 'No user object'
    });

    const original = await Product.findById(req.params.id);
    if (!original) {
      console.log('❌ Original product not found');
      return res.status(404).json({ message: "Product not found" });
    }

    const userId = resolveUserId(req);
    if (!userId) {
      console.log('❌ Clone failed: No userId');
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const clone = new Product({
      ...original._doc,
      _id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      userId: new mongoose.Types.ObjectId(userId), // Set to current user
      status: "disapproved",
    });

    await clone.save();
    
    console.log('✅ Product cloned successfully:', clone._id);
    res.status(201).json({ message: "Product cloned (pending approval)", product: clone });
  } catch (err) {
    console.error('❌ Clone product error:', err);
    res.status(500).json({ message: "Clone failed", error: err.message });
  }
};

/* ---------------------------------------
   APPROVE / REJECT PRODUCT
----------------------------------------*/
exports.approveProduct = async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: "Product not found" });
    p.status = "approved";
    await p.save();
    res.json({ message: "Product approved", product: p });
  } catch (err) {
    console.error('❌ Approve product error:', err);
    res.status(500).json({ message: "Approval failed", error: err.message });
  }
};

exports.rejectProduct = async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: "Product not found" });
    p.status = "rejected";
    await p.save();
    res.json({ message: "Product rejected", product: p });
  } catch (err) {
    console.error('❌ Reject product error:', err);
    res.status(500).json({ message: "Rejection failed", error: err.message });
  }
};
