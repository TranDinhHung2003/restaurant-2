/**
 * paymentWebhook.js — TỰ ĐỘNG xác nhận thanh toán VietQR khi ngân hàng
 * báo tiền về thành công (Casso, SePay, PayOS...).
 *
 * Luồng đúng (không cần khách hay admin bấm xác nhận):
 * 1. Khách chọn VietQR → backend sinh nội dung CK duy nhất (vd "DH12abcd")
 *    gắn vào mã QR và lưu vào order.payment.addInfo.
 * 2. Khách chuyển khoản THÀNH CÔNG → dịch vụ webhook phát hiện biến động số dư
 *    và gọi POST /api/payments/webhook kèm nội dung + số tiền.
 * 3. Backend khớp addInfo + số tiền ≥ tổng đơn → payment.status = paid,
 *    đẩy realtime cho admin board và màn hình khách đang chờ.
 *
 * Bảo mật: webhook phải gửi kèm secret (đặt trong .env WEBHOOK_SECRET) qua
 * một trong các cách:
 *   - Header:  Authorization: Apikey <WEBHOOK_SECRET>   (chuẩn Casso)
 *   - Header:  x-webhook-secret: <WEBHOOK_SECRET>
 *   - Query:   POST /api/payments/webhook?secret=<WEBHOOK_SECRET>
 */
const express = require('express');
const Order = require('../models/Order');

const router = express.Router();

function isAuthorized(req) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false;

  const auth = req.headers.authorization || '';
  if (auth === `Apikey ${secret}` || auth === `Bearer ${secret}`) return true;
  if (req.headers['x-webhook-secret'] === secret) return true;
  if (req.query.secret === secret) return true;
  return false;
}

/** Chuẩn hoá nội dung CK: bỏ khoảng trắng, viết hoa — ngân hàng hay thêm space/ký tự. */
function normalizeTransferContent(str) {
  return String(str || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Chuẩn hoá payload từ các dịch vụ khác nhau về dạng chung:
 * [{ content: "nội dung CK", amount: 45000 }]
 * - Casso:  { data: [{ description, amount, ... }] }
 * - SePay:  { content | transaction_content, transferAmount, transferType }
 * - PayOS / tự viết: { content/description, amount }
 */
function extractTransactions(body) {
  if (!body) return [];
  const list = Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [body];

  return list
    .map((tx) => ({
      content: String(tx.content || tx.description || tx.transaction_content || tx.addInfo || ''),
      amount: Number(tx.amount ?? tx.transferAmount ?? tx.amount_in ?? tx.creditAmount ?? 0),
      isMoneyIn: tx.transferType ? tx.transferType === 'in' : true,
    }))
    .filter((tx) => tx.content && tx.amount > 0 && tx.isMoneyIn);
}

function emitPaymentConfirmed(req, order) {
  const io = req.app.get('io');
  io.to('admin_room').emit('order_updated', order);
  io.to('admin_room').emit('payment_confirmed', order);
  // Khách đang mở màn QR (đã join phòng order_<id>) nhận ngay, không cần poll.
  io.to(`order_${order._id}`).emit('payment_confirmed', order);
}

/**
 * POST /api/payments/webhook
 * Nhận biến động số dư từ ngân hàng → tự động đánh dấu đơn đã thanh toán.
 */
router.post('/webhook', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, message: 'Sai hoặc thiếu WEBHOOK_SECRET' });
  }

  const transactions = extractTransactions(req.body);
  const confirmed = [];

  for (const tx of transactions) {
    const txNorm = normalizeTransferContent(tx.content);

    const candidates = await Order.find({
      'payment.status': 'unpaid',
      'payment.method': 'vietqr',
      'payment.addInfo': { $ne: '' },
    });

    const order = candidates.find((o) => {
      const code = normalizeTransferContent(o.payment.addInfo);
      if (!code) return false;
      // Nội dung CK ngân hàng phải chứa mã đơn (vd DH12ABCD)
      const matchedCode = txNorm.includes(code);
      // Số tiền chuyển ≥ tổng đơn (chuyển thừa vẫn OK; thiếu thì không tự xác nhận)
      const matchedAmount = tx.amount >= o.total;
      return matchedCode && matchedAmount;
    });

    if (!order) continue;

    order.payment.status = 'paid';
    order.payment.paidAt = new Date();
    await order.save();
    confirmed.push({
      orderId: order._id,
      orderNumber: order.orderNumber,
      amount: tx.amount,
    });

    emitPaymentConfirmed(req, order);
  }

  // Luôn 200 để dịch vụ webhook không retry vô hạn với giao dịch không khớp đơn.
  res.json({ success: true, confirmedCount: confirmed.length, confirmed });
});

module.exports = router;
