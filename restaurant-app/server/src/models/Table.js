const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema(
  {
    tableNumber: { type: String, required: true, unique: true, trim: true }, // "01", "02"...
    label: { type: String, default: '' }, // vd: "Bàn cửa sổ" (tuỳ chọn)
    // qr_code_link — URL mà mã QR dán trên bàn trỏ tới, vd:
    // "https://tennhahang.com/?table=05". Được sinh tự động lúc tạo bàn
    // từ biến PUBLIC_URL trong .env (hoặc từ domain của request nếu chưa cấu hình).
    qrCodeLink: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Table', tableSchema);
