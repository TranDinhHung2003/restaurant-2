const express = require('express');
const Table = require('../models/Table');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * Sinh qr_code_link cho một bàn — URL mà mã QR dán trên bàn sẽ trỏ tới.
 * Ưu tiên PUBLIC_URL trong .env (domain thật khi deploy, vd https://tennhahang.com);
 * chưa cấu hình thì lấy domain của chính request (đúng khi chạy demo local).
 */
function buildQrCodeLink(req, tableNumber) {
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  return `${base}/?table=${encodeURIComponent(tableNumber)}`;
}

// ADMIN — danh sách bàn
router.get('/', requireAdmin, async (req, res) => {
  const tables = await Table.find().sort({ tableNumber: 1 });

  // Bàn tạo từ phiên bản cũ (chưa có qrCodeLink) thì bổ sung luôn tại đây,
  // khỏi cần chạy script migrate riêng.
  for (const table of tables) {
    if (!table.qrCodeLink) {
      table.qrCodeLink = buildQrCodeLink(req, table.tableNumber);
      await table.save();
    }
  }
  res.json(tables);
});

// ADMIN — thêm bàn mới
router.post('/', requireAdmin, async (req, res) => {
  const { tableNumber, label } = req.body;
  if (!tableNumber) return res.status(400).json({ message: 'Thiếu tableNumber' });
  const exists = await Table.findOne({ tableNumber });
  if (exists) return res.status(409).json({ message: 'Số bàn đã tồn tại' });
  const table = await Table.create({
    tableNumber,
    label,
    qrCodeLink: buildQrCodeLink(req, tableNumber),
  });
  res.status(201).json(table);
});

// ADMIN — xoá bàn
router.delete('/:id', requireAdmin, async (req, res) => {
  await Table.findByIdAndDelete(req.params.id);
  res.json({ message: 'Đã xoá' });
});

module.exports = router;
