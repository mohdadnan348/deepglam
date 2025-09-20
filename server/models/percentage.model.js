const mongoose = require('mongoose');

const percentageSchema = new mongoose.Schema({
  value: { type: Number, required: true, unique: true } // dropdown values unique होंगी
});

module.exports = mongoose.model('Percentage', percentageSchema);
