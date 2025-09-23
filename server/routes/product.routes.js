const express = require("express");
const router = express.Router();
const { verifyJWT } = require("../middlewares/auth.middleware");
const productCtrl = require("../controllers/product.controller");
const { upload } = require("../utils/upload.helper");

// ========================================
// PUBLIC ROUTES (No Authentication)
// ========================================
router.get("/", productCtrl.getAllProducts);

// ========================================
// SPECIFIC ROUTES (Must come before /:id)
// ========================================
router.get("/my", verifyJWT, productCtrl.getProductsByUser);
router.put("/approve/:id", productCtrl.approveProduct);
router.put("/reject/:id", productCtrl.rejectProduct);
router.post("/clone/:id", productCtrl.cloneProduct);

// ========================================
// GENERAL CRUD ROUTES (Parameterized)
// ========================================
//router.post("/", verifyJWT, productCtrl.createProduct);
// Single main image + multiple gallery images
router.post(
  "/",
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]),
  productCtrl.createProduct
);
router.get("/:id", productCtrl.getProductById);
router.put("/:id", productCtrl.updateProduct);
router.delete("/:id", productCtrl.deleteProduct);

module.exports = router;
