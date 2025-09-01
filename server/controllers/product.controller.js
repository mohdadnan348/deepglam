// controllers/product.controller.js
const mongoose = require('mongoose');
//const Product = require("../models/product.model");
//const mongoose = require('mongoose');
const Product = require('../models/product.model');
const Seller = require('../models/seller.model');
/*
// ---- helpers ----
const toNum = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toStringArray = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof v === 'string') {
    const s = v.trim();
    try { 
      const arr = JSON.parse(s); 
      if (Array.isArray(arr)) return arr.map(String).map(x=>x.trim()).filter(Boolean); 
    } catch {}
    return s.split(',').map(x=>x.trim()).filter(Boolean);
  }
  return [];
};

const calc = ({ price, discountPercentage=0, discountAmount=0, gstPercentage=0, gstType='exclusive' }) => {
  const discByPct = price * (toNum(discountPercentage)/100);
  const disc = Math.max(toNum(discountAmount), discByPct);
  const afterDisc = Math.max(price - disc, 0);
  const inclusive = String(gstType).toLowerCase() === 'inclusive';
  const gstAmt = inclusive
    ? (afterDisc - (afterDisc / (1 + toNum(gstPercentage)/100)))
    : (afterDisc * toNum(gstPercentage)/100);
  const final = inclusive ? afterDisc : (afterDisc + gstAmt);
  return { priceAfterDiscount: afterDisc, gstAmount: gstAmt, finalPrice: final, discountApplied: disc };
};

// Normalize image fields to { url }
const toImageObj = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return { url: v };
  if (v && typeof v === 'object' && v.url) return { url: v.url };
  return null;
};

const toImageObjArray = (arr) => {
  if (!arr) return [];
  const a = Array.isArray(arr) ? arr : [];
  return a.map(toImageObj).filter(Boolean);
};

exports.createProduct = async (req, res) => {
  try {
    const {
      mainCategory, subCategory, productType, productname,
      hsnCode, MOQ, purchasePrice, margin=0,
      discountPercentage=0, discountAmount=0, gstPercentage=0, gstType='exclusive',
      sizes, colors, description, // ✅ description added
      brand, stock,
      sellerId,                  // optional in body
      mainImage,                 // string or {url}
      images = []                // string[] or {url}[]
    } = req.body;

    // ---- required fields ----
    if (!productname) return res.status(400).json({ message: 'productname is required' });
    if (!mainCategory) return res.status(400).json({ message: 'mainCategory is required' });
    if (!subCategory) return res.status(400).json({ message: 'subCategory is required' });
    if (purchasePrice === undefined || purchasePrice === null)
      return res.status(400).json({ message: 'purchasePrice is required' });
    if (!mainImage) return res.status(400).json({ message: 'mainImage URL is required' });

    // ---- seller resolution ----
    let sellerHeader = req.headers['x-seller-id'];
    let sellerIdFinal = sellerId || sellerHeader || null;

    // If not provided in body/header, find by logged-in user's linked Seller profile
    if (!sellerIdFinal && req.user && req.user._id) {
      const sellerProfile = await Seller.findOne({ userId: req.user._id }).select('_id');
      if (sellerProfile) {
        sellerIdFinal = sellerProfile._id;
      }
    }

    if (!sellerIdFinal) {
      return res.status(400).json({ message: 'Seller is required (send Authorization Bearer token OR sellerId in body OR x-seller-id header)' });
    }
    if (!mongoose.isValidObjectId(sellerIdFinal)) {
      return res.status(400).json({ message: 'Invalid seller id format' });
    }

    // ---- pricing ----
    const purchase = toNum(purchasePrice);
    const marginNum = toNum(margin);
    const basePrice = purchase + (marginNum/100) * purchase;

    const { priceAfterDiscount, gstAmount, finalPrice } = calc({
      price: basePrice, discountPercentage, discountAmount, gstPercentage, gstType
    });

    // ---- arrays / text ----
    const parsedSizes = toStringArray(sizes);
    const parsedColors = toStringArray(colors);

    // ---- images normalize ----
    const mainImageObj = toImageObj(mainImage);
    const imageObjs = toImageObjArray(images);

    if (!mainImageObj) return res.status(400).json({ message: 'mainImage must be a URL string or { url }' });

    // ---- new product ----
    const newProduct = new Product({
      seller: sellerIdFinal, // ✅ now storing Seller _id
      mainCategory,
      subCategory,
      productType: productType ? String(productType).toLowerCase() : undefined,
      productname,
      hsnCode,
      MOQ: toNum(MOQ),
      purchasePrice: purchase,
      margin: marginNum,
      mrp: basePrice,
      discountPercentage: toNum(discountPercentage),
      discountAmount: toNum(discountAmount) > 0 ? toNum(discountAmount) : (basePrice > priceAfterDiscount ? (basePrice - priceAfterDiscount) : 0),
      gstPercentage: toNum(gstPercentage),
      gstAmount,
      gstType,
      finalPrice,
      sizes: parsedSizes,
      colors: parsedColors,
      description: description ? String(description).trim() : '', // ✅ save description
      brand,
      stock: toNum(stock),
      mainImage: mainImageObj,
      images: imageObjs,
      isApproved: true,
      isActive: true,
    });

    const saved = await newProduct.save();
    return res.status(201).json({ message: 'Product created', product: saved });

  } catch (err) {
    console.error('❌ Product creation error:', err);
    return res.status(500).json({ message: 'Product creation failed', error: err.message });
  }
};

*/


// ---- helpers ----
const toNum = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toStringArray = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof v === 'string') {
    const s = v.trim();
    try { const arr = JSON.parse(s); if (Array.isArray(arr)) return arr.map(String).map(x=>x.trim()).filter(Boolean); } catch {}
    return s.split(',').map(x=>x.trim()).filter(Boolean);
  }
  return [];
};
const calc = ({ price, discountPercentage=0, discountAmount=0, gstPercentage=0, gstType='exclusive' }) => {
  const discByPct = price * (toNum(discountPercentage)/100);
  const disc = Math.max(toNum(discountAmount), discByPct);
  const afterDisc = Math.max(price - disc, 0);
  const inclusive = String(gstType).toLowerCase() === 'inclusive';
  const gstAmt = inclusive
    ? (afterDisc - (afterDisc / (1 + toNum(gstPercentage)/100)))
    : (afterDisc * toNum(gstPercentage)/100);
  const final = inclusive ? afterDisc : (afterDisc + gstAmt);
  return { priceAfterDiscount: afterDisc, gstAmount: gstAmt, finalPrice: final, discountApplied: disc };
};
// normalize strings
const normStr = (v, max = 5000) => {
  if (v == null) return undefined;
  const s = typeof v === 'string' ? v : String(v);
  return s.trim().slice(0, max);
};

// Normalize image fields to { url }
const toImageObj = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return { url: v };
  if (v && typeof v === 'object' && v.url) return { url: v.url };
  return null;
};
const toImageObjArray = (arr) => {
  if (!arr) return [];
  const a = Array.isArray(arr) ? arr : [];
  return a.map(toImageObj).filter(Boolean);
};
exports.createProduct = async (req, res) => {
  try {
    const {
      mainCategory, subCategory, productType, productname,
      hsnCode, MOQ, purchasePrice, margin = 0,
      discountPercentage = 0, discountAmount = 0, gstPercentage = 0, gstType = 'exclusive',
      sizes, colors, brand, stock,
      sellerId,
      mainImage,
      images = [],
      description,
    } = req.body;

    // ---- required fields ----
    if (!productname) return res.status(400).json({ message: 'productname is required' });
    if (!mainCategory) return res.status(400).json({ message: 'mainCategory is required' });
    if (!subCategory) return res.status(400).json({ message: 'subCategory is required' });
    if (purchasePrice === undefined || purchasePrice === null)
      return res.status(400).json({ message: 'purchasePrice is required' });
    if (!mainImage) return res.status(400).json({ message: 'mainImage URL is required' });

    // ---- seller resolution: body.sellerId → header x-seller-id ----
    const sellerHeader = req.headers['x-seller-id'];
    const seller = sellerId || sellerHeader || null;
    if (!seller) {
      return res.status(400).json({
        message:
          'sellerId is required (send in body OR in x-seller-id header)',
      });
    }
    if (!mongoose.isValidObjectId(seller)) {
      return res.status(400).json({ message: 'Invalid seller id format' });
    }

    // ---- pricing ----
    const purchase = toNum(purchasePrice);
    const marginNum = toNum(margin);
    const basePrice = purchase + (marginNum / 100) * purchase;

    const { priceAfterDiscount, gstAmount, finalPrice } = calc({
      price: basePrice, discountPercentage, discountAmount, gstPercentage, gstType
    });

    // ---- arrays / text ----
    const parsedSizes = toStringArray(sizes);
    const parsedColors = toStringArray(colors);

    // ---- images normalize to embedded docs ----
    const mainImageObj = toImageObj(mainImage);
    const imageObjs = toImageObjArray(images);
    if (!mainImageObj) return res.status(400).json({ message: 'mainImage must be a URL string or { url }' });

    // description normalize
    const productDescription = normStr(description, 8000);

    const newProduct = new Product({
      seller,
      mainCategory,
      subCategory,
      productType: productType ? String(productType).toLowerCase() : undefined,
      productname,
      hsnCode,
      MOQ: toNum(MOQ),
      purchasePrice: purchase,
      margin: marginNum,
      mrp: basePrice,
      discountPercentage: toNum(discountPercentage),
      discountAmount: toNum(discountAmount) > 0 ? toNum(discountAmount) : (basePrice > priceAfterDiscount ? (basePrice - priceAfterDiscount) : 0),
      gstPercentage: toNum(gstPercentage),
      gstAmount,
      gstType,
      finalPrice,
      sizes: parsedSizes,
      colors: parsedColors,
      brand,
      stock: toNum(stock),

      // media
      mainImage: mainImageObj,
      images: imageObjs,

      // description
      description: productDescription,

      isApproved: true,
      isActive: true,
    });

    const saved = await newProduct.save();
    return res.status(201).json({ message: 'Product created', product: saved });

  } catch (err) {
    console.error('❌ Product creation error:', err);
    return res.status(500).json({ message: 'Product creation failed', error: err.message });
  }
};



// ✏️ Update Product
exports.updateProduct = async (req, res) => {
  try {
    const updates = req.body;
    if (updates.price || updates.discountPercentage || updates.discountAmount || updates.gstPercentage) {
      const calc = calculateFinalPrice({
        price: updates.price,
        discountPercentage: updates.discountPercentage,
        discountAmount: updates.discountAmount,
        gstPercentage: updates.gstPercentage,
        gstType: updates.gstType,
      });
      updates.finalPrice = calc.finalPrice;
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ message: "Product updated", product: updated });
  } catch (err) {
    res.status(500).json({ message: "Failed to update product", error: err.message });
  }
};

// ❌ Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete product", error: err.message });
  }
};

// 📄 Get all products (admin/seller/buyer) with optional approval filter
exports.getAllProducts = async (req, res) => {
  try {
    const { approved } = req.query; // Query parameter for filtering approval status
    const filter = {};

    if (approved === "true") {
      filter.isApproved = true;
    } else if (approved === "false") {
      filter.isApproved = false;
    }

    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch products", error: err.message });
  }
};


// 👤 Get single product
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch product", error: err.message });
  }
};
// 📄 Get all disapproved (not approved) products
exports.getDisapprovedProducts = async (req, res) => {
  try {
    const products = await Product.find({ isApproved: false }).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch disapproved products", error: err.message });
  }
};


// ✅ Approve Product (admin)
exports.approveProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    product.status = "approved";
    await product.save();

    res.json({ message: "Product approved" });
  } catch (err) {
    res.status(500).json({ message: "Approval failed", error: err.message });
  }
};

// 🌀 Clone Product
exports.cloneProduct = async (req, res) => {
  try {
    const original = await Product.findById(req.params.id);
    if (!original) return res.status(404).json({ message: "Product not found" });

    const clone = new Product({
      ...original._doc,
      _id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      status: "pending",
    });

    await clone.save();
    res.status(201).json({ message: "Product cloned", product: clone });
  } catch (err) {
    res.status(500).json({ message: "Clone failed", error: err.message });
  }
};

// 💰 Utility: Final price calculator
function calculateFinalPrice({ price, discountPercentage = 0, discountAmount = 0, gstPercentage = 0, gstType = "exclusive" }) {
  let priceAfterDiscount = price;

  if (discountPercentage) {
    priceAfterDiscount -= (discountPercentage / 100) * price;
  } else if (discountAmount) {
    priceAfterDiscount -= discountAmount;
  }

  const gstAmount = gstType === "exclusive" ? (gstPercentage / 100) * priceAfterDiscount : 0;
  const finalPrice = priceAfterDiscount + gstAmount;

  return {
    priceAfterDiscount,
    gstAmount,
    finalPrice,
  };
}