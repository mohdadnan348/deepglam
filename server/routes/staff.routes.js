// routes/staff.routes.js
const express = require("express");
const router = express.Router();
const staffCtrl = require("../controllers/staff.controller");
const { verifyJWT } = require("../middlewares/auth.middleware");

// --- CRUD staff ---
router.post("/", staffCtrl.createStaff);          // POST /api/staff
router.get("/", staffCtrl.getAllStaff);           // GET /api/staff
router.get("/:code", staffCtrl.getStaffByCode);   // GET /api/staff/:code
router.patch("/:id", staffCtrl.updateStaff);      // PATCH /api/staff/:id

// --- Attendance ---
router.post("/attendance/check-in", staffCtrl.checkIn);
router.post("/attendance/check-out", staffCtrl.checkOut);
router.get("/attendance/me", staffCtrl.myAttendance);

// --- Summary / Buyers / Orders ---
router.get("/summary/me", staffCtrl.mySummary);
router.get("/buyers", staffCtrl.myBuyers);
router.get("/orders", staffCtrl.myOrders);
router.get("/orders/count", staffCtrl.myOrdersCount);

// --- Orders workflow ---
router.patch("/orders/:id/ready-to-dispatch", staffCtrl.markReadyToDispatch);

// --- Payments ---
router.get("/payments/pending", staffCtrl.pendingPaymentsByStaff);
router.post("/payments/collect", staffCtrl.collectPayment);

// --- Targets & Reports ---
router.post("/:staffId/target", staffCtrl.setTarget);
router.get("/:staffId/target", staffCtrl.getTarget);
router.get("/:staffId/sales-report", staffCtrl.getSalesReport);

module.exports = router;
