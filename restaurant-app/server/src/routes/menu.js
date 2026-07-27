const express = require('express');
const MenuItem = require('../models/MenuItem');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/menu
 * PUBLIC — khách hàng gọi API này khi quét QR để xem thực đơn.
 * Trả về danh sách phẳng; client tự nhóm theo "category" để hiển thị theo tab.
 */
router.get('/', async (req, res) => {
  const items = await MenuItem.find().sort({ category: 1, sortOrder: 1, name: 1 });
  res.json(items);
});

/**
 * POST /api/menu
 * ADMIN — thêm món mới.
 */
router.post('/', requireAdmin, async (req, res) => {
  const { name, category, price, description, image, available } = req.body;
  if (!name || !category || price == null) {
    return res.status(400).json({ message: 'Thiếu name / category / price' });
  }
  const item = await MenuItem.create({ name, category, price, description, image, available });
  req.app.get('io').emit('menu_updated'); // báo cho admin dashboard khác (nếu mở nhiều tab) tự refresh
  res.status(201).json(item);
});

/**
 * PUT /api/menu/:id
 * ADMIN — sửa món, kể cả bật/tắt "available" theo giờ (hết món giữa ca).
 */
router.put('/:id', requireAdmin, async (req, res) => {
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
