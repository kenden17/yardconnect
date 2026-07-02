// public/js/register.js
document.addEventListener('DOMContentLoaded', () => {
  const roleInput   = document.getElementById('roleInput');
  const roleBtns    = document.querySelectorAll('.role-btn');
  const roleNote    = document.getElementById('roleNote');
  const emailInput  = document.getElementById('email');
  const emailHint   = document.getElementById('emailHint');
  const pwInput     = document.getElementById('password');
  const pwStrength  = document.getElementById('pwStrength');
  const form        = document.getElementById('registerForm');
  const errorEl     = document.getElementById('registerError');
  const successEl   = document.getElementById('registerSuccess');
  const submitBtn   = document.getElementById('registerBtn');

  // Pre-select role from URL param
  const params = new URLSearchParams(window.location.search);
  const urlRole = params.get('role');
  if (urlRole === 'homeowner') {
    roleInput.value = 'homeowner';
    roleBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.role === 'homeowner');
    });
    roleNote.style.display = 'none';
  }

  // Role toggle
  roleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      roleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      roleInput.value = btn.dataset.role;
      roleNote.style.display = btn.dataset.role === 'student' ? '' : 'none';
      emailHint.textContent = '';
      if (btn.dataset.role === 'homeowner') {
        emailInput.placeholder = 'your@email.com';
      } else {
        emailInput.placeholder = 'you@students.district.k12.tx.us';
      }
    });
  });

  // Live email hint for students
  emailInput.addEventListener('input', () => {
    if (roleInput.value !== 'student') return;
    const val = emailInput.value.toLowerCase();
    if (!val.includes('@')) { emailHint.textContent = ''; return; }
    const goodPatterns = ['.k12.', '.edu', 'student', 'stu.', 'isd.', 'school'];
    const looks = goodPatterns.some(p => val.includes(p));
    emailHint.textContent = looks
      ? '✅ Looks like a school email'
      : '⚠️ Needs to be a school or k12 email';
    emailHint.style.color = looks ? '#86efac' : '#fcd34d';
  });

  // Password strength
  pwInput.addEventListener('input', () => {
    const v = pwInput.value;
    pwStrength.className = 'pw-strength';
    if (!v) return;
    const score = [v.length >= 8, /[A-Z]/.test(v), /[0-9]/.test(v), /[^A-Za-z0-9]/.test(v)]
      .filter(Boolean).length;
    if (score <= 1) pwStrength.classList.add('weak');
    else if (score <= 3) pwStrength.classList.add('medium');
    else pwStrength.classList.add('strong');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    const name  = document.getElementById('name').value.trim();
    const email = emailInput.value.trim();
    const pw    = pwInput.value;
    const role  = roleInput.value;

    if (!name || !email || !pw) {
      errorEl.textContent = 'Please fill in all fields.';
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';

    try {
      await API.register(name, email, pw, role);
      successEl.textContent = '🎉 Account created! Check your email to verify your address.';
      successEl.classList.remove('hidden');
      form.reset();
      pwStrength.className = 'pw-strength';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  });
});
