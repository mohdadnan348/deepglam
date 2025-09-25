

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // ✅ variable ka naam
  api_key: process.env.CLOUDINARY_API_KEY,       // ✅ variable ka naam
  api_secret: process.env.CLOUDINARY_API_SECRET, // ✅ variable ka naam
  secure: true,
});

module.exports = cloudinary;
