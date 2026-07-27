/**
 * expenses.js — quản lý chi phí nhập hàng (admin).
 */
const express = require('express');
const Expense = require('../models/Expense');
const { requireAdmin } = require('../middleware/auth');
const { getDateKey, getWeekRange, getMonthRange, formatDateLabel } = require('../utils/dateKey');

const router = express.Router();

function buildDateKeyFilter(period, dateKey) {
  if (period === 'day') return { dateKey };
  if (period === 'week') {
    const { startKey, endKey } = getWeekRange(dateKey);
    return { dateKey: { $gte: startKey, $lte: endKey } };
  }
  if (period === 'month') {
    const { startKey, endKey } = getMonthRange(dateKey);
    return { dateKey: { $gte: startKey, $lte: endKey } };
  }
  return null;
}

/**
 * GET /api/expenses?period=day|week|month&date=YYYY-MM-DD
 */
router.get('/', requireAdmin, async (req, res) => {
  const period = req.query.period || 'day';
  const dateKey = req.query.date || getDateKey();
  const filter = buildDateKeyFilter(period, dateKey);
  if (!filter) {
    return res.status(400).json({ message: 'period phải là day, week hoặc month' });
  }

  const expenses = await Expense.find(filter).sort({ dateKey: -1, createdAt: -1 });
  const totalCost = expenses.reduce((sum, e) => sum + e.amount, 0);

  res.json({
    period,
    dateKey,
    totalCost,
    expenses,
  });
});

/**
 * POST /api/expenses
 * body: { amount, note?, date? }
 */
router.post('/', requireAdmin, async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Số tiền nhập hàng phải > 0' });
  }

  const dateKey = req.body?.date || getDateKey();
  const note = String(req.body?.note || '').trim();

  const expense = await Expense.create({ dateKey, amount: Math.round(amount), note });

  req.app.get('io').to('admin_room').emit('expense_updated', { dateKey });

  res.status(201).json(expense);
});

/**
 * DELETE /api/expenses/:id
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  const expense = await Expense.findByIdAndDelete(req.params.id);
  if (!expense) return res.status(404).json({ message: 'Không tìm thấy khoản nhập hàng' });

  req.app.get('io').to('admin_room').emit('expense_updated', { dateKey: expense.dateKey });
  res.status(204).end();
});

/**
 * DELETE /api/expenses?period=day|week|month&date=YYYY-MM-DD
 * Xoá toàn bộ chi phí nhập hàng trong kỳ.
 */
router.delete('/', requireAdmin, async (req, res) => {
  const period = req.query.period || 'day';
  const dateKey = req.query.date || getDateKey();
  const filter = buildDateKeyFilter(period, dateKey);
  if (!filter) {
    return res.status(400).json({ message: 'period phải là day, week hoặc month' });
  }

  const result = await Expense.deleteMany(filter);
  req.app.get('io').to('admin_room').emit('expense_updated', { dateKey, period });

  res.json({
    message: `Đã xoá ${result.deletedCount} khoản nhập hàng`,
    deletedCount: result.deletedCount,
    dateLabel: formatDateLabel(dateKey),
  });
});

module.exports = router;
