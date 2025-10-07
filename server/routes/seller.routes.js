// routes/seller.routes.js
const express = require("express");
const router = express.Router();

const { verifyJWT } = require("../middlewares/auth.middleware");
const sellerCtrl = require("../controllers/seller.controller");

// ✅ SELLER REGISTRATION 
router.post("/", sellerCtrl.createSeller);

// ✅ SELLER DASHBOARD
router.get("/my/stats", verifyJWT, sellerCtrl.getMyStats);

// ✅ My brand (must be before parameterized routes)
router.get("/my/profile", verifyJWT, sellerCtrl.getMyProfile);

router.get("/", sellerCtrl.getAllSellers);
router.get("/disapproved", sellerCtrl.getDisapprovedSellers);
router.patch("/:sellerId/approve", sellerCtrl.approveSeller);
router.patch("/:id/reject", sellerCtrl.rejectSeller);

// IMPORTANT: parameterized /:id route MUST be at the END
router.get("/:id", sellerCtrl.getSellerById);

module.exports = router;
