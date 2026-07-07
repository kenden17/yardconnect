// public/js/register.js
document.addEventListener('DOMContentLoaded', () => {
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
  const submitBtn  = document.getElementById('registerBtn');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    errorEl.classList.remove('shake');
    void errorEl.offsetWidth;
    errorEl.classList.add('shake');
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Live email domain hint
  emailInput.addEventListener('input', () => {
    const val = emailInput.value.toLowerCase();
    if (!val.includes('@')) { emailHint.textContent = ''; return; }
    const domain = val.split('@')[1] || '';
    const blocked = ['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
                     'me.com','aol.com','protonmail.com','proton.me','live.com','msn.com'];
    if (blocked.includes(domain)) {
      emailHint.textContent = '❌ Personal emails not accepted — use your school email.';
      emailHint.style.color = 'var(--danger)';
      return;
    }
    const good = ['.k12.', '.edu', 'student', 'stu.', 'isd.', 'cusd.', 'usd.',
                  'school', 'academy', 'hs.', 'college.', 'university.'];
    if (good.some(p => val.includes(p))) {
      emailHint.textContent = '✅ Looks like a school email';
      emailHint.style.color = 'var(--success)';
    } else {
      emailHint.textContent = '⚠️ Must be a school, k12, or .edu email address';
      emailHint.style.color = 'var(--warn)';
    }
  });

  // Password strength bar
  pwInput.addEventListener('input', () => {
    const v = pwInput.value;
    pwStrength.className = 'pw-strength';
    if (!v) return;
    const score = [v.length >= 8, /[A-Z]/.test(v), /[0-9]/.test(v), /[^A-Za-z0-9]/.test(v)]
      .filter(Boolean).length;
    pwStrength.classList.add(score <= 1 ? 'weak' : score <= 3 ? 'medium' : 'strong');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errorEl.classList.add('hidden');

    const name  = document.getElementById('name').value.trim();
    const dob   = document.getElementById('dob').value;
    const email = emailInput.value.trim();
    const pw    = pwInput.value;
    const agreed = document.getElementById('agreeGuidelines')?.checked;

    if (!name)   { showError('Full name is required.'); return; }
    if (!dob)    { showError('Date of birth is required.'); return; }
    if (!email)  { showError('Email address is required.'); return; }
    if (!pw)     { showError('Password is required.'); return; }
    if (pw.length < 8)      { showError('Password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(pw))  { showError('Password must contain at least one uppercase letter.'); return; }
    if (!/[0-9]/.test(pw))  { showError('Password must contain at least one number.'); return; }
    if (!agreed) { showError('You must agree to the Community Guidelines.'); return; }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Creating account…';

    try {
      const { token, user } = await API.register(name, email, pw, dob, true);
      Auth.setSession(token, user);
      window.location.href = '/dashboard.html';
    } catch (err) {
      showError(err.message || 'Registration failed. Please try again.');
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Create Account';
    }
  });
});
