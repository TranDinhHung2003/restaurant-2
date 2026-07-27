document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errorEl = document.getElementById('loginError');
  errorEl.hidden = true;

  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: form.get('username'),
        password: form.get('password'),
      }),
    });
    localStorage.setItem('admin_token', data.token);
    window.location.href = 'index.html';
  } catch (err) {
    errorEl.textContent = err.message || 'Đăng nhập thất bại';
    errorEl.hidden = false;
  }
});

// Nếu đã đăng nhập rồi thì vào thẳng dashboard
if (getToken()) window.location.href = 'index.html';
