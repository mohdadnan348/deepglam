// 📁 server/controllers/master.controller.js
const HSN = require('../models/hsn.model');
const Location = require('../models/location.model');
const Banner = require('../models/banner.model');
const ProfitMargin = require('../models/profitMargin.model');

// ========================================
// 📦 HSN CRUD Operations
// ========================================



// Create HSN
exports.createHSN = async (req, res) => {
  try {
    const { hsnCode, description, gstPercentage } = req.body;
    const hsn = new HSN({ hsnCode, description, gstPercentage });
    await hsn.save();
    res.status(201).json(hsn);
  } catch (err) {
    // Handle duplicate key error
    if (err.code === 11000) {
      return res.status(400).json({ message: 'HSN Code already exists' });
    }
    res.status(500).json({ message: 'Failed to create HSN', error: err.message });
  }
};

// Update HSN
exports.updateHSN = async (req, res) => {
  try {
    const { id } = req.params;
    const { hsnCode, description, gstPercentage } = req.body;
    
    const updatedHSN = await HSN.findByIdAndUpdate(
      id,
      { hsnCode, description, gstPercentage },
      { new: true, runValidators: true }
    );
    
    if (!updatedHSN) {
      return res.status(404).json({ message: 'HSN not found' });
    }
    
    res.json(updatedHSN);
  } catch (err) {
    // Handle duplicate key error
    if (err.code === 11000) {
      return res.status(400).json({ message: 'HSN Code already exists' });
    }
    res.status(500).json({ message: 'Failed to update HSN', error: err.message });
  }
};


// Get All HSNs
exports.getHSNs = async (req, res) => {
  try {
    const hsns = await HSN.find();
    res.json(hsns);
  } catch (err) {
    res.status(500).json({ message: 'Failed to get HSNs', error: err.message });
  }
};

// Get Single HSN by ID
exports.getHSNById = async (req, res) => {
  try {
    const { id } = req.params;
    const hsn = await HSN.findById(id);
    
    if (!hsn) {
      return res.status(404).json({ message: 'HSN not found' });
    }
    
    res.json(hsn);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch HSN', error: err.message });
  }
};

// Delete HSN
exports.deleteHSN = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedHSN = await HSN.findByIdAndDelete(id);
    
    if (!deletedHSN) {
      return res.status(404).json({ message: 'HSN not found' });
    }
    
    res.json({ message: 'HSN deleted successfully', data: deletedHSN });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete HSN', error: err.message });
  }
};

// ========================================
// 🌍 LOCATION CRUD Operations
// ========================================

// Create Location
exports.createLocation = async (req, res) => {
  try {
    const { pincode, city, state } = req.body;
    const location = new Location({ pincode, city, state });
    await location.save();
    res.status(201).json(location);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create location', error: err.message });
  }
};

// Get All Locations
exports.getAllLocations = async (req, res) => {
  try {
    const locations = await Location.find();
    res.json(locations);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch locations', error: err.message });
  }
};

// Get Location by Pincode
exports.getLocation = async (req, res) => {
  try {
    const { pincode } = req.params;
    const location = await Location.findOne({ pincode });

    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    res.json(location);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch location', error: err.message });
  }
};

// Update Location (or Create if not exists)
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
    res.status(500).json({ message: 'Failed to save location', error: err.message });
  }
};

// Update Location by ID
exports.updateLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { pincode, city, state } = req.body;
    
    const updatedLocation = await Location.findByIdAndUpdate(
      id,
      { pincode, city, state },
      { new: true, runValidators: true }
    );
    
    if (!updatedLocation) {
      return res.status(404).json({ message: 'Location not found' });
    }
    
    res.json(updatedLocation);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update location', error: err.message });
  }
};

// Delete Location
exports.deleteLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedLocation = await Location.findByIdAndDelete(id);
    
    if (!deletedLocation) {
      return res.status(404).json({ message: 'Location not found' });
    }
    
    res.json({ message: 'Location deleted successfully', data: deletedLocation });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete location', error: err.message });
  }
};

// ========================================
// 💰 PROFIT MARGIN CRUD Operations
// ========================================

// Create Profit Margin
exports.createProfit = async (req, res) => {
  try {
    const { category, marginPercentage, applicableTo, isActive } = req.body;
    const profit = new ProfitMargin({ category, marginPercentage, applicableTo, isActive });
    await profit.save();
    res.status(201).json(profit);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create profit margin', error: err.message });
  }
};

// Update Profit Margin by ID
exports.updateProfit = async (req, res) => {
  try {
    const { id } = req.params;
    const { category, marginPercentage, applicableTo, isActive } = req.body;
    
    const updatedProfit = await ProfitMargin.findByIdAndUpdate(
      id,
      { category, marginPercentage, applicableTo, isActive },
      { new: true, runValidators: true }
    );
    
    if (!updatedProfit) {
      return res.status(404).json({ message: 'Profit margin not found' });
    }
    
    res.json(updatedProfit);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update profit margin', error: err.message });
  }
};


// Get All Profit Margins
exports.getProfits = async (req, res) => {
  try {
    const profits = await ProfitMargin.find();
    res.json(profits);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch profits', error: err.message });
  }
};

// Get Single Profit Margin by ID
exports.getProfitById = async (req, res) => {
  try {
    const { id } = req.params;
    const profit = await ProfitMargin.findById(id);
    
    if (!profit) {
      return res.status(404).json({ message: 'Profit margin not found' });
    }
    
    res.json(profit);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch profit margin', error: err.message });
  }
};

// Set/Update Profit Margin (Upsert)
exports.setProfit = async (req, res) => {
  try {
    const { category, profitPercentage } = req.body;

    const updated = await ProfitMargin.findOneAndUpdate(
      { category },
      { profitPercentage },
      { upsert: true, new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save profit %', error: err.message });
  }
};

// Delete Profit Margin
exports.deleteProfit = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProfit = await ProfitMargin.findByIdAndDelete(id);
    
    if (!deletedProfit) {
      return res.status(404).json({ message: 'Profit margin not found' });
    }
    
    res.json({ message: 'Profit margin deleted successfully', data: deletedProfit });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete profit margin', error: err.message });
  }
};

// ========================================
// 🖼️ BANNER CRUD Operations
// ========================================

// Create Banner
exports.createBanner = async (req, res) => {
  try {
    const { image, linkType, linkId, title } = req.body;
    const banner = new Banner({ image, linkType, linkId, title });
    await banner.save();
    res.status(201).json(banner);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create banner', error: err.message });
  }
};

// Get All Banners
exports.getBanners = async (req, res) => {
  try {
    const banners = await Banner.find();
    res.json(banners);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch banners', error: err.message });
  }
};

// Get Single Banner by ID
exports.getBannerById = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);
    
    if (!banner) {
      return res.status(404).json({ message: 'Banner not found' });
    }
    
    res.json(banner);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch banner', error: err.message });
  }
};

// Update Banner
exports.updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { image, linkType, linkId, title } = req.body;
    
    const updatedBanner = await Banner.findByIdAndUpdate(
      id,
      { image, linkType, linkId, title },
      { new: true, runValidators: true }
    );
    
    if (!updatedBanner) {
      return res.status(404).json({ message: 'Banner not found' });
    }
    
    res.json(updatedBanner);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update banner', error: err.message });
  }
};

// Delete Banner
exports.deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedBanner = await Banner.findByIdAndDelete(id);
    
    if (!deletedBanner) {
      return res.status(404).json({ message: 'Banner not found' });
    }
    
    res.json({ message: 'Banner deleted successfully', data: deletedBanner });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete banner', error: err.message });
  }
};
