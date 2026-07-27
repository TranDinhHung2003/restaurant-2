/**
 * hours.js — xử lý "khung giờ phục vụ" (available_hours) của món ăn.
 *
 * Định dạng lưu trong DB: chuỗi các khoảng giờ "HH:mm-HH:mm", cách nhau dấu phẩy.
 *   - ""                        -> phục vụ CẢ NGÀY (mặc định)
 *   - "06:00-10:00"             -> chỉ bán buổi sáng
 *   - "10:30-14:00, 17:00-21:00"-> bán trưa + tối
 *   - "22:00-02:00"             -> khung giờ QUA ĐÊM cũng được hỗ trợ
 *
 * Giờ được so theo múi giờ TIMEZONE trong .env (mặc định Asia/Ho_Chi_Minh),
 * để server deploy ở nước ngoài (UTC) vẫn lọc đúng giờ Việt Nam.
 */

const TIMEZONE = process.env.TIMEZONE || 'Asia/Ho_Chi_Minh';

/** Lấy số phút kể từ 00:00 của thời điểm hiện tại theo múi giờ nhà hàng. */
function currentMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return hour * 60 + minute;
}

/** "HH:mm" -> số phút. Trả về null nếu sai định dạng. */
function toMinutes(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Chuỗi availableHours có hợp lệ không? (dùng để validate khi admin lưu món)
 * Chuỗi rỗng = hợp lệ (cả ngày).
 */
function isValidHoursString(hoursStr) {
  if (!hoursStr || !hoursStr.trim()) return true;
  return hoursStr.split(',').every((range) => {
    const [start, end] = range.split('-').map((s) => (s || '').trim());
    return toMinutes(start || '') != null && toMinutes(end || '') != null;
  });
}

/**
 * Món có đang trong khung giờ phục vụ không?
 * - hoursStr rỗng -> luôn true (bán cả ngày).
 * - Hỗ trợ nhiều khoảng và khoảng qua đêm (start > end, vd 22:00-02:00).
 * - Khoảng nào sai định dạng thì bỏ qua (không chặn nhầm món).
 */
function isWithinHours(hoursStr, now = new Date()) {
  if (!hoursStr || !hoursStr.trim()) return true;

  const nowMin = currentMinutes(now);

  return hoursStr.split(',').some((range) => {
    const [startStr, endStr] = range.split('-').map((s) => (s || '').trim());
    const start = toMinutes(startStr || '');
    const end = toMinutes(endStr || '');
    if (start == null || end == null) return false;

    if (start <= end) return nowMin >= start && nowMin <= end;
    // Khoảng qua đêm: 22:00-02:00 nghĩa là >=22:00 HOẶC <=02:00
    return nowMin >= start || nowMin <= end;
  });
}

module.exports = { isWithinHours, isValidHoursString };
