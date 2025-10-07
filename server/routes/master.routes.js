// 📁 server/routes/master.routes.js
const express = require('express');
const router = express.Router();
const masterController = require('../controllers/master.controller');

// HSN Routes
router.post('/hsn', masterController.createHSN);
router.get('/hsn', masterController.getHSNs);
router.get('/hsn/:id', masterController.getHSNById);
router.put('/hsn/:id', masterController.updateHSN);
router.delete('/hsn/:id', masterController.deleteHSN);

// Location Routes
router.post('/location', masterController.createLocation);
router.get('/location', masterController.getAllLocations);
router.get('/location/:pincode', masterController.getLocation);
router.put('/location/upsert', masterController.upsertLocation);
router.put('/location/:id', masterController.updateLocation);
router.delete('/location/:id', masterController.deleteLocation);

// Profit Margin Routes
router.post('/profit', masterController.createProfit);
router.get('/profit', masterController.getProfits);
router.get('/profit/:id', masterController.getProfitById);
router.put('/profit/set', masterController.setProfit);
router.put('/profit/:id', masterController.updateProfit);
router.delete('/profit/:id', masterController.deleteProfit);

// Banner Routes
router.post('/banner', masterController.createBanner);
router.get('/banner', masterController.getBanners);
router.get('/banner/:id', masterController.getBannerById);
router.put('/banner/:id', masterController.updateBanner);
router.delete('/banner/:id', masterController.deleteBanner);

router.post('/coupons', masterController.createCoupon);
router.get('/coupons', masterController.getCoupons);
router.delete('/coupons/:id', masterController.deleteCoupon);
router.post('/coupons/validate', masterController.validateCoupon);
router.post('/coupons/mark-used', masterController.markCouponUsed);


module.exports = router;
