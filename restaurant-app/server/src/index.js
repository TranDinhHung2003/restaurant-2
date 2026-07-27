require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const connectDB = require('./db');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const tableRoutes = require('./routes/tables');
const authRoutes = require('./routes/auth');
const paymentWebhookRoutes = require('./routes/paymentWebhook');
const expenseRoutes = require('./routes/expenses');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }, // demo: cho phép mọi origin. Production nên giới hạn domain thật.
});

app.set('io', io); // để các route lấy io qua req.app.get('io')

app.use(cors());
app.use(express.json());

// ---- API ----
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/payments', paymentWebhookRoutes); // webhook ngân hàng tự xác nhận VietQR
app.use('/api/expenses', expenseRoutes); // chi phí nhập hàng + tính lãi

// ---- Phục vụ giao diện tĩnh (tiện chạy demo local, 1 server cho tất cả) ----
app.use('/', express.static(path.join(__dirname, '../../client')));
app.use('/admin', express.static(path.join(__dirname, '../../admin')));

// ---- Realtime: admin join phòng riêng; khách join phòng theo orderId để nhận thanh toán ----
io.on('connection', (socket) => {
  socket.on('join_admin', (token) => {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      socket.join('admin_room');
    } catch {
      // token sai thì bỏ qua
    }
  });

  // Khách đang chờ VietQR join phòng đơn của mình để nhận payment_confirmed ngay khi tiền về.
  socket.on('join_order', (orderId) => {
    if (orderId && typeof orderId === 'string' && /^[a-f0-9]{24}$/i.test(orderId)) {
      socket.join(`order_${orderId}`);
    }
  });
});

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    console.log(`   Trang khách hàng:  http://localhost:${PORT}/?table=01`);
    console.log(`   Trang admin:       http://localhost:${PORT}/admin`);
  });
});
