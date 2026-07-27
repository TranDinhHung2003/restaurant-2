/* ==========================================================================
   app.js — Giao diện khách hàng
   Hiện tại dùng DỮ LIỆU MẪU (MOCK) để bạn xem giao diện chạy được ngay.
   Mọi chỗ cần nối vào backend thật đều được đánh dấu bằng "TODO API:".
   Khi backend (Express + MongoDB) sẵn sàng, chỉ cần thay các hàm fetchMenu(),
   submitOrder(), createVietQr() bằng lời gọi fetch() tới API thật.
   ========================================================================== */

// ---------------------------------------------------------------------------
// 1. LẤY SỐ BÀN TỪ QR CODE
// Mỗi bàn có 1 QR trỏ tới: https://domain.com/?table=05
// ---------------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const TABLE_ID = params.get('table') || '01';
document.getElementById('tableNumber').textContent = TABLE_ID;

// ---------------------------------------------------------------------------
// 2. CẤU HÌNH & LẤY DỮ LIỆU MÓN ĂN TỪ BACKEND THẬT (GET /api/menu)
// Nếu client và server chạy cùng domain (phục vụ qua Express static như
// hướng dẫn trong README), để trống ''. Nếu tách deploy riêng, đổi thành
// URL đầy đủ, vd: 'https://api.quanha.vn'
// ---------------------------------------------------------------------------
const API_BASE = '';

let MENU = []; // sẽ được nạp từ API lúc khởi tạo, dạng [{ category, items:[...] }]

async function fetchMenu(){
  const res = await fetch(`${API_BASE}/api/menu`);
  if (!res.ok) throw new Error('Không tải được thực đơn');
  const flatItems = await res.json(); // MenuItem[] phẳng từ MongoDB

  // Nhóm theo category để hiển thị theo tab, giữ đúng field cần cho renderMenu()
  const grouped = {};
  flatItems.forEach((raw) => {
    const item = {
      id: raw._id,
      name: raw.name,
      price: raw.price,
      desc: raw.description || '',
      available: raw.available,
    };
    if (!grouped[raw.category]) grouped[raw.category] = [];
    grouped[raw.category].push(item);
  });
  MENU = Object.entries(grouped).map(([category, items]) => ({ category, items }));
}

// ---------------------------------------------------------------------------
// 3. STATE GIỎ HÀNG
// ---------------------------------------------------------------------------
const cart = new Map(); // itemId -> { item, qty }

// ---------------------------------------------------------------------------
// 4. RENDER TABS DANH MỤC (gọi lại sau khi MENU đã có dữ liệu từ API)
// ---------------------------------------------------------------------------
const tabsEl = document.getElementById('categoryTabs');
function renderTabs(){
  tabsEl.innerHTML = '';
  MENU.forEach((section, idx) => {
    const tab = document.createElement('button');
    tab.className = 'tab' + (idx === 0 ? ' is-active' : '');
    tab.textContent = section.category;
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      document.getElementById('sec-' + idx).scrollIntoView({ behavior:'smooth', block:'start' });
    });
    tabsEl.appendChild(tab);
  });
}

// ---------------------------------------------------------------------------
// 5. RENDER DANH SÁCH MÓN
// ---------------------------------------------------------------------------
const menuEl = document.getElementById('menuList');

function formatVnd(n){
  return n.toLocaleString('vi-VN') + 'đ';
}

function renderMenu(){
  menuEl.innerHTML = '';
  MENU.forEach((section, idx) => {
    const title = document.createElement('h3');
    title.className = 'menu__section-title';
    title.id = 'sec-' + idx;
    title.textContent = section.category;
    menuEl.appendChild(title);

    section.items.forEach(item => {
      const qty = cart.get(item.id)?.qty || 0;
      const card = document.createElement('article');
      card.className = 'dish' + (!item.available ? ' dish--soldout' : '');
      card.innerHTML = `
        <div class="dish__body">
          <div class="dish__top">
            <p class="dish__name">${item.name}</p>
          </div>
          <p class="dish__desc">${item.desc}</p>
          <div class="dish__bottom">
            <span class="dish__price">${formatVnd(item.price)}</span>
            ${!item.available
              ? `<span class="dish__badge">Hết món</span>`
              : qty > 0
                ? `<div class="stepper" data-id="${item.id}">
                     <button class="stepper__btn" data-action="dec">−</button>
                     <span class="stepper__qty">${qty}</span>
                     <button class="stepper__btn" data-action="inc">+</button>
                   </div>`
                : `<button class="add-btn" data-add="${item.id}">+ Thêm</button>`
            }
          </div>
        </div>`;
      menuEl.appendChild(card);
    });
  });

  // Gắn sự kiện cho nút "+ Thêm"
  menuEl.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      changeQty(btn.getAttribute('data-add'), 1);
    });
  });
  // Gắn sự kiện cho stepper (+/-)
  menuEl.querySelectorAll('.stepper').forEach(stepper => {
    const id = stepper.getAttribute('data-id');
    stepper.querySelector('[data-action="inc"]').addEventListener('click', () => changeQty(id, 1));
    stepper.querySelector('[data-action="dec"]').addEventListener('click', () => changeQty(id, -1));
  });
}

function findItem(id){
  for (const section of MENU) {
    const found = section.items.find(i => i.id === id);
    if (found) return found;
  }
  return null;
}

function changeQty(id, delta){
  const item = findItem(id);
  if (!item) return;
  const current = cart.get(id)?.qty || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) cart.delete(id);
  else cart.set(id, { item, qty: next });
  renderMenu();
  renderCartBar();
}

// ---------------------------------------------------------------------------
// 6. THANH GIỎ HÀNG NỔI
// ---------------------------------------------------------------------------
const cartBar = document.getElementById('cartBar');
const cartCount = document.getElementById('cartCount');
const cartTotal = document.getElementById('cartTotal');

function getCartTotal(){
  let total = 0;
  cart.forEach(({ item, qty }) => total += item.price * qty);
  return total;
}
function getCartCount(){
  let count = 0;
  cart.forEach(({ qty }) => count += qty);
  return count;
}
function renderCartBar(){
  const count = getCartCount();
  cartBar.hidden = count === 0;
  cartCount.textContent = count;
  cartTotal.textContent = formatVnd(getCartTotal());
}
cartBar.addEventListener('click', openCartSheet);

// ---------------------------------------------------------------------------
// 7. SHEET GIỎ HÀNG
// ---------------------------------------------------------------------------
const cartSheet = document.getElementById('cartSheet');
const cartItemsEl = document.getElementById('cartItems');
const sheetTotal = document.getElementById('sheetTotal');

function openCartSheet(){
  cartItemsEl.innerHTML = '';
  cart.forEach(({ item, qty }) => {
    const line = document.createElement('div');
    line.className = 'cart-line';
    line.innerHTML = `
      <span class="cart-line__name">${qty} × ${item.name}</span>
      <span class="cart-line__price">${formatVnd(item.price * qty)}</span>`;
    cartItemsEl.appendChild(line);
  });
  sheetTotal.textContent = formatVnd(getCartTotal());
  cartSheet.hidden = false;
}

// Đóng sheet khi bấm nền mờ hoặc nút có data-close
document.querySelectorAll('[data-close]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.target.closest('.sheet').hidden = true;
  });
});

// ---------------------------------------------------------------------------
// 8. ĐẶT CƠM — gọi backend thật để sinh số thứ tự
// Backend (POST /api/orders) chịu trách nhiệm sinh orderNumber TĂNG DẦN &
// DUY NHẤT theo ngày (dùng MongoDB Counter, thao tác atomic) để không bao
// giờ trùng hoặc nhảy số giữa các khách đặt trước/sau — điểm mấu chốt
// tránh nhầm lẫn đơn hàng.
// ---------------------------------------------------------------------------
let currentOrder = null;
const placeOrderBtn = document.getElementById('placeOrderBtn');

async function submitOrder(){
  const note = document.getElementById('orderNote').value.trim();
  const items = Array.from(cart.values()).map(({ item, qty }) => ({ id: item.id, qty }));

  placeOrderBtn.disabled = true;
  placeOrderBtn.textContent = 'Đang gửi đơn…';
  try {
    const res = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: TABLE_ID, items, note }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Đặt cơm thất bại, vui lòng thử lại.');
    }
    const { orderId, orderNumber, total } = await res.json();
    currentOrder = { orderId, orderNumber, table: TABLE_ID, total };

    cart.clear();
    renderMenu();
    renderCartBar();
    cartSheet.hidden = true;

    document.getElementById('ticketNumber').textContent = orderNumber;
    document.getElementById('ticketTable').textContent = 'Bàn ' + TABLE_ID;
    document.getElementById('ticketSheet').hidden = false;
  } catch (err) {
    alert(err.message);
  } finally {
    placeOrderBtn.disabled = false;
    placeOrderBtn.textContent = 'Đặt cơm';
  }
}

placeOrderBtn.addEventListener('click', submitOrder);

// ---------------------------------------------------------------------------
// 9. THANH TOÁN — chọn Tiền mặt hoặc VietQR (gọi backend thật)
// ---------------------------------------------------------------------------
document.getElementById('payCashBtn').addEventListener('click', async () => {
  document.getElementById('ticketSheet').hidden = true;
  try {
    await fetch(`${API_BASE}/api/orders/${currentOrder.orderId}/payment-method`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'cash' }),
    });
    alert('Đã ghi nhận: bạn sẽ thanh toán tiền mặt tại quầy khi nhận cơm.');
  } catch {
    alert('Không thể gửi yêu cầu, nhưng đơn của bạn vẫn được ghi nhận — vui lòng báo nhân viên.');
  }
});

document.getElementById('payQrBtn').addEventListener('click', () => {
  document.getElementById('ticketSheet').hidden = true;
  openVietQr(currentOrder);
});

async function openVietQr(order){
  const qrSheet = document.getElementById('qrSheet');
  const statusEl = document.getElementById('qrStatus');
  qrSheet.hidden = false;
  statusEl.textContent = 'Đang tạo mã QR…';

  try {
    // Backend tự lấy thông tin tài khoản ngân hàng từ cấu hình (.env), sinh
    // sẵn link ảnh VietQR với đúng số tiền + nội dung CK = mã đơn hàng.
    const res = await fetch(`${API_BASE}/api/orders/${order.orderId}/vietqr`);
    const { qrUrl, addInfo, amount } = await res.json();

    document.getElementById('qrImage').src = qrUrl;
    document.getElementById('qrAmount').textContent = formatVnd(amount);
    document.getElementById('qrDesc').textContent = 'Nội dung chuyển khoản: ' + addInfo;
    statusEl.textContent = 'Đang chờ xác nhận thanh toán từ nhà hàng…';

    pollPaymentStatus(order.orderId);
  } catch {
    statusEl.textContent = 'Không tạo được mã QR, vui lòng thanh toán tiền mặt tại quầy.';
  }
}

// Kiểm tra định kỳ xem admin đã xác nhận thanh toán chưa (mỗi 4 giây, tối đa 2 phút).
// Muốn tức thời hơn có thể thay bằng lắng nghe Socket.IO 'order_updated' như bên admin.
function pollPaymentStatus(orderId){
  let attempts = 0;
  const timer = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}`);
      const order = await res.json();
      if (order.payment.status === 'paid') {
        document.getElementById('qrStatus').textContent = '✅ Đã nhận được thanh toán. Cảm ơn bạn!';
        clearInterval(timer);
      }
    } catch { /* bỏ qua lỗi tạm thời, thử lại lần sau */ }
    if (attempts >= 30) clearInterval(timer); // ~2 phút thì dừng để không gọi API mãi
  }, 4000);
}

// ---------------------------------------------------------------------------
// KHỞI TẠO — tải thực đơn thật từ backend rồi mới vẽ giao diện
// ---------------------------------------------------------------------------
(async function init(){
  try {
    await fetchMenu();
    renderTabs();
    renderMenu();
  } catch (err) {
    menuEl.innerHTML = `<p style="padding:20px;color:#C23B22;">Không tải được thực đơn. Vui lòng thử lại hoặc báo nhân viên.</p>`;
    console.error(err);
  }
  renderCartBar();
})();
