/**
 * dateKey.js — ngày theo múi giờ nhà hàng (YYYY-MM-DD).
 * Dùng chung cho đếm số thứ tự, lọc đơn và báo cáo doanh thu.
 */
const TIMEZONE = process.env.TIMEZONE || 'Asia/Ho_Chi_Minh';

function getDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(now);
}

function dateKeyToParts(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

function partsToDateKey({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysToDateKey(dateKey, days) {
  const { year, month, day } = dateKeyToParts(dateKey);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return partsToDateKey({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });
}

function dateAtNoon(dateKey) {
  const { year, month, day } = dateKeyToParts(dateKey);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function getWeekday(dateKey) {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
  }).format(dateAtNoon(dateKey));
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd];
}

/** Thứ Hai → Chủ Nhật của tuần chứa dateKey. */
function getWeekRange(dateKey = getDateKey()) {
  const dayNum = getWeekday(dateKey);
  const daysFromMonday = dayNum === 0 ? 6 : dayNum - 1;
  const startKey = addDaysToDateKey(dateKey, -daysFromMonday);
  const endKey = addDaysToDateKey(startKey, 6);
  return { startKey, endKey };
}

/** Ngày đầu → cuối tháng chứa dateKey. */
function getMonthRange(dateKey = getDateKey()) {
  const { year, month } = dateKeyToParts(dateKey);
  const startKey = partsToDateKey({ year, month, day: 1 });
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endKey = partsToDateKey({ year, month, day: lastDay });
  return { startKey, endKey };
}

function formatDateLabel(dateKey) {
  const { year, month, day } = dateKeyToParts(dateKey);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

module.exports = {
  TIMEZONE,
  getDateKey,
  addDaysToDateKey,
  getWeekRange,
  getMonthRange,
  formatDateLabel,
};
