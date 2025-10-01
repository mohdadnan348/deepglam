// controllers/staff.controller.js
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const dayjs = require("dayjs");

const Staff = require("../models/staff.model");
const Attendance = require("../models/attendance.model");
const Buyer = require("../models/buyer.model");
const User = require("../models/user.model");
const Order = require("../models/order.model");
const Product = require("../models/product.model");
const Seller = require("../models/seller.model");

// ---------- Config ----------
const OFFICE_LAT = Number(process.env.OFFICE_LAT || 28.6139);
const OFFICE_LNG = Number(process.env.OFFICE_LNG || 77.2090);
const GEOFENCE_RADIUS_M = Number(process.env.GEOFENCE_RADIUS_M || 300);
const SHIFT_START = process.env.SHIFT_START || "09:00";
const SHIFT_END = process.env.SHIFT_END || "18:30";

// ---------- Helpers ----------
const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const fail = (res, error, status = 400) => res.status(status).json({ ok: false, error });

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

const getStaffForReq = async (req) => {
  if (req.user?.staffId) {
    const byId = await Staff.findById(req.user.staffId);
    if (byId) return byId;
  }

  if (!req.user?._id) {
    const err = new Error("Unauthorized: user missing");
    err.status = 401;
    throw err;
  }

  const staff = await Staff.findOne({ userId: req.user._id });
  if (staff) return staff;

  const err = new Error("Staff record not found for current user");
  err.status = 404;
  throw err;
};

async function generateRandomEmployeeCode() {
  let code, exists = true;
  while (exists) {
    const num = Math.floor(10000 + Math.random() * 90000);
    code = `EMA${num}`;
    exists = await Staff.exists({ employeeCode: code });
  }
  return code;
}

// ✅ 1. CREATE STAFF
exports.createStaff = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      name, phone, email, password,
      address, photo, salary, travelAllowance, target, bankDetails,
      isActive, fcmToken,
    } = req.body;

    if (!name || !phone || !password) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        ok: false, 
        error: "name, phone and password are required" 
      });
    }

    const emailNorm = email ? String(email).trim().toLowerCase() : undefined;
    const emailToUse = emailNorm || `${phone}@autogen.local`;
    const userHashed = await bcrypt.hash(password, 10);

    let user = await User.findOne({
      $or: [
        { phone }, 
        ...(emailNorm ? [{ email: emailNorm }] : [{ email: emailToUse }])
      ],
    }).session(session);

    if (!user) {
      const created = await User.create([{
        name, 
        phone, 
        email: emailToUse, 
        passwordHash: userHashed,
        role: "staff", 
        isActive: true, 
        isApproved: true
      }], { session });
      user = created[0];
    } else {
      if (user.role !== "staff") user.role = "staff";
      if (!user.name) user.name = name;
      if (!user.email) user.email = emailToUse;
      if (!user.passwordHash) user.passwordHash = userHashed;
      if (typeof user.isApproved === "undefined") user.isApproved = true;
      if (typeof user.isActive === "undefined") user.isActive = true;
      await user.save({ session });
    }

    const employeeCode = await generateRandomEmployeeCode();

    const staffDocs = await Staff.create([{
      name, 
      phone, 
      email: emailNorm, 
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
        user: { 
          _id: user._id, 
          name: user.name, 
          phone: user.phone, 
          email: user.email, 
          role: user.role 
        } 
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
    return res.status(500).json({ 
      ok: false, 
      error: e.message || "Create staff+user failed" 
    });
  }
};

// ✅ 2. GET ALL STAFF
exports.getAllStaff = async (req, res) => {
  try {
    const { search, role, isActive, page = 1, limit = 20 } = req.query;
    
    const filter = {};
    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { name: regex }, 
        { phone: regex }, 
        { email: regex }, 
        { employeeCode: regex }
      ];
    }
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [staffList, total] = await Promise.all([
      Staff.find(filter)
        .populate('userId', 'name phone email isActive')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select("-password"),
      Staff.countDocuments(filter)
    ]);

    return ok(res, { 
      items: staffList, 
      total, 
      page: pageNum,
      pages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    return fail(res, err.message || "Failed to fetch staff", 500);
  }
};

// ✅ 3. GET STAFF BY id
exports.getStaffById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const staff = await Staff.findById(id)
      .populate('userId', 'name email phone isActive')
      .lean();
      
    if (!staff) {
      return res.status(404).json({
        ok: false,
        message: "Staff not found"
      });
    }

    res.status(200).json({
      ok: true,
      data: staff
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Failed to fetch staff details"
    });
  }
};


// ✅ 4. UPDATE STAFF
exports.updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    
    if (updates.employeeCode && !/^EMA\d{5}$/.test(updates.employeeCode)) {
      return fail(res, "employeeCode must be like EMA00001", 400);
    }
    
    const staff = await Staff.findByIdAndUpdate(id, updates, { new: true })
      .populate('userId', 'name phone email');
    
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

// ✅ 5. STAFF SUMMARY & KPIs
exports.mySummary = async (req, res) => {
  try {
    const staff = await getStaffForReq(req);

    const { from, to } = req.query;
    const match = { staffUserId: staff._id };
    
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
          processing: { $sum: { $cond: [{ $eq: ["$status", "processing"] }, 1, 0] } },
          packed: { $sum: { $cond: [{ $eq: ["$status", "packed"] }, 1, 0] } },
          shipped: { $sum: { $cond: [{ $eq: ["$status", "shipped"] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          returned: { $sum: { $cond: [{ $eq: ["$status", "returned"] }, 1, 0] } },
          amountTotal: { $sum: { $ifNull: ["$finalAmountPaise", 0] } },
          amountReceived: { $sum: { $ifNull: ["$paidAmountPaise", 0] } },
          buyersSet: { $addToSet: "$buyerUserId" },
        },
      },
      {
        $project: {
          _id: 0,
          totalOrders: 1,
          confirmed: 1,
          processing: 1,
          packed: 1,
          shipped: 1,
          delivered: 1,
          cancelled: 1,
          returned: 1,
          amountTotal: { $divide: ["$amountTotal", 100] },
          amountReceived: { $divide: ["$amountReceived", 100] },
          amountPending: { $divide: [{ $subtract: ["$amountTotal", "$amountReceived"] }, 100] },
          uniqueBuyers: { $size: "$buyersSet" },
        },
      },
    ]);

    const summary = summaryAgg[0] || {
      totalOrders: 0, confirmed: 0, processing: 0, packed: 0, shipped: 0,
      delivered: 0, cancelled: 0, returned: 0, amountTotal: 0,
      amountReceived: 0, amountPending: 0, uniqueBuyers: 0,
    };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const ordersToday = await Order.countDocuments({
      staffUserId: staff._id,
      createdAt: { $gte: todayStart, $lte: todayEnd },
    });

    return ok(res, { 
      employeeCode: staff.employeeCode, 
      ...summary, 
      ordersToday 
    });
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};

// ✅ 6. MY BUYERS (Fixed Model Name)
exports.myBuyers = async (req, res) => {
  try {
    const staff = await getStaffForReq(req);
    const { q, page = 1, limit = 20 } = req.query;

    const filter = { staffUserId: staff._id };
    if (q) {
      const regex = new RegExp(q, "i");
      
      const users = await User.find({
        role: "buyer",
        $or: [
          { name: regex },
          { phone: regex },
          { email: regex }
        ]
      }).select('_id');

      const userIds = users.map(u => u._id);
      
      filter.$or = [
        { shopName: regex },
        { employeeCode: regex },
        ...(userIds.length > 0 ? [{ userId: { $in: userIds } }] : [])
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Buyer.find(filter) // ✅ FIXED: Using Buyer instead of BuyerProfile
        .populate('userId', 'name phone email isActive')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Buyer.countDocuments(filter), // ✅ FIXED: Using Buyer
    ]);

    return ok(res, {
      items,
      total,
      page: Number(page),
      pages: Math.max(1, Math.ceil(total / Number(limit)))
    });
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};

// ✅ 7. PENDING PAYMENTS (Fixed Model Name)
exports.pendingPaymentsByStaff = async (req, res) => {
  try {
    const staff = await getStaffForReq(req);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const minDays = Number(req.query.minDays) || 0;
    const sinceDate = minDays ? new Date(Date.now() - minDays * 86400000) : null;

    const matchOrders = { staffUserId: staff._id };

    const base = [
      { $match: matchOrders },
      {
        $project: {
          buyerUserId: 1,
          createdAt: 1,
          paymentTotal: { $ifNull: ["$finalAmountPaise", 0] },
          paymentReceived: { $ifNull: ["$paidAmountPaise", 0] },
        },
      },
      {
        $project: {
          buyerUserId: 1,
          createdAt: 1,
          balance: { $subtract: ["$paymentTotal", "$paymentReceived"] },
        },
      },
      {
        $group: {
          _id: "$buyerUserId",
          pending: { $sum: "$balance" },
          lastInvoiceAt: { $max: "$createdAt" },
        }
      },
      { $match: { pending: { $gt: 0 } } },
      ...(sinceDate ? [{ $match: { lastInvoiceAt: { $lte: sinceDate } } }] : []),
      {
        $lookup: {
          from: "buyers", // ✅ FIXED: Collection name for buyer.model
          localField: "_id",
          foreignField: "userId",
          as: "buyerProfile"
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: { path: "$buyerProfile", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          buyerId: "$_id",
          dueAmount: { $divide: ["$pending", 100] },
          since: "$lastInvoiceAt",
          buyer: {
            _id: "$buyerProfile._id",
            name: { $ifNull: ["$buyerProfile.shopName", "$user.name"] },
            shopName: "$buyerProfile.shopName",
            phone: "$user.phone",
            email: "$user.email",
          },
        },
      },
      { $sort: { dueAmount: -1 } },
    ];

    const [rows, countArr] = await Promise.all([
      Order.aggregate([...base, { $skip: (page - 1) * limit }, { $limit: limit }]),
      Order.aggregate([...base, { $count: "total" }]),
    ]);

    const total = countArr?.[0]?.total || 0;
    const hasMore = page * limit < total;
    
    return res.json({ ok: true, items: rows, total, hasMore });
  } catch (e) {
    const code = e.status || 400;
    return res.status(code).json({ 
      ok: false, 
      error: e.message || 'Something went wrong' 
    });
  }
};

// ✅ 8. CHECK IN
exports.checkIn = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    
    if (typeof lat !== "number" || typeof lng !== "number") {
      return fail(res, "lat/lng required", 400);
    }

    const staff = await getStaffForReq(req);

    const dist = haversineMeters(lat, lng, OFFICE_LAT, OFFICE_LNG);
    const withinFence = dist <= GEOFENCE_RADIUS_M;
    const now = new Date();

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    const existing = await Attendance.findOne({
      staffId: staff._id,
      date: { $gte: dayStart, $lt: dayEnd }
    });
    
    if (existing?.checkIn?.time) {
      return fail(res, "Already checked-in", 409);
    }

    const status = inShift(now) ? "present" : "late";

    const att = await Attendance.findOneAndUpdate(
      { staffId: staff._id, date: { $gte: dayStart, $lt: dayEnd } },
      {
        $set: {
          staffId: staff._id,
          date: new Date(),
          status,
          checkIn: { time: now, lat, lng, withinFence }
        }
      },
      { upsert: true, new: true }
    );

    return ok(res, {
      attendance: att,
      geo: { distance: dist, withinFence },
      shift: { within: inShift(now) }
    }, 201);
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};

// ✅ 9. CHECK OUT
exports.checkOut = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const staff = await getStaffForReq(req);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    const att = await Attendance.findOne({
      staffId: staff._id,
      date: { $gte: dayStart, $lt: dayEnd }
    });
    
    if (!att || !att.checkIn?.time) {
      return fail(res, "No check-in found for today", 400);
    }
    
    if (att.checkOut?.time) {
      return fail(res, "Already checked-out", 409);
    }

    const dist = haversineMeters(lat, lng, OFFICE_LAT, OFFICE_LNG);
    const now = new Date();

    att.checkOut = {
      time: now,
      lat,
      lng,
      withinFence: dist <= GEOFENCE_RADIUS_M
    };
    
    await att.save();

    return ok(res, att);
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};

// ✅ 10. MY ATTENDANCE
exports.myAttendance = async (req, res) => {
  try {
    const staff = await getStaffForReq(req);
    const { month } = req.query;
    
    const start = month 
      ? new Date(`${month}-01T00:00:00.000Z`) 
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    
    const list = await Attendance.find({
      staffId: staff._id,
      date: { $gte: start, $lt: end }
    }).sort({ date: 1 });
    
    return ok(res, list);
  } catch (e) {
    return fail(res, e.message, e.status || 400);
  }
};

// ✅ 11. SET TARGET
exports.setTarget = async (req, res) => {
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
    
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    return res.json({
      ok: true,
      message: "Target saved",
      target: staff.target
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to save target",
      error: e.message
    });
  }
};

// ✅ 12. GET TARGET
exports.getTarget = async (req, res) => {
  try {
    const { staffId } = req.params;
    const staff = await Staff.findById(staffId).lean();
    
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }
    
    return res.json({
      ok: true,
      target: Number(staff.target || 0)
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch target",
      error: e.message
    });
  }
};

// ✅ 13. GET SALES REPORT
exports.getSalesReport = async (req, res) => {
  try {
    const { staffId } = req.params;
    let { month, year } = req.query;

    const now = dayjs();
    month = Number(month || (now.month() + 1));
    year = Number(year || now.year());

    const staff = await Staff.findById(staffId).lean();
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const start = dayjs().year(year).month(month - 1).startOf("month").toDate();
    const end = dayjs().year(year).month(month - 1).endOf("month").toDate();

    const match = {
      status: { $in: ["confirmed", "shipped", "delivered"] },
      createdAt: { $gte: start, $lte: end },
      staffUserId: new mongoose.Types.ObjectId(staffId),
    };

    const salesAgg = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: { $divide: ["$finalAmountPaise", 100] } }
        }
      }
    ]);

    const actual = salesAgg?.[0]?.total || 0;
    const target = Number(staff.target || 0);
    const achievedPercent = target > 0 
      ? Number(((actual / target) * 100).toFixed(2)) 
      : 0;

    return res.json({
      ok: true,
      staff: {
        id: staff._id,
        name: staff.name,
        employeeCode: staff.employeeCode
      },
      month,
      year,
      target,
      actual,
      remaining: Math.max(target - actual, 0),
      achievedPercent,
      range: { start, end }
    });
  } catch (e) {
    console.error("getSalesReport error:", e);
    return res.status(500).json({
      message: "Failed to compute sales report",
      error: e.message
    });
  }
};// VERIFY EMPLOYEE CODE (safe - uses Staff and Seller variables already required)
exports.verifyEmployeeCode = async (req, res) => {
  try {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ ok: false, message: "Employee code is required" });
    }

    // 1) Try User collection (some apps store employeeCode on user with role 'staff')
    try {
      const user = await User.findOne({ employeeCode: code, role: "staff" }).lean();
      if (user) {
        const name = user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Staff";
        return res.json({ ok: true, data: { employeeName: name, staffUserId: user._id, role: user.role } });
      }
    } catch (uErr) {
      console.warn("verifyEmployeeCode - user lookup error:", uErr && uErr.message ? uErr.message : uErr);
    }

    // 2) Try Staff collection (use the Staff variable required at file top)
    if (typeof Staff !== "undefined" && Staff) {
      try {
        const staff = await Staff.findOne({ employeeCode: code }).populate("userId", "name").lean();
        if (staff) {
          const name = staff.userId?.name || staff.name || "Staff";
          return res.json({
            ok: true,
            data: { employeeName: name, staffUserId: staff.userId?._id || staff._id, role: "staff" },
          });
        }
      } catch (sErr) {
        console.warn("verifyEmployeeCode - staff lookup error:", sErr && sErr.message ? sErr.message : sErr);
      }
    }

    // 3) Try Seller collection (use Seller variable required at file top)
    if (typeof Seller !== "undefined" && Seller) {
      try {
        const seller = await Seller.findOne({ employeeCode: code }).populate("userId", "name").lean();
        if (seller) {
          const name = seller.userId?.name || seller.brandName || "Seller";
          return res.json({
            ok: true,
            data: { employeeName: name, staffUserId: seller.userId?._id || seller._id, role: "seller" },
          });
        }
      } catch (selErr) {
        console.warn("verifyEmployeeCode - seller lookup error:", selErr && selErr.message ? selErr.message : selErr);
      }
    }

    // Not found anywhere
    return res.status(404).json({ ok: false, message: "Employee code not found" });
  } catch (err) {
    console.error("verifyEmployeeCode error:", err);
    return res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
};
