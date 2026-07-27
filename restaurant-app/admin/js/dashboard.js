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
  });
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('admin_token');
  window.location.href = 'login.html';
});

/* =========================================================================
   REALTIME — kết nối Socket.IO, join phòng admin để nhận đơn mới ngay lập tức
   ========================================================================= */
const socket = io(); // cùng origin với trang admin
socket.on('connect', () => socket.emit('join_admin', getToken()));
socket.on('new_order', (order) => {
  orders.unshift(order);
  renderOrders(true);
});
socket.on('order_updated', (updated) => {
  const idx = orders.findIndex((o) => o._id === updated._id);
  if (idx >= 0) orders[idx] = updated;
  renderOrders();
});

/* =========================================================================
   PANEL: ĐƠN HÀNG
   ========================================================================= */
const orderGrid = document.getElementById('orderGrid');
const statusFilter = document.getElementById('statusFilter');
let orders = [];
let lastNewOrderId = null;

const STATUS_LABEL = {
  pending: 'Chờ chế biến',
  preparing: 'Đang chế biến',
  served: 'Đã phục vụ',
  cancelled: 'Đã huỷ',
};
const STATUS_NEXT = { pending: 'preparing', preparing: 'served' }; // trạng thái kế tiếp gợi ý

function formatVnd(n){ return n.toLocaleString('vi-VN') + 'đ'; }

async function loadOrders() {
  orders = await apiFetch('/api/orders');
  renderOrders();
}

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
   PANEL: THỰC ĐƠN
   ========================================================================= */
const menuTableBody = document.getElementById('menuTableBody');
let menuItems = [];

async function loadMenu() {
  menuItems = await apiFetch('/api/menu');
  renderMenuTable();
}

function renderMenuTable() {
  menuTableBody.innerHTML = menuItems.map((m) => `
    <tr>
      <td>${m.name}</td>
      <td>${m.category}</td>
      <td class="price">${formatVnd(m.price)}</td>
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
    available: document.getElementById('menuAvailable').checked,
  };
  if (id) {
    await apiFetch(`/api/menu/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  } else {
    await apiFetch('/api/menu', { method: 'POST', body: JSON.stringify(payload) });
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

function renderTables(tables) {
  qrGrid.innerHTML = tables.map((t) => `
    <div class="qr-card">
      <canvas id="qr-${t._id}"></canvas>
      <p class="qr-card__number">Bàn ${t.tableNumber}</p>
      <div class="qr-card__actions">
        <button class="btn btn--small btn--ghost" data-download="${t._id}" data-table="${t.tableNumber}">Tải ảnh</button>
        <button class="btn btn--small btn--ghost" data-remove-table="${t._id}">Xoá</button>
      </div>
    </div>
  `).join('');

  // Vẽ QR sau khi đã render xong canvas vào DOM
  tables.forEach((t) => {
    const url = `${window.location.origin}/?table=${encodeURIComponent(t.tableNumber)}`;
    QRCode.toCanvas(document.getElementById(`qr-${t._id}`), url, { width: 150, margin: 1 });
  });
}

document.getElementById('addTableForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('newTableNumber');
  await apiFetch('/api/tables', { method: 'POST', body: JSON.stringify({ tableNumber: input.value.trim() }) });
  input.value = '';
  loadTables();
});

qrGrid.addEventListener('click', async (e) => {
  const removeId = e.target.dataset.removeTable;
  const downloadId = e.target.dataset.download;

  if (removeId) {
    if (!confirm('Xoá bàn này?')) return;
    await apiFetch(`/api/tables/${removeId}`, { method: 'DELETE' });
    loadTables();
  }
  if (downloadId) {
    const canvas = document.getElementById(`qr-${downloadId}`);
    const link = document.createElement('a');
    link.download = `ban-${e.target.dataset.table}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
});

/* =========================================================================
   KHỞI TẠO
   ========================================================================= */
loadOrders();
loadMenu();
loadTables();
