const express = require('express');
const Table = require('../models/Table');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ADMIN — danh sách bàn
router.get('/', requireAdmin, async (req, res) => {
  const tables = await Table.find().sort({ tableNumber: 1 });
  res.json(tables);
});

// ADMIN — thêm bàn mới
router.post('/', requireAdmin, async (req, res) => {
  const { tableNumber, label } = req.body;
  if (!tableNumber) return res.status(400).json({ message: 'Thiếu tableNumber' });
  const exists = await Table.findOne({ tableNumber });
  if (exists) return res.status(409).json({ message: 'Số bàn đã tồn tại' });
  const table = await Table.create({ tableNumber, label });
  res.status(201).json(table);
});

// ADMIN — xoá bàn
router.delete('/:id', requireAdmin, async (req, res) => {
  await Table.findByIdAndDelete(req.params.id);
  res.json({ message: 'Đã xoá' });
});

module.exports = router;
