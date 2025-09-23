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
