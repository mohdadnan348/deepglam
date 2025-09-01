const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlist.controller');
const { verifyJWT } = require("../middlewares/auth.middleware"); // ✅ Correct import

// All cart routes require authentication
router.use(verifyJWT);

// ➕ Add to wishlist
router.post('/:productId', wishlistController.addToWishlist);

// ❌ Remove from wishlist
router.delete('/remove/:productId', wishlistController.removeFromWishlist); 

// 📥 Get user's wishlist
router.get('/', wishlistController.getWishlist);

module.exports = router;
