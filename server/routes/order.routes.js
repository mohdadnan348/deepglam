// server/routes/order.routes.js
const express = require("express");
const router = express.Router();
const { verifyJWT } = require("../middlewares/auth.middleware");
const orderCtrl = require("../controllers/order.controller");

// Essentials only
router.post("/",  orderCtrl.placeOrder);
router.get("/",  orderCtrl.getAllOrders);
router.get("/:id",  orderCtrl.getOrderById);
router.patch("/:id/status",  orderCtrl.updateStatus);

module.exports = router;
