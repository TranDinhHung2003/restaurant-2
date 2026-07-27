/**
 * Sinh URL ảnh VietQR động qua dịch vụ img.vietqr.io (miễn phí, không cần API key
 * cho việc TẠO ảnh QR — chỉ cần đúng mã ngân hàng (BIN) + số tài khoản).
 * Xem danh sách mã BIN ngân hàng: https://api.vietqr.io/v2/banks
 *
 * Thông tin tài khoản ngân hàng của nhà hàng lấy từ biến môi trường (.env),
 * KHÔNG hardcode trong code để dễ đổi khi cần và không lộ ra frontend công khai.
 */
function buildVietQrUrl({ amount, addInfo }) {
  const bin = process.env.BANK_BIN;
  const accountNo = process.env.BANK_ACCOUNT_NO;
  const accountName = process.env.BANK_ACCOUNT_NAME || '';

  if (!bin || !accountNo) {
    throw new Error('Chưa cấu hình BANK_BIN / BANK_ACCOUNT_NO trong .env');
  }

  const params = new URLSearchParams({
    amount: String(Math.round(amount)),
    addInfo,
    accountName,
  });

  return `https://img.vietqr.io/image/${bin}-${accountNo}-compact2.png?${params.toString()}`;
}

module.exports = { buildVietQrUrl };
