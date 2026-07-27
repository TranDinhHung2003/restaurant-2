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

// ---- Phục vụ giao diện tĩnh (tiện chạy demo local, 1 server cho tất cả) ----
app.use('/', express.static(path.join(__dirname, '../../client')));
app.use('/admin', express.static(path.join(__dirname, '../../admin')));

// ---- Realtime: admin dashboard join phòng riêng để nhận đơn hàng mới ----
io.on('connection', (socket) => {
  socket.on('join_admin', (token) => {
    try {
      jwt.verify(token, process.env.JWT_SECRET); // chỉ admin có token hợp lệ mới join được
      socket.join('admin_room');
    } catch {
      // token sai thì bỏ qua, không join phòng admin
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
