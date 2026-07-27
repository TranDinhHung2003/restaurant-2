/**
 * paymentWebhook.js — TỰ ĐỘNG xác nhận thanh toán VietQR qua webhook
 * biến động số dư ngân hàng (Casso, SePay, PayOS... đều bắn về dạng tương tự).
 *
 * Cách hoạt động:
 * 1. Khách chọn VietQR -> backend sinh nội dung CK duy nhất (vd "DH12abcd")
 *    và lưu vào order.payment.addInfo.
 * 2. Khách chuyển khoản -> dịch vụ webhook (Casso/SePay...) phát hiện tiền về
 *    và gọi POST /api/payments/webhook kèm nội dung + số tiền giao dịch.
 * 3. Backend dò chuỗi addInfo trong nội dung CK, khớp số tiền -> chuyển
 *    payment_status: unpaid -> paid, đẩy realtime cho admin + khách đang chờ.
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
  if (!secret) return false; // chưa cấu hình thì từ chối tất cả cho an toàn

  const auth = req.headers.authorization || '';
  if (auth === `Apikey ${secret}` || auth === `Bearer ${secret}`) return true;
  if (req.headers['x-webhook-secret'] === secret) return true;
  if (req.query.secret === secret) return true;
  return false;
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
      // SePay có transferType 'in'/'out' — chỉ quan tâm tiền VÀO
      isMoneyIn: tx.transferType ? tx.transferType === 'in' : true,
    }))
    .filter((tx) => tx.content && tx.amount > 0 && tx.isMoneyIn);
}

/**
 * POST /api/payments/webhook
 * Nhận biến động số dư -> tự động đánh dấu đơn đã thanh toán.
 */
router.post('/webhook', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, message: 'Sai hoặc thiếu WEBHOOK_SECRET' });
  }

  const transactions = extractTransactions(req.body);
  const confirmed = [];

  for (const tx of transactions) {
    // Tìm các đơn VietQR CHƯA thanh toán mà nội dung CK chứa mã addInfo của đơn.
    // Ngân hàng thường viết hoa/bỏ dấu nội dung CK nên so sánh không phân biệt hoa thường.
    const candidates = await Order.find({
      'payment.status': 'unpaid',
      'payment.addInfo': { $ne: '' },
    });

    const order = candidates.find(
      (o) =>
        tx.content.toUpperCase().includes(o.payment.addInfo.toUpperCase()) &&
        tx.amount >= o.total // chuyển thiếu tiền thì không tự xác nhận, để admin xử lý tay
    );
    if (!order) continue;

    order.payment.status = 'paid';
    order.payment.paidAt = new Date();
    await order.save();
    confirmed.push({ orderId: order._id, orderNumber: order.orderNumber });

    // Tự động xác nhận cho admin — không cần bấm tay "Xác nhận đã thanh toán".
    req.app.get('io').to('admin_room').emit('order_updated', order);
    req.app.get('io').to('admin_room').emit('payment_confirmed', order);
  }

  // Luôn trả 200 để dịch vụ webhook không retry vô hạn với giao dịch không khớp
  // (vd tiền về không liên quan đơn nào).
  res.json({ success: true, confirmedCount: confirmed.length, confirmed });
});

module.exports = router;
