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
    // Trigger shake — remove class first so animation re-fires
    errorEl.classList.remove('shake');
    void errorEl.offsetWidth;
    errorEl.classList.add('shake');
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    errorEl.classList.add('hidden');
  }

  // Live email hint
  emailInput.addEventListener('input', () => {
    const val = emailInput.value.toLowerCase();
    if (!val.includes('@')) { emailHint.textContent = ''; return; }

    const domain = val.split('@')[1] || '';
    const blocked = ['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
                     'me.com','aol.com','protonmail.com','proton.me','live.com','msn.com'];

    if (blocked.includes(domain)) {
      emailHint.textContent = '❌ Personal emails are not accepted. Use your school email.';
      emailHint.style.color = '#ef4444';
      return;
    }

    const good = ['.k12.', '.edu', 'student', 'stu.', 'isd.', 'cusd.', 'usd.',
                  'school', 'academy', 'hs.', 'college.', 'university.'];
    const ok = good.some(p => val.includes(p));
    if (ok) {
      emailHint.textContent = '✅ Looks like a school email';
      emailHint.style.color = '#16a34a';
    } else {
      emailHint.textContent = '⚠️ Must be a school, k12, or .edu email address';
      emailHint.style.color = '#d97706';
    }
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

    const agreedToGuidelines = document.getElementById('agreeGuidelines')?.checked;
    if (!agreedToGuidelines) { showError('You must agree to the Community Guidelines.'); return; }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Creating account…';

    try {
      const { token, user } = await API.register(name, email, pw, dob, true);
      try {
        Auth.setSession(token, user);
      } catch (storageErr) {
        showError('Could not save session: ' + storageErr.message + '. Try disabling private browsing.');
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Create Account';
        return;
      }
      window.location.href = '/dashboard.html';
    } catch (err) {
      console.error('Register catch:', err);
      const msg = (err && err.message) ? err.message : ('Unknown error: ' + JSON.stringify(err));
      showError(msg);
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Create Account';
    }
  });
});
