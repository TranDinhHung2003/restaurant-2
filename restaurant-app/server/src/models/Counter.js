/**
 * Counter — dùng để sinh SỐ THỨ TỰ ĐƠN HÀNG.
 *
 * Vì sao cần collection riêng thay vì đếm số đơn trong bảng Order?
 * - Phải đảm bảo tăng dần TUYỆT ĐỐI theo đúng thứ tự khách bấm "Đặt cơm",
 *   kể cả khi nhiều khách đặt cùng lúc (race condition).
 * - MongoDB findOneAndUpdate với $inc là thao tác ATOMIC (nguyên tử),
 *   nên 2 request đến cùng lúc vẫn được cấp 2 số khác nhau, không bao giờ trùng.
 * - _id = ngày hiện tại theo múi giờ nhà hàng (YYYY-MM-DD) => số thứ tự
 *   tự động reset về 1 mỗi ngày mới; admin cũng có thể reset tay trong ngày.
 */
const mongoose = require('mongoose');
const { todayKey } = require('../utils/date');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // vd: "2026-07-27"
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

/**
 * Lấy số thứ tự tiếp theo cho ngày hôm nay (atomic, an toàn khi nhiều người đặt cùng lúc).
 * Sang ngày mới (theo TIMEZONE) → tự bắt đầu lại từ 1 vì _id counter khác.
 */
async function getNextOrderNumber() {
  const today = todayKey();
  const counter = await Counter.findOneAndUpdate(
    { _id: today },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return counter.seq;
}

/** Đọc số thứ tự hiện tại (đơn gần nhất trong ngày), không tăng. */
async function getCurrentOrderNumber(dateKey = todayKey()) {
  const counter = await Counter.findById(dateKey);
  return counter ? counter.seq : 0;
}

/**
 * Reset số thứ tự về 0 cho một ngày (mặc định hôm nay).
 * Đơn tiếp theo sẽ nhận số #1. Không xoá đơn hàng đã tạo.
 */
async function resetOrderNumber(dateKey = todayKey()) {
  const counter = await Counter.findOneAndUpdate(
    { _id: dateKey },
    { $set: { seq: 0 } },
    { upsert: true, new: true }
  );
  return { dateKey, seq: counter.seq };
}

module.exports = {
  Counter,
  getNextOrderNumber,
  getCurrentOrderNumber,
  resetOrderNumber,
};
