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
- `PUBLIC_URL`: domain công khai của web (vd `https://tennhahang.com`) — dùng để sinh
  `qr_code_link` lưu cho từng bàn. Chạy demo local thì để trống.
- `TIMEZONE`: múi giờ dùng để lọc món theo khung giờ phục vụ (mặc định
  `Asia/Ho_Chi_Minh`).
- `WEBHOOK_SECRET`: chuỗi bí mật bảo vệ webhook tự động xác nhận thanh toán
  (xem mục 6). Để trống nếu chưa dùng.

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
   giữa giờ khi hết món), và đặt **khung giờ phục vụ** cho từng món
   (vd `06:00-10:00, 17:00-21:00`; bỏ trống = bán cả ngày; hỗ trợ cả khung giờ
   qua đêm như `22:00-02:00`).
3. **Khách** quét QR tại bàn → chỉ thấy các món **đang trong khung giờ phục vụ**
   (`GET /api/menu` lọc sẵn theo giờ hiện tại) → chọn món → **Đặt cơm** → nhận
   **số thứ tự** (sinh tăng dần, không trùng, kể cả khi nhiều khách đặt cùng lúc).
4. Khách chọn thanh toán:
   - **Tiền mặt**: hệ thống ghi nhận, khách trả tại quầy.
   - **VietQR**: hệ thống hiện mã QR động (đúng số tiền + nội dung = mã đơn).
5. **Admin** thấy đơn mới hiện ngay lập tức (không cần F5) ở tab **Đơn hàng** —
   kèm **popup to giữa màn hình + chuông reo 3 tiếng** để không lỡ đơn dù đang
   bận không nhìn màn hình (xem mục 7). Admin cập nhật trạng thái bếp (Chờ chế
   biến → Đang chế biến → Đã phục vụ) và bấm **Xác nhận đã thanh toán** khi thu
   tiền / thấy tiền chuyển khoản về — hoặc để hệ thống **tự xác nhận** qua
   webhook ngân hàng (mục 6).

## 5. Cách số thứ tự không bao giờ bị nhầm

Backend dùng một collection `Counter` riêng, tăng số bằng thao tác **atomic**
(`findOneAndUpdate` + `$inc`) trong MongoDB — nên dù 2 khách ở 2 bàn bấm "Đặt cơm"
đúng cùng một thời điểm, mỗi người vẫn chắc chắn nhận một số khác nhau, đúng thứ tự
ai bấm trước. Số reset về 1 mỗi ngày mới (xem `server/src/models/Counter.js`).

## 6. Tự động xác nhận thanh toán VietQR (webhook ngân hàng)

Backend có sẵn endpoint `POST /api/payments/webhook` để nhận **biến động số dư**
từ các dịch vụ trung gian như **Casso, SePay, PayOS**:

1. Đặt `WEBHOOK_SECRET` trong `.env` thành một chuỗi ngẫu nhiên dài.
2. Trên trang cấu hình của Casso/SePay, trỏ webhook về:
   `https://tennhahang.com/api/payments/webhook`
   và cấu hình gửi kèm secret theo 1 trong 3 cách:
   - Header `Authorization: Apikey <WEBHOOK_SECRET>` (chuẩn Casso), hoặc
   - Header `x-webhook-secret: <WEBHOOK_SECRET>`, hoặc
   - Query `?secret=<WEBHOOK_SECRET>`.
3. Khi tiền về, hệ thống dò **nội dung chuyển khoản** (vd `DH12abcd` — đã lưu vào
   đơn lúc khách bấm thanh toán VietQR) và **số tiền** phải ≥ tổng đơn, khớp thì tự
   chuyển `payment_status` → `paid`, đẩy realtime cho admin lẫn màn hình khách đang
   chờ. Chuyển thiếu tiền hoặc sai nội dung thì KHÔNG tự xác nhận — admin xử lý tay.

Chưa cấu hình webhook thì mọi thứ vẫn chạy bình thường: admin bấm tay
**Xác nhận đã thanh toán** như cũ.

## 7. Thông báo đơn hàng mới (popup + chuông reo)

Ngay khi khách bấm "Đặt cơm", trang admin (đang mở bất kỳ tab nào) sẽ:

- Hiện **popup to giữa màn hình**: số thứ tự khổng lồ, số bàn, danh sách món,
  ghi chú, tổng tiền — kèm nút **"✓ Bắt đầu chế biến"** (chuyển đơn sang trạng
  thái "Đang chế biến" và đóng popup luôn, khỏi phải bấm 2 lần) hoặc **"Đóng"**.
- **Reo chuông 3 tiếng** ("ting-ting-ting") — chuông được tự tạo bằng Web Audio
  API ngay trong trình duyệt, KHÔNG cần file âm thanh hay thư viện tải từ CDN
  ngoài, nên luôn hoạt động ổn định.
- Nếu nhiều bàn đặt cùng lúc, các đơn tiếp theo được xếp vào **hàng đợi** (hiện
  "+N đơn mới khác đang chờ xem" trong popup) — đóng đơn đang xem xong thì đơn
  kế tiếp tự hiện lên và chuông reo lại, không bị bỏ lỡ đơn nào.
- Có nút **🔔 Chuông: Bật/Tắt** ở cuối sidebar để admin tự tắt tiếng khi cần
  (trạng thái được nhớ giữa các lần đăng nhập).

> Lưu ý: trình duyệt chỉ cho phát âm thanh sau khi có tương tác của người dùng
> trên trang (quy định chống tự động phát âm thanh làm phiền). Chuông sẽ hoạt
> động ngay từ lượt bấm/gõ đầu tiên của admin sau khi tải trang — bấm vào menu
> sidebar hoặc bất cứ đâu trên trang một lần là đủ.

## 8. Những phần nên nâng cấp khi đưa vào chạy thật (production)

- **Đăng nhập admin nhiều tài khoản**: hiện dùng 1 tài khoản trong `.env`. Nên tạo
  model `Admin` với mật khẩu hash bằng `bcrypt` nếu có nhiều nhân viên.
- **HTTPS + giới hạn CORS** theo đúng domain thật khi deploy, thay vì `origin: '*'`.
- **In hoá đơn / kết nối máy in bếp** nếu cần phiếu bếp giấy song song với dashboard.
