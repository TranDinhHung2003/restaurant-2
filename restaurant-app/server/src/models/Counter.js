/**
 * Counter — dùng để sinh SỐ THỨ TỰ ĐƠN HÀNG.
 *
 * Vì sao cần collection riêng thay vì đếm số đơn trong bảng Order?
 * - Phải đảm bảo tăng dần TUYỆT ĐỐI theo đúng thứ tự khách bấm "Đặt cơm",
 *   kể cả khi nhiều khách đặt cùng lúc (race condition).
 * - MongoDB findOneAndUpdate với $inc là thao tác ATOMIC (nguyên tử),
 *   nên 2 request đến cùng lúc vẫn được cấp 2 số khác nhau, không bao giờ trùng.
 * - _id = ngày hiện tại (YYYY-MM-DD) => số thứ tự tự động reset về 1 mỗi ngày mới,
 *   đúng với thực tế nhà hàng (mỗi ca/mỗi ngày gọi số lại từ đầu).
 */
const mongoose = require('mongoose');
const { getDateKey } = require('../utils/dateKey');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // vd: "2026-07-27"
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

/**
 * Lấy số thứ tự tiếp theo cho ngày hôm nay (atomic, an toàn khi nhiều người đặt cùng lúc).
 */
async function getNextOrderNumber(dateKey = getDateKey()) {
  const counter = await Counter.findOneAndUpdate(
    { _id: dateKey },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return counter.seq;
}

/** Reset số thứ tự về 0 — đơn tiếp theo sẽ là #1. */
async function resetCounter(dateKey = getDateKey()) {
  await Counter.findOneAndUpdate(
    { _id: dateKey },
    { seq: 0 },
    { upsert: true }
  );
}

/** Lấy số thứ tự hiện tại (0 nếu chưa có đơn). */
async function getCurrentCounter(dateKey = getDateKey()) {
  const counter = await Counter.findById(dateKey);
  return counter?.seq ?? 0;
}

module.exports = { Counter, getNextOrderNumber, resetCounter, getCurrentCounter };
