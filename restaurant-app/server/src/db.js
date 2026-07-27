const mongoose = require('mongoose');

function redactUri(uri) {
  return String(uri).replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:***@');
}

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/restaurant';
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('✅ Đã kết nối MongoDB:', redactUri(uri));
  } catch (err) {
    console.error('❌ Lỗi kết nối MongoDB:', err.message);
    console.error('   Kiểm tra: Network Access Atlas phải có 0.0.0.0/0 và MONGO_URI trên Render đúng.');
    process.exit(1);
  }
}

module.exports = connectDB;
