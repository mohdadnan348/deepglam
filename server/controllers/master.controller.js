// server/controllers/master.controller.js

const mongoose = require('mongoose');
const HSN = require('../models/hsn.model');
const Location = require('../models/location.model');
const Banner = require('../models/banner.model');
const ProfitMargin = require('../models/profitMargin.model');
const Coupon = require('../models/coupon.model');

// --------------------------
// 📦 HSN CRUD
// --------------------------

exports.createHSN = async (req, res) => {
  try {
    const { hsnCode, description, gstPercentage } = req.body;
    const hsn = new HSN({ hsnCode, description, gstPercentage });
    await hsn.save();
    res.status(201).json(hsn);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'HSN Code already exists' });
    }
    res.status(500).json({ message: 'Failed to create HSN', error: err.message });
  }
};

exports.updateHSN = async (req, res) => {
  try {
    const { id } = req.params;
    const { hsnCode, description, gstPercentage } = req.body;

    const updatedHSN = await HSN.findByIdAndUpdate(
      id,
      { hsnCode, description, gstPercentage },
      { new: true, runValidators: true }
    );

    if (!updatedHSN) return res.status(404).json({ message: 'HSN not found' });

    res.json(updatedHSN);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'HSN Code already exists' });
    }
    res.status(500).json({ message: 'Failed to update HSN', error: err.message });
  }
};

exports.getHSNs = async (req, res) => {
  try {
    const hsns = await HSN.find();
    res.json(hsns);
  } catch (err) {
    res.status(500).json({ message: 'Failed to get HSNs', error: err.message });
  }
};

exports.getHSNById = async (req, res) => {
  try {
    const { id } = req.params;
    const hsn = await HSN.findById(id);
    if (!hsn) return res.status(404).json({ message: 'HSN not found' });
    res.json(hsn);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch HSN', error: err.message });
  }
};

exports.deleteHSN = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedHSN = await HSN.findByIdAndDelete(id);
    if (!deletedHSN) return res.status(404).json({ message: 'HSN not found' });
    res.json({ message: 'HSN deleted successfully', data: deletedHSN });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete HSN', error: err.message });
  }
};

// --------------------------
// 🌍 LOCATION CRUD
// --------------------------

exports.createLocation = async (req, res) => {
  try {
    const { pincode, city, state } = req.body;
    const location = new Location({ pincode, city, state });
    await location.save();
    res.status(201).json(location);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create location', error: err.message });
  }
};

exports.getAllLocations = async (req, res) => {
  try {
    const locations = await Location.find();
    res.json(locations);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch locations', error: err.message });
  }
};

exports.getLocation = async (req, res) => {
  try {
    const { pincode } = req.params;
    const location = await Location.findOne({ pincode });
    if (!location) return res.status(404).json({ message: 'Location not found' });
    res.json(location);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch location', error: err.message });
  }
};

exports.upsertLocation = async (req, res) => {
  try {
    const { pincode, city, state } = req.body;
    const updated = await Location.findOneAndUpdate(
      { pincode },
      { city, state },
      { upsert: true, new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save location', error: err.message });
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { pincode, city, state } = req.body;
    const updatedLocation = await Location.findByIdAndUpdate(
      id,
      { pincode, city, state },
      { new: true, runValidators: true }
    );
    if (!updatedLocation) return res.status(404).json({ message: 'Location not found' });
    res.json(updatedLocation);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update location', error: err.message });
  }
};

exports.deleteLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedLocation = await Location.findByIdAndDelete(id);
    if (!deletedLocation) return res.status(404).json({ message: 'Location not found' });
    res.json({ message: 'Location deleted successfully', data: deletedLocation });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete location', error: err.message });
  }
};

// --------------------------
// 💰 PROFIT MARGIN CRUD
// --------------------------

exports.createProfit = async (req, res) => {
  try {
    const { category, marginPercentage, applicableTo, isActive } = req.body;
    const profit = new ProfitMargin({ category, marginPercentage, applicableTo, isActive });
    await profit.save();
    res.status(201).json(profit);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create profit margin', error: err.message });
  }
};

exports.updateProfit = async (req, res) => {
  try {
    const { id } = req.params;
    const { category, marginPercentage, applicableTo, isActive } = req.body;
    const updatedProfit = await ProfitMargin.findByIdAndUpdate(
      id,
      { category, marginPercentage, applicableTo, isActive },
      { new: true, runValidators: true }
    );
    if (!updatedProfit) return res.status(404).json({ message: 'Profit margin not found' });
    res.json(updatedProfit);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update profit margin', error: err.message });
  }
};

exports.getProfits = async (req, res) => {
  try {
    const profits = await ProfitMargin.find();
    res.json(profits);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch profits', error: err.message });
  }
};

exports.getProfitById = async (req, res) => {
  try {
    const { id } = req.params;
    const profit = await ProfitMargin.findById(id);
    if (!profit) return res.status(404).json({ message: 'Profit margin not found' });
    res.json(profit);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch profit margin', error: err.message });
  }
};

exports.setProfit = async (req, res) => {
  try {
    const { category, profitPercentage } = req.body;
    const updated = await ProfitMargin.findOneAndUpdate(
      { category },
      { profitPercentage },
      { upsert: true, new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save profit %', error: err.message });
  }
};

exports.deleteProfit = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProfit = await ProfitMargin.findByIdAndDelete(id);
    if (!deletedProfit) return res.status(404).json({ message: 'Profit margin not found' });
    res.json({ message: 'Profit margin deleted successfully', data: deletedProfit });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete profit margin', error: err.message });
  }
};

// --------------------------
// 🖼️ BANNER CRUD
// --------------------------

exports.createBanner = async (req, res) => {
  try {
    const { image, linkType, linkId, title } = req.body;
    const banner = new Banner({ image, linkType, linkId, title });
    await banner.save();
    res.status(201).json(banner);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create banner', error: err.message });
  }
};

exports.getBanners = async (req, res) => {
  try {
    const banners = await Banner.find();
    res.json(banners);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch banners', error: err.message });
  }
};

exports.getBannerById = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    res.json(banner);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch banner', error: err.message });
  }
};

exports.updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { image, linkType, linkId, title } = req.body;
    const updatedBanner = await Banner.findByIdAndUpdate(
      id,
      { image, linkType, linkId, title },
      { new: true, runValidators: true }
    );
    if (!updatedBanner) return res.status(404).json({ message: 'Banner not found' });
    res.json(updatedBanner);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update banner', error: err.message });
  }
};

exports.deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedBanner = await Banner.findByIdAndDelete(id);
    if (!deletedBanner) return res.status(404).json({ message: 'Banner not found' });
    res.json({ message: 'Banner deleted successfully', data: deletedBanner });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete banner', error: err.message });
  }
};

// --------------------------
// 🎟️ COUPON CRUD + Validate + Mark-used
// --------------------------

// Create Coupon (Admin)
exports.createCoupon = async (req, res) => {
  try {
    // expected fields from frontend - adjust names if your frontend uses different
    const {
      code,
      discountType = 'percentage', // or 'fixed'
      value,
      expiryDate,
      minOrderAmount = 0,
      maxDiscount = null,
      maxUses = null,
      isActive = true,
    } = req.body;

    const coupon = new Coupon({
      code: code.toUpperCase(),
      type: discountType || 'percentage',
      value,
      minOrderAmount,
      maxDiscount,
      validFrom: new Date(),
      validTill: expiryDate ? new Date(expiryDate) : null,
      maxUses,
      isActive,
    });

    await coupon.save();
    res.status(201).json({ ok: true, data: coupon });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ ok: false, message: 'Coupon code exists' });
    res.status(500).json({ ok: false, message: 'Failed to create coupon', error: err.message });
  }
};

// Get all coupons (Admin)
exports.getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch coupons', error: err.message });
  }
};

// Delete coupon (Admin)
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Coupon.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Coupon not found' });
    res.json({ message: 'Coupon deleted', data: deleted });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete coupon', error: err.message });
  }
};

// Validate coupon (called from checkout to calculate discount)
exports.validateCoupon = async (req, res) => {
  try {
    const { code, userId, cartTotal } = req.body;
    if (!code) return res.status(400).json({ ok: false, message: 'Coupon code required' });

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) return res.status(404).json({ ok: false, message: 'Coupon not found or inactive' });

    const now = new Date();
    if (coupon.validFrom && now < new Date(coupon.validFrom)) return res.status(400).json({ ok: false, message: 'Coupon not active yet' });
    if (coupon.validTill && now > new Date(coupon.validTill)) return res.status(400).json({ ok: false, message: 'Coupon expired' });

    if (cartTotal < (coupon.minOrderAmount || 0)) return res.status(400).json({ ok: false, message: `Minimum order ₹${coupon.minOrderAmount} required` });

    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ ok: false, message: 'Coupon usage limit reached' });

    if (userId && coupon.usedBy && coupon.usedBy.includes(userId)) return res.status(400).json({ ok: false, message: 'You have already used this coupon' });

    let discountAmount = 0;
    if (coupon.type === 'percentage') discountAmount = (cartTotal * coupon.value) / 100;
    else discountAmount = coupon.value;

    if (coupon.maxDiscount != null) discountAmount = Math.min(discountAmount, coupon.maxDiscount);
    if (discountAmount > cartTotal) discountAmount = cartTotal;

    const newTotal = Math.max(0, cartTotal - discountAmount);

    return res.json({
      ok: true,
      coupon: {
        id: coupon._id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
      },
      discountAmount,
      newTotal,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Failed to validate coupon', error: err.message });
  }
};
// Mark coupon used – call after payment/order confirmed
exports.markCouponUsed = async (req, res) => {
  try {
    const { couponId, userId, orderId } = req.body;
    
    // Validation
    if (!couponId) {
      return res.status(400).json({ ok: false, message: 'couponId required' });
    }

    console.log('📌 Marking coupon used:', { couponId, userId, orderId });

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(couponId)) {
      return res.status(400).json({ ok: false, message: 'Invalid couponId format' });
    }

    // Find coupon first
    const coupon = await Coupon.findById(couponId);
    
    if (!coupon) {
      return res.status(404).json({ ok: false, message: 'Coupon not found' });
    }

    // Check if already at max uses
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ ok: false, message: 'Coupon usage limit reached' });
    }

    // Prepare update
    const updateObj = {
      $inc: { usedCount: 1 }
    };

    // Add userId to usedBy array if provided (and valid)
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      updateObj.$addToSet = { usedBy: userId }; // Don't need to wrap in ObjectId anymore
    }

    // Update coupon
    const updatedCoupon = await Coupon.findByIdAndUpdate(
      couponId,
      updateObj,
      { new: true }
    );

    if (!updatedCoupon) {
      return res.status(404).json({ ok: false, message: 'Failed to update coupon' });
    }

    console.log('✅ Coupon marked as used successfully');
    
    return res.json({ 
      ok: true, 
      message: 'Coupon usage recorded', 
      data: {
        couponId: updatedCoupon._id,
        code: updatedCoupon.code,
        usedCount: updatedCoupon.usedCount,
        maxUses: updatedCoupon.maxUses
      }
    });

  } catch (err) {
    console.error('❌ markCouponUsed error:', err);
    res.status(500).json({ 
      ok: false, 
      message: 'Failed to mark coupon used', 
      error: err.message 
    });
  }
};