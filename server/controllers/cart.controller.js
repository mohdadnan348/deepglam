// controllers/cartController.js
const Cart = require("../models/cart.model");
const Product = require("../models/product.model");

const cartController = {
  // Get user's cart
  getCart: async (req, res) => {
    try {
      const userId = req.user.id;

      let cart = await Cart.findOne({ user: userId })
        .populate({
          path: 'items.productId',
          select: 'productname mainImage mrp finalPrice purchasePrice brand stock MOQ'
        });

      if (!cart) {
        cart = new Cart({ user: userId, items: [] });
        await cart.save();
      }

      // Calculate totals
      let subtotal = 0;
      const cartItems = cart.items.map(item => {
        // Prefer stored unitPrice on the cart item; otherwise fallback to product prices
        const price = (typeof item.unitPrice === 'number' && !isNaN(item.unitPrice))
          ? item.unitPrice
          : (item.productId?.finalPrice ?? item.productId?.mrp ?? item.productId?.purchasePrice ?? 0);

        const itemTotal = price * item.quantity;
        subtotal += itemTotal;

        return {
          ...item.toObject(),
          unitPrice: price,
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
            itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0)
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Add item to cart
  addToCart: async (req, res) => {
    try {
      const { productId, quantity = 1 } = req.body;
      const userId = req.user.id;

      // Validate product exists
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found"
        });
      }

      let cart = await Cart.findOne({ user: userId });
      if (!cart) {
        cart = new Cart({ user: userId, items: [] });
      }

      const existingItemIndex = cart.items.findIndex(item =>
        item.productId.toString() === productId
      );

      // Calculate desired qty (existing + new) for stock check
      const existingQty = existingItemIndex > -1 ? cart.items[existingItemIndex].quantity : 0;
      const desiredQty = existingQty + quantity;

      // Check stock if available
      if (product.stock && product.stock < desiredQty) {
        return res.status(400).json({
          success: false,
          message: "Insufficient stock"
        });
      }

      // Check MOQ
      const minQty = product.MOQ || 1;
      if (quantity < minQty && existingQty === 0) {
        // if adding first time, enforce MOQ. If updating existing via add, combined qty check above ensures overall quantity.
        return res.status(400).json({
          success: false,
          message: `Minimum order quantity is ${minQty}`
        });
      }

      // Determine server-authoritative unit price (use finalPrice as sale price)
      const unitPriceToStore = Number(product.finalPrice ?? product.mrp ?? product.purchasePrice ?? 0);

      if (existingItemIndex > -1) {
        // Update existing item quantity and refresh unitPrice to current product sale price
        cart.items[existingItemIndex].quantity = cart.items[existingItemIndex].quantity + quantity;
        cart.items[existingItemIndex].unitPrice = unitPriceToStore;
      } else {
        // Add new item with unitPrice set to product finalPrice (sale price)
        cart.items.push({ productId, quantity, unitPrice: unitPriceToStore });
      }

      await cart.save();

      await cart.populate({
        path: 'items.productId',
        select: 'productname mainImage mrp finalPrice purchasePrice brand stock MOQ'
      });

      res.json({
        success: true,
        message: existingItemIndex > -1 ? "Cart updated" : "Product added to cart",
        cart
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Update cart item quantity
  updateCartItem: async (req, res) => {
    try {
      const { productId, quantity } = req.body;
      const userId = req.user.id;

      if (quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be greater than 0"
        });
      }

      const cart = await Cart.findOne({ user: userId });
      if (!cart) {
        return res.status(404).json({
          success: false,
          message: "Cart not found"
        });
      }

      const itemIndex = cart.items.findIndex(item =>
        item.productId.toString() === productId
      );

      if (itemIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Item not found in cart"
        });
      }

      // Optional: verify stock for the new quantity
      const product = await Product.findById(productId);
      if (product && product.stock && product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: "Insufficient stock"
        });
      }

      cart.items[itemIndex].quantity = quantity;
      // Keep unitPrice as-is (it was set when item was added)
      await cart.save();

      res.json({
        success: true,
        message: "Cart updated successfully",
        cart
      });
    } catch (error) {
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
        return res.status(404).json({
          success: false,
          message: "Cart not found"
        });
      }

      cart.items = cart.items.filter(item =>
        item.productId.toString() !== productId
      );

      await cart.save();

      res.json({
        success: true,
        message: "Item removed from cart",
        cart
      });
    } catch (error) {
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
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};

module.exports = cartController;
