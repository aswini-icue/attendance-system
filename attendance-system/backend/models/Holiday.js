const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD
    name: { type: String, required: [true, 'Holiday name is required'], trim: true, maxlength: 100 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Holiday', holidaySchema);
