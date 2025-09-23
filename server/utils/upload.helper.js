const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Readable } = require("stream");
const cloudinary = require("cloudinary").v2;

/* ---------------- Cloudinary Config ---------------- */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ---------------- Ensure uploads dir ---------------- */
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

/* ---------------- Multer for images ---------------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
  if (allowedTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only jpg, jpeg, png files allowed"));
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

/* ---------------- Cloudinary upload ---------------- */
async function uploadBufferToCloudinary(filePath, folder = "products") {
  try {
    const result = await cloudinary.uploader.upload(filePath, { folder });
    return { url: result.secure_url, public_id: result.public_id };
  } catch (err) {
    console.error("Cloudinary upload failed:", err.message);
    return null;
  }
}

/* ---------------- Local fallback ---------------- */
function saveLocally(filePath, folder = "products") {
  const dir = path.join(uploadDir, folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = path.basename(filePath);
  const dest = path.join(dir, filename);
  fs.copyFileSync(filePath, dest);
  return { url: `/uploads/${folder}/${filename}`, public_id: "" };
}

module.exports = { upload, uploadBufferToCloudinary, saveLocally };
