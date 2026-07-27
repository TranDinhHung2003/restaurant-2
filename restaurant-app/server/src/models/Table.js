const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema(
  {
    tableNumber: { type: String, required: true, unique: true, trim: true }, // "01", "02"...
    label: { type: String, default: '' }, // vd: "Bàn cửa sổ" (tuỳ chọn)
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Table', tableSchema);
