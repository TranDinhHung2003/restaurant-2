const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true }, // "Món chính", "Khai vị"...
    price: { type: Number, required: true, min: 0 },
    description: { type: String, default: '' },
    image: { type: String, default: '' }, // URL ảnh món
    // Admin bật/tắt cái này bất cứ lúc nào trong ngày (hết món giữa giờ...)
    available: { type: Boolean, default: true },
    // Thứ tự hiển thị trong danh mục (tuỳ chọn, admin có thể kéo-thả sau này)
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true } // tự có createdAt / updatedAt -> biết món vừa update lúc mấy giờ
);

module.exports = mongoose.model('MenuItem', menuItemSchema);
