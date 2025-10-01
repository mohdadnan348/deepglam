// controllers/order.controller.js
const mongoose = require("mongoose");
const Order = require("../models/order.model");
const Product = require("../models/product.model");
const BuyerProfile = require("../models/buyer.model");
const User = require("../models/user.model");

const toInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

// ============================
// 1. BUYER FUNCTIONS
// ============================

// ✅ CREATE ORDER (Buyer only)
exports.createOrder = async (req, res) => {
  try {
    const buyerUserId = req.user._id;

    const {
      products = [],
      deliveryAddress,
      notes = "",
      discountPaise = 0
    } = req.body;

    if (!products || products.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "Products are required to create order"
      });
    }

    // Get buyer profile
    const buyerProfile = await BuyerProfile.findOne({ userId: buyerUserId })
      .populate('staffUserId', 'name phone email');

    if (!buyerProfile) {
      return res.status(404).json({
        ok: false,
        message: "Buyer profile not found"
      });
    }

    // Fetch product details with seller info
    const productIds = products.map(item => item.productId);
    const productDetails = await Product.find({ _id: { $in: productIds } })
      .populate('userId', 'name email businessName phone');

    if (productDetails.length !== productIds.length) {
      return res.status(400).json({
        ok: false,
        message: "Some products not found in database"
      });
    }

    // Build order products
    let subtotalPaise = 0;
    const orderProducts = products.map(item => {
      const product = productDetails.find(p => p._id.toString() === item.productId);
      if (!product) throw new Error(`Product not found: ${item.productId}`);

      const quantity = Math.max(1, Number(item.quantity) || 1);
      
      let pricePerUnitPaise;
      if (product.salePrice) {
        pricePerUnitPaise = Math.round(product.salePrice * 100);
      } else if (product.price) {
        pricePerUnitPaise = Math.round(product.price * 100);
      } else {
        pricePerUnitPaise = 0;
      }
      
      const totalPaise = quantity * pricePerUnitPaise;
      subtotalPaise += totalPaise;

      return {
        product: product._id,
        productName: product.productName,
        sellerUserId: product.userId ? product.userId._id : null,
        brand: product.brand || "Unknown",
        quantity,
        pricePerUnitPaise,
        totalPaise
      };
    });
    
    // Auto-derive delivery address
    let finalDeliveryAddress;
    
    if (deliveryAddress && deliveryAddress.shopName && deliveryAddress.fullAddress) {
      finalDeliveryAddress = {
        shopName: deliveryAddress.shopName,
        fullAddress: deliveryAddress.fullAddress,
        city: deliveryAddress.city || buyerProfile.shopAddress.city,
        state: deliveryAddress.state || buyerProfile.shopAddress.state,
        postalCode: deliveryAddress.postalCode || buyerProfile.shopAddress.postalCode,
        country: deliveryAddress.country || buyerProfile.shopAddress.country || "India"
      };
    } else {
      finalDeliveryAddress = {
        shopName: buyerProfile.shopName,
        fullAddress: `${buyerProfile.shopAddress.line1}${buyerProfile.shopAddress.line2 ? ', ' + buyerProfile.shopAddress.line2 : ''}, ${buyerProfile.shopAddress.city}, ${buyerProfile.shopAddress.state}`,
        city: buyerProfile.shopAddress.city,
        state: buyerProfile.shopAddress.state,
        postalCode: buyerProfile.shopAddress.postalCode,
        country: buyerProfile.shopAddress.country || "India"
      };
    }

    // Calculate totals
    const taxRate = 0.18;
    const discountedSubtotal = Math.max(0, subtotalPaise - discountPaise);
    const taxPaise = Math.round(discountedSubtotal * taxRate);
    const finalAmountPaise = discountedSubtotal + taxPaise;

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    // Create order
    const order = new Order({
      buyerUserId,
      staffUserId: buyerProfile.staffUserId._id || buyerProfile.staffUserId,
      employeeCode: buyerProfile.employeeCode,
      orderNumber,
      deliveryAddress: finalDeliveryAddress,
      products: orderProducts,
      subtotalPaise,
      discountPaise,
      taxPaise,
      finalAmountPaise,
      paymentStatus: "unpaid",
      status: "confirmed",
      notes: notes.trim()
    });

    // Calculate brand breakdown
    if (typeof order.calculateBrandBreakdown === "function") {
      order.calculateBrandBreakdown();
    }

    await order.save();
  
    // Populate response data
    const populatedOrder = await Order.findById(order._id)
      .populate('buyerUserId', 'name phone email')
      .populate('staffUserId', 'name phone email')
      .populate({
        path: 'products.product',
        select: 'productName brand mainImage'
      });
    
    res.status(201).json({
      ok: true,
      message: "Order created successfully",
      data: {
        ...populatedOrder.toObject(),
        subtotal: (populatedOrder.subtotalPaise / 100).toFixed(2),
        discount: (populatedOrder.discountPaise / 100).toFixed(2),
        tax: (populatedOrder.taxPaise / 100).toFixed(2),
        finalAmount: (populatedOrder.finalAmountPaise / 100).toFixed(2)
      }
    });

  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to create order",
      error: error.message
    });
  }
};

// ============================
// 2. COMMON FUNCTIONS (All Roles)
// ============================

// ✅ GET ORDERS (Role-based filtering)
exports.getOrders = async (req, res) => {
  try {
    const userId = req.user._id; 
    const userRole = req.user.role;
    
    const {
      page = 1,
      limit = 20,
      status = "",
      paymentStatus = "",
      dateFrom = "",
      dateTo = ""
    } = req.query;

    const pageNum = Math.max(1, toInt(page));
    const limitNum = Math.min(100, Math.max(1, toInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Role-based filtering
    let filter = {};

    if (userRole === "buyer") {
      filter.buyerUserId = userId;
    } else if (userRole === "staff") {
      filter.staffUserId = userId;
    } else if (userRole === "seller") {
      filter["products.sellerUserId"] = userId;
    }
    // Admin can see all orders (no filter)

    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('buyerUserId', 'name phone email')
        .populate('staffUserId', 'name phone')
        .populate({
          path: 'products.product',
          select: 'productName brand mainImage'
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(filter)
    ]);

    // Filter seller's view to show only their products
    let filteredOrders = orders;
    if (userRole === "seller") {
      filteredOrders = orders.map(order => ({
        ...order,
        products: order.products.filter(product => 
          product.sellerUserId?.toString() === userId.toString()
        ),
        // Calculate seller's portion
        sellerTotal: order.products
          .filter(product => product.sellerUserId?.toString() === userId.toString())
          .reduce((sum, product) => sum + product.totalPaise, 0)
      }));
    }

    res.json({
      ok: true,
      data: filteredOrders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to fetch orders",
      error: error.message
    });
  }
};

// ✅ GET ORDER BY ID
// exports.getOrderById = async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const userId = req.user._id;
//     const userRole = req.user.role;

//     const order = await Order.findById(orderId)
//       .populate('buyerUserId', 'name phone email')
//       .populate('staffUserId', 'name phone email')
//       .populate({
//         path: 'products.product',
//         select: 'productName brand mainImage'
//       });

//     if (!order) {
//       return res.status(404).json({
//         ok: false,
//         message: "Order not found"
//       });
//     }

//     // Authorization check
//     let hasAccess = false;
    
//     if (userRole === "admin") {
//       hasAccess = true;
//     } else if (userRole === "buyer") {
//       hasAccess = order.buyerUserId._id.toString() === userId.toString();
//     } else if (userRole === "staff") {
//       hasAccess = order.staffUserId._id.toString() === userId.toString();
//     } else if (userRole === "seller") {
//       hasAccess = order.products.some(product => 
//         product.sellerUserId?.toString() === userId.toString()
//       );
//     }

//     if (!hasAccess) {
//       return res.status(403).json({
//         ok: false,
//         message: "Access denied - this order doesn't belong to you"
//       });
//     }

//     res.json({
//       ok: true,
//       data: order
//     });

//   } catch (error) {
//     console.error("Get order by ID error:", error);
//     res.status(500).json({
//       ok: false,
//       message: "Failed to fetch order",
//       error: error.message
//     });
//   }
// };
// controllers/order.controller.js में getOrderById function को update करें

// ✅ GET ORDER BY ID
exports.getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const order = await Order.findById(orderId)
      .populate('buyerUserId', 'name phone email')
      .populate('staffUserId', 'name phone email')
      .populate({
        path: 'products.product',
        select: 'productName brand mainImage'
      });

    if (!order) {
      return res.status(404).json({
        ok: false,
        message: "Order not found"
      });
    }

    // Authorization check (same as before)
    let hasAccess = false;
    
    if (userRole === "admin") {
      hasAccess = true;
    } else if (userRole === "buyer") {
      hasAccess = order.buyerUserId._id.toString() === userId.toString();
    } else if (userRole === "staff") {
      hasAccess = order.staffUserId._id.toString() === userId.toString();
    } else if (userRole === "seller") {
      hasAccess = order.products.some(product => 
        product.sellerUserId?.toString() === userId.toString()
      );
    }

    if (!hasAccess) {
      return res.status(403).json({
        ok: false,
        message: "Access denied - this order doesn't belong to you"
      });
    }

    // ✅ Format response for frontend (added this part)
    const formattedOrder = {
      ...order.toObject(),
      // Convert paise to rupees for display
      finalAmount: order.finalAmountPaise ? (order.finalAmountPaise / 100) : 0,
      subtotal: order.subtotalPaise ? (order.subtotalPaise / 100) : 0,
      tax: order.taxPaise ? (order.taxPaise / 100) : 0,
      
      // Ensure required fields for tracking
      items: order.products || [],
      products: order.products || [],
      address: order.deliveryAddress || null,
      deliveryAddress: order.deliveryAddress || null,
      statusHistory: order.statusLogs || [],
      tracking: order.statusLogs || [],
      paymentType: order.paymentType || 'COD',
      paymentMethod: order.paymentType || 'COD'
    };

    res.json({
      ok: true,
      data: formattedOrder
    });

  } catch (error) {
    console.error("Get order by ID error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to fetch order",
      error: error.message
    });
  }
};


// ============================
// 3. SELLER FUNCTIONS
// ============================

// ✅ SELLER DASHBOARD
exports.getSellerDashboard = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { period = "30" } = req.query;
    
    if (req.user.role !== "seller") {
      return res.status(403).json({
        ok: false,
        message: "Access denied - sellers only"
      });
    }
    
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - parseInt(period));

    const [
      totalOrders,
      pendingOrders,
      completedOrders,
      totalRevenue,
      recentOrders
    ] = await Promise.all([
      Order.countDocuments({
        "products.sellerUserId": sellerId,
        createdAt: { $gte: dateFrom }
      }),
      Order.countDocuments({
        "products.sellerUserId": sellerId,
        status: { $in: ["confirmed", "processing"] }
      }),
      Order.countDocuments({
        "products.sellerUserId": sellerId,
        status: "delivered"
      }),
      Order.aggregate([
        { $match: { "products.sellerUserId": sellerId } },
        { $unwind: "$products" },
        { $match: { "products.sellerUserId": sellerId } },
        { $group: { _id: null, total: { $sum: "$products.totalPaise" } } }
      ]),
      Order.find({
        "products.sellerUserId": sellerId
      })
        .populate('buyerUserId', 'name shopName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
    ]);

    const revenue = totalRevenue.length > 0 ? totalRevenue[0].total : 0;

    // Status breakdown
    const statusStats = await Order.aggregate([
      { $match: { "products.sellerUserId": sellerId } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    res.json({
      ok: true,
      data: {
        summary: {
          totalOrders,
          pendingOrders,
          completedOrders,
          totalRevenue: Math.round(revenue / 100),
          period: `${period} days`
        },
        statusBreakdown: statusStats,
        recentOrders: recentOrders.map(order => ({
          _id: order._id,
          orderNumber: order.orderNumber,
          buyer: order.buyerUserId,
          status: order.status,
          createdAt: order.createdAt,
          sellerProducts: order.products.filter(p => 
            p.sellerUserId.toString() === sellerId.toString()
          ).length
        }))
      }
    });

  } catch (error) {
    console.error("Seller dashboard error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to fetch seller dashboard",
      error: error.message
    });
  }
};

// ✅ SELLER EARNINGS
exports.getSellerEarnings = async (req, res) => {
  try {
    const sellerId = req.user._id;
    
    if (req.user.role !== "seller") {
      return res.status(403).json({
        ok: false,
        message: "Access denied - sellers only"
      });
    }
    
    const { 
      period = "monthly",
      year = new Date().getFullYear(),
      month = new Date().getMonth() + 1
    } = req.query;

    let dateFilter = {};
    let groupBy = {};

    if (period === "monthly") {
      dateFilter = {
        createdAt: {
          $gte: new Date(year, month - 1, 1),
          $lt: new Date(year, month, 1)
        }
      };
      groupBy = {
        _id: { $dayOfMonth: "$createdAt" },
        earnings: { $sum: "$products.totalPaise" },
        orders: { $sum: 1 }
      };
    }

    const earnings = await Order.aggregate([
      { $match: { "products.sellerUserId": sellerId, ...dateFilter } },
      { $unwind: "$products" },
      { $match: { "products.sellerUserId": sellerId } },
      { $group: groupBy },
      { $sort: { "_id": 1 } }
    ]);

    const totalEarnings = earnings.reduce((sum, day) => sum + day.earnings, 0);

    res.json({
      ok: true,
      data: {
        period,
        totalEarnings: Math.round(totalEarnings / 100),
        dailyBreakdown: earnings.map(day => ({
          day: day._id,
          earnings: Math.round(day.earnings / 100),
          orders: day.orders
        }))
      }
    });

  } catch (error) {
    console.error("Seller earnings error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to fetch seller earnings",
      error: error.message
    });
  }
};

// ============================
// 4. STAFF FUNCTIONS
// ============================

// ✅ STAFF DASHBOARD
exports.getStaffDashboard = async (req, res) => {
  try {
    const staffId = req.user._id;
    
    if (req.user.role !== "staff") {
      return res.status(403).json({
        ok: false,
        message: "Access denied - staff only"
      });
    }
    
    const { period = "30" } = req.query;
    
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - parseInt(period));

    const [
      totalBuyers,
      totalOrders,
      pendingOrders,
      deliveredOrders,
      totalSales,
      pendingPayments,
      recentOrders,
      topBuyers
    ] = await Promise.all([
      BuyerProfile.countDocuments({ staffUserId: staffId }),
      Order.countDocuments({
        staffUserId: staffId,
        createdAt: { $gte: dateFrom }
      }),
      Order.countDocuments({
        staffUserId: staffId,
        status: { $in: ["confirmed", "processing", "packed"] }
      }),
      Order.countDocuments({
        staffUserId: staffId,
        status: "delivered"
      }),
      Order.aggregate([
        { $match: { staffUserId: staffId } },
        { $group: { _id: null, total: { $sum: "$finalAmountPaise" } } }
      ]),
      Order.aggregate([
        { $match: { staffUserId: staffId, paymentStatus: { $ne: "paid" } } },
        { $group: { _id: null, total: { $sum: { $subtract: ["$finalAmountPaise", "$paidAmountPaise"] } } } }
      ]),
      Order.find({ staffUserId: staffId })
        .populate('buyerUserId', 'name shopName')
        .sort({ createdAt: -1 })
        .limit(5),
      Order.aggregate([
        { $match: { staffUserId: staffId } },
        { $group: { 
          _id: "$buyerUserId", 
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: "$finalAmountPaise" }
        }},
        { $sort: { totalAmount: -1 } },
        { $limit: 5 },
        { $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "buyer"
        }}
      ])
    ]);

    const sales = totalSales.length > 0 ? totalSales[0].total : 0;
    const pending = pendingPayments.length > 0 ? pendingPayments[0].total : 0;

    res.json({
      ok: true,
      data: {
        summary: {
          totalBuyers,
          totalOrders,
          pendingOrders,
          deliveredOrders,
          totalSales: Math.round(sales / 100),
          pendingPayments: Math.round(pending / 100),
          period: `${period} days`
        },
        recentOrders: recentOrders,
        topBuyers: topBuyers.map(buyer => ({
          buyer: buyer.buyer[0],
          totalOrders: buyer.totalOrders,
          totalAmount: Math.round(buyer.totalAmount / 100)
        }))
      }
    });

  } catch (error) {
    console.error("Staff dashboard error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to fetch staff dashboard",
      error: error.message
    });
  }
};

// ✅ GET STAFF'S BUYERS
exports.getStaffBuyers = async (req, res) => {
  try {
    const staffId = req.user._id;
    
    if (req.user.role !== "staff") {
      return res.status(403).json({
        ok: false,
        message: "Access denied - staff only"
      });
    }
    
    const buyers = await BuyerProfile.find({ staffUserId: staffId })
      .populate('userId', 'name phone email')
      .select('shopName shopAddress approvalStatus kycVerified creditLimitPaise currentDuePaise')
      .sort({ createdAt: -1 });

    // Get order stats for each buyer
    const buyersWithStats = await Promise.all(
      buyers.map(async (buyer) => {
        const [totalOrders, pendingOrders, totalSpent] = await Promise.all([
          Order.countDocuments({ buyerUserId: buyer.userId._id }),
          Order.countDocuments({ 
            buyerUserId: buyer.userId._id, 
            status: { $in: ["confirmed", "processing", "packed"] }
          }),
          Order.aggregate([
            { $match: { buyerUserId: buyer.userId._id } },
            { $group: { _id: null, total: { $sum: "$finalAmountPaise" } } }
          ])
        ]);

        const spent = totalSpent.length > 0 ? totalSpent[0].total : 0;

        return {
          ...buyer.toObject(),
          stats: {
            totalOrders,
            pendingOrders,
            totalSpent: Math.round(spent / 100)
          }
        };
      })
    );

    res.json({
      ok: true,
      data: buyersWithStats
    });

  } catch (error) {
    console.error("Get staff buyers error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to fetch staff buyers",
      error: error.message
    });
  }
};

// ============================
// 5. STATUS UPDATE FUNCTIONS
// ============================

// ✅ UPDATE ORDER STATUS (Role-based permissions)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, note = "" } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    const validStatuses = [
      "confirmed", "processing", "packed", 
      "shipped", "delivered", "cancelled"
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid status value"
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        ok: false,
        message: "Order not found"
      });
    }

    // Role-based authorization
    let canUpdate = false;
    let allowedStatuses = [];
    
    if (userRole === "admin") {
      canUpdate = true;
      allowedStatuses = validStatuses;
    } else if (userRole === "staff") {
      canUpdate = order.staffUserId.toString() === userId.toString();
      allowedStatuses = validStatuses;
    } else if (userRole === "seller") {
      const hasSellerProducts = order.products.some(
        product => product.sellerUserId.toString() === userId.toString()
      );
      canUpdate = hasSellerProducts;
      allowedStatuses = ["processing", "packed"];
    } else if (userRole === "buyer") {
      canUpdate = (
        order.buyerUserId.toString() === userId.toString() && 
        status === "cancelled" && 
        !["shipped", "delivered"].includes(order.status)
      );
      allowedStatuses = ["cancelled"];
    }

    if (!canUpdate) {
      return res.status(403).json({
        ok: false,
        message: "Access denied - cannot update this order status"
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        message: `You can only update status to: ${allowedStatuses.join(", ")}`
      });
    }

    // Status transition validation
    const validTransitions = {
      "confirmed": ["processing", "cancelled"],
      "processing": ["packed", "cancelled"],
      "packed": ["shipped", "cancelled"],
      "shipped": ["delivered"],
      "delivered": [],
      "cancelled": []
    };

    if (!validTransitions[order.status]?.includes(status)) {
      return res.status(400).json({
        ok: false,
        message: `Cannot change status from ${order.status} to ${status}`
      });
    }

    // Update order status
    order.status = status;
    if (!order.statusLogs) order.statusLogs = [];
    
    order.statusLogs.push({
      timestamp: new Date(),
      actionBy: userId,
      action: status.toUpperCase(),
      note: note || `Status updated to ${status}`
    });

    await order.save();

    res.json({
      ok: true,
      message: `Order status updated to ${status}`,
      data: order
    });

  } catch (error) {
    console.error("Update order status error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to update order status",
      error: error.message
    });
  }
};

// ✅ UPDATE PAYMENT STATUS
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paidAmount, note = "" } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (typeof paidAmount !== "number" || paidAmount < 0) {
      return res.status(400).json({
        ok: false,
        message: "Valid paid amount is required"
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        ok: false,
        message: "Order not found"
      });
    }

    // Authorization (Staff and Admin only)
    if (userRole === "staff" && order.staffUserId.toString() !== userId.toString()) {
      return res.status(403).json({
        ok: false,
        message: "Access denied - not your buyer's order"
      });
    }

    if (!["staff", "admin"].includes(userRole)) {
      return res.status(403).json({
        ok: false,
        message: "Access denied - staff/admin only"
      });
    }

    // Convert to paise
    const paidAmountPaise = Math.round(paidAmount * 100);
    const currentPaid = order.paidAmountPaise || 0;
    const newPaidAmount = currentPaid + paidAmountPaise;

    // Update payment status
    order.paidAmountPaise = newPaidAmount;
    
    if (newPaidAmount >= order.finalAmountPaise) {
      order.paymentStatus = "paid";
    } else if (newPaidAmount > 0) {
      order.paymentStatus = "partially_paid";
    } else {
      order.paymentStatus = "unpaid";
    }

    // Add payment log
    if (!order.statusLogs) order.statusLogs = [];
    order.statusLogs.push({
      timestamp: new Date(),
      actionBy: userId,
      action: "PAYMENT_UPDATED",
      note: note || `Payment updated: ₹${paidAmount}`
    });

    await order.save();

    res.json({
      ok: true,
      message: "Payment status updated successfully",
      data: {
        ...order.toObject(),
        paidAmount: Math.round(order.paidAmountPaise / 100),
        remainingAmount: Math.round((order.finalAmountPaise - order.paidAmountPaise) / 100)
      }
    });

  } catch (error) {
    console.error("Update payment status error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to update payment status",
      error: error.message
    });
  }
};

// ============================
// 6. BULK OPERATIONS
// ============================

// ✅ BULK UPDATE ORDERS
exports.bulkUpdateOrders = async (req, res) => {
  try {
    const { orderIds, status, note = "" } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "Order IDs array is required"
      });
    }

    const results = [];
    
    for (const orderId of orderIds) {
      try {
        const order = await Order.findById(orderId);
        if (order) {
          // Staff can only update their buyers' orders
          if (userRole === "staff" && 
              order.staffUserId.toString() !== userId.toString()) {
            results.push({ orderId, success: false, error: "Access denied" });
            continue;
          }

          order.status = status;
          if (!order.statusLogs) order.statusLogs = [];
          
          order.statusLogs.push({
            timestamp: new Date(),
            actionBy: userId,
            action: `BULK_${status.toUpperCase()}`,
            note
          });
          
          await order.save();
          results.push({ orderId, success: true });
        } else {
          results.push({ orderId, success: false, error: "Order not found" });
        }
      } catch (error) {
        results.push({ orderId, success: false, error: error.message });
      }
    }

    res.json({
      ok: true,
      message: "Bulk status update completed",
      results
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Bulk update failed",
      error: error.message
    });
  }
};

// ✅ BULK DISPATCH ORDERS
exports.bulkDispatchOrders = async (req, res) => {
  try {
    const { orderIds, courier, dispatchNote = "" } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (!["staff", "admin"].includes(userRole)) {
      return res.status(403).json({
        ok: false,
        message: "Access denied - staff/admin only"
      });
    }

    const results = [];

    for (const orderId of orderIds) {
      try {
        let filter = {
          _id: orderId,
          status: "packed"
        };

        // Staff can only dispatch their buyers' orders
        if (userRole === "staff") {
          filter.staffUserId = userId;
        }

        const order = await Order.findOne(filter);

        if (!order) {
          results.push({ 
            orderId, 
            success: false, 
            error: "Order not found or not ready for dispatch" 
          });
          continue;
        }

        // Generate AWB number
        const awb = `AWB${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

        // Update dispatch info
        order.status = "shipped";
        order.dispatch = {
          courier,
          awb,
          note: dispatchNote,
          dispatchedAt: new Date(),
          dispatchedBy: userId
        };

        if (!order.statusLogs) order.statusLogs = [];
        order.statusLogs.push({
          timestamp: new Date(),
          actionBy: userId,
          action: "SHIPPED",
          note: `Dispatched via ${courier}, AWB: ${awb}`
        });

        await order.save();
        results.push({ orderId, success: true, awb });

      } catch (error) {
        results.push({ orderId, success: false, error: error.message });
      }
    }

    res.json({
      ok: true,
      message: "Bulk dispatch completed",
      results
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Bulk dispatch failed",
      error: error.message
    });
  }
};


// ✅ ENHANCED BRAND-WISE BILL WITH SELLER ADDRESS
// controllers/order.controller.js में getBrandWiseBill function को replace करें

exports.getBrandWiseBill = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { brand, sellerUserId } = req.query;

    console.log("🔍 Fetching bill for:", { orderId, brand, sellerUserId });

    if (!brand || !sellerUserId) {
      return res.status(400).json({
        ok: false,
        message: "Brand and sellerUserId parameters are required"
      });
    }

    const order = await Order.findById(orderId)
      .populate('buyerUserId', 'name phone email')
      .populate('staffUserId', 'name phone email');

    if (!order) {
      return res.status(404).json({
        ok: false,
        message: "Order not found"
      });
    }

    // Filter products
    const brandProducts = order.products.filter(product => 
      product.brand === brand && 
      product.sellerUserId.toString() === sellerUserId
    );

    const brandBill = order.brandBreakdown.find(breakdown =>
      breakdown.brand === brand && 
      breakdown.sellerUserId.toString() === sellerUserId
    );

    if (!brandBill || brandProducts.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Brand bill not found"
      });
    }

    // ✅ DIRECT SELLER FETCH - NO COMPLICATIONS
    console.log("📋 Fetching seller with ID:", sellerUserId);
    
    const User = require('../models/user.model');
    const Seller = require('../models/seller.model');
    
    const [userInfo, sellerProfile] = await Promise.all([
      User.findById(sellerUserId).lean(),
      Seller.findOne({ userId: sellerUserId }).lean()
    ]);

    console.log("👤 User Info:", userInfo);
    console.log("🏪 Seller Profile:", sellerProfile);

    // ✅ BUILD SELLER OBJECT
    const seller = {
      name: userInfo?.name || "Unknown Seller",
      email: userInfo?.email || "N/A",
      phone: userInfo?.phone || "N/A",
      businessName: sellerProfile?.brandName || userInfo?.businessName || brand,
      address: sellerProfile?.fullAddress ? {
        street: `${sellerProfile.fullAddress.line1}${sellerProfile.fullAddress.line2 ? ', ' + sellerProfile.fullAddress.line2 : ''}`,
        city: sellerProfile.fullAddress.city,
        state: sellerProfile.fullAddress.state,
        postalCode: sellerProfile.fullAddress.postalCode
      } : {
        street: "Address not provided",
        city: "Unknown",
        state: "Unknown",
        postalCode: "000000"
      }
    };

    console.log("✅ Final Seller Object:", seller);

    const billData = {
      orderNumber: order.orderNumber,
      billNumber: `BILL-${order.orderNumber}-${brand.toUpperCase()}`,
      buyer: {
        name: order.buyerUserId.name,
        phone: order.buyerUserId.phone,
        email: order.buyerUserId.email,
        address: order.deliveryAddress
      },
      seller: seller,
      staff: order.staffUserId ? {
        name: order.staffUserId.name,
        phone: order.staffUserId.phone,
        email: order.staffUserId.email,
        employeeCode: order.employeeCode
      } : null,
      brand: brand,
      products: brandProducts.map(product => ({
        name: product.productName,
        quantity: product.quantity,
        pricePerUnit: (product.pricePerUnitPaise / 100).toFixed(2),
        total: (product.totalPaise / 100).toFixed(2)
      })),
      amounts: {
        subtotal: (brandBill.subtotalPaise / 100).toFixed(2),
        tax: (brandBill.taxPaise / 100).toFixed(2),
        total: (brandBill.totalPaise / 100).toFixed(2)
      },
      dates: {
        orderDate: order.createdAt,
        billDate: new Date()
      }
    };

    res.json({
      ok: true,
      message: "Brand-wise bill generated successfully",
      data: billData
    });

  } catch (error) {
    console.error("❌ Generate brand bill error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to generate brand bill",
      error: error.message
    });
  }
};



// ✅ CANCEL ORDER
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason = "" } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        ok: false,
        message: "Order not found"
      });
    }

    // Authorization checks
    if (userRole === "buyer" && order.buyerUserId.toString() !== userId.toString()) {
      return res.status(403).json({
        ok: false,
        message: "Access denied"
      });
    }

    if (userRole === "staff" && order.staffUserId.toString() !== userId.toString()) {
      return res.status(403).json({
        ok: false,
        message: "Access denied - not your buyer's order"
      });
    }

    // Check if order can be cancelled
    if (["shipped", "delivered", "cancelled"].includes(order.status)) {
      return res.status(400).json({
        ok: false,
        message: `Cannot cancel order with status: ${order.status}`
      });
    }

    // Cancel order
    order.status = "cancelled";
    if (!order.statusLogs) order.statusLogs = [];
    
    order.statusLogs.push({
      timestamp: new Date(),
      actionBy: userId,
      action: "CANCELLED",
      note: reason || "Order cancelled by user"
    });
    
    await order.save();

    res.json({
      ok: true,
      message: "Order cancelled successfully",
      data: order
    });

  } catch (error) {
    console.error("Cancel order error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to cancel order",
      error: error.message
    });
  }
};