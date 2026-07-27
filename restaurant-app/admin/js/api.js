/**
 * api.js — helper dùng chung cho các trang admin.
 * API_BASE để trống '' vì admin đang được server Express phục vụ tại /admin
 * trên CÙNG domain với API (/api/...). Nếu bạn tách deploy admin ra domain
 * khác, đổi API_BASE thành URL đầy đủ của backend, vd: 'https://api.quanha.vn'
 */
const API_BASE = '';

function getToken() {
  return localStorage.getItem('admin_token');
}

function requireLogin() {
  if (!getToken()) window.location.href = 'login.html';
}

async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = 'login.html';
    return null;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Có lỗi xảy ra' }));
    throw new Error(err.message);
  }
  // Một số API trả 204/không body
  return res.status === 204 ? null : res.json();
}
