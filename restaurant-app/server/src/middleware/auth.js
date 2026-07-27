const jwt = require('jsonwebtoken');

/**
 * Bảo vệ các route chỉ dành cho Admin (quản lý món ăn, xem đơn, xác nhận thanh toán...).
 * Frontend admin phải gửi header: Authorization: Bearer <token>
 * Token được cấp khi đăng nhập ở POST /api/auth/login
 */
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Thiếu token xác thực' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

module.exports = { requireAdmin };
