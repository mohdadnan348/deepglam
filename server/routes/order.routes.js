// routes/order.routes.js
const express = require("express");
const router = express.Router();

const { verifyJWT, requireRole } = require("../middlewares/auth.middleware");
const orderCtrl = require("../controllers/order.controller");

// ---------------------------
// BUYER: CREATE ORDER
// ---------------------------
router.post("/", verifyJWT, requireRole(["buyer"]), orderCtrl.createOrder);

// ---------------------------
// COMMON AUTH ROUTES (ALL AUTH USERS)
// ---------------------------
router.get("/my", verifyJWT, orderCtrl.getOrders);

// Brand-wise bill
router.get("/bill/:orderId", verifyJWT, orderCtrl.getBrandWiseBill);

// Update status
router.put("/status/:orderId", verifyJWT, orderCtrl.updateOrderStatus);

// Cancel order
router.delete("/:orderId/cancel", verifyJWT, orderCtrl.cancelOrder);

// ---------------------------
// SELLER ROUTES
// ---------------------------
router.get("/seller/dashboard", verifyJWT, requireRole(["seller"]), orderCtrl.getSellerDashboard);
router.get("/seller/earnings", verifyJWT, requireRole(["seller"]), orderCtrl.getSellerEarnings);

// ---------------------------
// STAFF ROUTES
// ---------------------------
router.get("/staff/dashboard", verifyJWT, requireRole(["staff"]), orderCtrl.getStaffDashboard);
router.get("/staff/buyers", verifyJWT, requireRole(["staff"]), orderCtrl.getStaffBuyers);

// Payment update
router.put("/payment/:orderId", verifyJWT, requireRole(["staff", "admin"]), orderCtrl.updatePaymentStatus);

// Dispatch (bulk shipping)
router.post("/dispatch", verifyJWT, requireRole(["staff", "admin", "seller"]), orderCtrl.bulkDispatchOrders);

// ---------------------------
// ADMIN ROUTES
// ---------------------------
router.put("/bulk-update", verifyJWT, requireRole(["staff", "admin"]), orderCtrl.bulkUpdateOrders);

// Admin + staff both can view full list
router.get("/", verifyJWT, orderCtrl.getOrders);

// ---------------------------
// PARAM ROUTE — ALWAYS LAST!
// ---------------------------
router.get("/:orderId", verifyJWT, orderCtrl.getOrderById);

module.exports = router;
