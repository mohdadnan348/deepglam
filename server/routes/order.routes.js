

// routes/order.routes.js
const express = require("express");
const router = express.Router();
const { verifyJWT, requireRole } = require("../middlewares/auth.middleware");
const orderCtrl = require("../controllers/order.controller");

// ✅ 1. BUYER ROUTES
router.post("/", verifyJWT, requireRole(["buyer"]), orderCtrl.createOrder);

// ✅ 2. COMMON ROUTES (All authenticated users)
router.get("/my", verifyJWT, orderCtrl.getOrders);
router.get("/:orderId", verifyJWT, orderCtrl.getOrderById);
router.get("/:orderId/bill", verifyJWT, orderCtrl.getBrandWiseBill);
router.put("/:orderId/status", verifyJWT, orderCtrl.updateOrderStatus);
router.delete("/:orderId", verifyJWT, orderCtrl.cancelOrder);

// ✅ 3. SELLER ROUTES
router.get("/seller/dashboard", verifyJWT, requireRole(["seller"]), orderCtrl.getSellerDashboard);
router.get("/seller/earnings", verifyJWT, requireRole(["seller"]), orderCtrl.getSellerEarnings);

// ✅ 4. STAFF ROUTES  
router.get("/staff/dashboard", verifyJWT, requireRole(["staff"]), orderCtrl.getStaffDashboard);
router.get("/staff/buyers", verifyJWT, requireRole(["staff"]), orderCtrl.getStaffBuyers);
router.put("/:orderId/payment", verifyJWT, requireRole(["staff", "admin"]), orderCtrl.updatePaymentStatus);
router.post("/dispatch", verifyJWT, requireRole(["staff", "admin"]), orderCtrl.bulkDispatchOrders);

// ✅ 5. ADMIN ROUTES
router.get("/", verifyJWT, requireRole(["admin"]), orderCtrl.getOrders);
router.put("/bulk", verifyJWT, requireRole(["staff", "admin"]), orderCtrl.bulkUpdateOrders);

module.exports = router;
