const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");

// Memory storage (file RAM me ayega, disk pe nahi)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ Product Image Upload
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Cloudinary upload
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "deepglam/products", // Cloudinary folder
      },
      (err, result) => {
        if (err) {
          console.error("Cloudinary error:", err);
          return res.status(500).json({ message: "Cloudinary upload failed" });
        }

        // ✅ Ye URL sab devices par chalega
        return res.json({
          message: "Upload successful",
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    Readable.from(req.file.buffer).pipe(stream);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Upload failed" });
  }
});

module.exports = router;
