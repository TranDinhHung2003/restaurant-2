const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

/**
 * POST /api/auth/login
 * body: { username, password }
 *
 * Bản MVP này dùng 1 tài khoản admin duy nhất cấu hình trong .env
 * (ADMIN_USERNAME / ADMIN_PASSWORD). Muốn nhiều tài khoản/nhân viên,
 * hãy thay bằng model Admin + mật khẩu hash bằng bcrypt.
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (
    username !== process.env.ADMIN_USERNAME ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' });
  }

  const token = jwt.sign(
    { username, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({ token, username });
});

module.exports = router;
