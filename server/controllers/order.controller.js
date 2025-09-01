const mongoose = require("mongoose");
const { isValidObjectId } = mongoose;
const Order = require("../models/order.model");
const Buyer = require("../models/buyer.model");
const Product = require("../models/product.model");
exports.placeOrder = async (req, res) => {
  try {
    const {
      buyerId,
      products = [],
      address,
      pincode,
      city,
      state,
      country = "India",
      fullAddress,
      staffCode,
    } = req.body;

    // ✅ Validation
    if (!buyerId || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "buyerId (Buyer._id) and products[] required" });
    }

    // ✅ Buyer fetch
    const buyer = await Buyer.findById(buyerId).populate("staffId");
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    // ✅ If address provided from frontend → update Buyer in DB
    if (address || fullAddress || city || state || pincode) {
      buyer.shopAddress = {
        line1: address || buyer.shopAddress?.line1 || "",
        city: city || buyer.shopAddress?.city || "",
        state: state || buyer.shopAddress?.state || "",
        postalCode: pincode || buyer.shopAddress?.postalCode || "",
        country: country || buyer.shopAddress?.country || "India",
      };
      await buyer.save();
    }

    // ✅ Split product lines
    const withIds = products.filter(p => p.productId && isValidObjectId(String(p.productId)));
    const adHoc = products.filter(p => !p.productId || !isValidObjectId(String(p.productId)));

    // ✅ DB products mapping
    let dbItems = [];
    if (withIds.length) {
      const ids = withIds.map(p => String(p.productId));
      const prodDocs = await Product.find({ _id: { $in: ids } });

      dbItems = withIds.map(line => {
        const doc = prodDocs.find(d => String(d._id) === String(line.productId));
        if (!doc) return null;
        const quantity = Number(line.quantity || line.qty || 1);
        const price = Number(doc.finalPrice ?? doc.mrp ?? doc.purchasePrice ?? 0);
        return {
          product: doc._id,
          quantity,
          price,
          total: price * quantity,
          brand: doc.brand || undefined
        };
      }).filter(Boolean);
    }

    // ✅ Ad-hoc products mapping
    const adHocItems = adHoc.map(line => {
      const quantity = Number(line.quantity || line.qty || 1);
      const price = Number(line.price || 0);
      return {
        quantity,
        price,
        total: price * quantity,
        brand: line.brand || undefined
      };
    });

    // ✅ Merge all items
    const allItems = [...dbItems, ...adHocItems];
    if (!allItems.length) {
      return res.status(400).json({ message: "No valid products. Provide valid productId or price lines." });
    }

    // ✅ Totals
    const totalAmount = allItems.reduce((s, x) => s + (Number(x.total) || 0), 0);
    const discountAmount = Number(req.body.discountAmount || 0);
    const gstAmount = Number(req.body.gstAmount || 0);
    const finalAmount = Number(req.body.finalAmount || (totalAmount - discountAmount + gstAmount));

    // ✅ Create order
    const orderDoc = await Order.create({
      buyerId: buyer._id, // Always Buyer._id
      address: buyer.shopAddress?.line1 || "",
      pincode: buyer.shopAddress?.postalCode || "",
      city: buyer.shopAddress?.city || "",
      state: buyer.shopAddress?.state || "",
      country: buyer.shopAddress?.country || "India",
      fullAddress: fullAddress || buyer.shopAddress?.line1 || "",

      staffCode: staffCode || buyer.staffCode || buyer.employeeCode || undefined,

      products: allItems,
      product: withIds.length === 1 ? withIds[0].productId : undefined,

      brandBreakdown: allItems.reduce((acc, it) => {
        if (!it.brand) return acc;
        const hit = acc.find(b => b.brand === it.brand);
        if (hit) hit.amount += it.total;
        else acc.push({ brand: it.brand, amount: it.total });
        return acc;
      }, []),

      totalAmount,
      discountAmount,
      gstAmount,
      finalAmount,

      status: req.body.status || "confirmed",
      paymentStatus: req.body.paymentStatus || "unpaid",

      invoiceUrl: req.body.invoiceUrl,
      sellerInvoiceUrl: req.body.sellerInvoiceUrl,

      isReturnRequested: false,
      returnReason: "",
    });

    return res.status(201).json({ message: "Order placed", order: orderDoc });
  } catch (err) {
    console.error("placeOrder error:", err);
    return res.status(500).json({ message: "Order placement failed", error: err.message });
  }
};
   



/*

exports.placeOrder = async (req, res) => {
  try {
    const { buyerId, products = [], address, pincode, city, state, country = "India", fullAddress, staffCode } = req.body;

    // ✅ Validation
    if (!buyerId || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "buyerId (Buyer._id) and products[] required" });
    }

    // ✅ Buyer fetch
    const buyer = await Buyer.findById(buyerId).populate("staffId");
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    // ✅ Split product lines
    const withIds = products.filter(p => p.productId && isValidObjectId(String(p.productId)));
    const adHoc  = products.filter(p => !p.productId || !isValidObjectId(String(p.productId)));

    // ✅ DB products mapping
    let dbItems = [];
    if (withIds.length) {
      const ids = withIds.map(p => String(p.productId));
      const prodDocs = await Product.find({ _id: { $in: ids } });

      dbItems = withIds.map(line => {
        const doc = prodDocs.find(d => String(d._id) === String(line.productId));
        if (!doc) return null;
        const quantity = Number(line.quantity || line.qty || 1);
        const price    = Number(doc.finalPrice ?? doc.mrp ?? doc.purchasePrice ?? 0);
        return {
          product: doc._id,
          quantity,
          price,
          total: price * quantity,
          brand: doc.brand || undefined
        };
      }).filter(Boolean);
    }

    // ✅ Ad-hoc products mapping
    const adHocItems = adHoc.map(line => {
      const quantity = Number(line.quantity || line.qty || 1);
      const price    = Number(line.price || 0);
      return {
        quantity,
        price,
        total: price * quantity,
        brand: line.brand || undefined
      };
    });

    // ✅ Merge all items
    const allItems = [...dbItems, ...adHocItems];
    if (!allItems.length) {
      return res.status(400).json({ message: "No valid products. Provide valid productId or price lines." });
    }

    // ✅ Totals
    const totalAmount = allItems.reduce((s, x) => s + (Number(x.total) || 0), 0);
    const discountAmount = Number(req.body.discountAmount || 0);
    const gstAmount      = Number(req.body.gstAmount || 0);
    const finalAmount    = Number(req.body.finalAmount || (totalAmount - discountAmount + gstAmount));

    // ✅ Create order
    const orderDoc = await Order.create({
      buyerId: buyer._id,  // 🔹 Always save Buyer._id here
      address, pincode, city, state, country, fullAddress,
      staffCode: staffCode || buyer.staffCode || buyer.employeeCode || undefined,

      products: allItems,
      product: withIds.length === 1 ? withIds[0].productId : undefined,

      brandBreakdown: allItems.reduce((acc, it) => {
        if (!it.brand) return acc;
        const hit = acc.find(b => b.brand === it.brand);
        if (hit) hit.amount += it.total;
        else acc.push({ brand: it.brand, amount: it.total });
        return acc;
      }, []),

      totalAmount,
      discountAmount,
      gstAmount,
      finalAmount,

      status: req.body.status || "confirmed",
      paymentStatus: req.body.paymentStatus || "unpaid",

      invoiceUrl: req.body.invoiceUrl,
      sellerInvoiceUrl: req.body.sellerInvoiceUrl,

      isReturnRequested: false,
      returnReason: "",
    });

    return res.status(201).json({ message: "Order placed", order: orderDoc });
  } catch (err) {
    console.error("placeOrder error:", err);
    return res.status(500).json({ message: "Order placement failed", error: err.message });
  }
};
*/

// 📌 Get all orders (fixed)
exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("buyerId", "name phone email")          // ✅ matches schema
      .populate("sellerId", "brandName userId")         // ✅ if you want seller info
      .populate("product", "productname finalPrice")    // ✅ optional single product ref
      .sort({ createdAt: -1 })
      .lean();

    // If you still want a simple staff field in the response, echo staffCode:
    // (You can also map/rename here if your frontend expects `employeeCode`)
    return res.json({ ok: true, items: orders });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch orders", error: err.message });
  }
};


// 📌 Get single order
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("buyer", "name phone fullAddress")
      .populate("employee", "name employeeCode")
      .populate("products.productId", "productname finalPrice");

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch order", error: err.message });
  }
};

// 📌 Update order status (dispatch/deliver/cancel)
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: "Status is required" });

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json({ message: `Order marked as ${status}`, order });
  } catch (err) {
    res.status(500).json({ message: "Failed to update status", error: err.message });
  }
};
