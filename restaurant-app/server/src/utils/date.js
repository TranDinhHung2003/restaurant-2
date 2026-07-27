/**
 * date.js — ngày/giờ theo múi giờ nhà hàng (TIMEZONE, mặc định Asia/Ho_Chi_Minh).
 * Dùng chung cho số thứ tự đơn (Counter) và báo cáo doanh thu, để server
 * chạy ở UTC vẫn tính đúng "hôm nay / tuần này / tháng này" của Việt Nam.
 */

const TIMEZONE = process.env.TIMEZONE || 'Asia/Ho_Chi_Minh';

/** "YYYY-MM-DD" của một thời điểm theo múi giờ nhà hàng. */
function dateKeyOf(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

/** dateKey hôm nay theo múi giờ nhà hàng. */
function todayKey() {
  return dateKeyOf(new Date());
}

/**
 * Cộng/trừ N ngày lịch trên chuỗi "YYYY-MM-DD" (không phụ thuộc timezone server).
 * Dùng cho khoảng tuần/tháng khi đã biết dateKey.
 */
function addDays(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/**
 * Thứ trong tuần của dateKey: 0 = Chủ nhật … 6 = Thứ bảy (giống Date.getUTCDay).
 * Vì dateKey đã là ngày lịch VN, dùng UTC để tránh lệch do timezone máy chủ.
 */
function weekdayOf(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Khoảng tuần hiện tại (Thứ 2 → Chủ nhật) theo dateKey hôm nay.
 * Trả về { from, to } dạng "YYYY-MM-DD".
 */
function weekRangeOf(dateKey = todayKey()) {
  const dow = weekdayOf(dateKey); // 0 CN … 6 T7
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const from = addDays(dateKey, mondayOffset);
  const to = addDays(from, 6);
  return { from, to };
}

/**
 * Khoảng tháng hiện tại của dateKey: ngày 01 → ngày cuối tháng.
 */
function monthRangeOf(dateKey = todayKey()) {
  const [y, m] = dateKey.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  // Ngày 0 của tháng sau = ngày cuối tháng này (UTC)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

module.exports = {
  TIMEZONE,
  dateKeyOf,
  todayKey,
  addDays,
  weekRangeOf,
  monthRangeOf,
};
