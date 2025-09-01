// server/routes/buyer.routes.js
const express = require("express");
const router = express.Router();
const { verifyJWT } = require("../middlewares/auth.middleware");
const buyerCtrl = require("../controllers/buyer.controller");

// Create & CRUD
router.post("/",  buyerCtrl.createBuyer);
router.patch("/:id/address", buyerCtrl.updateBuyerAddress);
router.patch("/:id",  buyerCtrl.updateBuyer);
router.get("/:id",  buyerCtrl.getBuyerById);
router.get("/",  buyerCtrl.getAllBuyers);
router.delete("/:id", buyerCtrl.deleteBuyer);

// Optional: buyer orders list
router.get("/:id/orders",  buyerCtrl.getBuyerOrders);

module.exports = router;
