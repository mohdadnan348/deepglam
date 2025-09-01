const express = require("express");
const router = express.Router();

const { verifyJWT } = require("../middlewares/auth.middleware");
const sellerCtrl = require("../controllers/seller.controller");

// Create
router.post("/",  sellerCtrl.createSeller);

// Read
router.get("/",  sellerCtrl.getAllSellers);
//router.get("/me",  sellerCtrl.getMySellerProfile);
router.get("/disapproved",  sellerCtrl.getDisapprovedSellers); // enhanced list
router.get("/:id",  sellerCtrl.getSellerById);

// Update
router.patch("/:id",  sellerCtrl.updateSeller);
//router.patch("/:id/toggle-active",  sellerCtrl.toggleActive);

// Approvals (kept as you asked)
router.patch("/:sellerId/approve",  sellerCtrl.approveSeller);
router.patch("/:id/reject",  sellerCtrl.rejectSeller);

// Delete
//router.delete("/:id",  sellerCtrl.deleteSeller);

module.exports = router;
