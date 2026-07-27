require('dotenv').config();
const connectDB = require('./db');
const MenuItem = require('./models/MenuItem');
const Table = require('./models/Table');

const menuData = [
  { name: 'Cơm sườn bì chả', category: 'Món chính', price: 45000, description: 'Sườn nướng, bì, chả trứng, cơm tấm dẻo.' },
  { name: 'Cơm gà xối mỡ', category: 'Món chính', price: 42000, description: 'Đùi gà chiên giòn, nước mắm gừng.' },
  { name: 'Cơm cá kho tộ', category: 'Món chính', price: 40000, description: 'Cá kho tộ đậm đà, ăn kèm dưa leo.' },
  { name: 'Gỏi cuốn tôm thịt', category: 'Khai vị', price: 25000, description: '2 cuốn, chấm tương đậu phộng.' },
  { name: 'Chả giò chiên', category: 'Khai vị', price: 28000, description: '4 cuốn giòn rụm, ăn kèm rau sống.' },
  { name: 'Canh chua cá lóc', category: 'Canh', price: 35000, description: 'Vị chua thanh, đậu bắp, bạc hà.' },
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
