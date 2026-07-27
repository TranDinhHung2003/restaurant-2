const mongoose = require('mongoose');

// Một dòng món trong đơn — LƯU LẠI giá tại thời điểm đặt (snapshot),
// để nếu admin đổi giá món sau đó, đơn cũ không bị đổi giá theo.
const orderItemSchema = new mongoose.Schema(
  {
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    // Số thứ tự hiển thị cho khách & admin — KHÔNG dùng _id của Mongo vì quá dài,
    // khó đọc và không tăng dần trực quan theo thời gian trong ngày.
    orderNumber: { type: Number, required: true },
    dateKey: { type: String, required: true }, // "YYYY-MM-DD", dùng để lọc đơn theo ngày

    table: { type: String, required: true },
    items: { type: [orderItemSchema], required: true },
    note: { type: String, default: '' },
    total: { type: Number, required: true },

    // Trạng thái xử lý tại bếp/nhà hàng
    status: {
      type: String,
      enum: ['pending', 'preparing', 'served', 'cancelled'],
      default: 'pending',
    },

    // Thông tin thanh toán
    payment: {
      method: { type: String, enum: ['cash', 'vietqr', null], default: null },
      status: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
      paidAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// Truy vấn "đơn hôm nay" rất thường xuyên trên dashboard admin -> đánh index.
orderSchema.index({ dateKey: 1, orderNumber: 1 });

module.exports = mongoose.model('Order', orderSchema);
