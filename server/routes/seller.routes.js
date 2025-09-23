// routes/seller.routes.js
const express = require("express");
const router = express.Router();

const { verifyJWT } = require("../middlewares/auth.middleware");
const sellerCtrl = require("../controllers/seller.controller");

// ✅ SELLER REGISTRATION 
router.post("/",  sellerCtrl.createSeller);

// ✅ SELLER DASHBOARD
// ---------- Seller Dashboard / Products ----------
router.get("/my/stats", verifyJWT, sellerCtrl.getMyStats);

// ✅ ADMIN MANAGEMENT 
// ---------- Admin: Manage Sellers ----------
router.get("/", sellerCtrl.getAllSellers);
router.get("/disapproved", sellerCtrl.getDisapprovedSellers);
router.patch("/:sellerId/approve", sellerCtrl.approveSeller);
router.patch("/:id/reject", sellerCtrl.rejectSeller);


// ✅ IMPORTANT: Keep parameterized route at the END
router.get("/:id", sellerCtrl.getSellerById); // 👈 keep this at the end

module.exports = router;
