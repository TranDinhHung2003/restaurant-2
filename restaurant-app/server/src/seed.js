require('dotenv').config();
const connectDB = require('./db');
const MenuItem = require('./models/MenuItem');
const Table = require('./models/Table');

// availableHours: khung giờ phục vụ — rỗng = bán cả ngày.
// Ngoài khung giờ, khách sẽ KHÔNG thấy món trong menu.
const menuData = [
  { name: 'Cơm sườn bì chả', category: 'Món chính', price: 45000, description: 'Sườn nướng, bì, chả trứng, cơm tấm dẻo.', availableHours: '10:00-14:00, 17:00-21:00' },
  { name: 'Cơm gà xối mỡ', category: 'Món chính', price: 42000, description: 'Đùi gà chiên giòn, nước mắm gừng.', availableHours: '10:00-14:00, 17:00-21:00' },
  { name: 'Cơm cá kho tộ', category: 'Món chính', price: 40000, description: 'Cá kho tộ đậm đà, ăn kèm dưa leo.', availableHours: '10:00-14:00, 17:00-21:00' },
  { name: 'Bánh mì ốp la', category: 'Món chính', price: 30000, description: 'Chỉ bán buổi sáng — 2 trứng ốp la, pate, đồ chua.', availableHours: '06:00-10:00' },
  { name: 'Gỏi cuốn tôm thịt', category: 'Khai vị', price: 25000, description: '2 cuốn, chấm tương đậu phộng.' },
  { name: 'Chả giò chiên', category: 'Khai vị', price: 28000, description: '4 cuốn giòn rụm, ăn kèm rau sống.' },
  { name: 'Canh chua cá lóc', category: 'Canh', price: 35000, description: 'Vị chua thanh, đậu bắp, bạc hà.', availableHours: '10:00-14:00, 17:00-21:00' },
  { name: 'Trà đá', category: 'Đồ uống', price: 5000, description: 'Miễn phí refill.' },
  { name: 'Nước sâm bí đao', category: 'Đồ uống', price: 15000, description: 'Mát gan, giải nhiệt.' },
  { name: 'Cà phê sữa đá', category: 'Đồ uống', price: 20000, description: 'Cà phê phin truyền thống.' },
];

const tableData = ['01', '02', '03', '04', '05'];

(async () => {
  await connectDB();
  await MenuItem.deleteMany({});
  await Table.deleteMany({});
  await MenuItem.insertMany(menuData);
  await Table.insertMany(tableData.map((tableNumber) => ({ tableNumber })));
  console.log('✅ Đã seed dữ liệu mẫu: món ăn + bàn.');
  process.exit(0);
})();
