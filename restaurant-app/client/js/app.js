/* ==========================================================================
   app.js — Giao diện khách hàng (trang gọi món khi quét QR tại bàn)

   Luồng dữ liệu:
   - GET  /api/menu                -> thực đơn (backend đã lọc theo khung giờ)
   - POST /api/orders              -> đặt món, nhận số thứ tự
   - GET  /api/orders/:id/vietqr   -> mã VietQR động để chuyển khoản
   ========================================================================== */

// ---------------------------------------------------------------------------
// 1. LẤY SỐ BÀN TỪ QR CODE
// Mỗi bàn có 1 QR trỏ tới: https://domain.com/?table=05
// ---------------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const TABLE_ID = params.get('table') || '01';
document.getElementById('tableNumber').textContent = TABLE_ID;

// ---------------------------------------------------------------------------
// 2. CẤU HÌNH & LẤY DỮ LIỆU MÓN ĂN TỪ BACKEND (GET /api/menu)
// Nếu client và server chạy cùng domain (phục vụ qua Express static như
// hướng dẫn trong README), để trống ''. Nếu tách deploy riêng, đổi thành
// URL đầy đủ, vd: 'https://api.quanha.vn'
// ---------------------------------------------------------------------------
const API_BASE = '';

let MENU = []; // [{ category, items:[...] }] — nạp từ API lúc khởi tạo

// Emoji đại diện khi món chưa có ảnh thật — để thẻ món không bị ô trống xám
const CATEGORY_EMOJI = {
  'Món chính': '🍛',
  'Khai vị': '🥗',
  'Canh': '🍲',
  'Đồ uống': '🥤',
};
const DEFAULT_EMOJI = '🍽️';

// Câu mô tả ngắn dưới tiêu đề mỗi danh mục — chi tiết nhỏ làm menu "có hồn" hơn
const CATEGORY_TAGLINE = {
  'Món chính': 'Cơm nóng xới tay, đầy đặn — no bụng đúng kiểu cơm nhà.',
  'Khai vị': 'Nhẹ bụng khai màn, ăn kèm rau sống hái trong ngày.',
  'Canh': 'Nồi canh nấu liu riu, chan cơm là tròn bữa.',
  'Đồ uống': 'Giải nhiệt mát lành, pha khi khách gọi.',
};

function emojiFor(category) {
  return CATEGORY_EMOJI[category] || DEFAULT_EMOJI;
}

async function fetchMenu(){
  const res = await fetch(`${API_BASE}/api/menu`);
  if (!res.ok) throw new Error('Không tải được thực đơn');
  const flatItems = await res.json(); // MenuItem[] phẳng từ MongoDB
  // Backend đã LỌC SẴN theo khung giờ phục vụ (availableHours) — món ngoài giờ
  // không được trả về, nên khách chỉ thấy các món đang bán ở thời điểm hiện tại.

  const NEW_WITHIN_DAYS = 7;
  const now = Date.now();
  const isRecent = (raw) => raw.createdAt && (now - new Date(raw.createdAt).getTime()) < NEW_WITHIN_DAYS * 86400000;

  // Chỉ gắn nhãn "Mới" khi món đó mới so với PHẦN CÒN LẠI của thực đơn.
  // Nếu cả thực đơn đều vừa tạo (vd vừa chạy seed / quán mới mở) thì không
  // gắn nhãn cho món nào — tránh cảnh mọi món đều dán "Mới" trông rối mắt.
  const hasEstablishedItems = flatItems.some((raw) => !isRecent(raw));

  // Nhóm theo category để hiển thị theo tab, giữ đúng field cần cho renderMenu()
  const grouped = {};
  flatItems.forEach((raw) => {
    const item = {
      id: raw._id,
      name: raw.name,
      category: raw.category,
      price: raw.price,
      desc: raw.description || '',
      image: raw.image || '',
      available: raw.availableNow ?? raw.available,
      hours: raw.availableHours || '', // vd "10:30-14:00" — khung giờ bán
      isNew: hasEstablishedItems && isRecent(raw),
    };
    if (!grouped[raw.category]) grouped[raw.category] = [];
    grouped[raw.category].push(item);
  });
  MENU = Object.entries(grouped).map(([category, items]) => ({ category, items }));
}

// ---------------------------------------------------------------------------
// 3. STATE GIỎ HÀNG + TÌM KIẾM
// ---------------------------------------------------------------------------
const cart = new Map(); // itemId -> { item, qty }
let searchQuery = '';

/** Bỏ dấu tiếng Việt để tìm "com suon" vẫn ra "Cơm sườn". */
function normalize(str){
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/** Danh sách section sau khi áp bộ lọc tìm kiếm. */
function visibleMenu(){
  if (!searchQuery.trim()) return MENU;
  const q = normalize(searchQuery.trim());
  return MENU
    .map((section) => ({
      category: section.category,
      items: section.items.filter((i) => normalize(i.name + ' ' + i.desc).includes(q)),
    }))
    .filter((section) => section.items.length > 0);
}

document.getElementById('searchInput').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderTabs();
  renderMenu();
});

// ---------------------------------------------------------------------------
// 4. RENDER TABS DANH MỤC (kèm số lượng món trong mỗi danh mục)
// ---------------------------------------------------------------------------
const tabsEl = document.getElementById('categoryTabs');
function renderTabs(){
  const sections = visibleMenu();
  tabsEl.innerHTML = '';
  sections.forEach((section, idx) => {
    const tab = document.createElement('button');
    tab.className = 'tab' + (idx === 0 ? ' is-active' : '');
    tab.innerHTML = `${section.category} <span class="tab__count">${section.items.length}</span>`;
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      document.getElementById('sec-' + idx)?.scrollIntoView({ behavior:'smooth', block:'start' });
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

/** HTML phần ảnh của thẻ món: ảnh thật nếu có, không thì emoji trên nền gradient. */
function dishMediaHtml(item){
  const flag = item.isNew ? `<span class="dish__flag">Mới</span>` : '';
  if (item.image) {
    // Ảnh lỗi/hỏng link -> tự thay bằng emoji placeholder, không để ô vỡ ảnh
    return `<div class="dish__media">${flag}<img src="${item.image}" alt="${item.name}" loading="lazy"
      onerror="this.remove();this.parentElement.classList.add('dish__media--placeholder');this.parentElement.insertAdjacentText('beforeend','${emojiFor(item.category)}')"></div>`;
  }
  return `<div class="dish__media dish__media--placeholder">${flag}${emojiFor(item.category)}</div>`;
}

function renderMenu(){
  const sections = visibleMenu();
  menuEl.innerHTML = '';

  if (sections.length === 0) {
    menuEl.innerHTML = `
      <div class="menu__empty">
        <strong>🍳</strong>
        ${searchQuery.trim()
          ? `Không tìm thấy món nào cho “${searchQuery.trim()}”.<br>Thử từ khoá khác xem sao nhé.`
          : `Hiện chưa có món nào trong khung giờ này.<br>Bạn quay lại vào giờ cơm giúp quán nhé!`}
      </div>`;
    return;
  }

  // Mỗi danh mục là một <section> chứa lưới món, để trên màn hình rộng
  // các thẻ món tự xếp thành 2–4 cột (CSS .dish-grid lo phần chia cột).
  sections.forEach((section, idx) => {
    const sec = document.createElement('section');
    sec.className = 'menu__section';
    sec.id = 'sec-' + idx;
    sec.innerHTML = `
      <h3 class="menu__section-title">${section.category}</h3>
      ${CATEGORY_TAGLINE[section.category]
        ? `<p class="menu__section-sub">${CATEGORY_TAGLINE[section.category]}</p>`
        : ''}
      <div class="dish-grid"></div>`;
    const grid = sec.querySelector('.dish-grid');

    section.items.forEach(item => {
      const qty = cart.get(item.id)?.qty || 0;
      const card = document.createElement('article');
      card.className = 'dish' + (!item.available ? ' dish--soldout' : '');
      card.dataset.dish = item.id;
      card.innerHTML = `
        ${dishMediaHtml(item)}
        <div class="dish__body">
          <div class="dish__top">
            <p class="dish__name">${item.name}</p>
          </div>
          <p class="dish__desc">${item.desc}</p>
          ${item.hours ? `<p class="dish__hours">⏰ Phục vụ: ${item.hours}</p>` : ''}
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
      grid.appendChild(card);
    });

    menuEl.appendChild(sec);
  });

  // Bấm vào thẻ món -> mở CHI TIẾT MÓN (trừ khi bấm vào nút +/-/Thêm)
  menuEl.querySelectorAll('.dish').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const item = findItem(card.dataset.dish);
      if (item && item.available) openDishSheet(item);
    });
  });
  // Nút "+ Thêm"
  menuEl.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => changeQty(btn.getAttribute('data-add'), 1));
  });
  // Stepper (+/-)
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
// 6. SHEET CHI TIẾT MÓN ĂN
// Ảnh lớn + mô tả đầy đủ + danh mục + khung giờ + chọn số lượng.
// ---------------------------------------------------------------------------
const dishSheet = document.getElementById('dishSheet');
let detailItem = null;
let detailQty = 1;

function openDishSheet(item){
  detailItem = item;
  detailQty = Math.max(1, cart.get(item.id)?.qty || 1);

  const media = document.getElementById('dishDetailMedia');
  if (item.image) {
    media.innerHTML = `<img src="${item.image}" alt="${item.name}"
      onerror="this.remove();this.parentElement.insertAdjacentText('beforeend','${emojiFor(item.category)}')">`;
  } else {
    media.textContent = emojiFor(item.category);
  }

  document.getElementById('dishDetailName').textContent = item.name;
  document.getElementById('dishDetailPrice').textContent = formatVnd(item.price);

  const meta = [];
  meta.push(`<span class="meta-chip">${emojiFor(item.category)} ${item.category}</span>`);
  meta.push(item.hours
    ? `<span class="meta-chip meta-chip--warn">⏰ Phục vụ ${item.hours}</span>`
    : `<span class="meta-chip">⏰ Bán cả ngày</span>`);
  if (item.isNew) meta.push(`<span class="meta-chip meta-chip--gold">✨ Món mới</span>`);
  document.getElementById('dishDetailMeta').innerHTML = meta.join('');

  document.getElementById('dishDetailDesc').textContent =
    item.desc || 'Món ngon chuẩn vị cơm nhà — hỏi nhân viên để biết thêm về nguyên liệu và cách chế biến.';

  renderDetailQty();
  dishSheet.hidden = false;
}

function renderDetailQty(){
  document.getElementById('dishQty').textContent = detailQty;
  document.getElementById('dishQtyDec').disabled = detailQty <= 1;
  document.getElementById('dishAddBtn').textContent =
    `Thêm vào giỏ · ${formatVnd(detailItem.price * detailQty)}`;
}

document.getElementById('dishQtyInc').addEventListener('click', () => { detailQty++; renderDetailQty(); });
document.getElementById('dishQtyDec').addEventListener('click', () => { if (detailQty > 1){ detailQty--; renderDetailQty(); } });
document.getElementById('dishAddBtn').addEventListener('click', () => {
  cart.set(detailItem.id, { item: detailItem, qty: detailQty });
  dishSheet.hidden = true;
  renderMenu();
  renderCartBar();
});

// ---------------------------------------------------------------------------
// 7. THANH GIỎ HÀNG NỔI
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
// 8. SHEET GIỎ HÀNG — chỉnh số lượng ngay trong giỏ, có ảnh món
// ---------------------------------------------------------------------------
const cartSheet = document.getElementById('cartSheet');
const cartItemsEl = document.getElementById('cartItems');
const sheetTotal = document.getElementById('sheetTotal');

function cartLineThumb(item){
  if (item.image) {
    return `<div class="cart-line__thumb"><img src="${item.image}" alt=""
      onerror="this.remove();this.parentElement.insertAdjacentText('beforeend','${emojiFor(item.category)}')"></div>`;
  }
  return `<div class="cart-line__thumb">${emojiFor(item.category)}</div>`;
}

function renderCartSheet(){
  cartItemsEl.innerHTML = '';
  cart.forEach(({ item, qty }) => {
    const line = document.createElement('div');
    line.className = 'cart-line';
    line.innerHTML = `
      ${cartLineThumb(item)}
      <div class="cart-line__info">
        <p class="cart-line__name">${item.name}</p>
        <p class="cart-line__price">${formatVnd(item.price)} / phần · ${formatVnd(item.price * qty)}</p>
      </div>
      <div class="stepper" data-id="${item.id}">
        <button class="stepper__btn" data-action="dec">−</button>
        <span class="stepper__qty">${qty}</span>
        <button class="stepper__btn" data-action="inc">+</button>
      </div>`;
    cartItemsEl.appendChild(line);
  });

  cartItemsEl.querySelectorAll('.stepper').forEach(stepper => {
    const id = stepper.getAttribute('data-id');
    const update = (delta) => {
      changeQty(id, delta);
      if (cart.size === 0) { cartSheet.hidden = true; return; } // hết món thì đóng giỏ
      renderCartSheet();
    };
    stepper.querySelector('[data-action="inc"]').addEventListener('click', () => update(1));
    stepper.querySelector('[data-action="dec"]').addEventListener('click', () => update(-1));
  });

  sheetTotal.textContent = formatVnd(getCartTotal());
}

function openCartSheet(){
  renderCartSheet();
  cartSheet.hidden = false;
}

// Đóng sheet khi bấm nền mờ hoặc nút có data-close
document.querySelectorAll('[data-close]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.target.closest('.sheet').hidden = true;
  });
});

// ---------------------------------------------------------------------------
// 9. ĐẶT CƠM — gọi backend để sinh số thứ tự
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
// 10. THANH TOÁN — chọn Tiền mặt hoặc VietQR
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
    statusEl.textContent = 'Quét mã / chuyển khoản đúng số tiền và nội dung, rồi bấm "Tôi đã chuyển khoản".';
    document.getElementById('reportPaidBtn').hidden = false;
    document.getElementById('reportPaidBtn').disabled = false;

    pollPaymentStatus(order.orderId);
  } catch {
    statusEl.textContent = 'Không tạo được mã QR, vui lòng thanh toán tiền mặt tại quầy.';
  }
}

document.getElementById('reportPaidBtn').addEventListener('click', async () => {
  if (!currentOrder?.orderId) return;
  const btn = document.getElementById('reportPaidBtn');
  const statusEl = document.getElementById('qrStatus');
  btn.disabled = true;
  btn.textContent = 'Đang xác nhận…';
  try {
    const res = await fetch(`${API_BASE}/api/orders/${currentOrder.orderId}/report-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Không xác nhận được thanh toán');
    }
    statusEl.textContent = '✅ Đã nhận được thanh toán. Cảm ơn bạn!';
    btn.hidden = true;
  } catch (err) {
    statusEl.textContent = err.message || 'Có lỗi, vui lòng thử lại hoặc báo nhân viên.';
    btn.disabled = false;
    btn.textContent = '✓ Tôi đã chuyển khoản';
  }
});

// Kiểm tra định kỳ xem thanh toán đã được xác nhận chưa (khách báo đã CK,
// webhook ngân hàng, hoặc admin xác nhận tay) — mỗi 4 giây, tối đa 2 phút.
function pollPaymentStatus(orderId){
  let attempts = 0;
  const timer = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}`);
      const order = await res.json();
      if (order.payment.status === 'paid') {
        document.getElementById('qrStatus').textContent = '✅ Đã nhận được thanh toán. Cảm ơn bạn!';
        document.getElementById('reportPaidBtn').hidden = true;
        clearInterval(timer);
      }
    } catch { /* bỏ qua lỗi tạm thời, thử lại lần sau */ }
    if (attempts >= 30) clearInterval(timer);
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
