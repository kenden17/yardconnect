// public/js/login.js
document.addEventListener('DOMContentLoaded', async () => {
  // Verify token with server before redirecting — avoids bouncing when token is expired
  if (Auth.isLoggedIn()) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('ch_token') },
        credentials: 'include',
      });
      if (res.ok) {
        window.location.href = '/dashboard.html';
        return;
      } else {
        Auth.clearSession();
      }
    } catch (_) {
      // Network error — fall through to show the login form
    }
  }

  const form      = document.getElementById('loginForm');
  const errorEl   = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginBtn');

  // Show verified banner if coming from email link
  const params = new URLSearchParams(window.location.search);
  if (params.get('verified') === '1') {
    document.getElementById('verifiedAlert')?.classList.remove('hidden');
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    errorEl.classList.remove('shake');
    void errorEl.offsetWidth;
    errorEl.classList.add('shake');
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

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
    submitBtn.innerHTML   = '<span class="spinner"></span> Logging in…';

    try {
      const { token, user } = await API.login(email, password);
      try {
        Auth.setSession(token, user);
      } catch (storageErr) {
        showError('Could not save session: ' + storageErr.message + '. Try disabling private browsing.');
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Log In';
        return;
      }
      window.location.href = '/dashboard.html';
    } catch (err) {
      showError(err.message || ('Login failed: ' + String(err)));
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Log In';
    }
  });
});
