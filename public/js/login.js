// public/js/login.js
document.addEventListener('DOMContentLoaded', () => {
  // Redirect already-logged-in users straight to dashboard
  if (Auth.isLoggedIn()) {
    window.location.href = '/dashboard.html';
    return;
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
