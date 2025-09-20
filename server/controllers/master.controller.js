// 📁 server/controllers/master.controller.js
const HSN = require('../models/hsn.model');
const Location = require('../models/location.model');
const Banner = require('../models/banner.model');
const Percentage = require('../models/percentage.model');
const Profit = require('../models/profitMargin.model');


// 📦 HSN: Create
exports.createHSN = async (req, res) => {
  try {
    const { code, description, gstPercentage } = req.body;
    const hsn = new HSN({ code, description, gstPercentage });
    await hsn.save();
    res.status(201).json(hsn);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create HSN' });
  }
};

// 📦 HSN: Get All
exports.getHSNs = async (req, res) => {
  try {
    const hsns = await HSN.find();
    res.json(hsns);
  } catch (err) {
    res.status(500).json({ message: 'Failed to get HSNs' });
  }
};

// 🌍 Location: Add or Update
exports.upsertLocation = async (req, res) => {
  try {
    const { pincode, city, state } = req.body;

    const updated = await Location.findOneAndUpdate(
      { pincode },
      { city, state },
      { upsert: true, new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save location' });
  }
};

// 🌍 Location: Get by Pincode
exports.getLocation = async (req, res) => {
  try {
    const { pincode } = req.params;
    const location = await Location.findOne({ pincode });

    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    res.json(location);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch location' });
  }
};

// 💰 Profit % Master: Set
exports.setProfit = async (req, res) => {
  try {
    const { category, profitPercentage } = req.body;

    const updated = await Profit.findOneAndUpdate(
      { category },
      { profitPercentage },
      { upsert: true, new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save profit %' });
  }
};

// 💰 Profit % Master: Get All
exports.getProfits = async (req, res) => {
  try {
    const profits = await Profit.find();
    res.json(profits);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch profits' });
  }
};

// 🖼️ Banner: Create
exports.createBanner = async (req, res) => {
  try {
    const { image, linkType, linkId, title } = req.body;
    const banner = new Banner({ image, linkType, linkId, title });
    await banner.save();
    res.status(201).json(banner);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create banner' });
  }
};

// 🖼️ Banner: Get All
exports.getBanners = async (req, res) => {
  try {
    const banners = await Banner.find();
    res.json(banners);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch banners' });
  }
};
exports.addPercentage = async (req, res) => {
  try {
    const { value } = req.body;

    const exists = await Percentage.findOne({ value });
    if (exists) {
      return res.status(400).json({ message: 'Percentage already exists' });
    }

    const percentage = new Percentage({ value });
    await percentage.save();

    res.status(201).json(percentage);
  } catch (err) {
    //console.error("Error in addPercentage:", err);  // 🔍 असली error यहाँ दिखेगा
    res.status(500).json({ message: 'Failed to add percentage' });
  }
};


// 📥 Percentage: Get All (for dropdown)
exports.getPercentages = async (req, res) => {
  try {
    const percentages = await Percentage.find().sort({ value: 1 }); // ascending order
    res.json(percentages);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch percentages' });
  }
};