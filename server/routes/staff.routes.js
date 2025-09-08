// routes/staff.routes.js
const express = require("express");
const router = express.Router();
const staffCtrl = require("../controllers/staff.controller");
const orderCtrl = require("../controllers/order.controller");
const { verifyJWT, requireRole } = require("../middlewares/auth.middleware");

// ✅ STAFF MANAGEMENT (Admin Only)
router.post("/", verifyJWT, requireRole(["admin"]), staffCtrl.createStaff);
router.get("/",  staffCtrl.getAllStaff);
router.patch("/:id", verifyJWT, requireRole(["admin"]), staffCtrl.updateStaff);
router.get("/:id", staffCtrl.getStaffById);

// ✅ ATTENDANCE (Staff Only)
router.post("/attendance/check-in", verifyJWT, requireRole(["staff"]), staffCtrl.checkIn);
router.post("/attendance/check-out", verifyJWT, requireRole(["staff"]), staffCtrl.checkOut);
router.get("/attendance/me", verifyJWT, requireRole(["staff"]), staffCtrl.myAttendance);

// ✅ STAFF DASHBOARD & KPIs (Staff Only)
router.get("/summary/me", verifyJWT, requireRole(["staff"]), staffCtrl.mySummary);
router.get("/buyers", verifyJWT, requireRole(["staff", "admin"]), staffCtrl.myBuyers);

// ✅ STAFF PAYMENTS (Staff Only)
router.get("/payments/pending", verifyJWT, requireRole(["staff"]), staffCtrl.pendingPaymentsByStaff);

// ✅ TARGETS & SALES REPORTS
router.post("/:staffId/target", verifyJWT, requireRole(["admin"]), staffCtrl.setTarget);
router.get("/:staffId/target", verifyJWT, requireRole(["admin", "staff"]), staffCtrl.getTarget);
router.get("/:staffId/sales-report", verifyJWT, requireRole(["admin", "staff"]), staffCtrl.getSalesReport);



module.exports = router;
