// public/js/register.js
document.addEventListener('DOMContentLoaded', () => {
  // Redirect already-logged-in users straight to dashboard
  if (Auth.isLoggedIn()) {
    window.location.href = '/dashboard.html';
    return;
  }

  const emailInput = document.getElementById('email');
  const emailHint  = document.getElementById('emailHint');
  const pwInput    = document.getElementById('password');
  const pwStrength = document.getElementById('pwStrength');
  const form       = document.getElementById('registerForm');
  const errorEl    = document.getElementById('registerError');
  const successEl  = document.getElementById('registerSuccess');
  const submitBtn  = document.getElementById('registerBtn');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    errorEl.classList.add('hidden');
  }

  // Live email hint
  emailInput.addEventListener('input', () => {
    const val = emailInput.value.toLowerCase();
    if (!val.includes('@')) { emailHint.textContent = ''; return; }
    const good = ['.k12.', '.edu', 'student', 'stu.', 'isd.', 'school', 'academy', 'hs.'];
    const ok   = good.some(p => val.includes(p));
    emailHint.textContent = ok ? '✅ Looks like a school email' : '⚠️ Must be a school or k12 email';
    emailHint.style.color = ok ? '#86efac' : '#fcd34d';
  });

  // Password strength
  pwInput.addEventListener('input', () => {
    const v = pwInput.value;
    pwStrength.className = 'pw-strength';
    if (!v) return;
    const score = [v.length >= 8, /[A-Z]/.test(v), /[0-9]/.test(v), /[^A-Za-z0-9]/.test(v)]
      .filter(Boolean).length;
    if (score <= 1)      pwStrength.classList.add('weak');
    else if (score <= 3) pwStrength.classList.add('medium');
    else                 pwStrength.classList.add('strong');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    hideError();
    successEl.classList.add('hidden');

    const name  = document.getElementById('name').value.trim();
    const dob   = document.getElementById('dob').value;
    const email = emailInput.value.trim();
    const pw    = pwInput.value;

    // Client-side validation before hitting the server
    if (!name)  { showError('Full name is required.'); return; }
    if (!dob)   { showError('Date of birth is required.'); return; }
    if (!email) { showError('Email address is required.'); return; }
    if (!pw)    { showError('Password is required.'); return; }
    if (pw.length < 8)        { showError('Password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(pw))   { showError('Password must contain at least one uppercase letter.'); return; }
    if (!/[0-9]/.test(pw))   { showError('Password must contain at least one number.'); return; }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Creating account…';

    try {
      const { token, user } = await API.register(name, email, pw, dob);
      Auth.setSession(token, user);
      window.location.href = '/dashboard.html';
    } catch (err) {
      showError(err.message || 'Registration failed. Please try again.');
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Create Account';
    }
  });
});
