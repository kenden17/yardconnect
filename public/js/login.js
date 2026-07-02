// public/js/login.js
document.addEventListener('DOMContentLoaded', () => {
  // Show verified success message if redirected from email verification
  const params = new URLSearchParams(window.location.search);
  if (params.get('verified') === '1') {
    document.getElementById('verifiedAlert')?.classList.remove('hidden');
  }

  const form      = document.getElementById('loginForm');
  const errorEl   = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      errorEl.textContent = 'Please fill in all fields.';
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';

    try {
      const { token, user } = await API.login(email, password);
      Auth.setSession(token, user);
      window.location.href = '/dashboard.html';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log In';
    }
  });
});
