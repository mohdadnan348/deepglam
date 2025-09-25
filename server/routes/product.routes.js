const express = require("express");
const router = express.Router();
const multer = require("multer");
const { Readable } = require("stream");
const cloudinary = require("../config/cloudinary");

const { verifyJWT } = require("../middlewares/auth.middleware");
const productCtrl = require("../controllers/product.controller");

// ========================================
// Multer Setup (for backend → Cloudinary uploads)
// ========================================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ========================================
// PUBLIC ROUTES
// ========================================
router.get("/", productCtrl.getAllProducts);

// ========================================
// SPECIFIC ROUTES
// ========================================
router.get("/my", verifyJWT, productCtrl.getProductsByUser);
router.put("/approve/:id", productCtrl.approveProduct);
router.put("/reject/:id", productCtrl.rejectProduct);
router.post("/clone/:id", productCtrl.cloneProduct);

// ========================================
// PRODUCT IMAGE UPLOAD (Backend → Cloudinary)
// ========================================
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const stream = cloudinary.uploader.upload_stream(
      { folder: "deepglam/products" },
      (err, result) => {
        if (err) {
          console.error("❌ Cloudinary error:", err);
          return res.status(500).json({ message: "Upload failed" });
        }

        return res.json({
          message: "✅ Upload successful",
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    Readable.from(req.file.buffer).pipe(stream);
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ message: "Upload error", error: err.message });
  }
});

// ========================================
// GENERAL CRUD ROUTES
// ========================================
router.post("/", verifyJWT, productCtrl.createProduct);
router.get("/:id", productCtrl.getProductById);
router.put("/:id", productCtrl.updateProduct);
router.delete("/:id", productCtrl.deleteProduct);

module.exports = router;
