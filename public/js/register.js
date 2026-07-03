// public/js/register.js
document.addEventListener('DOMContentLoaded', () => {
  const emailInput = document.getElementById('email');
  const emailHint  = document.getElementById('emailHint');
  const pwInput    = document.getElementById('password');
  const pwStrength = document.getElementById('pwStrength');
  const form       = document.getElementById('registerForm');
  const errorEl    = document.getElementById('registerError');
  const successEl  = document.getElementById('registerSuccess');
  const submitBtn  = document.getElementById('registerBtn');

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
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    const name  = document.getElementById('name').value.trim();
    const email = emailInput.value.trim();
    const pw    = pwInput.value;

    if (!name || !email || !pw) {
      errorEl.textContent = 'Please fill in all fields.';
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';

    try {
      const { token, user } = await API.register(name, email, pw);
      Auth.setSession(token, user);
      window.location.href = '/dashboard.html';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  });
});
