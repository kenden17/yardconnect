// public/js/dashboard.js — Student dashboard
document.addEventListener('DOMContentLoaded', async () => {

  const user = Auth.requireAuth();
  if (!user) return;

  // ── Header / sidebar ────────────────────────────────────
  document.getElementById('navName').textContent       = user.name.split(' ')[0];
  document.getElementById('sidebarName').textContent   = user.name;
  document.getElementById('welcomeName').textContent   = user.name.split(' ')[0];
  document.getElementById('sideAvatar').textContent    = user.name.charAt(0).toUpperCase();
  document.getElementById('settingsName').textContent  = user.name;
  document.getElementById('settingsEmail').textContent = user.email;

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('stripe') === 'success') {
    // Re-fetch user so has_stripe reflects the newly connected account
    try {
      const fresh = await API.me();
      Auth.setSession(localStorage.getItem('ch_token'), fresh.user);
      // Reload so the updated user object is used throughout the page
      window.history.replaceState({}, '', '/dashboard.html');
      window.location.reload();
      return;
    } catch (_) {}
    showAlert('✅ Payout account connected! You can now receive payments.');
  }
  if (urlParams.get('stripe') === 'refresh') showAlert('⚠️ Payout setup incomplete. Please try again.', 'error');

  // ── Payout warning banner ────────────────────────────────
  // Show a persistent top-of-page warning if no Stripe account
  if (!user.has_stripe) {
    const banner = document.createElement('div');
    banner.id = 'payoutWarningBanner';
    banner.style.cssText = [
      'background:#fef3c7', 'border-bottom:2px solid #f59e0b', 'padding:14px 24px',
      'display:flex', 'align-items:center', 'gap:14px', 'flex-wrap:wrap',
    ].join(';');
    banner.innerHTML = `
      <span style="font-size:1.3rem">⚠️</span>
      <div style="flex:1;min-width:200px">
        <strong style="color:#92400e">You won't get paid without a payout account.</strong>
        <span style="color:#78350f;font-size:.88rem;display:block;margin-top:2px">
          Set up your bank account now so earnings from completed tasks are sent to you automatically.
        </span>
      </div>
      <button class="btn btn--sm" id="bannerOnboardBtn"
        style="background:#f59e0b;color:#fff;border:none;flex-shrink:0">
        Set Up Payouts →
      </button>`;
    // Insert after the header
    document.querySelector('.dash-layout').prepend(banner);

    document.getElementById('bannerOnboardBtn').addEventListener('click', async () => {
      try {
        const { url } = await API.stripeOnboard();
        window.location.href = url;
      } catch (err) { Auth.toast(err.message, 'error'); }
    });
  }

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
  function showAlert(msg, type = 'success') {
    const el = document.getElementById('dashAlert');
    el.textContent = msg;
    el.className = `alert alert--${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 6000);
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function statusBadge(s) {
    const labels = {
      open:            'Open',
      assigned:        'Assigned',
      pending_payment: 'Payment Pending',
      active:          'In Progress',
      pending_review:  'Awaiting Review',
      completed:       'Completed',
      cancelled:       'Cancelled',
    };
    return `<span class="job-card__status status-${s}">${labels[s] || s}</span>`;
  }

  function fmtDate(dt) {
    return dt ? new Date(dt).toLocaleDateString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  }

  function starsHtml(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  // ── Rating modal ──────────────────────────────────────────
  let ratingModal = null;

  function openRatingModal(jobId, jobTitle) {
    // Remove old modal if exists
    document.getElementById('ratingModal')?.remove();

    const modal = document.createElement('div');
    modal.id        = 'ratingModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal__backdrop" id="ratingBackdrop"></div>
      <div class="modal__box" style="max-width:440px">
        <button class="modal__close" id="ratingClose">✕</button>
        <h2 class="modal__title">Rate this Task</h2>
        <p style="color:var(--text-mid);margin-bottom:20px;font-size:.9rem">${escHtml(jobTitle)}</p>
        <div class="star-picker" id="starPicker" role="group" aria-label="Star rating">
          ${[1,2,3,4,5].map(n => `
            <button type="button" class="star-btn" data-val="${n}" aria-label="${n} star${n>1?'s':''}">★</button>
          `).join('')}
        </div>
        <p class="star-hint" id="starHint">Tap to rate</p>
        <div class="form-group" style="margin-top:16px">
          <label for="ratingComment">Comment (optional)</label>
          <textarea id="ratingComment" rows="3" placeholder="How did it go? Any feedback for the poster?" maxlength="500"></textarea>
        </div>
        <div class="alert alert--error hidden" id="ratingError" role="alert"></div>
        <button class="btn btn--accent btn--full" id="submitRatingBtn" style="margin-top:12px" disabled>
          Submit Rating
        </button>
      </div>`;

    document.body.appendChild(modal);
    ratingModal = modal;

    let selectedStars = 0;
    const starBtns    = modal.querySelectorAll('.star-btn');
    const submitBtn   = modal.querySelector('#submitRatingBtn');
    const hint        = modal.querySelector('#starHint');
    const hints       = ['','Terrible','Poor','OK','Good','Excellent'];

    function highlightStars(n) {
      starBtns.forEach(b => {
        const v = parseInt(b.dataset.val);
        b.classList.toggle('active', v <= n);
      });
    }

    starBtns.forEach(btn => {
      btn.addEventListener('mouseenter', () => highlightStars(parseInt(btn.dataset.val)));
      btn.addEventListener('mouseleave', () => highlightStars(selectedStars));
      btn.addEventListener('click', () => {
        selectedStars    = parseInt(btn.dataset.val);
        hint.textContent = hints[selectedStars];
        submitBtn.disabled = false;
        highlightStars(selectedStars);
      });
    });

    submitBtn.addEventListener('click', async () => {
      if (!selectedStars) return;
      submitBtn.disabled    = true;
      submitBtn.textContent = 'Submitting…';
      const comment = modal.querySelector('#ratingComment').value.trim();
      try {
        await API.rateJob(jobId, { stars: selectedStars, comment });
        modal.remove();
        showAlert('⭐ Rating submitted. Thanks!');
        loadMyJobs();
      } catch (err) {
        modal.querySelector('#ratingError').textContent = err.message;
        modal.querySelector('#ratingError').classList.remove('hidden');
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Submit Rating';
      }
    });

    modal.querySelector('#ratingClose').addEventListener('click',   () => modal.remove());
    modal.querySelector('#ratingBackdrop').addEventListener('click', () => modal.remove());
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

      // Show student's own rating
      const myRating = user.avg_rating
        ? `${starsHtml(Math.round(user.avg_rating))} <span style="font-size:.85rem;color:var(--dim)">${user.avg_rating} (${user.rating_count})</span>`
        : '<span style="color:var(--dim);font-size:.85rem">No ratings yet</span>';

      cardsEl.innerHTML = `
        <div class="ov-card"><div class="ov-card__num">${jobs.length}</div><div class="ov-card__label">Total Applied</div></div>
        <div class="ov-card"><div class="ov-card__num">${pending}</div><div class="ov-card__label">Pending</div></div>
        <div class="ov-card"><div class="ov-card__num">${accepted}</div><div class="ov-card__label">Accepted</div></div>
        <div class="ov-card"><div class="ov-card__num">${completed}</div><div class="ov-card__label">Completed</div></div>
        <div class="ov-card"><div class="ov-card__num" style="font-size:1.4rem;color:var(--warn)">${myRating}</div><div class="ov-card__label">Your Rating</div></div>
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
        <div class="job-card" id="jcard-${j.id}" style="margin-bottom:12px">
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
              <span class="job-card__status" style="background:var(--blue-l);color:var(--blue);border:1px solid #bfdbfe">
                App: ${j.application_status}
              </span>
            </div>
          </div>

          ${j.application_status === 'accepted' && j.status === 'assigned' ? `
            <div style="margin-top:10px;padding:10px;background:var(--success-l);
                 border:1px solid #bbf7d0;border-radius:4px;font-size:.85rem;color:var(--success)">
              ✅ You've been accepted! The poster will contact you to coordinate.
              ${j.address ? `<br/><span style="color:var(--text-mid)">📍 ${escHtml(j.address)}</span>` : ''}
            </div>
            ${!user.has_stripe ? `
            <div style="margin-top:6px;padding:10px;background:#fef3c7;border:1px solid #f59e0b;
                 border-radius:4px;font-size:.84rem;color:#92400e">
              ⚠️ <strong>Set up your payout account before work begins</strong> or you won't receive payment.
              <br/><button class="btn btn--sm" style="margin-top:6px;background:#f59e0b;color:#fff;border:none"
                onclick="document.getElementById('stripeOnboardBtn').click()">Set Up Payouts →</button>
            </div>` : ''}` : ''}

          ${j.status === 'pending_payment' ? `
            <div style="margin-top:10px;padding:10px;background:var(--warn-l);
                 border:1px solid #fde68a;border-radius:4px;font-size:.85rem;color:var(--warn)">
              ⏳ The poster is processing payment. Work begins once payment is confirmed.
            </div>
            ${!user.has_stripe ? `
            <div style="margin-top:6px;padding:10px;background:#fef3c7;border:1px solid #f59e0b;
                 border-radius:4px;font-size:.84rem;color:#92400e">
              ⚠️ <strong>No payout account found.</strong> Set one up now — payment is being processed and
              you need an account to receive your earnings.
              <br/><button class="btn btn--sm" style="margin-top:6px;background:#f59e0b;color:#fff;border:none"
                onclick="document.getElementById('stripeOnboardBtn').click()">Set Up Payouts →</button>
            </div>` : ''}` : ''}

          ${j.status === 'active' ? `
            <div style="margin-top:10px;padding:10px;background:var(--blue-l);
                 border:1px solid #bfdbfe;border-radius:4px;font-size:.85rem;color:#1d4ed8">
              🚀 Work is in progress! Complete the task, then the poster will release payment.
              ${j.address ? `<br/><span style="color:var(--dim)">📍 ${escHtml(j.address)}</span>` : ''}
            </div>
            ${!user.has_stripe ? `
            <div style="margin-top:6px;padding:10px;background:#fef3c7;border:1px solid #f59e0b;
                 border-radius:4px;font-size:.84rem;color:#92400e">
              ⚠️ <strong>You still don't have a payout account.</strong> Set one up before the poster
              marks the job complete — otherwise your payment can't be sent automatically.
              <br/><button class="btn btn--sm" style="margin-top:6px;background:#f59e0b;color:#fff;border:none"
                onclick="document.getElementById('stripeOnboardBtn').click()">Set Up Payouts →</button>
            </div>` : ''}` : ''}

          ${j.status === 'pending_review' && !j.student_rated_poster ? `
            <div style="margin-top:12px">
              <p style="font-size:.85rem;color:var(--text-mid);margin-bottom:8px">
                🎉 Task complete! Leave a rating for the poster.
              </p>
              <button class="btn btn--accent btn--sm rate-btn" data-id="${j.id}" data-title="${escHtml(j.title)}">
                ⭐ Rate Poster
              </button>
            </div>` : ''}

          ${j.status === 'completed' ? `
            <div style="margin-top:8px;font-size:.82rem;color:var(--text-mid)">
              ✅ Completed on ${fmtDate(j.created_at)}
            </div>` : ''}
        </div>`).join('');

      // Bind rate buttons
      list.querySelectorAll('.rate-btn').forEach(btn => {
        btn.addEventListener('click', () => openRatingModal(btn.dataset.id, btn.dataset.title));
      });

    } catch (err) {
      list.innerHTML = `<div class="empty-state"><p>${escHtml(err.message)}</p></div>`;
    }
  }

  // ── Payments / Earnings ──────────────────────────────────
  async function loadPayments() {
    const onboardSection = document.getElementById('stripeOnboardSection');
    const txList         = document.getElementById('txList');

    if (!user.has_stripe) {
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
    } catch (err) { Auth.toast(err.message, 'error'); }
  });

  loadOverview();
});
