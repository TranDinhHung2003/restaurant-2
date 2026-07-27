const express = require('express');
const MenuItem = require('../models/MenuItem');
const { requireAdmin } = require('../middleware/auth');
const { isWithinHours, isValidHoursString } = require('../utils/hours');

const router = express.Router();

/**
 * GET /api/menu
 * PUBLIC — khách hàng gọi API này khi quét QR để xem thực đơn.
 * Trả về danh sách phẳng; client tự nhóm theo "category" để hiển thị theo tab.
 *
 * LỌC THEO GIỜ: chỉ trả về các món có availableHours phù hợp với giờ hiện tại
 * (món để trống khung giờ = bán cả ngày). Trang admin gọi GET /api/menu?all=1
 * để lấy TOÀN BỘ món (kể cả ngoài giờ) phục vụ việc quản lý.
 * Mỗi món trả về kèm field tính toán "availableNow" để client hiển thị.
 */
router.get('/', async (req, res) => {
  const items = await MenuItem.find().sort({ category: 1, sortOrder: 1, name: 1 });
  const now = new Date();

  const withFlag = items.map((item) => ({
    ...item.toObject(),
    availableNow: item.available && isWithinHours(item.availableHours, now),
  }));

  if (req.query.all === '1') return res.json(withFlag); // admin: xem tất cả
  res.json(withFlag.filter((item) => isWithinHours(item.availableHours, now)));
});

/**
 * POST /api/menu
 * ADMIN — thêm món mới.
 */
router.post('/', requireAdmin, async (req, res) => {
  const { name, category, price, description, image, available, availableHours } = req.body;
  if (!name || !category || price == null) {
    return res.status(400).json({ message: 'Thiếu name / category / price' });
  }
  if (!isValidHoursString(availableHours)) {
    return res.status(400).json({ message: 'Khung giờ sai định dạng. Ví dụ đúng: 06:00-10:00, 17:00-21:00' });
  }
  const item = await MenuItem.create({ name, category, price, description, image, available, availableHours });
  req.app.get('io').emit('menu_updated'); // báo cho admin dashboard khác (nếu mở nhiều tab) tự refresh
  res.status(201).json(item);
});

/**
 * PUT /api/menu/:id
 * ADMIN — sửa món, kể cả bật/tắt "available" theo giờ (hết món giữa ca).
 */
router.put('/:id', requireAdmin, async (req, res) => {
  if ('availableHours' in req.body && !isValidHoursString(req.body.availableHours)) {
    return res.status(400).json({ message: 'Khung giờ sai định dạng. Ví dụ đúng: 06:00-10:00, 17:00-21:00' });
  }
  const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!item) return res.status(404).json({ message: 'Không tìm thấy món' });
  req.app.get('io').emit('menu_updated');
  res.json(item);
});

/**
 * DELETE /api/menu/:id
 * ADMIN — xoá món khỏi thực đơn.
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  await MenuItem.findByIdAndDelete(req.params.id);
  req.app.get('io').emit('menu_updated');
  res.json({ message: 'Đã xoá' });
});

module.exports = router;
