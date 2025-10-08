// controllers/cartController.js
const Cart = require("../models/cart.model");
const Product = require("../models/product.model");

const EPSILON = 0.01; // tolerance in currency units (adjust if you store paise as integers)

/**
 * Helper: DB se preferred unit price nikalna
 */
const getDbUnitPrice = (product) => {
  // Prefer finalPrice -> mrp -> purchasePrice -> 0
  return Number(product?.finalPrice ?? product?.mrp ?? product?.purchasePrice ?? 0);
};

const cartController = {
  // Get user's cart
  getCart: async (req, res) => {
    try {
      const userId = req.user.id;

      let cart = await Cart.findOne({ user: userId }).populate({
        path: "items.productId",
        select: "productname mainImage mrp finalPrice purchasePrice brand stock MOQ"
      });

      if (!cart) {
        cart = new Cart({ user: userId, items: [] });
        await cart.save();
      }

      // Calculate totals — prefer stored item.unitPrice, else derive from product
      let subtotal = 0;
      const cartItems = cart.items.map(item => {
        // if unitPrice stored on cart item, use that; otherwise take DB price
        const storedUnit = typeof item.unitPrice !== "undefined" && item.unitPrice !== null
          ? Number(item.unitPrice)
          : null;

        const derivedUnit = getDbUnitPrice(item.productId);
        const unitPrice = storedUnit !== null ? storedUnit : derivedUnit;
        const qty = Number(item.quantity || 0);
        const itemTotal = unitPrice * qty;
        subtotal += itemTotal;

        // return item details with computed unitPrice and itemTotal
        const base = item.toObject ? item.toObject() : { ...item };
        return {
          ...base,
          unitPrice,
          itemTotal
        };
      });

      res.json({
        success: true,
        cart: {
          ...cart.toObject(),
          items: cartItems,
          totals: {
            subtotal,
            itemCount: cart.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
          }
        }
      });
    } catch (error) {
      console.error("getCart error:", error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Add item to cart (accepts optional client unitPrice with validation)
  addToCart: async (req, res) => {
    try {
      const { productId, quantity = 1, unitPrice: clientUnitPrice } = req.body;
      const userId = req.user.id;

      if (!productId) {
        return res.status(400).json({ success: false, message: "productId is required" });
      }

      // Validate product exists
      const product = await Product.findById(productId).select("productname mainImage mrp finalPrice purchasePrice brand stock MOQ");
      if (!product) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }

      // Check stock if available
      if (product.stock && product.stock < quantity) {
        return res.status(400).json({ success: false, message: "Insufficient stock" });
      }

      // Check MOQ
      const minQty = product.MOQ || 1;
      if (quantity < minQty) {
        return res.status(400).json({ success: false, message: `Minimum order quantity is ${minQty}` });
      }

      // parse & validate client provided unit price (if present)
      let clientUnit = null;
      if (clientUnitPrice !== undefined && clientUnitPrice !== null) {
        const parsed = Number(clientUnitPrice);
        if (!Number.isNaN(parsed) && parsed >= 0) clientUnit = parsed;
      }

      // DB authoritative price
      const dbUnit = getDbUnitPrice(product);

      // Decide unitPriceToStore (prefer client if it matches DB within EPSILON OR DB missing)
      let unitPriceToStore;
      if (clientUnit !== null) {
        if (dbUnit > 0) {
          if (Math.abs(clientUnit - dbUnit) <= EPSILON) {
            unitPriceToStore = clientUnit;
          } else {
            // Mismatch -> log and fallback to DB price
            console.warn("Client unitPrice mismatch - using DB price", { productId, clientUnit, dbUnit, userId });
            unitPriceToStore = dbUnit;
          }
        } else {
          // DB has no price -> accept client price (basic validation done)
          unitPriceToStore = clientUnit;
        }
      } else {
        unitPriceToStore = dbUnit;
      }

      // Upsert cart
      let cart = await Cart.findOne({ user: userId });
      if (!cart) {
        cart = new Cart({ user: userId, items: [] });
      }

      const existingItemIndex = cart.items.findIndex(item =>
        String(item.productId) === String(productId)
      );

      if (existingItemIndex > -1) {
        // Update existing item: increment quantity and update unitPrice (if changed)
        cart.items[existingItemIndex].quantity = Number(cart.items[existingItemIndex].quantity || 0) + Number(quantity || 1);
        cart.items[existingItemIndex].unitPrice = unitPriceToStore;
        cart.items[existingItemIndex].updatedAt = new Date();
      } else {
        // Add new item with unitPrice saved
        cart.items.push({
          productId,
          quantity: Number(quantity || 1),
          unitPrice: unitPriceToStore,
          addedAt: new Date()
        });
      }

      await cart.save();

      await cart.populate({
        path: 'items.productId',
        select: 'productname mainImage mrp finalPrice purchasePrice brand stock MOQ'
      });

      // compute subtotal to return
      let subtotal = 0;
      cart.items.forEach(it => {
        const up = Number(it.unitPrice || getDbUnitPrice(it.productId) || 0);
        const q = Number(it.quantity || 0);
        subtotal += up * q;
      });

      res.json({
        success: true,
        message: existingItemIndex > -1 ? "Cart updated" : "Product added to cart",
        cart,
        subtotal
      });
    } catch (error) {
      console.error("addToCart error:", error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Update cart item quantity (optionally can accept unitPrice to update price too)
  updateCartItem: async (req, res) => {
    try {
      const { productId, quantity, unitPrice: clientUnitPrice } = req.body;
      const userId = req.user.id;

      if (!productId) return res.status(400).json({ success: false, message: "productId required" });
      if (quantity === undefined || quantity === null) return res.status(400).json({ success: false, message: "quantity required" });

      if (Number(quantity) <= 0) {
        return res.status(400).json({ success: false, message: "Quantity must be greater than 0" });
      }

      const cart = await Cart.findOne({ user: userId });
      if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

      const itemIndex = cart.items.findIndex(item =>
        String(item.productId) === String(productId)
      );
      if (itemIndex === -1) return res.status(404).json({ success: false, message: "Item not found in cart" });

      // Update quantity
      cart.items[itemIndex].quantity = Number(quantity);
      cart.items[itemIndex].updatedAt = new Date();

      // If client provided unitPrice update it (with basic validation + DB check)
      if (clientUnitPrice !== undefined && clientUnitPrice !== null) {
        const product = await Product.findById(productId).select("mrp finalPrice purchasePrice");
        const parsed = Number(clientUnitPrice);
        if (!Number.isNaN(parsed) && parsed >= 0) {
          const dbUnit = getDbUnitPrice(product);
          if (dbUnit > 0 && Math.abs(parsed - dbUnit) <= EPSILON) {
            cart.items[itemIndex].unitPrice = parsed;
          } else if (dbUnit > 0) {
            console.warn("Client unitPrice mismatch on update - using DB price", { productId, parsed, dbUnit, userId });
            cart.items[itemIndex].unitPrice = dbUnit;
          } else {
            // db price missing -> accept client price
            cart.items[itemIndex].unitPrice = parsed;
          }
        }
      }

      await cart.save();

      return res.json({
        success: true,
        message: "Cart updated successfully",
        cart
      });
    } catch (error) {
      console.error("updateCartItem error:", error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Remove item from cart
  removeFromCart: async (req, res) => {
    try {
      const { productId } = req.params;
      const userId = req.user.id;

      const cart = await Cart.findOne({ user: userId });
      if (!cart) {
        return res.status(404).json({ success: false, message: "Cart not found" });
      }

      cart.items = cart.items.filter(item =>
        String(item.productId) !== productId
      );

      await cart.save();

      res.json({
        success: true,
        message: "Item removed from cart",
        cart
      });
    } catch (error) {
      console.error("removeFromCart error:", error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Clear entire cart
  clearCart: async (req, res) => {
    try {
      const userId = req.user.id;

      await Cart.findOneAndUpdate(
        { user: userId },
        { items: [] },
        { new: true }
      );

      res.json({
        success: true,
        message: "Cart cleared successfully"
      });
    } catch (error) {
      console.error("clearCart error:", error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};

module.exports = cartController;
