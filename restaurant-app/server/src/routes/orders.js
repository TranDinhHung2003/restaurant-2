const express = require('express');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const { getNextOrderNumber } = require('../models/Counter');
const { requireAdmin } = require('../middleware/auth');
const { buildVietQrUrl } = require('../utils/vietqr');

const router = express.Router();

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

    // Lấy thông tin món thật từ DB, kiểm tra còn hàng
    const menuItems = await MenuItem.find({ _id: { $in: items.map((i) => i.id) } });
    const orderItems = [];
    let total = 0;

    for (const line of items) {
      const menuItem = menuItems.find((m) => String(m._id) === line.id);
      if (!menuItem) return res.status(400).json({ message: `Món không tồn tại: ${line.id}` });
      if (!menuItem.available) return res.status(409).json({ message: `Món "${menuItem.name}" hiện đã hết` });

      const qty = Math.max(1, Number(line.qty) || 1);
      orderItems.push({ menuItem: menuItem._id, name: menuItem.name, price: menuItem.price, qty });
      total += menuItem.price * qty;
    }

    const dateKey = new Date().toISOString().slice(0, 10);
    const orderNumber = await getNextOrderNumber();

    const order = await Order.create({
      orderNumber,
      dateKey,
      table,
      items: orderItems,
      note: note || '',
      total,
    });

    // Đẩy realtime cho admin dashboard ngay lập tức — không cần F5.
    req.app.get('io').to('admin_room').emit('new_order', order);

    res.status(201).json({
      orderId: order._id,
      orderNumber: order.orderNumber,
      total: order.total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi máy chủ khi tạo đơn hàng' });
  }
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
 * PUBLIC — khách chọn thanh toán VietQR, backend trả link ảnh QR động
 * (số tiền + nội dung CK = mã đơn, để đối soát khi tiền về).
 */
router.get('/:id/vietqr', async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn' });

  const addInfo = `DH${order.orderNumber}${String(order._id).slice(-4)}`;
  const qrUrl = buildVietQrUrl({ amount: order.total, addInfo });

  // Lưu lại phương thức thanh toán khách đã chọn
  order.payment.method = 'vietqr';
  await order.save();
  req.app.get('io').to('admin_room').emit('order_updated', order);

  res.json({ qrUrl, addInfo, amount: order.total });
});

/**
 * PATCH /api/orders/:id/payment-method
 * PUBLIC — khách chọn "Tiền mặt" (không cần đăng nhập).
 */
router.patch('/:id/payment-method', async (req, res) => {
  const { method } = req.body; // 'cash' | 'vietqr'
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { 'payment.method': method },
    { new: true }
  );
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn' });
  req.app.get('io').to('admin_room').emit('order_updated', order);
  res.json(order);
});

/* ------------------------- CÁC ROUTE DÀNH CHO ADMIN ------------------------- */

/**
 * GET /api/orders?date=YYYY-MM-DD&status=pending
 * ADMIN — danh sách đơn hàng (mặc định lấy hôm nay).
 */
router.get('/', requireAdmin, async (req, res) => {
  const dateKey = req.query.date || new Date().toISOString().slice(0, 10);
  const filter = { dateKey };
  if (req.query.status) filter.status = req.query.status;

  const orders = await Order.find(filter).sort({ orderNumber: -1 });
  res.json(orders);
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
 * ADMIN — xác nhận ĐÃ THANH TOÁN.
 * - Với tiền mặt: admin bấm tay sau khi thu tiền tại quầy.
 * - Với VietQR: admin bấm sau khi thấy tiền về (bản MVP xác nhận thủ công;
 *   phần "tự động qua webhook ngân hàng" ghi ở mục nâng cấp trong README).
 */
router.patch('/:id/confirm-payment', requireAdmin, async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { 'payment.status': 'paid', 'payment.paidAt': new Date() },
    { new: true }
  );
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn' });
  req.app.get('io').to('admin_room').emit('order_updated', order);
  res.json(order);
});

module.exports = router;
