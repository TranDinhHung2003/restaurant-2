# Quán Nhà — Hệ thống gọi món qua QR

Web đặt món cho nhà hàng: khách quét QR tại bàn → chọn món → đặt → nhận **số thứ tự** →
thanh toán **tiền mặt** hoặc **VietQR**. Admin quản lý món ăn, nhận đơn **realtime**,
xác nhận thanh toán.

## Cấu trúc thư mục

```
restaurant-app/
├── server/     Backend: Node.js + Express + MongoDB + Socket.IO
├── client/     Trang khách hàng (quét QR vào đây): HTML/CSS/JS thuần
└── admin/      Trang quản trị nhà hàng: HTML/CSS/JS thuần
```

## 1. Cài đặt

Yêu cầu: **Node.js ≥ 18** và **MongoDB** (chạy local hoặc dùng MongoDB Atlas miễn phí).

```bash
cd server
npm install
cp .env.example .env
```

Mở file `.env` vừa tạo, chỉnh các giá trị:
- `MONGO_URI`: chuỗi kết nối MongoDB của bạn
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`: tài khoản đăng nhập trang quản trị
- `JWT_SECRET`: đổi thành một chuỗi ngẫu nhiên dài (dùng để ký token đăng nhập)
- `BANK_BIN`, `BANK_ACCOUNT_NO`, `BANK_ACCOUNT_NAME`: thông tin tài khoản ngân hàng
  nhận tiền VietQR của nhà hàng (tra mã BIN ngân hàng tại
  https://api.vietqr.io/v2/banks)

## 2. Nạp dữ liệu mẫu (tuỳ chọn, để có sẵn món ăn + bàn thử nghiệm)

```bash
npm run seed
```

## 3. Chạy server

```bash
npm start
# hoặc khi phát triển, tự restart lúc sửa code:
npm run dev
```

Server sẽ chạy tại `http://localhost:4000` và phục vụ **luôn cả 3 phần** (để tiện chạy
demo 1 lệnh duy nhất):

| Trang | URL |
|---|---|
| Khách hàng (demo bàn 01) | http://localhost:4000/?table=01 |
| Quản trị (đăng nhập) | http://localhost:4000/admin/login.html |

> Muốn tách deploy client/admin lên hosting tĩnh riêng (Vercel, Netlify...) thì chỉ
> cần đổi biến `API_BASE` trong `client/js/app.js` và `admin/js/api.js` thành URL
> đầy đủ của backend, rồi deploy `server/` riêng (Render, Railway, VPS...).

## 4. Luồng sử dụng

1. **Admin** đăng nhập → tab **Bàn & QR** → thêm bàn → tải ảnh QR → in dán lên từng bàn.
   Mỗi QR trỏ tới `.../?table=SỐ_BÀN`.
2. **Admin** → tab **Thực đơn** → thêm món, bật/tắt "Còn hàng" bất cứ lúc nào (kể cả
   giữa giờ khi hết món).
3. **Khách** quét QR tại bàn → chọn món → **Đặt cơm** → nhận **số thứ tự** (sinh tăng
   dần, không trùng, kể cả khi nhiều khách đặt cùng lúc).
4. Khách chọn thanh toán:
   - **Tiền mặt**: hệ thống ghi nhận, khách trả tại quầy.
   - **VietQR**: hệ thống hiện mã QR động (đúng số tiền + nội dung = mã đơn).
5. **Admin** thấy đơn mới hiện ngay lập tức (không cần F5) ở tab **Đơn hàng**, cập
   nhật trạng thái bếp (Chờ chế biến → Đang chế biến → Đã phục vụ) và bấm
   **Xác nhận đã thanh toán** khi thu tiền / thấy tiền chuyển khoản về.

## 5. Cách số thứ tự không bao giờ bị nhầm

Backend dùng một collection `Counter` riêng, tăng số bằng thao tác **atomic**
(`findOneAndUpdate` + `$inc`) trong MongoDB — nên dù 2 khách ở 2 bàn bấm "Đặt cơm"
đúng cùng một thời điểm, mỗi người vẫn chắc chắn nhận một số khác nhau, đúng thứ tự
ai bấm trước. Số reset về 1 mỗi ngày mới (xem `server/src/models/Counter.js`).

## 6. Những phần nên nâng cấp khi đưa vào chạy thật (production)

- **Xác nhận thanh toán VietQR tự động**: hiện tại admin bấm tay "Xác nhận đã thanh
  toán". Muốn tự động, cần đăng ký dịch vụ webhook báo biến động số dư của ngân hàng
  (hoặc qua các cổng trung gian như SePay, Casso...) rồi gọi
  `PATCH /api/orders/:id/confirm-payment` tự động khi có giao dịch khớp nội dung.
- **Đăng nhập admin nhiều tài khoản**: hiện dùng 1 tài khoản trong `.env`. Nên tạo
  model `Admin` với mật khẩu hash bằng `bcrypt` nếu có nhiều nhân viên.
- **HTTPS + giới hạn CORS** theo đúng domain thật khi deploy, thay vì `origin: '*'`.
- **In hoá đơn / kết nối máy in bếp** nếu cần phiếu bếp giấy song song với dashboard.
