// controllers/cart.controller.js
const Cart = require("../models/cart.model");
const Product = require("../models/product.model");

const cartController = {
  // Get user's cart
  getCart: async (req, res) => {
    try {
      const userId = req.user.id;

      let cart = await Cart.findOne({ user: userId }).populate({
        path: "items.productId",
        select: "productName mainImage salePrice finalPrice price purchasePrice brand stock MOQ"
      });

      if (!cart) {
        cart = new Cart({ user: userId, items: [] });
        await cart.save();
      }

      // Calculate totals using stored unitPrice (or fallbacks)
      let subtotal = 0;
      const cartItems = cart.items.map(item => {
        // Prefer stored unitPrice on cart item (set when added). Fallback to product sale/final/price/purchasePrice.
        const price = (typeof item.unitPrice === "number" && !isNaN(item.unitPrice))
          ? item.unitPrice
          : (item.productId?.salePrice ?? item.productId?.finalPrice ?? item.productId?.price ?? item.productId?.purchasePrice ?? 0);

        const itemTotal = price * item.quantity;
        subtotal += itemTotal;

        return {
          ...item.toObject(),
          unitPrice: price,
          itemTotal
        };
      });

      return res.json({
        success: true,
        cart: {
          ...cart.toObject(),
          items: cartItems,
          totals: {
            subtotal,
            itemCount: cart.items.reduce((sum, it) => sum + it.quantity, 0)
          }
        }
      });
    } catch (error) {
      console.error("getCart error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Add item to cart
  addToCart: async (req, res) => {
    try {
      const { productId, quantity = 1 } = req.body;
      const userId = req.user.id;

      if (!productId) {
        return res.status(400).json({ success: false, message: "productId is required" });
      }

      // Validate product
      const product = await Product.findById(productId).lean();
      if (!product) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }

      // Determine server-authoritative unit price (salePrice preferred)
      const unitPriceToStore = Number(product.salePrice ?? product.finalPrice ?? product.price ?? product.purchasePrice ?? 0);

      let cart = await Cart.findOne({ user: userId });
      if (!cart) {
        cart = new Cart({ user: userId, items: [] });
      }

      const existingIndex = cart.items.findIndex(it => it.productId.toString() === productId);

      const existingQty = existingIndex > -1 ? cart.items[existingIndex].quantity : 0;
      const desiredQty = existingQty + Number(quantity);

      // Stock check (if product.stock present)
      if (product.stock != null && product.stock < desiredQty) {
        return res.status(400).json({ success: false, message: "Insufficient stock" });
      }

      // MOQ check (enforce on first-time add)
      const minQty = product.MOQ || 1;
      if (existingQty === 0 && Number(quantity) < minQty) {
        return res.status(400).json({ success: false, message: `Minimum order quantity is ${minQty}` });
      }

      if (existingIndex > -1) {
        // Update existing: increase qty and update unitPrice to current sale price
        cart.items[existingIndex].quantity = desiredQty;
        cart.items[existingIndex].unitPrice = unitPriceToStore;
      } else {
        // Add new item with server-determined unitPrice
        cart.items.push({
          productId,
          quantity: Number(quantity),
          unitPrice: unitPriceToStore
        });
      }

      await cart.save();

      // Populate product details for response
      await cart.populate({
        path: "items.productId",
        select: "productName mainImage salePrice finalPrice price purchasePrice brand stock MOQ"
      });

      return res.json({
        success: true,
        message: existingIndex > -1 ? "Cart updated" : "Product added to cart",
        cart
      });
    } catch (error) {
      console.error("addToCart error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Update item quantity (explicit set)
  updateCartItem: async (req, res) => {
    try {
      const { productId, quantity } = req.body;
      const userId = req.user.id;

      if (!productId || typeof quantity === "undefined") {
        return res.status(400).json({ success: false, message: "productId and quantity required" });
      }

      if (quantity <= 0) {
        return res.status(400).json({ success: false, message: "Quantity must be greater than 0" });
      }

      const cart = await Cart.findOne({ user: userId });
      if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

      const idx = cart.items.findIndex(it => it.productId.toString() === productId);
      if (idx === -1) return res.status(404).json({ success: false, message: "Item not in cart" });

      // Optional: verify stock for requested quantity
      const product = await Product.findById(productId).lean();
      if (product && product.stock != null && product.stock < Number(quantity)) {
        return res.status(400).json({ success: false, message: "Insufficient stock" });
      }

      cart.items[idx].quantity = Number(quantity);
      // keep unitPrice as stored (we don't change price on quantity update)
      await cart.save();

      return res.json({ success: true, message: "Cart updated successfully", cart });
    } catch (error) {
      console.error("updateCartItem error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Remove item
  removeFromCart: async (req, res) => {
    try {
      const { productId } = req.params;
      const userId = req.user.id;

      const cart = await Cart.findOne({ user: userId });
      if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

      cart.items = cart.items.filter(it => it.productId.toString() !== productId);
      await cart.save();

      return res.json({ success: true, message: "Item removed from cart", cart });
    } catch (error) {
      console.error("removeFromCart error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Clear cart
  clearCart: async (req, res) => {
    try {
      const userId = req.user.id;
      await Cart.findOneAndUpdate({ user: userId }, { items: [] }, { new: true });
      return res.json({ success: true, message: "Cart cleared successfully" });
    } catch (error) {
      console.error("clearCart error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = cartController;
