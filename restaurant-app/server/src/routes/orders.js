const express = require('express');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const Expense = require('../models/Expense');
const { getNextOrderNumber, resetCounter, getCurrentCounter } = require('../models/Counter');
const { requireAdmin } = require('../middleware/auth');
const { buildVietQrUrl } = require('../utils/vietqr');
const { isWithinHours } = require('../utils/hours');
const { getDateKey, getWeekRange, getMonthRange, formatDateLabel } = require('../utils/dateKey');

const router = express.Router();

const PAID_REVENUE_MATCH = {
  'payment.status': 'paid',
  status: { $ne: 'cancelled' },
};

async function aggregateRevenue(match) {
  const [summary] = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$total' },
        orderCount: { $sum: 1 },
        cashRevenue: {
          $sum: { $cond: [{ $eq: ['$payment.method', 'cash'] }, '$total', 0] },
        },
        vietqrRevenue: {
          $sum: { $cond: [{ $eq: ['$payment.method', 'vietqr'] }, '$total', 0] },
        },
      },
    },
  ]);

  return {
    totalRevenue: summary?.totalRevenue ?? 0,
    orderCount: summary?.orderCount ?? 0,
    cashRevenue: summary?.cashRevenue ?? 0,
    vietqrRevenue: summary?.vietqrRevenue ?? 0,
  };
}

/**
 * POST /api/orders
 * PUBLIC — khách bấm "Đặt cơm".
 * body: { table: "05", items: [{ id, qty }], note }
 *
 * QUAN TRỌNG:
 * - Giá tiền được LẤY LẠI TỪ DATABASE, không tin giá client gửi lên (tránh gian lận).
 * - Số thứ tự được sinh ATOMIC qua Counter -> đảm bảo đúng thứ tự đặt trước/sau,
 *   không bao giờ trùng dù nhiều khách bấm "Đặt cơm" cùng một giây.
 */
router.post('/', async (req, res) => {
  try {
    const { table, items, note } = req.body;
    if (!table || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Thiếu table hoặc items' });
    }

    const menuItems = await MenuItem.find({ _id: { $in: items.map((i) => i.id) } });
    const orderItems = [];
    let total = 0;

    for (const line of items) {
      const menuItem = menuItems.find((m) => String(m._id) === line.id);
      if (!menuItem) return res.status(400).json({ message: `Món không tồn tại: ${line.id}` });
      if (!menuItem.available) return res.status(409).json({ message: `Món "${menuItem.name}" hiện đã hết` });
      if (!isWithinHours(menuItem.availableHours)) {
        return res.status(409).json({
          message: `Món "${menuItem.name}" chỉ phục vụ trong khung giờ ${menuItem.availableHours}`,
        });
      }

      const qty = Math.max(1, Number(line.qty) || 1);
      orderItems.push({ menuItem: menuItem._id, name: menuItem.name, price: menuItem.price, qty });
      total += menuItem.price * qty;
    }

    const dateKey = getDateKey();
    const orderNumber = await getNextOrderNumber(dateKey);

    const order = await Order.create({
      orderNumber,
      dateKey,
      table,
      items: orderItems,
      note: note || '',
      total,
    });

    req.app.get('io').to('admin_room').emit('new_order', order);

    res.status(201).json({
      orderId: order._id,
      orderNumber: order.orderNumber,
      total: order.total,
      dateKey: order.dateKey,
      table: order.table,
      items: order.items,
      status: order.status,
      createdAt: order.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi máy chủ khi tạo đơn hàng' });
  }
});

/* ------------------------- CÁC ROUTE DÀNH CHO ADMIN (đặt trước /:id) ------------------------- */

/**
 * GET /api/orders?date=YYYY-MM-DD&status=pending
 * ADMIN — danh sách đơn hàng (mặc định lấy hôm nay).
 */
router.get('/', requireAdmin, async (req, res) => {
  const dateKey = req.query.date || getDateKey();
  const filter = { dateKey };
  if (req.query.status) filter.status = req.query.status;

  const orders = await Order.find(filter).sort({ orderNumber: -1 });
  const currentOrderNumber = await getCurrentCounter(dateKey);

  res.json({
    dateKey,
    dateLabel: formatDateLabel(dateKey),
    currentOrderNumber,
    orders,
  });
});

function buildRevenuePeriodMatch(period, dateKey) {
  let match = { ...PAID_REVENUE_MATCH };
  let periodLabel = '';
  let dateFilter = null;

  if (period === 'day') {
    match.dateKey = dateKey;
    dateFilter = { dateKey };
    periodLabel = formatDateLabel(dateKey);
  } else if (period === 'week') {
    const { startKey, endKey } = getWeekRange(dateKey);
    match.dateKey = { $gte: startKey, $lte: endKey };
    dateFilter = { dateKey: { $gte: startKey, $lte: endKey } };
    periodLabel = `${formatDateLabel(startKey)} – ${formatDateLabel(endKey)}`;
  } else if (period === 'month') {
    const { startKey, endKey } = getMonthRange(dateKey);
    match.dateKey = { $gte: startKey, $lte: endKey };
    dateFilter = { dateKey: { $gte: startKey, $lte: endKey } };
    const { year, month } = startKey.split('-').map(Number);
    periodLabel = `Tháng ${month}/${year}`;
  } else if (period === 'all') {
    dateFilter = {};
    periodLabel = 'Toàn bộ';
  } else {
    return null;
  }

  return { match, periodLabel, dateFilter };
}

async function sumExpenses(dateFilter) {
  const [row] = await Expense.aggregate([
    { $match: dateFilter },
    { $group: { _id: null, totalCost: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  return {
    totalCost: row?.totalCost ?? 0,
    expenseCount: row?.count ?? 0,
  };
}

/**
 * GET /api/orders/revenue?period=day|week|month&date=YYYY-MM-DD
 * ADMIN — doanh thu, chi phí nhập hàng, lãi theo ngày/tuần/tháng.
 */
router.get('/revenue', requireAdmin, async (req, res) => {
  const period = req.query.period || 'day';
  const dateKey = req.query.date || getDateKey();
  const built = buildRevenuePeriodMatch(period, dateKey);
  if (!built) {
    return res.status(400).json({ message: 'period phải là day, week hoặc month' });
  }

  const stats = await aggregateRevenue(built.match);
  const costStats = await sumExpenses(built.dateFilter);
  const profit = stats.totalRevenue - costStats.totalCost;

  res.json({
    period,
    dateKey,
    periodLabel: built.periodLabel,
    ...stats,
    totalCost: costStats.totalCost,
    expenseCount: costStats.expenseCount,
    profit,
  });
});

/**
 * POST /api/orders/revenue/reset
 * ADMIN — xoá dữ liệu doanh thu (đưa các đơn đã thanh toán về unpaid).
 * body: { period: 'day'|'week'|'month'|'all', date?: 'YYYY-MM-DD' }
 */
router.post('/revenue/reset', requireAdmin, async (req, res) => {
  const period = req.body?.period || 'all';
  const dateKey = req.body?.date || getDateKey();
  const built = buildRevenuePeriodMatch(period, dateKey);
  if (!built) {
    return res.status(400).json({ message: 'period phải là day, week, month hoặc all' });
  }

  const result = await Order.updateMany(built.match, {
    $set: { 'payment.status': 'unpaid', 'payment.paidAt': null },
  });

  req.app.get('io').to('admin_room').emit('revenue_reset', { period, dateKey });

  res.json({
    message: `Đã reset doanh thu (${built.periodLabel}). Dữ liệu doanh thu trước đó đã bị xoá.`,
    period,
    dateKey,
    periodLabel: built.periodLabel,
    resetCount: result.modifiedCount,
  });
});

/**
 * POST /api/orders/reset-counter
 * ADMIN — reset số thứ tự đơn hôm nay về 0 (đơn tiếp theo sẽ là #1).
 */
router.post('/reset-counter', requireAdmin, async (req, res) => {
  const dateKey = req.body?.date || getDateKey();
  await resetCounter(dateKey);

  req.app.get('io').to('admin_room').emit('orders_reset', { dateKey, type: 'counter' });

  res.json({
    message: `Đã reset số thứ tự cho ngày ${formatDateLabel(dateKey)}`,
    dateKey,
    nextOrderNumber: 1,
  });
});

/**
 * DELETE /api/orders/today
 * ADMIN — xóa tất cả đơn hàng của một ngày và reset số thứ tự.
 */
router.delete('/today', requireAdmin, async (req, res) => {
  const dateKey = req.query.date || getDateKey();
  const result = await Order.deleteMany({ dateKey });
  await resetCounter(dateKey);

  req.app.get('io').to('admin_room').emit('orders_reset', { dateKey, type: 'full' });

  res.json({
    message: `Đã xóa ${result.deletedCount} đơn và reset số thứ tự cho ngày ${formatDateLabel(dateKey)}`,
    dateKey,
    deletedCount: result.deletedCount,
    nextOrderNumber: 1,
  });
});

/**
 * PATCH /api/orders/:id/status
 * ADMIN — cập nhật trạng thái bếp: pending -> preparing -> served (hoặc cancelled).
 */
router.patch('/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn' });
  req.app.get('io').to('admin_room').emit('order_updated', order);
  res.json(order);
});

/**
 * PATCH /api/orders/:id/confirm-payment
 * ADMIN — xác nhận ĐÃ THANH TOÁN (tiền mặt hoặc fallback VietQR).
 */
router.patch('/:id/confirm-payment', requireAdmin, async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { 'payment.status': 'paid', 'payment.paidAt': new Date() },
    { new: true }
  );
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn' });
  req.app.get('io').to('admin_room').emit('order_updated', order);
  req.app.get('io').to('admin_room').emit('payment_confirmed', order);
  res.json(order);
});

/* ------------------------- CÁC ROUTE PUBLIC (có :id) ------------------------- */

/**
 * GET /api/orders/history?ids=id1,id2,...
 * PUBLIC — khách xem lại các đơn đã đặt trên máy này (theo danh sách orderId đã lưu).
 */
router.get('/history', async (req, res) => {
  const raw = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter((id) => /^[a-f0-9]{24}$/i.test(id))
    .slice(0, 30);

  if (raw.length === 0) {
    return res.json({ orders: [] });
  }

  const orders = await Order.find({ _id: { $in: raw } })
    .sort({ createdAt: -1 })
    .select('orderNumber dateKey table items note total status payment createdAt')
    .lean();

  res.json({ orders });
});

/**
 * GET /api/orders/:id
 * PUBLIC (khách cần xem trạng thái đơn/thanh toán của chính mình qua orderId trả về lúc đặt)
 */
router.get('/:id', async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn' });
  res.json(order);
});

/**
 * GET /api/orders/:id/vietqr
 * PUBLIC — khách chọn thanh toán VietQR, backend trả link ảnh QR động.
 */
router.get('/:id/vietqr', async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn' });

  const addInfo = `DH${order.orderNumber}${String(order._id).slice(-4)}`;
  const qrUrl = buildVietQrUrl({ amount: order.total, addInfo });

  order.payment.method = 'vietqr';
  order.payment.addInfo = addInfo;
  await order.save();
  req.app.get('io').to('admin_room').emit('order_updated', order);

  res.json({ qrUrl, addInfo, amount: order.total });
});

/**
 * PATCH /api/orders/:id/payment-method
 * PUBLIC — khách chọn / đổi hình thức thanh toán (cash | vietqr).
 * Khi đổi sang tiền mặt sau khi đã mở VietQR: xoá mã CK chờ ngân hàng.
 */
router.patch('/:id/payment-method', async (req, res) => {
  const { method } = req.body;
  if (!['cash', 'vietqr'].includes(method)) {
    return res.status(400).json({ message: 'method phải là cash hoặc vietqr' });
  }

  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn' });
  if (order.payment.status === 'paid') {
    return res.status(409).json({ message: 'Đơn đã thanh toán, không đổi được phương thức' });
  }

  order.payment.method = method;
  if (method === 'cash') {
    // Đổi sang tiền mặt → không còn chờ ngân hàng
    order.payment.addInfo = '';
  }
  await order.save();

  req.app.get('io').to('admin_room').emit('order_updated', order);
  req.app.get('io').to(`order_${order._id}`).emit('payment_method_changed', order);
  res.json(order);
});

module.exports = router;
