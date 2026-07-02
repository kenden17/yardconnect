// public/js/dashboard.js
document.addEventListener('DOMContentLoaded', async () => {
  const user = Auth.requireAuth();
  if (!user) return;

  // ── Populate header / sidebar ──────────────────────────
  document.getElementById('navName').textContent     = user.name.split(' ')[0];
  document.getElementById('sidebarName').textContent = user.name;
  document.getElementById('sidebarRole').textContent = user.role;
  document.getElementById('welcomeName').textContent = user.name.split(' ')[0];
  document.getElementById('sideAvatar').textContent  = user.name.charAt(0).toUpperCase();

  document.getElementById('settingsName').textContent  = user.name;
  document.getElementById('settingsEmail').textContent = user.email;
  document.getElementById('settingsRole').textContent  = user.role;

  // Show/hide homeowner-only nav items
  if (user.role === 'homeowner') {
    document.getElementById('navPost').style.display = '';
  }

  // ── Panel navigation ───────────────────────────────────
  const navBtns = document.querySelectorAll('.dash-nav-btn');
  const panels  = document.querySelectorAll('.dash-panel');

  function showPanel(name) {
    panels.forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.panel === name));
    if (name === 'jobs')     loadMyJobs();
    if (name === 'overview') loadOverview();
    if (name === 'payments') loadPayments();
  }

  navBtns.forEach(btn => btn.addEventListener('click', () => showPanel(btn.dataset.panel)));

  // Check URL param for stripe onboarding return
  const params = new URLSearchParams(window.location.search);
  if (params.get('stripe') === 'success') showAlert('✅ Payout account connected!');

  // ── Helpers ────────────────────────────────────────────
  function showAlert(msg) {
    const el = document.getElementById('dashAlert');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function statusBadge(s) {
    return `<span class="job-card__status status-${s}">${s}</span>`;
  }

  function fmtDate(dt) {
    return dt ? new Date(dt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
  }

  // ── Overview ───────────────────────────────────────────
  async function loadOverview() {
    const cardsEl  = document.getElementById('overviewCards');
    const recentEl = document.getElementById('recentJobs');
    try {
      let jobs, stats;
      if (user.role === 'homeowner') {
        const r = await API.myJobsHomeowner();
        jobs = r.jobs;
        const open      = jobs.filter(j => j.status === 'open').length;
        const assigned  = jobs.filter(j => j.status === 'assigned').length;
        const completed = jobs.filter(j => j.status === 'completed').length;
        cardsEl.innerHTML = `
          <div class="ov-card"><div class="ov-card__num">${jobs.length}</div><div class="ov-card__label">Total Jobs Posted</div></div>
          <div class="ov-card"><div class="ov-card__num">${open}</div><div class="ov-card__label">Open</div></div>
          <div class="ov-card"><div class="ov-card__num">${assigned}</div><div class="ov-card__label">In Progress</div></div>
          <div class="ov-card"><div class="ov-card__num">${completed}</div><div class="ov-card__label">Completed</div></div>`;
      } else {
        const r = await API.myJobsStudent();
        jobs = r.jobs;
        const pending   = jobs.filter(j => j.application_status === 'pending').length;
        const accepted  = jobs.filter(j => j.application_status === 'accepted').length;
        const completed = jobs.filter(j => j.status === 'completed').length;
        cardsEl.innerHTML = `
          <div class="ov-card"><div class="ov-card__num">${jobs.length}</div><div class="ov-card__label">Applications</div></div>
          <div class="ov-card"><div class="ov-card__num">${pending}</div><div class="ov-card__label">Pending</div></div>
          <div class="ov-card"><div class="ov-card__num">${accepted}</div><div class="ov-card__label">Accepted</div></div>
          <div class="ov-card"><div class="ov-card__num">${completed}</div><div class="ov-card__label">Completed</div></div>`;
      }

      const recent = jobs.slice(0, 4);
      if (recent.length === 0) {
        recentEl.innerHTML = '<div class="empty-state"><p>No activity yet.</p></div>';
        return;
      }
      recentEl.innerHTML = recent.map(j => `
        <div class="job-card" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:8px">
            <div>
              <div class="job-card__cat">${escHtml(j.category)}</div>
              <div class="job-card__title">${escHtml(j.title)}</div>
              <div class="text-dim" style="font-size:.8rem;margin-top:4px">${escHtml(j.city)}, ${escHtml(j.state)} · ${fmtDate(j.created_at)}</div>
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

  // ── My Jobs ────────────────────────────────────────────
  async function loadMyJobs() {
    const list = document.getElementById('myJobsList');
    list.innerHTML = '<div class="loading-state">Loading…</div>';
    try {
      let jobs;
      if (user.role === 'homeowner') {
        const r = await API.myJobsHomeowner();
        jobs = r.jobs;
        if (!jobs.length) {
          list.innerHTML = `<div class="empty-state">
            <h3>No jobs posted yet</h3>
            <p>Post your first job to start getting applicants.</p>
            <button class="btn btn--accent" style="margin-top:14px" onclick="document.querySelector('[data-panel=post]').click()">Post a Job</button>
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
                  ${escHtml(j.address)}, ${escHtml(j.city)}, ${escHtml(j.state)} ${escHtml(j.zip)} · Posted ${fmtDate(j.created_at)}
                </div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
                <div class="job-card__pay">$${parseFloat(j.pay).toFixed(2)}</div>
                ${statusBadge(j.status)}
              </div>
            </div>
            <div class="job-card__actions" style="margin-top:12px;flex-wrap:wrap">
              ${j.status === 'open' ? `
                <button class="btn btn--ghost btn--sm view-apps-btn" data-id="${j.id}" data-title="${escHtml(j.title)}">
                  View Applicants ${j.app_count > 0 ? `<span style="background:var(--accent);color:var(--black);border-radius:10px;padding:1px 7px;font-size:.72rem">${j.app_count}</span>` : ''}
                </button>
                <button class="btn btn--outline btn--sm cancel-job-btn" data-id="${j.id}">Cancel</button>` : ''}
              ${j.status === 'assigned' ? `
                <button class="btn btn--accent btn--sm pay-job-btn" data-id="${j.id}" data-title="${escHtml(j.title)}">
                  Release Payment
                </button>` : ''}
            </div>
          </div>`).join('');

        list.querySelectorAll('.view-apps-btn').forEach(btn => {
          btn.addEventListener('click', () => openAppsModal(btn.dataset.id, btn.dataset.title));
        });
        list.querySelectorAll('.cancel-job-btn').forEach(btn => {
          btn.addEventListener('click', () => cancelJob(btn.dataset.id));
        });
        list.querySelectorAll('.pay-job-btn').forEach(btn => {
          btn.addEventListener('click', () => openPayModal(btn.dataset.id, btn.dataset.title));
        });

      } else {
        // Student
        const r = await API.myJobsStudent();
        jobs = r.jobs;
        if (!jobs.length) {
          list.innerHTML = `<div class="empty-state">
            <h3>No applications yet</h3>
            <p>Browse open jobs and apply to start earning.</p>
            <a href="/#jobs" class="btn btn--accent" style="margin-top:14px">Browse Jobs →</a>
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
                  ${escHtml(j.city)}, ${escHtml(j.state)} · by ${escHtml(j.homeowner_name)}
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
          </div>`).join('');
      }
    } catch (err) {
      list.innerHTML = `<div class="empty-state"><p>${escHtml(err.message)}</p></div>`;
    }
  }

  // ── Cancel job ─────────────────────────────────────────
  async function cancelJob(id) {
    if (!confirm('Cancel this job? This cannot be undone.')) return;
    try {
      await API.cancelJob(id);
      showAlert('Job cancelled.');
      loadMyJobs();
    } catch (err) { alert(err.message); }
  }

  // ── Applicants Modal ───────────────────────────────────
  const appsModal    = document.getElementById('appsModal');
  const appsClose    = document.getElementById('appsClose');
  const appsBackdrop = document.getElementById('appsBackdrop');

  async function openAppsModal(jobId, jobTitle) {
    document.getElementById('modalJobTitle').textContent = jobTitle;
    const list = document.getElementById('appsList');
    list.innerHTML = '<div class="loading-state">Loading…</div>';
    appsModal.classList.remove('hidden');

    try {
      const { applications } = await API.getApplicants(jobId);
      if (!applications.length) {
        list.innerHTML = '<p class="text-dim">No applicants yet.</p>';
        return;
      }
      list.innerHTML = applications.map(a => `
        <div class="app-card" id="app-${a.id}">
          <h4>${escHtml(a.student_name)}</h4>
          <p style="font-size:.78rem;color:var(--dim)">${escHtml(a.student_email)}</p>
          ${a.message ? `<p>${escHtml(a.message)}</p>` : '<p class="text-dim">No message provided.</p>'}
          ${a.status === 'pending' ? `
            <div class="app-actions">
              <button class="btn btn--accent btn--sm accept-btn" data-id="${a.id}">Accept</button>
              <button class="btn btn--danger btn--sm reject-btn" data-id="${a.id}">Reject</button>
            </div>` : `
            <span class="job-card__status ${a.status === 'accepted' ? 'status-assigned' : 'status-cancelled'}">${a.status}</span>`
          }
        </div>`).join('');

      list.querySelectorAll('.accept-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true; btn.textContent = 'Accepting…';
          try {
            const r = await API.acceptApp(btn.dataset.id);
            showAlert(r.message);
            appsModal.classList.add('hidden');
            loadMyJobs();
          } catch (err) { alert(err.message); btn.disabled = false; btn.textContent = 'Accept'; }
        });
      });
      list.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await API.rejectApp(btn.dataset.id);
            document.getElementById(`app-${btn.dataset.id}`)
              .querySelector('.app-actions').innerHTML =
              '<span class="job-card__status status-cancelled">Rejected</span>';
          } catch (err) { alert(err.message); btn.disabled = false; }
        });
      });
    } catch (err) {
      list.innerHTML = `<p class="text-dim">${escHtml(err.message)}</p>`;
    }
  }

  [appsClose, appsBackdrop].forEach(el => el?.addEventListener('click', () => appsModal.classList.add('hidden')));

  // ── Payment Modal ──────────────────────────────────────
  const payModal    = document.getElementById('payModal');
  const payClose    = document.getElementById('payClose');
  const payBackdrop = document.getElementById('payBackdrop');
  const paySubmit   = document.getElementById('paySubmitBtn');
  const payError    = document.getElementById('payError');
  let stripeInstance = null, cardElement = null, currentPayIntent = null;

  async function openPayModal(jobId, jobTitle) {
    payError.classList.add('hidden');
    document.getElementById('payDetails').innerHTML = '<div class="loading-state">Loading…</div>';
    document.getElementById('stripeCardEl').innerHTML = '';
    payModal.classList.remove('hidden');

    try {
      const data = await API.createPaymentIntent(jobId);
      currentPayIntent = { id: data.transactionId, intentSecret: data.clientSecret, jobId };

      document.getElementById('payDetails').innerHTML = `
        <div class="info-card">
          <h3>${escHtml(jobTitle)}</h3>
          <p>Job pay: <strong>$${data.amount.toFixed(2)}</strong></p>
          <p>Platform fee (5%): <strong>-$${data.platformFee.toFixed(2)}</strong></p>
          <p>Student receives: <strong style="color:var(--accent)">$${data.studentPayout.toFixed(2)}</strong></p>
        </div>`;

      if (data.publishableKey && typeof Stripe !== 'undefined') {
        stripeInstance = Stripe(data.publishableKey);
        const elements = stripeInstance.elements();
        cardElement = elements.create('card', {
          style: {
            base: { color: '#f5f5f0', fontFamily: 'Inter, sans-serif', fontSize: '15px',
                    '::placeholder': { color: 'rgba(245,245,240,.35)' } },
          },
        });
        cardElement.mount('#stripeCardEl');
      } else {
        document.getElementById('stripeCardEl').innerHTML =
          '<p class="text-dim" style="margin-top:12px">⚠️ Stripe not configured. Add keys to .env to enable real payments.</p>';
      }
    } catch (err) {
      document.getElementById('payDetails').innerHTML = '';
      payError.textContent = err.message;
      payError.classList.remove('hidden');
    }
  }

  paySubmit?.addEventListener('click', async () => {
    if (!currentPayIntent) return;
    paySubmit.disabled = true;
    paySubmit.textContent = 'Processing…';
    payError.classList.add('hidden');

    try {
      if (stripeInstance && cardElement) {
        const { error, paymentIntent } = await stripeInstance.confirmCardPayment(
          currentPayIntent.intentSecret,
          { payment_method: { card: cardElement } }
        );
        if (error) throw new Error(error.message);
        await API.confirmPayment(paymentIntent.id);
      } else {
        // Dev mode — skip real Stripe
        await API.confirmPayment('dev_' + Date.now());
      }
      showAlert('💰 Payment released! Job marked complete.');
      payModal.classList.add('hidden');
      loadMyJobs();
    } catch (err) {
      payError.textContent = err.message;
      payError.classList.remove('hidden');
    } finally {
      paySubmit.disabled = false;
      paySubmit.textContent = 'Pay Now';
    }
  });

  [payClose, payBackdrop].forEach(el => el?.addEventListener('click', () => payModal.classList.add('hidden')));

  // ── Post Job Form ──────────────────────────────────────
  const postForm = document.getElementById('postJobForm');
  const descArea = document.getElementById('jobDesc');
  const descCount = document.getElementById('descCount');

  descArea?.addEventListener('input', () => {
    descCount.textContent = `${descArea.value.length} / 1000`;
  });

  postForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('postJobError');
    const sucEl = document.getElementById('postJobSuccess');
    const btn   = document.getElementById('postJobBtn');
    errEl.classList.add('hidden');
    sucEl.classList.add('hidden');
    btn.disabled = true; btn.textContent = 'Posting…';

    const data = {
      title:       document.getElementById('jobTitle').value.trim(),
      description: document.getElementById('jobDesc').value.trim(),
      category:    document.getElementById('jobCategory').value,
      pay:         document.getElementById('jobPay').value,
      address:     document.getElementById('jobAddress').value.trim(),
      city:        document.getElementById('jobCity').value.trim(),
      state:       document.getElementById('jobState').value.trim(),
      zip:         document.getElementById('jobZip').value.trim(),
    };

    try {
      await API.postJob(data);
      sucEl.textContent = '✅ Job posted! Students can now apply.';
      sucEl.classList.remove('hidden');
      postForm.reset();
      descCount.textContent = '0 / 1000';
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Post Job';
    }
  });

  // ── Payments Panel ─────────────────────────────────────
  async function loadPayments() {
    const onboardSection = document.getElementById('stripeOnboardSection');
    const txList = document.getElementById('txList');

    if (user.role === 'student') {
      onboardSection.classList.remove('hidden');
    }

    txList.innerHTML = '<div class="loading-state">Loading…</div>';
    try {
      const { transactions } = await API.paymentHistory();
      if (!transactions.length) {
        txList.innerHTML = '<div class="empty-state"><p>No transactions yet.</p></div>';
        return;
      }
      txList.innerHTML = transactions.map(t => `
        <div class="tx-row">
          <div class="tx-info">
            <h4>${escHtml(t.job_title)}</h4>
            <p>${user.role === 'homeowner' ? `To: ${escHtml(t.student_name)}` : `From: ${escHtml(t.homeowner_name)}`} · ${fmtDate(t.created_at)}</p>
          </div>
          <div style="display:flex;align-items:center;gap:16px">
            <span class="tx-amount">$${user.role === 'homeowner' ? t.amount.toFixed(2) : t.student_payout.toFixed(2)}</span>
            <span class="tx-status tx-${t.status}">${t.status}</span>
          </div>
        </div>`).join('');
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

  // ── Initial load ───────────────────────────────────────
  loadOverview();
});
