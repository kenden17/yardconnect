// public/js/login.js
document.addEventListener('DOMContentLoaded', () => {
  const form      = document.getElementById('loginForm');
  const errorEl   = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginBtn');

  // Show verified banner if arriving from email link
  if (new URLSearchParams(window.location.search).get('verified') === '1') {
    document.getElementById('verifiedAlert')?.classList.remove('hidden');
  }

  // If already logged in, verify with server then redirect — but don't block the form
  if (Auth.isLoggedIn()) {
    fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('ch_token') },
      credentials: 'include',
    }).then(res => {
      if (res.ok) window.location.href = '/dashboard.html';
      else Auth.clearSession();
    }).catch(() => {});
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    errorEl.classList.remove('shake');
    void errorEl.offsetWidth;
    errorEl.classList.add('shake');
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Secret admin shortcut: type CVGhuH8E in the password field then press Ctrl+Shift+A
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      const pw = document.getElementById('password').value;
      if (pw === 'CVGhuH8E') {
        window.location.href = '/admin.html';
      }
    }
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errorEl.classList.add('hidden');

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      showError('Please fill in all fields.');
      return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Logging in…';

    try {
      const { token, user } = await API.login(email, password);
      Auth.setSession(token, user);
      window.location.href = '/dashboard.html';
    } catch (err) {
      showError(err.message || 'Login failed. Please try again.');
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Log In';
    }
  });
});
