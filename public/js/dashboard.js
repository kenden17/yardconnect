// public/js/dashboard.js — Student dashboard
document.addEventListener('DOMContentLoaded', async () => {

  // ── Handle email verification redirect ──────────────────
  // When a student clicks the verification link they land here with
  // ?verified=1&token=... — we store the token so they're logged in.
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('verified') === '1' && urlParams.get('token')) {
    const token = urlParams.get('token');
    try {
      // Store token first, then fetch user info
      localStorage.setItem('ch_token', token);
      const { user } = await API.me();
      Auth.setSession(token, user);
      // Clean the URL
      history.replaceState({}, '', '/dashboard.html');
      showAlert('🎉 Email verified! Welcome to Campus Hands.');
    } catch (_) {
      localStorage.removeItem('ch_token');
      window.location.href = '/login.html';
      return;
    }
  }

  const user = Auth.requireAuth();
  if (!user) return;

  // ── Header / sidebar ────────────────────────────────────
  document.getElementById('navName').textContent     = user.name.split(' ')[0];
  document.getElementById('sidebarName').textContent = user.name;
  document.getElementById('welcomeName').textContent = user.name.split(' ')[0];
  document.getElementById('sideAvatar').textContent  = user.name.charAt(0).toUpperCase();
  document.getElementById('settingsName').textContent  = user.name;
  document.getElementById('settingsEmail').textContent = user.email;

  // Stripe onboarding success
  if (urlParams.get('stripe') === 'success') showAlert('✅ Payout account connected!');

  // ── Panel nav ────────────────────────────────────────────
  const navBtns = document.querySelectorAll('.dash-nav-btn');
  const panels  = document.querySelectorAll('.dash-panel');

  function showPanel(name) {
    panels.forEach(p  => p.classList.toggle('active', p.id === `panel-${name}`));
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.panel === name));
    if (name === 'overview')     loadOverview();
    if (name === 'applications') loadMyJobs();
    if (name === 'payments')     loadPayments();
  }

  navBtns.forEach(btn => btn.addEventListener('click', () => showPanel(btn.dataset.panel)));

  // ── Helpers ──────────────────────────────────────────────
  function showAlert(msg) {
    const el = document.getElementById('dashAlert');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 6000);
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function statusBadge(s) {
    return `<span class="job-card__status status-${s}">${s}</span>`;
  }

  function fmtDate(dt) {
    return dt ? new Date(dt).toLocaleDateString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  }

  // ── Overview ─────────────────────────────────────────────
  async function loadOverview() {
    const cardsEl  = document.getElementById('overviewCards');
    const recentEl = document.getElementById('recentJobs');
    try {
      const { jobs } = await API.myJobsStudent();
      const pending   = jobs.filter(j => j.application_status === 'pending').length;
      const accepted  = jobs.filter(j => j.application_status === 'accepted').length;
      const completed = jobs.filter(j => j.status === 'completed').length;

      cardsEl.innerHTML = `
        <div class="ov-card"><div class="ov-card__num">${jobs.length}</div><div class="ov-card__label">Total Applied</div></div>
        <div class="ov-card"><div class="ov-card__num">${pending}</div><div class="ov-card__label">Pending</div></div>
        <div class="ov-card"><div class="ov-card__num">${accepted}</div><div class="ov-card__label">Accepted</div></div>
        <div class="ov-card"><div class="ov-card__num">${completed}</div><div class="ov-card__label">Completed</div></div>
      `;

      const recent = jobs.slice(0, 4);
      if (!recent.length) {
        recentEl.innerHTML = `<div class="empty-state">
          <p>No applications yet.</p>
          <a href="/#tasks" class="btn btn--accent" style="margin-top:12px">Browse Tasks →</a>
        </div>`;
        return;
      }

      recentEl.innerHTML = recent.map(j => `
        <div class="job-card" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <div>
              <div class="job-card__cat">${escHtml(j.category)}</div>
              <div class="job-card__title">${escHtml(j.title)}</div>
              <div class="text-dim" style="font-size:.8rem;margin-top:4px">
                ${escHtml(j.city)}, ${escHtml(j.state)} · ${fmtDate(j.created_at)}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <div class="job-card__pay">$${parseFloat(j.pay).toFixed(2)}</div>
              ${statusBadge(j.status)}
              <span class="job-card__status" style="background:rgba(59,130,246,.15);color:#93c5fd">
                ${j.application_status}
              </span>
            </div>
          </div>
        </div>`).join('');
    } catch (err) {
      cardsEl.innerHTML = `<div class="empty-state"><p>${escHtml(err.message)}</p></div>`;
    }
  }

  // ── My Applications ──────────────────────────────────────
  async function loadMyJobs() {
    const list = document.getElementById('myJobsList');
    list.innerHTML = '<div class="loading-state">Loading…</div>';
    try {
      const { jobs } = await API.myJobsStudent();
      if (!jobs.length) {
        list.innerHTML = `<div class="empty-state">
          <h3>No applications yet</h3>
          <p>Browse open tasks and start applying to earn.</p>
          <a href="/#tasks" class="btn btn--accent" style="margin-top:14px">Browse Tasks →</a>
        </div>`;
        return;
      }

      list.innerHTML = jobs.map(j => `
        <div class="job-card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div>
              <div class="job-card__cat">${escHtml(j.category)}</div>
              <div class="job-card__title">${escHtml(j.title)}</div>
              <div class="text-dim" style="font-size:.8rem;margin-top:4px">
                ${escHtml(j.city)}, ${escHtml(j.state)} · Posted by ${escHtml(j.poster_name)}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <div class="job-card__pay">$${parseFloat(j.pay).toFixed(2)}</div>
              ${statusBadge(j.status)}
              <span class="job-card__status" style="background:rgba(59,130,246,.15);color:#93c5fd">
                App: ${j.application_status}
              </span>
            </div>
          </div>
          ${j.application_status === 'accepted' ? `
            <div style="margin-top:10px;padding:10px;background:rgba(34,197,94,.08);
                 border:1px solid rgba(34,197,94,.2);border-radius:4px;font-size:.85rem">
              ✅ You've been accepted! The task poster will contact you to coordinate.
            </div>` : ''}
        </div>`).join('');
    } catch (err) {
      list.innerHTML = `<div class="empty-state"><p>${escHtml(err.message)}</p></div>`;
    }
  }

  // ── Payments / Earnings ──────────────────────────────────
  async function loadPayments() {
    const onboardSection = document.getElementById('stripeOnboardSection');
    const txList         = document.getElementById('txList');

    // Show onboarding if student hasn't set up payouts
    if (!user.stripe_account_id) {
      onboardSection.classList.remove('hidden');
    }

    txList.innerHTML = '<div class="loading-state">Loading…</div>';
    try {
      const { transactions } = await API.paymentHistory();
      if (!transactions.length) {
        txList.innerHTML = '<div class="empty-state"><p>No earnings yet. Complete a task to get paid.</p></div>';
        return;
      }

      let totalEarned = 0;
      transactions.forEach(t => { if (t.status === 'paid') totalEarned += t.student_payout; });

      txList.innerHTML = `
        <div class="ov-card" style="margin-bottom:20px;max-width:220px">
          <div class="ov-card__num">$${totalEarned.toFixed(2)}</div>
          <div class="ov-card__label">Total Earned</div>
        </div>
        ${transactions.map(t => `
          <div class="tx-row">
            <div class="tx-info">
              <h4>${escHtml(t.job_title)}</h4>
              <p>Posted by ${escHtml(t.poster_name)} · ${fmtDate(t.created_at)}</p>
            </div>
            <div style="display:flex;align-items:center;gap:16px">
              <span class="tx-amount">$${t.student_payout.toFixed(2)}</span>
              <span class="tx-status tx-${t.status}">${t.status}</span>
            </div>
          </div>`).join('')}
      `;
    } catch (err) {
      txList.innerHTML = `<div class="empty-state"><p>${escHtml(err.message)}</p></div>`;
    }
  }

  document.getElementById('stripeOnboardBtn')?.addEventListener('click', async () => {
    try {
      const { url } = await API.stripeOnboard();
      window.location.href = url;
    } catch (err) { alert(err.message); }
  });

  // ── Initial load ─────────────────────────────────────────
  loadOverview();
});
