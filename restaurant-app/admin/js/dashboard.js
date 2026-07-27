requireLogin();

/* =========================================================================
   ĐIỀU HƯỚNG SIDEBAR
   ========================================================================= */
document.querySelectorAll('.sidebar__link').forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.sidebar__link').forEach((l) => l.classList.remove('is-active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('is-active'));
    link.classList.add('is-active');
    document.getElementById('panel-' + link.dataset.panel).classList.add('is-active');
    if (link.dataset.panel === 'revenue') loadRevenue();
  });
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('admin_token');
  window.location.href = 'login.html';
});

/* =========================================================================
   CHUÔNG BÁO ĐƠN MỚI
   Dùng Web Audio API tự tạo tiếng "ting-ting" — KHÔNG phụ thuộc file mp3
   hay thư viện tải từ CDN ngoài (tránh lặp lại lỗi mất mã QR do CDN hỏng
   đường dẫn). Trình duyệt chặn phát âm thanh tự động trước khi có tương
   tác của người dùng, nên ta "mở khoá" AudioContext ngay lần bấm/gõ đầu
   tiên trên trang — sau đó chuông reo được ngay khi đơn mới về.
   ========================================================================= */
let audioCtx = null;
let soundEnabled = localStorage.getItem('admin_sound_enabled') !== 'off'; // mặc định BẬT

function unlockAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
['click', 'keydown', 'touchstart'].forEach((evt) =>
  document.addEventListener(evt, unlockAudio, { once: true, passive: true })
);

/** Phát 1 tiếng "ting" (2 nốt chuông chồng lên nhau, tắt dần tự nhiên). */
function ringOnce() {
  if (!soundEnabled || !audioCtx) return;
  const now = audioCtx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + i * 0.12);
    osc.stop(now + 1);
  });
}

/** Chuông "ting-ting-ting" khi có đơn mới — dồn dập hơn 1 tiếng đơn để chắc bếp nghe thấy. */
function ringNewOrder() {
  ringOnce();
  setTimeout(ringOnce, 260);
  setTimeout(ringOnce, 520);
}

const soundToggle = document.getElementById('soundToggle');
const soundLabel = document.getElementById('soundLabel');
const soundIcon = document.getElementById('soundIcon');
function renderSoundToggle() {
  soundToggle.classList.toggle('is-muted', !soundEnabled);
  soundIcon.textContent = soundEnabled ? '🔔' : '🔕';
  soundLabel.textContent = 'Chuông: ' + (soundEnabled ? 'Bật' : 'Tắt');
}
soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem('admin_sound_enabled', soundEnabled ? 'on' : 'off');
  renderSoundToggle();
  if (soundEnabled) ringOnce(); // reo thử 1 tiếng để admin biết đã bật lại
});
renderSoundToggle();

/* =========================================================================
   MODAL ĐƠN HÀNG MỚI — hiện to giữa màn hình, xếp hàng nếu nhiều đơn về
   liên tiếp (vd nhiều bàn đặt cùng lúc), reo chuông cho từng đơn.
   ========================================================================= */
const newOrderModal = document.getElementById('newOrderModal');
const newOrderQueueEl = document.getElementById('newOrderQueue');
let pendingNewOrders = []; // đơn mới đã reo chuông nhưng admin chưa "xem"

function showNewOrderModal(order) {
  document.getElementById('newOrderNumber').textContent = order.orderNumber;
  document.getElementById('newOrderTable').textContent = 'Bàn ' + order.table;
  document.getElementById('newOrderItems').innerHTML = order.items
    .map((i) => `<li><span>${i.qty} × ${i.name}</span><span>${formatVnd(i.price * i.qty)}</span></li>`)
    .join('');
  const noteEl = document.getElementById('newOrderNote');
  noteEl.hidden = !order.note;
  noteEl.textContent = order.note ? '📝 Ghi chú: ' + order.note : '';
  document.getElementById('newOrderTotal').textContent = formatVnd(order.total);

  const rest = pendingNewOrders.length - 1;
  newOrderQueueEl.hidden = rest <= 0;
  newOrderQueueEl.textContent = rest > 0 ? `+ còn ${rest} đơn mới khác đang chờ xem` : '';

  newOrderModal.hidden = false;
  newOrderModal.dataset.orderId = order._id;
}

function closeNewOrderModal() {
  newOrderModal.hidden = true;
  pendingNewOrders.shift();
  if (pendingNewOrders.length > 0) {
    // Hiện đơn tiếp theo trong hàng đợi sau một nhịp ngắn, kèm reo chuông lại
    setTimeout(() => { ringNewOrder(); showNewOrderModal(pendingNewOrders[0]); }, 450);
  }
}

document.getElementById('newOrderCloseBtn').addEventListener('click', closeNewOrderModal);
document.getElementById('newOrderAckBtn').addEventListener('click', async () => {
  const id = newOrderModal.dataset.orderId;
  try {
    await apiFetch(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'preparing' }) });
  } catch { /* đơn có thể đã đổi trạng thái từ nơi khác, bỏ qua lỗi */ }
  closeNewOrderModal();
});

/* =========================================================================
   REALTIME — kết nối Socket.IO, join phòng admin để nhận đơn mới ngay lập tức
   ========================================================================= */
const socket = io(); // cùng origin với trang admin
socket.on('connect', () => socket.emit('join_admin', getToken()));
socket.on('new_order', (order) => {
  // Chỉ gắn vào lưới nếu đang xem đúng ngày của đơn (thường là hôm nay)
  if (order.dateKey === selectedOrderDate) {
    orders.unshift(order);
    renderOrders(true);
  }
  loadCounter();

  pendingNewOrders.push(order);
  ringNewOrder();
  if (pendingNewOrders.length === 1) {
    showNewOrderModal(order);
  } else {
    // Modal đơn trước vẫn đang mở -> chỉ cập nhật số đơn còn chờ, không
    // giật màn hình sang đơn mới (admin cần xử lý xong đơn đang xem trước).
    newOrderQueueEl.hidden = false;
    newOrderQueueEl.textContent = `+ còn ${pendingNewOrders.length - 1} đơn mới khác đang chờ xem`;
  }
});
socket.on('order_updated', (updated) => {
  const idx = orders.findIndex((o) => o._id === updated._id);
  if (idx >= 0) orders[idx] = updated;
  else if (updated.dateKey === selectedOrderDate) orders.unshift(updated);
  renderOrders();
  // Thanh toán xong → doanh thu đổi, làm mới nếu đang mở tab Doanh thu
  if (document.getElementById('panel-revenue').classList.contains('is-active')) {
    loadRevenue();
  }
});
socket.on('counter_reset', () => {
  loadCounter();
});

/* =========================================================================
   PANEL: ĐƠN HÀNG
   ========================================================================= */
const orderGrid = document.getElementById('orderGrid');
const statusFilter = document.getElementById('statusFilter');
const orderDateFilter = document.getElementById('orderDateFilter');
let orders = [];
let lastNewOrderId = null;

/** Ngày hôm nay theo máy admin (YYYY-MM-DD) — dùng làm mặc định cho bộ lọc. */
function localTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

let selectedOrderDate = localTodayKey();
orderDateFilter.value = selectedOrderDate;

const STATUS_LABEL = {
  pending: 'Chờ chế biến',
  preparing: 'Đang chế biến',
  served: 'Đã phục vụ',
  cancelled: 'Đã huỷ',
};
const STATUS_NEXT = { pending: 'preparing', preparing: 'served' }; // trạng thái kế tiếp gợi ý

function formatVnd(n){ return Number(n || 0).toLocaleString('vi-VN') + 'đ'; }

async function loadCounter() {
  try {
    const info = await apiFetch('/api/orders/counter');
    document.getElementById('counterSeq').textContent = info.seq;
    document.getElementById('counterNext').textContent = info.nextNumber;
    document.getElementById('counterDateHint').textContent = `Ngày counter: ${info.dateKey}`;
  } catch {
    document.getElementById('counterSeq').textContent = '—';
    document.getElementById('counterNext').textContent = '—';
  }
}

document.getElementById('resetCounterBtn').addEventListener('click', async () => {
  const ok = confirm(
    'Reset số thứ tự hôm nay về #1?\n\n' +
    '• Đơn tiếp theo sẽ nhận số #1\n' +
    '• Không xoá đơn đã tạo\n' +
    '• Sang ngày mới hệ thống vẫn tự đánh lại từ #1'
  );
  if (!ok) return;
  try {
    const result = await apiFetch('/api/orders/reset-counter', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
    alert(result.message || 'Đã reset số thứ tự.');
    loadCounter();
  } catch (err) {
    alert(err.message || 'Không reset được số thứ tự.');
  }
});

async function loadOrders() {
  const q = new URLSearchParams({ date: selectedOrderDate });
  orders = await apiFetch('/api/orders?' + q.toString());
  renderOrders();
  loadCounter();
}

orderDateFilter.addEventListener('change', () => {
  selectedOrderDate = orderDateFilter.value || localTodayKey();
  loadOrders();
});

function renderOrders(justAdded = false) {
  const filter = statusFilter.value;
  const list = filter ? orders.filter((o) => o.status === filter) : orders;

  if (list.length === 0) {
    orderGrid.innerHTML = '<p class="empty-hint">Chưa có đơn nào phù hợp bộ lọc.</p>';
    return;
  }

  orderGrid.innerHTML = list.map((o) => `
    <article class="order-card ${justAdded && o._id === orders[0]._id ? 'order-card--new' : ''}">
      <div class="order-card__top">
        <div>
          <p class="order-card__number">#${o.orderNumber}</p>
          <p class="order-card__table">Bàn ${o.table}</p>
        </div>
        <span class="badge badge--${o.status}">${STATUS_LABEL[o.status]}</span>
      </div>
      <ul class="order-card__items">
        ${o.items.map((i) => `<li><span>${i.qty} × ${i.name}</span><span>${formatVnd(i.price * i.qty)}</span></li>`).join('')}
      </ul>
      ${o.note ? `<p class="order-card__note">Ghi chú: ${o.note}</p>` : ''}
      <div class="order-card__row">
        <span class="order-card__total">${formatVnd(o.total)}</span>
        <span class="badge badge--${o.payment.status}">
          ${o.payment.status === 'paid' ? 'Đã thanh toán' : (o.payment.method === 'vietqr' ? 'Chờ chuyển khoản' : 'Chưa thanh toán')}
        </span>
      </div>
      <div class="order-card__actions">
        ${STATUS_NEXT[o.status] ? `<button class="btn btn--small btn--primary" data-action="status" data-id="${o._id}" data-next="${STATUS_NEXT[o.status]}">Chuyển: ${STATUS_LABEL[STATUS_NEXT[o.status]]}</button>` : ''}
        ${o.payment.status !== 'paid' ? `<button class="btn btn--small btn--danger-outline" data-action="pay" data-id="${o._id}">Xác nhận đã thanh toán</button>` : ''}
        ${o.status !== 'cancelled' && o.status !== 'served' ? `<button class="btn btn--small btn--ghost" data-action="cancel" data-id="${o._id}">Huỷ đơn</button>` : ''}
      </div>
    </article>
  `).join('');
}

orderGrid.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id, next } = btn.dataset;

  if (action === 'status') {
    await apiFetch(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
  } else if (action === 'cancel') {
    if (!confirm('Huỷ đơn này?')) return;
    await apiFetch(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
  } else if (action === 'pay') {
    await apiFetch(`/api/orders/${id}/confirm-payment`, { method: 'PATCH' });
  }
  // Không cần tự render lại — socket 'order_updated' sẽ tự bắn về và render.
});

statusFilter.addEventListener('change', () => renderOrders());

/* =========================================================================
   PANEL: DOANH THU
   ========================================================================= */
const revenueGrid = document.getElementById('revenueGrid');
const revenueDateFilter = document.getElementById('revenueDateFilter');
revenueDateFilter.value = localTodayKey();

function revenueCard(title, rangeLabel, stats) {
  return `
    <article class="revenue-card">
      <p class="revenue-card__eyebrow">${title}</p>
      <p class="revenue-card__amount">${formatVnd(stats.revenue)}</p>
      <p class="revenue-card__range">${rangeLabel}</p>
      <ul class="revenue-card__meta">
        <li><span>Đã thanh toán</span><strong>${stats.paidCount} đơn</strong></li>
        <li><span>Chưa thu</span><strong>${formatVnd(stats.unpaid)} (${stats.unpaidCount})</strong></li>
        <li><span>Tổng đơn</span><strong>${stats.orderCount}</strong></li>
        <li><span>Đã huỷ</span><strong>${stats.cancelledCount}</strong></li>
      </ul>
    </article>
  `;
}

async function loadRevenue() {
  const date = revenueDateFilter.value || localTodayKey();
  revenueGrid.innerHTML = '<p class="empty-hint">Đang tải doanh thu…</p>';
  try {
    const data = await apiFetch('/api/orders/revenue?date=' + encodeURIComponent(date));
    revenueGrid.innerHTML = [
      revenueCard('Hôm nay / ngày chọn', data.day.from, data.day),
      revenueCard('Tuần này', `${data.week.from} → ${data.week.to}`, data.week),
      revenueCard('Tháng này', `${data.month.from} → ${data.month.to}`, data.month),
    ].join('');
  } catch (err) {
    revenueGrid.innerHTML = `<p class="empty-hint">Không tải được doanh thu: ${err.message}</p>`;
  }
}

revenueDateFilter.addEventListener('change', loadRevenue);
document.getElementById('refreshRevenueBtn').addEventListener('click', loadRevenue);

/* =========================================================================
   PANEL: THỰC ĐƠN
   ========================================================================= */
const menuTableBody = document.getElementById('menuTableBody');
let menuItems = [];

async function loadMenu() {
  // "?all=1": admin xem TẤT CẢ món, kể cả món đang ngoài khung giờ phục vụ
  // (API public mặc định đã lọc bớt các món ngoài giờ cho khách).
  menuItems = await apiFetch('/api/menu?all=1');
  renderMenuTable();
}

function renderMenuTable() {
  menuTableBody.innerHTML = menuItems.map((m) => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          ${m.image
            ? `<img src="${m.image}" alt="" style="width:38px;height:38px;object-fit:cover;border-radius:8px;" onerror="this.style.display='none'">`
            : ''}
          <span>${m.name}</span>
        </div>
      </td>
      <td>${m.category}</td>
      <td class="price">${formatVnd(m.price)}</td>
      <td>
        ${m.availableHours || 'Cả ngày'}
        ${m.available && m.availableNow === false ? '<br><small style="color:#C23B22;">(đang ngoài giờ — khách không thấy)</small>' : ''}
      </td>
      <td>
        <label class="switch">
          <input type="checkbox" data-toggle="${m._id}" ${m.available ? 'checked' : ''}>
          <span class="switch__track"></span>
        </label>
      </td>
      <td>
        <button class="btn btn--small btn--ghost" data-edit="${m._id}">Sửa</button>
        <button class="btn btn--small btn--ghost" data-delete="${m._id}">Xoá</button>
      </td>
    </tr>
  `).join('');
}

menuTableBody.addEventListener('change', async (e) => {
  const id = e.target.dataset.toggle;
  if (!id) return;
  await apiFetch(`/api/menu/${id}`, { method: 'PUT', body: JSON.stringify({ available: e.target.checked }) });
  const item = menuItems.find((m) => m._id === id);
  if (item) item.available = e.target.checked; // cập nhật ngay không cần đợi reload
});

menuTableBody.addEventListener('click', async (e) => {
  const editId = e.target.dataset.edit;
  const deleteId = e.target.dataset.delete;
  if (editId) openMenuModal(menuItems.find((m) => m._id === editId));
  if (deleteId) {
    if (!confirm('Xoá món này khỏi thực đơn?')) return;
    await apiFetch(`/api/menu/${deleteId}`, { method: 'DELETE' });
    loadMenu();
  }
});

// ---- Modal thêm/sửa món ----
const menuModal = document.getElementById('menuModal');
const menuForm = document.getElementById('menuForm');

document.getElementById('addMenuBtn').addEventListener('click', () => openMenuModal(null));
document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => (menuModal.hidden = true)));

function openMenuModal(item) {
  document.getElementById('menuModalTitle').textContent = item ? 'Sửa món' : 'Thêm món mới';
  document.getElementById('menuItemId').value = item?._id || '';
  document.getElementById('menuName').value = item?.name || '';
  document.getElementById('menuCategory').value = item?.category || '';
  document.getElementById('menuPrice').value = item?.price ?? '';
  document.getElementById('menuDesc').value = item?.description || '';
  document.getElementById('menuImage').value = item?.image || '';
  document.getElementById('menuHours').value = item?.availableHours || '';
  document.getElementById('menuAvailable').checked = item ? item.available : true;
  menuModal.hidden = false;
}

menuForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('menuItemId').value;
  const payload = {
    name: document.getElementById('menuName').value.trim(),
    category: document.getElementById('menuCategory').value.trim(),
    price: Number(document.getElementById('menuPrice').value),
    description: document.getElementById('menuDesc').value.trim(),
    image: document.getElementById('menuImage').value.trim(),
    availableHours: document.getElementById('menuHours').value.trim(),
    available: document.getElementById('menuAvailable').checked,
  };
  try {
    if (id) {
      await apiFetch(`/api/menu/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/api/menu', { method: 'POST', body: JSON.stringify(payload) });
    }
  } catch (err) {
    alert(err.message); // vd: khung giờ sai định dạng
    return;
  }
  menuModal.hidden = true;
  loadMenu();
});

/* =========================================================================
   PANEL: BÀN & QR
   ========================================================================= */
const qrGrid = document.getElementById('qrGrid');

async function loadTables() {
  const tables = await apiFetch('/api/tables');
  renderTables(tables);
}

/**
 * Sinh ảnh mã QR qua dịch vụ ảnh miễn phí api.qrserver.com (goqr.me) — không
 * cần cài thư viện JS nào, không lo lỗi CDN/thư viện thiếu bản build cho
 * trình duyệt (nguyên nhân gây mất mã QR trước đây). Cùng cách VietQR
 * (img.vietqr.io) đang dùng trong app: chỉ là một URL ảnh, dùng thẳng
 * trong thẻ <img>.
 */
function qrImageUrl(link, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(link)}`;
}

function renderTables(tables) {
  qrGrid.innerHTML = tables.map((t) => {
    // qrCodeLink được server sinh sẵn từ PUBLIC_URL khi tạo bàn; bàn cũ
    // (trước khi có tính năng này) thì fallback về domain hiện tại.
    const link = t.qrCodeLink || `${window.location.origin}/?table=${encodeURIComponent(t.tableNumber)}`;
    return `
    <div class="qr-card">
      <img class="qr-card__img" src="${qrImageUrl(link)}" width="150" height="150" alt="Mã QR bàn ${t.tableNumber}"
        data-link="${link}"
        onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'qr-card__error',textContent:'Không tải được ảnh QR. Đường dẫn: ${link}'}))">
      <p class="qr-card__number">Bàn ${t.tableNumber}</p>
      <p class="qr-card__link">${link}</p>
      <div class="qr-card__actions">
        <button class="btn btn--small btn--ghost" data-download data-link="${link}" data-table="${t.tableNumber}">Tải ảnh</button>
        <button class="btn btn--small btn--ghost" data-remove-table="${t._id}">Xoá</button>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('addTableForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('newTableNumber');
  await apiFetch('/api/tables', { method: 'POST', body: JSON.stringify({ tableNumber: input.value.trim() }) });
  input.value = '';
  loadTables();
});

qrGrid.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const removeId = btn.dataset.removeTable;

  if (removeId) {
    if (!confirm('Xoá bàn này?')) return;
    await apiFetch(`/api/tables/${removeId}`, { method: 'DELETE' });
    loadTables();
  }
  if ('download' in btn.dataset) {
    // Ảnh QR đến từ domain khác (api.qrserver.com) nên không dùng
    // canvas.toDataURL được — tải qua fetch() thành blob rồi mới lưu file,
    // để tên file luôn là "ban-XX.png" thay vì mở tab ảnh mới.
    try {
      const res = await fetch(qrImageUrl(btn.dataset.link, 600));
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `ban-${btn.dataset.table}.png`;
      link.href = objectUrl;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert('Không tải được ảnh QR, vui lòng thử lại.');
    }
  }
});

/* =========================================================================
   KHỞI TẠO
   ========================================================================= */
loadOrders();
loadMenu();
loadTables();
