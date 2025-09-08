const express = require("express");
const router = express.Router();

const { verifyJWT, requireRole } = require("../middlewares/auth.middleware");
const buyerCtrl = require("../controllers/buyer.controller");

// ✅ FIXED: Reorder routes to avoid conflicts
// Create buyer (no auth required for registration)
router.post("/", buyerCtrl.createBuyer);

// Get all buyers (admin/staff only)
router.get("/", verifyJWT, requireRole(['admin', 'superadmin', 'staff']), buyerCtrl.getAllBuyers);

// Get my profile (buyer only - no ID needed)
router.get("/my", verifyJWT, buyerCtrl.getBuyerProfile);

// Get specific buyer profile by ID (admin/staff can access any, buyer can access only own)
router.get("/:id", verifyJWT, buyerCtrl.getBuyerProfile);

// Get buyer orders
router.get("/:id/orders", verifyJWT, buyerCtrl.getBuyerOrders);

// Update buyer profile
router.patch("/:id", verifyJWT, buyerCtrl.updateBuyerProfile);

module.exports = router;
