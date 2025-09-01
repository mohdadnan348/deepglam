// controllers/wishlistController.js
const Wishlist = require("../models/wishlist.model");
const Product = require("../models/product.model");

const wishlistController = {
  // Get user's wishlist
  getWishlist: async (req, res) => {
    try {
      const userId = req.user.id;

      let wishlist = await Wishlist.findOne({ user: userId }).populate({
        path: "products.product",
        select:
          "productname mainImage mrp finalPrice purchasePrice brand stock",
      });

      if (!wishlist) {
        wishlist = new Wishlist({ user: userId, products: [] });
        await wishlist.save();
      }

      res.json({
        success: true,
        wishlist,
        count: wishlist.products.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Add product to wishlist
  addToWishlist: async (req, res) => {
    try {
      const { productId } = req.body;
      const userId = req.user.id;

      // Validate product exists
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      let wishlist = await Wishlist.findOne({ user: userId });

      if (!wishlist) {
        wishlist = new Wishlist({ user: userId, products: [] });
      }

      // Check if product already in wishlist
      const existingProduct = wishlist.products.find(
        (item) => item.product.toString() === productId
      );

      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: "Product already in wishlist",
        });
      }

      wishlist.products.push({ product: productId });
      await wishlist.save();

      await wishlist.populate({
        path: "products.product",
        select: "productname mainImage mrp finalPrice purchasePrice brand",
      });

      res.json({
        success: true,
        message: "Product added to wishlist",
        wishlist,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Remove product from wishlist
 // controllers/wishlistController.js में सिर्फ removeFromWishlist को बदलें:
removeFromWishlist: async (req, res) => {
  try {
    const { productId } = req.params; // ✅ Get from URL params
    const userId = req.user.id;

    console.log('🔍 Remove wishlist request:', { productId, userId });

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required"
      });
    }

    const wishlist = await Wishlist.findOne({ user: userId });
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: "Wishlist not found"
      });
    }

    // Remove product from wishlist
    const initialLength = wishlist.products.length;
    wishlist.products = wishlist.products.filter(item => 
      item.product.toString() !== productId.toString()
    );

    if (wishlist.products.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: "Product not found in wishlist"
      });
    }

    await wishlist.save();

    res.json({
      success: true,
      message: "Product removed from wishlist",
      wishlist
    });
  } catch (error) {
    console.error('❌ Remove wishlist error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
},

  // Clear entire wishlist
  clearWishlist: async (req, res) => {
    try {
      const userId = req.user.id;

      await Wishlist.findOneAndUpdate(
        { user: userId },
        { products: [] },
        { new: true }
      );

      res.json({
        success: true,
        message: "Wishlist cleared successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Move item from wishlist to cart
  moveToCart: async (req, res) => {
    try {
      const { productId, quantity = 1 } = req.body;
      const userId = req.user.id;

      // Add to cart logic here (you can import cart controller or duplicate logic)
      // Remove from wishlist
      const wishlist = await Wishlist.findOne({ user: userId });
      if (wishlist) {
        wishlist.products = wishlist.products.filter(
          (item) => item.product.toString() !== productId
        );
        await wishlist.save();
      }

      res.json({
        success: true,
        message: "Product moved to cart",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
};

module.exports = wishlistController;
