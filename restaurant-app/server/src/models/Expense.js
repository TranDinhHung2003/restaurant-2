/**
 * Expense — chi phí nhập hàng theo ngày.
 * Dùng để tính lãi = doanh thu đã bán − tổng tiền hàng đã nhập (trong kỳ).
 */
const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    dateKey: { type: String, required: true }, // YYYY-MM-DD
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

expenseSchema.index({ dateKey: 1, createdAt: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
