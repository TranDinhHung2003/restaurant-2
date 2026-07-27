require('dotenv').config();
const connectDB = require('./db');
const MenuItem = require('./models/MenuItem');
const Table = require('./models/Table');

// availableHours: khung giờ phục vụ — rỗng = bán cả ngày.
// Ngoài khung giờ, khách sẽ KHÔNG thấy món trong menu.
// image: link ảnh minh hoạ (Unsplash) — ảnh hỏng link thì client tự hiện
// hình placeholder nên không sợ vỡ giao diện. Đổi thành ảnh chụp món thật khi vận hành.
const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=60`;

const menuData = [
  { name: 'Cơm sườn bì chả', category: 'Món chính', price: 45000, description: 'Sườn cốt lết ướp sả nướng than hoa, bì trộn thính, chả trứng hấp mềm — dọn cùng cơm tấm dẻo, mỡ hành và chén nước mắm chua ngọt pha theo công thức riêng của quán.', availableHours: '10:00-14:00, 17:00-21:00', image: img('photo-1544025162-d76694265947') },
  { name: 'Cơm gà xối mỡ', category: 'Món chính', price: 42000, description: 'Đùi gà góc tư chiên xối mỡ da giòn rụm, thịt bên trong vẫn mọng nước. Ăn kèm cơm chiên nghệ, dưa leo và nước mắm gừng đánh tay.', availableHours: '10:00-14:00, 17:00-21:00', image: img('photo-1504674900247-0877df9cc836') },
  { name: 'Cơm cá kho tộ', category: 'Món chính', price: 40000, description: 'Cá basa kho trong tộ đất với nước màu dừa, tiêu xanh và tóp mỡ — kho hai lửa nên miếng cá thấm đậm, dọn kèm dưa leo và canh rau trong bữa.', availableHours: '10:00-14:00, 17:00-21:00', image: img('photo-1546069901-ba9599a7e63c') },
  { name: 'Bánh mì ốp la', category: 'Món chính', price: 30000, description: 'Chỉ bán buổi sáng — 2 trứng gà ta ốp la lòng đào trên chảo gang nóng, pate nhà làm, đồ chua và bánh mì nướng giòn vỏ.', availableHours: '06:00-10:00', image: img('photo-1525351484163-7529414344d8') },
  { name: 'Gỏi cuốn tôm thịt', category: 'Khai vị', price: 25000, description: '2 cuốn — tôm đất luộc, thịt ba rọi, bún tươi và rau thơm cuốn bánh tráng mỏng, chấm tương đậu phộng xay nhuyễn.', image: img('photo-1512621776951-a57141f2eefd') },
  { name: 'Chả giò chiên', category: 'Khai vị', price: 28000, description: '4 cuốn chả giò nhân thịt, khoai môn và nấm mèo, chiên vàng giòn rụm — ăn kèm rau sống và nước mắm chua ngọt.' },
  { name: 'Canh chua cá lóc', category: 'Canh', price: 35000, description: 'Cá lóc đồng nấu với me tươi, thơm, đậu bắp, bạc hà và giá — vị chua thanh dịu, rắc rau om ngò gai thơm lừng, chan cơm là hết nồi.', availableHours: '10:00-14:00, 17:00-21:00', image: img('photo-1547592166-23ac45744acd') },
  { name: 'Trà đá', category: 'Đồ uống', price: 5000, description: 'Trà lài ủ lạnh, miễn phí refill suốt bữa.' },
  { name: 'Nước sâm bí đao', category: 'Đồ uống', price: 15000, description: 'Nấu từ bí đao, mía lau, la hán quả và lá dứa — mát gan, giải nhiệt, nhà nấu mỗi sáng.' },
  { name: 'Cà phê sữa đá', category: 'Đồ uống', price: 20000, description: 'Cà phê robusta pha phin truyền thống, sữa đặc, đá viên — đậm đắng đúng gu Sài Gòn.', image: img('photo-1509042239860-f550ce710b93') },
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
