// controllers/cart.controller.js
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
          select: 'productName productname mainImage mrp finalPrice price salePrice purchasePrice brand stock MOQ gstPercentage'
        });

      if (!cart) {
        cart = new Cart({ user: userId, items: [] });
        await cart.save();
      }

      // Calculate totals using stored item.unitPrice if present, else product salePrice
      let subtotal = 0;
      const cartItems = (cart.items || []).map(item => {
        // prefer stored unitPrice, else product.salePrice/fallback
        const storedUnit = (typeof item.unitPrice !== 'undefined' && item.unitPrice !== null) ? Number(item.unitPrice) : null;
        const productObj = item.productId || {};
        const productSale = Number(productObj.salePrice ?? productObj.finalPrice ?? productObj.price ?? productObj.purchasePrice ?? 0);
        const unitPrice = storedUnit !== null ? storedUnit : productSale;
        const quantity = Number(item.quantity || 0);
        const itemTotal = Number(unitPrice || 0) * quantity;
        subtotal += itemTotal;

        return {
          ...item.toObject(),
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
      console.error("Get cart error:", error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Add item to cart
  addToCart: async (req, res) => {
    try {
      const { productId, quantity = 1, unitPrice: clientUnitPrice } = req.body;
      const userId = req.user.id;

      // Validate product exists
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }

      // Validate stock
      if (product.stock && product.stock < quantity) {
        return res.status(400).json({ success: false, message: "Insufficient stock" });
      }

      // MOQ check
      const minQty = product.MOQ || 1;
      if (quantity < minQty) {
        return res.status(400).json({ success: false, message: `Minimum order quantity is ${minQty}` });
      }

      // Decide unit price to store (paise-int comparison for safety)
      const dbUnitPaise = Math.round(Number(product.salePrice ?? product.finalPrice ?? product.price ?? product.purchasePrice ?? 0) * 100);
      let chosenUnitPaise = dbUnitPaise; // default prefer DB salePrice

      if (typeof clientUnitPrice !== "undefined" && clientUnitPrice !== null) {
        // clientUnitPrice may be rupees — convert to paise
        const clientPaise = Math.round(Number(clientUnitPrice) * 100);
        // tolerance (paise) — allow tiny rounding differences
        const EPSILON = 1; // 1 paise tolerance
        if (dbUnitPaise > 0) {
          // accept client price only if it's near DB price
          if (Math.abs(clientPaise - dbUnitPaise) <= EPSILON) {
            chosenUnitPaise = clientPaise;
          } else {
            // mismatch -> prefer DB price and log
            console.warn("Client unitPrice mismatch — using DB price", { productId, clientPaise, dbUnitPaise, userId });
            chosenUnitPaise = dbUnitPaise;
          }
        } else {
          // DB has no price, accept client price
          chosenUnitPaise = clientPaise;
        }
      }

      const chosenUnitRupees = Number((chosenUnitPaise / 100).toFixed(2));

      let cart = await Cart.findOne({ user: userId });
      if (!cart) {
        cart = new Cart({ user: userId, items: [] });
      }

      const existingIndex = cart.items.findIndex(it => it.productId.toString() === productId.toString());
      if (existingIndex > -1) {
        // update quantity (and keep existing unitPrice unless client passed explicit unitPrice close to DB)
        cart.items[existingIndex].quantity += Number(quantity);
        // If stored unitPrice null or 0, set it now
        if (!cart.items[existingIndex].unitPrice) {
          cart.items[existingIndex].unitPrice = chosenUnitRupees;
        }
      } else {
        cart.items.push({
          productId,
          quantity,
          unitPrice: chosenUnitRupees
        });
      }

      await cart.save();

      // populate for response
      await cart.populate({
        path: 'items.productId',
        select: 'productName productname mainImage mrp finalPrice price salePrice purchasePrice brand'
      });

      res.json({
        success: true,
        message: existingIndex > -1 ? "Cart updated" : "Product added to cart",
        cart
      });

    } catch (error) {
      console.error("Add to cart error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Update cart item
  updateCartItem: async (req, res) => {
    try {
      const { productId, quantity, unitPrice: clientUnitPrice } = req.body;
      const userId = req.user.id;

      if (quantity <= 0) {
        return res.status(400).json({ success: false, message: "Quantity must be greater than 0" });
      }

      const cart = await Cart.findOne({ user: userId });
      if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

      const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
      if (itemIndex === -1) return res.status(404).json({ success: false, message: "Item not found in cart" });

      cart.items[itemIndex].quantity = Number(quantity);

      // optionally update stored unitPrice if client supplied (validate against product)
      if (typeof clientUnitPrice !== "undefined" && clientUnitPrice !== null) {
        const product = await Product.findById(productId);
        if (product) {
          const dbUnitPaise = Math.round(Number(product.salePrice ?? product.finalPrice ?? product.price ?? product.purchasePrice ?? 0) * 100);
          const clientPaise = Math.round(Number(clientUnitPrice) * 100);
          const EPSILON = 1;
          if (dbUnitPaise > 0 && Math.abs(clientPaise - dbUnitPaise) <= EPSILON) {
            cart.items[itemIndex].unitPrice = Number((clientPaise / 100).toFixed(2));
          } else if (dbUnitPaise === 0) {
            cart.items[itemIndex].unitPrice = Number((clientPaise / 100).toFixed(2));
          } else {
            // mismatch -> keep DB price or existing value
            cart.items[itemIndex].unitPrice = Number((dbUnitPaise / 100).toFixed(2));
          }
        }
      }

      await cart.save();
      res.json({ success: true, message: "Cart updated successfully", cart });
    } catch (error) {
      console.error("Update cart item error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Remove item from cart
  removeFromCart: async (req, res) => {
    try {
      const { productId } = req.params;
      const userId = req.user.id;

      const cart = await Cart.findOne({ user: userId });
      if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

      cart.items = cart.items.filter(item => item.productId.toString() !== productId);
      await cart.save();

      res.json({ success: true, message: "Item removed from cart", cart });
    } catch (error) {
      console.error("Remove from cart error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Clear entire cart
  clearCart: async (req, res) => {
    try {
      const userId = req.user.id;
      await Cart.findOneAndUpdate({ user: userId }, { items: [] }, { new: true });
      res.json({ success: true, message: "Cart cleared successfully" });
    } catch (error) {
      console.error("Clear cart error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = cartController;
