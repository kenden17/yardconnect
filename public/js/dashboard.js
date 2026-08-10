// public/js/dashboard.js
document.addEventListener('DOMContentLoaded', async () => {

  const user = Auth.requireAuth();
  if (!user) return;

  // ── Populate user info ───────────────────────────────────
  const firstName = user.name.split(' ')[0];
  document.getElementById('navName').textContent       = firstName;
  document.getElementById('sidebarName').textContent   = user.name;
  document.getElementById('welcomeName').textContent   = firstName;
  document.getElementById('settingsName').textContent  = user.name;
  document.getElementById('settingsEmail').textContent = user.email;
  const initial = user.name.charAt(0).toUpperCase();
  document.getElementById('sideAvatar').textContent    = initial;
  document.getElementById('settingsAvatar').textContent = initial;

  // ── Mobile sidebar toggle ────────────────────────────────
  const toggleBtn = document.getElementById('sidebarToggle');
  const sidebar   = document.getElementById('dashSidebar');
  toggleBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    toggleBtn.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
      sidebar.classList.remove('open');
      toggleBtn.classList.remove('open');
    }
  });

  // ── Panel navigation ─────────────────────────────────────
  const navBtns = document.querySelectorAll('.dash-nav-btn');
  const panels  = document.querySelectorAll('.dash-panel');

  function showPanel(name) {
    panels.forEach(p  => p.classList.toggle('active', p.id === `panel-${name}`));
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.panel === name));
    if (name === 'overview')     loadOverview();
    if (name === 'applications') loadMyJobs();
    if (name === 'payments')     loadPayments();
    if (name === 'settings')     loadSettings();
    // Close mobile sidebar after nav
    sidebar.classList.remove('open');
    toggleBtn?.classList.remove('open');
  }

  navBtns.forEach(btn => btn.addEventListener('click', () => showPanel(btn.dataset.panel)));

  // ── Helpers ──────────────────────────────────────────────
  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtDate(dt) {
    return dt ? new Date(dt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
  }

  function starsHtml(n) {
    n = Math.max(0, Math.min(5, Math.round(n)));
    return '<span class="stars-gold">' + '★'.repeat(n) + '</span>' + '☆'.repeat(5 - n);
  }

  function statusBadge(s) {
    const labels = {
      open:'Open', assigned:'Assigned', pending_payment:'Payment Pending',
      active:'In Progress', pending_review:'Awaiting Review',
      completed:'Completed', cancelled:'Cancelled',
    };
    return `<span class="badge-status badge-status--${s}">${labels[s] || s}</span>`;
  }

  function appBadge(s) {
    const map = { pending:'Pending', accepted:'Accepted', rejected:'Declined' };
    return `<span class="badge-status badge-status--app-${s}">${map[s] || s}</span>`;
  }

  // ── Rating modal ─────────────────────────────────────────
  function openRatingModal(jobId, jobTitle) {
    document.getElementById('ratingModal')?.remove();
    const modal = document.createElement('div');
    modal.id        = 'ratingModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal__backdrop"></div>
      <div class="modal__box" style="max-width:420px">
        <button class="modal__close" aria-label="Close">✕</button>
        <h2 class="modal__title">Rate this Task</h2>
        <p class="text-dim" style="margin-bottom:20px;font-size:.9rem">${escHtml(jobTitle)}</p>
        <div class="star-picker" role="group" aria-label="Star rating">
          ${[1,2,3,4,5].map(n => `<button type="button" class="star-btn" data-val="${n}" aria-label="${n} star${n>1?'s':''}">★</button>`).join('')}
        </div>
        <p class="star-hint" id="starHint">Tap to rate</p>
        <div class="form-group" style="margin-top:16px">
          <label for="ratingComment">Comment <span style="font-weight:400;color:var(--dim)">(optional)</span></label>
          <textarea id="ratingComment" rows="3" placeholder="How did it go?" maxlength="500"></textarea>
        </div>
        <div class="alert alert--error hidden" id="ratingError" role="alert"></div>
        <button class="btn btn--accent btn--full" id="submitRatingBtn" style="margin-top:16px" disabled>Submit Rating</button>
      </div>`;
    document.body.appendChild(modal);

    let selected = 0;
    const starBtns  = modal.querySelectorAll('.star-btn');
    const submitBtn = modal.querySelector('#submitRatingBtn');
    const hint      = modal.querySelector('#starHint');
    const hints     = ['','Terrible','Poor','OK','Good','Excellent'];

    const highlight = n => starBtns.forEach(b => b.classList.toggle('active', +b.dataset.val <= n));
    starBtns.forEach(btn => {
      btn.addEventListener('mouseenter', () => highlight(+btn.dataset.val));
      btn.addEventListener('mouseleave', () => highlight(selected));
      btn.addEventListener('click', () => {
        selected = +btn.dataset.val;
        hint.textContent = hints[selected];
        submitBtn.disabled = false;
        highlight(selected);
      });
    });

    submitBtn.addEventListener('click', async () => {
      if (!selected) return;
      submitBtn.disabled = true; submitBtn.textContent = 'Submitting…';
      try {
        await API.rateJob(jobId, { stars: selected, comment: modal.querySelector('#ratingComment').value.trim() });
        modal.remove();
        Auth.toast('⭐ Rating submitted. Thanks!');
        loadMyJobs();
      } catch (err) {
        modal.querySelector('#ratingError').textContent = err.message;
        modal.querySelector('#ratingError').classList.remove('hidden');
        submitBtn.disabled = false; submitBtn.textContent = 'Submit Rating';
      }
    });
    modal.querySelector('.modal__close').addEventListener('click',   () => modal.remove());
    modal.querySelector('.modal__backdrop').addEventListener('click', () => modal.remove());
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
      const rating    = user.avg_rating
        ? `${starsHtml(user.avg_rating)} <small>${user.avg_rating} (${user.rating_count})</small>`
        : '<small class="text-dim">No ratings yet</small>';

      cardsEl.innerHTML = `
        <div class="ov-card"><div class="ov-card__num">${jobs.length}</div><div class="ov-card__label">Total Applied</div></div>
        <div class="ov-card"><div class="ov-card__num">${pending}</div><div class="ov-card__label">Pending</div></div>
        <div class="ov-card"><div class="ov-card__num">${accepted}</div><div class="ov-card__label">Accepted</div></div>
        <div class="ov-card"><div class="ov-card__num">${completed}</div><div class="ov-card__label">Completed</div></div>
        <div class="ov-card"><div class="ov-card__num ov-rating">${rating}</div><div class="ov-card__label">Your Rating</div></div>`;

      if (!jobs.length) {
        recentEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-state__icon">📋</div>
            <h3>No applications yet</h3>
            <p>Find tasks near you and start earning.</p>
            <a href="/#tasks" class="btn btn--accent" style="margin-top:16px">Browse Tasks →</a>
          </div>`;
        return;
      }

      recentEl.innerHTML = jobs.slice(0, 4).map(j => jobCardHtml(j)).join('');
      recentEl.querySelectorAll('.rate-btn').forEach(btn => {
        btn.addEventListener('click', () => openRatingModal(btn.dataset.id, btn.dataset.title));
      });
    } catch (err) {
      cardsEl.innerHTML = `<div class="empty-state"><p>${escHtml(err.message)}</p></div>`;
    }
  }

  // ── Shared job card renderer ──────────────────────────────
  function jobCardHtml(j) {
    const statusNote = (() => {
      if (j.application_status === 'accepted' && j.status === 'assigned')
        return `<div class="job-status-note job-status-note--success">
          ✅ You've been accepted! The poster will contact you to coordinate.
          ${j.address ? `<div class="job-status-note__detail">📍 ${escHtml(j.address)}</div>` : ''}
        </div>`;
      if (j.status === 'pending_payment')
        return `<div class="job-status-note job-status-note--warn">
          ⏳ The poster is processing payment. Work begins once confirmed.
        </div>`;
      if (j.status === 'active')
        return `<div class="job-status-note job-status-note--info">
          🚀 Work is in progress! Complete the task and the poster will release payment.
          ${j.address ? `<div class="job-status-note__detail">📍 ${escHtml(j.address)}</div>` : ''}
        </div>`;
      if (j.status === 'pending_review' && !j.student_rated_poster)
        return `<div class="job-status-note job-status-note--success">
          🎉 Task complete! Leave a rating for the poster.
          <button class="btn btn--accent btn--xs rate-btn" data-id="${j.id}" data-title="${escHtml(j.title)}" style="margin-left:10px">⭐ Rate</button>
        </div>`;
      if (j.status === 'completed')
        return `<div class="job-status-note job-status-note--dim">✅ Completed ${fmtDate(j.created_at)}</div>`;
      return '';
    })();

    return `
      <div class="app-job-card" id="jcard-${escHtml(j.id)}">
        <div class="app-job-card__header">
          <div class="app-job-card__left">
            <span class="job-card__cat">${escHtml(j.category)}</span>
            <h3 class="app-job-card__title">${escHtml(j.title)}</h3>
            <p class="app-job-card__meta">📍 ${escHtml(j.city)}, ${escHtml(j.state)} · ${escHtml(j.poster_name)} · ${fmtDate(j.created_at)}</p>
          </div>
          <div class="app-job-card__right">
            <span class="app-job-card__pay">$${parseFloat(j.pay).toFixed(2)}</span>
            ${statusBadge(j.status)}
            ${appBadge(j.application_status)}
          </div>
        </div>
        ${statusNote}
      </div>`;
  }

  // ── My Applications ──────────────────────────────────────
  async function loadMyJobs() {
    const list = document.getElementById('myJobsList');
    list.innerHTML = '<div class="loading-state">Loading…</div>';
    try {
      const { jobs } = await API.myJobsStudent();
      if (!jobs.length) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state__icon">🔍</div>
            <h3>No applications yet</h3>
            <p>Browse open tasks and start applying to earn.</p>
            <a href="/#tasks" class="btn btn--accent" style="margin-top:16px">Browse Tasks →</a>
          </div>`;
        return;
      }
      list.innerHTML = jobs.map(j => jobCardHtml(j)).join('');
      list.querySelectorAll('.rate-btn').forEach(btn => {
        btn.addEventListener('click', () => openRatingModal(btn.dataset.id, btn.dataset.title));
      });
    } catch (err) {
      list.innerHTML = `<div class="empty-state"><p>${escHtml(err.message)}</p></div>`;
    }
  }

  // ── Earnings ─────────────────────────────────────────────
  async function loadPayments() {
    const txList = document.getElementById('txList');
    txList.innerHTML = '<div class="loading-state">Loading…</div>';
    try {
      const { jobs } = await API.paymentHistory();
      if (!jobs.length) {
        txList.innerHTML = `
          <div class="empty-state">
            <div class="empty-state__icon">💰</div>
            <h3>No earnings yet</h3>
            <p>Complete a task to get paid.</p>
          </div>`;
        return;
      }
      txList.innerHTML = `
        <div class="tx-list">
          ${jobs.map(j => `
            <div class="tx-row">
              <div class="tx-info">
                <h4>${escHtml(j.title)}</h4>
                <p>Posted by ${escHtml(j.poster_name)} · ${fmtDate(j.created_at)}</p>
              </div>
              <div class="tx-right">
                <span class="tx-amount">$${parseFloat(j.pay).toFixed(2)}</span>
                <span class="tx-status">${escHtml(j.status)}</span>
              </div>
            </div>`).join('')}
        </div>`;
    } catch (err) {
      txList.innerHTML = `<div class="empty-state"><p>${escHtml(err.message)}</p></div>`;
    }
  }

  // ── Settings ─────────────────────────────────────────────
  function loadSettings() {
    // Settings panel — no payout info needed
  }

  // ── Init ─────────────────────────────────────────────────
  loadOverview();
});
