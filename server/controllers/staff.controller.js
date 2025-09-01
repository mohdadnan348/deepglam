
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

// Models
const Staff = require("../models/staff.model");
const Attendance = require("../models/attendance.model");
//const Order = require("../models/order.model");
const Buyer = require("../models/buyer.model");
const User = require("../models/user.model");
const Order = require("../models/order.model");
const Product = require("../models/product.model"); // optional (single product name ke liye)
const Seller = require("../models/seller.model");   // seller populate ke liye

const PaymentReceipt = require("../models/paymentReceipt.model");

const generateBillPDF = require("../utils/generateBillPDF");

// --- Cloudinary raw upload helper (use if you already use cloudinary) ---
const cloudinary = require("cloudinary").v2;
// make sure cloudinary.config(...) kahin app bootstrap me set hai
function uploadRawBuffer(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "raw", public_id: publicId, overwrite: true },
      (err, res) => (err ? reject(err) : resolve(res))
    );
    stream.end(buffer);
  });
}

// --- Local fallback (agar Cloudinary nahi use kar rahe ho) ---
// const fs = require("fs/promises");
// const path = require("path");
// async function uploadRawBuffer(buffer, publicId) {
//   const filePath = path.join(__dirname, `../public/invoices/${publicId}.pdf`);
//   await fs.mkdir(path.dirname(filePath), { recursive: true });
//   await fs.writeFile(filePath, buffer);
//   return { secure_url: `/invoices/${publicId}.pdf`, url: `/invoices/${publicId}.pdf` };
// }


// ---------- Config ----------
const OFFICE_LAT = Number(process.env.OFFICE_LAT || 28.6139);
const OFFICE_LNG = Number(process.env.OFFICE_LNG || 77.2090);
const GEOFENCE_RADIUS_M = Number(process.env.GEOFENCE_RADIUS_M || 300);
const SHIFT_START = process.env.SHIFT_START || "09:00";
const SHIFT_END = process.env.SHIFT_END || "18:30";

// ---------- Helpers ----------
const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const fail = (res, error, status = 400) => res.status(status).json({ ok: false, error });

const ensureRole = (req, roles = []) => {
  const role = req.user?.role || req.auth?.role;
  if (!role || !roles.includes(role)) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
};

const parseHHMM = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};
const inShift = (now = new Date()) => {
  const s = parseHHMM(SHIFT_START);
  const e = parseHHMM(SHIFT_END);
  return now >= s && now <= e;
};
const toRad = (x) => (x * Math.PI) / 180;
const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Resolve staff for current requester
const getStaffForReq = async (req) => {
  if (req.auth?.staffId) {
    const byId = await Staff.findById(req.auth.staffId);
    if (byId) return byId;
  }
  if (req.user?._id) {
    const byUser = await Staff.findOne({ userId: req.user._id });
    if (byUser) return byUser;
  }
  if (req.user?.phone) {
    const byPhone = await Staff.findOne({ phone: req.user.phone });
    if (byPhone) return byPhone;
  }
  if (req.user?.email) {
    const byEmail = await Staff.findOne({ email: req.user.email });
    if (byEmail) return byEmail;
  }
  const err = new Error("Staff record not found for current user");
  err.status = 404;
  throw err;
};

// Unique employee code like EMA12345
async function generateRandomEmployeeCode() {
  let code, exists = true;
  while (exists) {
    const num = Math.floor(10000 + Math.random() * 90000); // 5 digits
    code = `EMA${num}`;
    exists = await Staff.exists({ employeeCode: code });
  }
  return code;
}

// ---------- Controllers ----------
// Create Staff + link User (safe)
// - User: hashed password always
// - Staff: plain password (Staff model's pre-save will hash)
const createStaff = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      name,
      phone,
      email,        // optional in API; if your User schema requires it, we autogenerate
      password,     // required
      address,
      photo,
      salary,
      travelAllowance,
      target,
      bankDetails,
      isActive,
      fcmToken,
    } = req.body;

    if (!name || !phone || !password) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ ok: false, error: "name, phone and password are required" });
    }

    const emailNorm = email ? String(email).trim().toLowerCase() : undefined;
    // If your User schema requires email, use a safe fallback when not provided
    const emailToUse = emailNorm || `${phone}@autogen.local`;

    // Hash only for User (Staff model will hash itself in pre('save'))
    const userHashed = await bcrypt.hash(password, 10);

    // 1) Find-or-create User
    let user = await User.findOne({
      $or: [{ phone }, ...(emailNorm ? [{ email: emailNorm }] : [{ email: emailToUse }])],
    }).session(session);

    if (!user) {
      const created = await User.create([{
        name,
        phone,
        email: emailToUse,
        password: userHashed,        // hashed for User
        role: "staff",
        isActive: true,
        isApproved: true
      }], { session });
      user = created[0];
    } else {
      // Ensure role/password/flags present
      if (user.role !== "staff") user.role = "staff";
      if (!user.name) user.name = name;
      if (!user.email) user.email = emailToUse;
      if (!user.password) user.password = userHashed;   // set password if missing
      if (typeof user.isApproved === "undefined") user.isApproved = true;
      if (typeof user.isActive === "undefined") user.isActive = true;
      await user.save({ session });
    }

    // 2) Create Staff (plain password → Staff model will hash via pre-save)
    const employeeCode = await generateRandomEmployeeCode();

    const staffDocs = await Staff.create([{
      name,
      phone,
      email: emailNorm,          // can be undefined; not required here
      password,                  // PLAIN here (pre-save in Staff will hash)
      address,
      photo,
      salary,
      travelAllowance,
      target,
      bankDetails,
      isActive: typeof isActive === "boolean" ? isActive : true,
      fcmToken,
      role: "staff",
      userId: user._id,
      employeeCode,
    }], { session });

    const staff = staffDocs[0];

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      ok: true,
      message: "Staff & User created/linked successfully",
      data: {
        staff,
        user: { _id: user._id, name: user.name, phone: user.phone, email: user.email, role: user.role }
      }
    });
  } catch (e) {
    await session.abortTransaction();
    session.endSession();

    if (e?.code === 11000) {
      const msg =
        (e.keyPattern?.phone && "Phone already exists") ||
        (e.keyPattern?.email && "Email already exists") ||
        (e.keyPattern?.employeeCode && "Employee code already exists") ||
        "Duplicate key";
      return res.status(409).json({ ok: false, error: msg });
    }
    return res.status(500).json({ ok: false, error: e.message || "Create staff+user failed" });
  }
};


// List / search staff
const getAllStaff = async (req, res) => {
  try {
    const { search, role, isActive } = req.query;
    const filter = {};

    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { name: regex },
        { phone: regex },
        { email: regex },
        { employeeCode: regex },
      ];
    }
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const staffList = await Staff.find(filter).sort({ createdAt: -1 }).select("-password");
    const total = await Staff.countDocuments(filter);

    return ok(res, { total, items: staffList });
  } catch (err) {
    return fail(res, err.message || "Failed to fetch staff", 500);
  }
};

const getStaffByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const staff = await Staff.findOne({ employeeCode: code });
    if (!staff) return fail(res, "Staff not found", 404);
    return ok(res, staff);
  } catch (e) {
    return fail(res, e.message);
  }
};

const updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (updates.employeeCode && !/^EMA\d{5}$/.test(updates.employeeCode)) {
      return fail(res, "employeeCode must be like EMA00001", 400);
    }

    const staff = await Staff.findByIdAndUpdate(id, updates, { new: true });
    if (!staff) return fail(res, "Staff not found", 404);
    return ok(res, staff);
  } catch (e) {
    if (e?.code === 11000) {
      if (e.keyPattern?.phone) return fail(res, "Phone already exists", 409);
      if (e.keyPattern?.email) return fail(res, "Email already exists", 409);
      if (e.keyPattern?.employeeCode) return fail(res, "Employee code already exists", 409);
    }
    return fail(res, e.message || "Update failed");
  }
};

// Summary (counts + amounts + today)
const mySummary = async (req, res) => {
  try {
    ensureRole(req, ["staff"]);
    const staff = await getStaffForReq(req);

    const { from, to } = req.query;
    const match = {
      $or: [
        { staffId: staff._id },
        { staffCode: staff.employeeCode },
        { createdBy: staff._id },
      ],
    };
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) match.createdAt.$lte = new Date(to + "T23:59:59.999Z");
    }

    const summaryAgg = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          confirmed: { $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] } },
          rtd: { $sum: { $cond: [{ $eq: ["$status", "ready-to-dispatch"] }, 1, 0] } },
          dispatched: { $sum: { $cond: [{ $eq: ["$status", "dispatched"] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          returned: { $sum: { $cond: [{ $eq: ["$status", "returned"] }, 1, 0] } },
          amountTotal: { $sum: { $ifNull: ["$payment.total", 0] } },
          amountReceived: { $sum: { $ifNull: ["$payment.received", 0] } },
          buyersSet: { $addToSet: "$buyerId" },
        },
      },
      {
        $project: {
          _id: 0,
          totalOrders: 1,
          confirmed: 1,
          rtd: 1,
          dispatched: 1,
          delivered: 1,
          cancelled: 1,
          returned: 1,
          amountTotal: 1,
          amountReceived: 1,
          amountPending: { $subtract: ["$amountTotal", "$amountReceived"] },
          uniqueBuyers: { $size: "$buyersSet" },
        },
      },
    ]);

    const summary = summaryAgg[0] || {
      totalOrders: 0, confirmed: 0, rtd: 0, dispatched: 0, delivered: 0,
      cancelled: 0, returned: 0, amountTotal: 0, amountReceived: 0,
      amountPending: 0, uniqueBuyers: 0,
    };

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const ordersToday = await Order.countDocuments({
      ...match, createdAt: { $gte: todayStart, $lte: todayEnd },
    });

    return ok(res, { employeeCode: staff.employeeCode, ...summary, ordersToday });
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};

// My Buyers (owned by this staff)
const myBuyers = async (req, res) => {
  try {
    ensureRole(req, ["staff"]);
    const staff = await getStaffForReq(req);

    const { q, page = 1, limit = 20 } = req.query;
    const filter = { $or: [{ staffId: staff._id }, { staffCode: staff.employeeCode }] };
    if (q) {
      const regex = new RegExp(q, "i");
      filter.$and = (filter.$and || []).concat([{
        $or: [{ name: regex }, { shopName: regex }, { mobile: regex }, { email: regex }]
      }]);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Buyer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Buyer.countDocuments(filter),
    ]);

    return ok(res, { items, total, page: Number(page), pages: Math.max(1, Math.ceil(total / Number(limit))) });
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};

// My Orders (include orders of my buyers)
const myOrders = async (req, res) => {
  try {
    ensureRole(req, ["staff"]);
    const staff = await getStaffForReq(req);

    const { status, q, page = 1, limit = 20, from, to } = req.query;

    // find my buyers
    const myBuyerIds = await Buyer.find(
      { $or: [{ staffId: staff._id }, { staffCode: staff.employeeCode }] },
      { _id: 1 }
    ).lean();
    const buyerIdList = myBuyerIds.map((b) => b._id);

    const filter = {
      $or: [
        { staffId: staff._id },
        { staffCode: staff.employeeCode },
        { createdBy: staff._id },
        ...(buyerIdList.length ? [{ buyerId: { $in: buyerIdList } }] : []),
      ],
    };

    if (status) filter.status = status;

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to + "T23:59:59.999Z");
    }

    if (q) {
      const regex = new RegExp(q, "i");
      filter.$and = (filter.$and || []).concat([{ $or: [{ orderNo: regex }, { buyerName: regex }] }]);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const projection = {
      orderNo: 1, buyerId: 1, buyerName: 1, status: 1,
      "payment.total": 1, "payment.received": 1, createdAt: 1,
    };

    const [items, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).select(projection),
      Order.countDocuments(filter),
    ]);

    return ok(res, { items, total, page: Number(page), pages: Math.max(1, Math.ceil(total / Number(limit))) });
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};

// Orders count (total • monthly • pending) + optional rangeTotal
const myOrdersCount = async (req, res) => {
  try {
    ensureRole(req, ["staff"]);
    const staff = await getStaffForReq(req);
    if (!staff) return fail(res, "Staff record not found for current user", 404);

    const { from, to, month } = req.query;

    // --- include orders of my buyers ---
    const myBuyerIds = await Buyer.find(
      { $or: [{ staffId: staff._id }, { staffCode: staff.employeeCode }] },
      { _id: 1 }
    ).lean();
    const buyerIdList = myBuyerIds.map((b) => b._id);

    // base match for this staff + his buyers
    const baseMatch = {
      $or: [
        { staffId: staff._id },
        { staffCode: staff.employeeCode },
        { createdBy: staff._id },
        ...(buyerIdList.length ? [{ buyerId: { $in: buyerIdList } }] : []),
      ],
    };

    // month window (YYYY-MM) → [start, end)
    const getMonthWindow = (mStr) => {
      const now = new Date();
      let y = now.getFullYear(), m = now.getMonth(); // 0-indexed
      if (mStr) {
        const [yy, mm] = mStr.split("-").map((n) => parseInt(n, 10));
        if (yy && mm >= 1 && mm <= 12) { y = yy; m = mm - 1; }
      }
      const start = new Date(y, m, 1, 0, 0, 0, 0);
      const end   = new Date(y, m + 1, 1, 0, 0, 0, 0);
      return { start, end };
    };

    const { start, end } = getMonthWindow(month); // default current month

    // Counts in parallel
    const totalPromise   = Order.countDocuments(baseMatch);
    const monthlyPromise = Order.countDocuments({ ...baseMatch, createdAt: { $gte: start, $lt: end } });
    const pendingPromise = Order.countDocuments({
      ...baseMatch,
      status: { $in: ["confirmed", "ready-to-dispatch"] },
    });

    // Optional custom range total (if from/to provided)
    let rangePromise = undefined;
    if (from || to) {
      const range = {};
      if (from) range.$gte = new Date(from);
      if (to)   range.$lte = new Date(to + "T23:59:59.999Z");
      rangePromise = Order.countDocuments({ ...baseMatch, createdAt: range });
    }

    const [total, monthly, pending, rangeTotal] = await Promise.all([
      totalPromise,
      monthlyPromise,
      pendingPromise,
      rangePromise ?? Promise.resolve(undefined),
    ]);

    return ok(res, {
      employeeCode: staff.employeeCode,
      total,
      monthly,
      pending,
      ...(rangeTotal !== undefined ? { rangeTotal } : {}),
    });
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};


const checkIn = async (req, res) => {
  try {
    ensureRole(req, ["staff"]);
    const { lat, lng } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number") return fail(res, "lat/lng required", 400);

    const staff = await getStaffForReq(req);

    const dist = haversineMeters(lat, lng, OFFICE_LAT, OFFICE_LNG);
    const withinFence = dist <= GEOFENCE_RADIUS_M;
    const now = new Date();

    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayStart.getDate() + 1);

    const existing = await Attendance.findOne({ staffId: staff._id, date: { $gte: dayStart, $lt: dayEnd } });
    if (existing?.checkIn?.time) return fail(res, "Already checked-in", 409);

    const status = inShift(now) ? "present" : "late";

    const att = await Attendance.findOneAndUpdate(
      { staffId: staff._id, date: { $gte: dayStart, $lt: dayEnd } },
      { $set: { staffId: staff._id, date: new Date(), status, checkIn: { time: now, lat, lng, withinFence } } },
      { upsert: true, new: true }
    );

    return ok(res, { attendance: att, geo: { distance: dist, withinFence }, shift: { within: inShift(now) } }, 201);
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};

// Attendance: check-out
const checkOut = async (req, res) => {
  try {
    ensureRole(req, ["staff"]);
    const { lat, lng } = req.body;

    const staff = await getStaffForReq(req);

    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayStart.getDate() + 1);

    const att = await Attendance.findOne({ staffId: staff._id, date: { $gte: dayStart, $lt: dayEnd } });
    if (!att || !att.checkIn?.time) return fail(res, "No check-in found for today", 400);
    if (att.checkOut?.time) return fail(res, "Already checked-out", 409);

    const dist = haversineMeters(lat, lng, OFFICE_LAT, OFFICE_LNG);
    const now = new Date();

    att.checkOut = { time: now, lat, lng, withinFence: dist <= GEOFENCE_RADIUS_M };
    await att.save();

    return ok(res, att);
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};

// Attendance: monthly list
const myAttendance = async (req, res) => {
  try {
    ensureRole(req, ["staff"]);
    const staff = await getStaffForReq(req);

    const { month } = req.query; // YYYY-MM
    const start = month ? new Date(`${month}-01T00:00:00.000Z`) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = new Date(start); end.setMonth(end.getMonth() + 1);

    const list = await Attendance.find({ staffId: staff._id, date: { $gte: start, $lt: end } }).sort({ date: 1 });
    return ok(res, list);
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};
/*
// Ready to dispatch
const markReadyToDispatch = async (req, res) => {
  try {
    const role = req.user?.role || req.auth?.role;
    if (!["staff", "seller", "admin", "superadmin"].includes(role)) return fail(res, "Forbidden", 403);

    const { id } = req.params;
    const { note, courier, awb } = req.body;

    const order = await Order.findById(id);
    if (!order) return fail(res, "Order not found", 404);

    if (role === "staff") {
      const staff = await getStaffForReq(req);
      // ensure ownership
      if (
        String(order.staffId || "") !== String(staff._id) &&
        order.staffCode !== staff.employeeCode &&
        String(order.createdBy || "") !== String(staff._id)
      ) {
        return fail(res, "Forbidden for this order", 403);
      }
    }

    order.status = "ready-to-dispatch";
    order.dispatchInfo = { courier, awb, note, at: new Date(), by: req.user?._id };
    order.logs = order.logs || [];
    order.logs.push({ at: new Date(), by: req.user?._id, action: "READY_TO_DISPATCH", note });
    await order.save();

    return ok(res, order);
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};
*//*
const markReadyToDispatch = async (req, res) => {
  try {
    const role = req.user?.role || req.auth?.role;
    if (!["staff", "seller", "admin", "superadmin"].includes(role)) {
      return fail(res, "Forbidden", 403);
    }

    const { id } = req.params;
    const { note, courier, awb } = req.body;

    // populate for invoice fields that exist in your schema
    const order = await Order.findById(id)
      .populate("buyerId", "name phone email")
      .populate("sellerId", "brandName")
      .populate("product", "productname");

    if (!order) return fail(res, "Order not found", 404);

    // ----- staff ownership (with first-claim fallback) -----
    if (role === "staff") {
      const staff = await getStaffForReq(req);

      const hasOwner = !!order.staffId || !!order.staffCode || !!order.createdBy;
      const belongs =
        String(order.staffId || "") === String(staff._id) ||
        order.staffCode === staff.employeeCode ||
        String(order.createdBy || "") === String(staff._id);

      if (!hasOwner) {
        order.staffId = staff._id;
        order.staffCode = staff.employeeCode;
        order.createdBy = req.user?._id;
      } else if (!belongs) {
        return fail(res, "Forbidden for this order", 403);
      }
    }

    // ----- update order to dispatched -----
    order.status = "dispatched";
    order.dispatchInfo = { courier, awb, note, at: new Date(), by: req.user?._id };
    order.logs = order.logs || [];
    order.logs.push({ at: new Date(), by: req.user?._id, action: "DISPATCHED", note });
    await order.save();

    // ----- build invoice payload -----
    const lineItems = (order.products || []).map((li, idx) => ({
      sn: idx + 1,
      // products[] doesn’t carry productId in your schema, so use single `product` name for all rows
      name: order.product?.productname || `Item ${idx + 1}`,
      qty: Number(li.quantity || 1),
      price: Number(li.price || 0),
      total: Number(li.total || 0),
    }));

    const payload = {
      orderId: order._id,
      date: order.createdAt,
      buyer: order.buyerId
        ? { name: order.buyerId.name, phone: order.buyerId.phone, email: order.buyerId.email }
        : null,
      seller: order.sellerId ? { brandName: order.sellerId.brandName } : null,
      address: {
        fullAddress: order.fullAddress,
        city: order.city,
        state: order.state,
        pincode: order.pincode,
        country: order.country || "India",
      },
      lineItems,
      totals: {
        totalAmount: Number(order.totalAmount || 0),
        discountAmount: Number(order.discountAmount || 0),
        gstAmount: Number(order.gstAmount || 0),
        finalAmount: Number(order.finalAmount || 0),
      },
      dispatch: { courier, awb, note, at: order.dispatchInfo?.at },
    };

    // ----- generate + upload PDF -----
    const pdfBuffer = await generateBillPDF(payload);           // returns Buffer
    const publicId = `invoices/order-${String(order._id)}`;     // path/key
    const uploaded = await uploadRawBuffer(pdfBuffer, publicId); // -> { url / secure_url }

    order.invoiceUrl = uploaded.secure_url || uploaded.url || order.invoiceUrl;
    await order.save();

    return ok(res, order);
  } catch (e) {
    console.error("markReadyToDispatch error:", e);
    return fail(res, e.message, e.status || 400);
  }
};
*/

const markReadyToDispatch = async (req, res) => {
  try {
    const role = req.user?.role || req.auth?.role;
    if (!["staff", "seller", "admin", "superadmin"].includes(role)) {
      return fail(res, "Forbidden", 403);
    }

    const { id } = req.params;
    const { note, courier, awb } = req.body;

    // pull all data needed for invoice
    const order = await Order.findById(id)
      .populate("buyerId", "name phone email")      // User
      .populate("sellerId", "brandName")            // Seller
      .populate("product", "productname");          // Product (optional)

    if (!order) return fail(res, "Order not found", 404);

    // ---- Staff ownership guard (with auto-claim if owner is empty) ----
    if (role === "staff") {
      const staff = await getStaffForReq(req);
      if (!staff) return fail(res, "Forbidden", 403);

      const hasOwner = !!order.staffId || !!order.staffCode || !!order.createdBy;
      const belongs =
        String(order.staffId || "") === String(staff._id) ||
        order.staffCode === staff.employeeCode ||
        String(order.createdBy || "") === String(staff._id);

      if (!hasOwner) {
        // claim it for this staff
        order.staffId = staff._id;
        order.staffCode = staff.employeeCode;
        order.createdBy = req.user?._id;
        await order.save();
      } else if (!belongs) {
        return fail(res, "Forbidden for this order", 403);
      }
    }

    // ---- Mark as dispatched & log ----
    order.status = "dispatched";
    order.dispatchInfo = { courier, awb, note, at: new Date(), by: req.user?._id };
    order.logs = order.logs || [];
    order.logs.push({
      at: new Date(),
      by: req.user?._id,
      action: "DISPATCHED",
      note
    });
    await order.save();

    // ---- Build invoice payload for PDF ----
    const lineItems = (order.products || []).map((li, idx) => ({
      sn: idx + 1,
      name: order.product?.productname || `Item ${idx + 1}`, // fallback if you track one product separately
      qty: Number(li.quantity || 1),
      price: Number(li.price || 0),
      total: Number(li.total || 0),
    }));

    const payload = {
      orderId: order._id,
      date: order.createdAt,
      buyer: order.buyerId
        ? { name: order.buyerId.name, phone: order.buyerId.phone, email: order.buyerId.email }
        : null,
      seller: order.sellerId ? { brandName: order.sellerId.brandName } : null,
      address: {
        fullAddress: order.fullAddress,
        city: order.city,
        state: order.state,
        pincode: order.pincode,
        country: order.country || "India",
      },
      lineItems,
      totals: {
        totalAmount: Number(order.totalAmount || 0),
        discountAmount: Number(order.discountAmount || 0),
        gstAmount: Number(order.gstAmount || 0),
        finalAmount: Number(order.finalAmount || 0),
      },
      dispatch: { courier, awb, note, at: order.dispatchInfo?.at },
    };

    // ---- Generate PDF (Buffer) ----
    const pdfBuffer = await generateBillPDF(payload);

    // ---- Upload PDF & save invoiceUrl ----
    // Replace this helper with your Cloudinary/S3 uploader.
    // It should accept a Buffer and return { url / secure_url }.
    const publicId = `order-${order._id}`;
    const uploaded = await uploadRawBuffer(pdfBuffer, publicId, {
      folder: "invoices",           // optional
      filename: `invoice-${order._id}.pdf`,
      contentType: "application/pdf"
    });

    order.invoiceUrl = uploaded.secure_url || uploaded.url || order.invoiceUrl;
    await order.save();

    return ok(res, order);
  } catch (e) {
    console.error("markReadyToDispatch error:", e);
    return fail(res, e.message, e.status || 400);
  }
};

const pendingPaymentsByStaff = async (req, res) => {
  try {
    const staff = await getStaffForReq(req);
    if (!staff) return res.status(404).json({ ok: false, error: 'Staff not found' });

    const page  = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const minDays = Number(req.query.minDays) || 0;
    const sinceDate = minDays ? new Date(Date.now() - minDays * 86400000) : null;

    const matchOrders = {
      $or: [
        { staffId: staff._id },
        { staffCode: staff.employeeCode },
        { createdBy: staff._id },
      ],
    };

    // pipeline to group dues per buyer
    const base = [
      { $match: matchOrders },
      {
        $project: {
          buyerId: 1,
          createdAt: 1,
          paymentTotal: { $ifNull: ["$payment.total", 0] },
          paymentReceived: { $ifNull: ["$payment.received", 0] },
          lastPaymentAt: { $ifNull: ["$payment.lastReceivedAt", null] },
        },
      },
      {
        $project: {
          buyerId: 1,
          createdAt: 1,
          lastPaymentAt: 1,
          balance: { $subtract: ["$paymentTotal", "$paymentReceived"] },
        },
      },
      {
        $group: {
          _id: "$buyerId",
          pending: { $sum: "$balance" },
          lastInvoiceAt: { $max: "$createdAt" },
          lastPaymentAt: { $max: "$lastPaymentAt" },
        },
      },
      { $match: { pending: { $gt: 0 } } },
      // optional aging filter AFTER group (because we have lastInvoiceAt now)
      ...(sinceDate ? [{ $match: { lastInvoiceAt: { $lte: sinceDate } } }] : []),
      {
        $lookup: {
          from: "buyers",           // ⚠️ collection name must match your Buyer collection
          localField: "_id",
          foreignField: "_id",
          as: "buyer",
        },
      },
      { $unwind: { path: "$buyer", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          buyerId: "$_id",
          dueAmount: "$pending",
          since: "$lastInvoiceAt",
          lastPaymentAt: 1,
          buyer: {
            _id: "$buyer._id",
            name: { $ifNull: ["$buyer.shopName", "$buyer.name"] },
            shopName: "$buyer.shopName",
            mobile: { $ifNull: ["$buyer.mobile", "$buyer.phone"] },
            phone: "$buyer.phone",
            city: "$buyer.city",
            state: "$buyer.state",
          },
        },
      },
      { $sort: { dueAmount: -1 } },
    ];

    const countPipeline = [...base, { $count: "total" }];
    const listPipeline  = [...base, { $skip: (page - 1) * limit }, { $limit: limit }];

    const [rows, countArr] = await Promise.all([
      Order.aggregate(listPipeline),
      Order.aggregate(countPipeline),
    ]);

    const total = countArr?.[0]?.total || 0;
    const hasMore = page * limit < total;

    return res.json({ ok: true, items: rows, total, hasMore });
  } catch (e) {
    const code = e.status || 400;
    return res.status(code).json({ ok: false, error: e.message || 'Something went wrong' });
  }
};



// Collect Payment from Buyer
const collectPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId, amount, method, reference, note } = req.body;
    const staffId = req.user.id; // assuming staff is logged in

    // 1. Find order
    const order = await Order.findById(orderId).session(session);
    if (!order) throw new Error("Order not found");

    // 2. Create payment receipt
    const receipt = await PaymentReceipt.create(
      [
        {
          orderId,
          buyerId: order.buyerId,
          staffId,
          staffCode: order.staffCode,
          amount,
          method,
          reference,
          note,
        },
      ],
      { session }
    );

    // 3. Update buyer currentDue
    await User.findByIdAndUpdate(
      order.buyerId,
      { $inc: { currentDue: -Number(amount) } },
      { session }
    );

    // 4. Update order payment status
    let newPaid = (order.paidAmount || 0) + Number(amount);
    let paymentStatus =
      newPaid >= order.totalAmount ? "paid" : "partially_paid";

    await Order.findByIdAndUpdate(
      orderId,
      { $set: { paidAmount: newPaid, paymentStatus } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      ok: true,
      message: "Payment collected successfully",
      receipt: receipt[0],
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ ok: false, error: error.message });
  }
};



// helper: month date range
function monthRange(year, month) {
  const start = dayjs().year(year).month(month - 1).startOf("month").toDate();
  const end   = dayjs().year(year).month(month - 1).endOf("month").toDate();
  return { start, end };
}

/**
 * POST /api/staff/:staffId/target
 * Body: { amount }
 * Sets/updates single rolling target
 */
const setTarget = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { amount } = req.body;
    if (amount == null) {
      return res.status(400).json({ message: "amount required" });
    }

    const staff = await Staff.findByIdAndUpdate(
      staffId,
      { $set: { target: Number(amount) } },
      { new: true }
    );
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    return res.json({ ok: true, message: "Target saved", target: staff.target });
  } catch (e) {
    return res.status(500).json({ message: "Failed to save target", error: e.message });
  }
};

/**
 * GET /api/staff/:staffId/target
 * Returns current rolling target number
 */
const getTarget = async (req, res) => {
  try {
    const { staffId } = req.params;
    const staff = await Staff.findById(staffId).lean();
    if (!staff) return res.status(404).json({ message: "Staff not found" });
    return res.json({ ok: true, target: Number(staff.target || 0) });
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch target", error: e.message });
  }
};

/**
 * GET /api/staff/:staffId/sales-report?month=&year=
 * Uses single `target` and computes ACTUAL for the month from orders
 */
const getSalesReport = async (req, res) => {
  try {
    const { staffId } = req.params;
    let { month, year } = req.query;

    const now = dayjs();
    month = Number(month || (now.month() + 1)); // 1..12
    year  = Number(year  || now.year());

    const staff = await Staff.findById(staffId).lean();
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    const { start, end } = monthRange(year, month);

    // ---- IMPORTANT: yahan apne Order field name ke hisab se change karna ho to karo ----
    // Agar aapke Order schema me staff reference ka naam 'employee' ya 'staff' hai,
    // to 'staffId' ke bajay woh use karein.
    const match = {
      status: { $in: ["confirmed", "dispatched", "delivered"] },
      createdAt: { $gte: start, $lte: end },
      staffId: new mongoose.Types.ObjectId(staffId), // <-- change this key name if needed
    };

    const salesAgg = await Order.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: "$finalAmount" } } } // or "$totalAmount"
    ]);

    const actual = salesAgg?.[0]?.total || 0;
    const target = Number(staff.target || 0);
    const achievedPercent = target > 0 ? Number(((actual / target) * 100).toFixed(2)) : 0;

    return res.json({
      ok: true,
      staff: { id: staff._id, name: staff.name, employeeCode: staff.employeeCode },
      month, year,
      target,
      actual,
      remaining: Math.max(target - actual, 0),
      achievedPercent,
      range: { start, end }
    });
  } catch (e) {
    console.error("getSalesReport error:", e);
    return res.status(500).json({ message: "Failed to compute sales report", error: e.message });
  }
};
// ---------- Exports ----------
module.exports = {
  createStaff,
  getAllStaff,
  getStaffByCode,
  updateStaff,

  mySummary,
  myBuyers,
  myOrders,
  myOrdersCount,

  checkIn,
  checkOut,
  myAttendance,

  markReadyToDispatch,
  pendingPaymentsByStaff,
  collectPayment,
  getSalesReport,
  getTarget,
  setTarget,

  _helpers: { getStaffForReq, inShift, haversineMeters },
};
