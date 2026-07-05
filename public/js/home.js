// public/js/home.js — Homepage: post task form + browse tasks
document.addEventListener('DOMContentLoaded', async () => {

  // ── Load categories into both dropdowns ─────────────────
  async function loadCategories() {
    try {
      const { categories } = await API.getCategories();
      const filterSel = document.getElementById('filterCategory');
      const postSel   = document.getElementById('taskCategory');
      categories.forEach(c => {
        if (filterSel) filterSel.innerHTML += `<option value="${c}">${c}</option>`;
        if (postSel)   postSel.innerHTML   += `<option value="${c}">${c}</option>`;
      });
    } catch (_) {}
  }

  await loadCategories();

  // ── Browse tasks ─────────────────────────────────────────
  let currentPage = 1;

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function loadJobs(page = 1) {
    const grid       = document.getElementById('jobsGrid');
    const pagination = document.getElementById('jobsPagination');
    if (!grid) return;

    grid.innerHTML       = '<div class="loading-state">Loading tasks…</div>';
    pagination.innerHTML = '';

    const category = document.getElementById('filterCategory')?.value || '';
    const city     = document.getElementById('filterCity')?.value.trim() || '';
    const zip      = document.getElementById('filterZip')?.value.trim()  || '';

    try {
      const { jobs, pages } = await API.getJobs({ category, city, zip, page });

      if (!jobs || jobs.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
          <h3>No tasks found</h3>
          <p>Try different filters, or be the first to <a href="#post-task" style="color:var(--accent)">post a task</a>.</p>
        </div>`;
        return;
      }

      const user = Auth.getUser();

      grid.innerHTML = jobs.map(job => {
        const badges = [];
        if (job.has_pets)          badges.push('🐾 Pets');
        if (job.has_stairs)        badges.push('🪜 Stairs');
        if (job.heavy_lifting)     badges.push('💪 Heavy lifting');
        if (job.duration_estimate) badges.push('⏱ ' + escHtml(job.duration_estimate));
        const badgeHtml = badges.length
          ? `<div class="job-badges">${badges.map(b => `<span class="job-badge">${b}</span>`).join('')}</div>`
          : '';
        return `
        <article class="job-card">
          <div class="job-card__cat">${escHtml(job.category)}</div>
          <h3 class="job-card__title">${escHtml(job.title)}</h3>
          <p class="job-card__desc">${escHtml(job.description)}</p>
          <div class="job-card__meta">
            <span>📍 ${escHtml(job.city)}, ${escHtml(job.state)}</span>
            <span>👤 ${escHtml(job.poster_name)}</span>
          </div>
          ${badgeHtml}
          <div class="job-card__pay">$${parseFloat(job.pay).toFixed(2)}</div>
          <div class="job-card__actions">
            ${user
              ? `<button class="btn btn--accent btn--sm apply-btn" data-id="${job.id}">Apply</button>`
              : `<a href="/register.html" class="btn btn--accent btn--sm">Sign Up to Apply →</a>`
            }
          </div>
        </article>
      `}).join('');

      grid.querySelectorAll('.apply-btn').forEach(btn => {
        btn.addEventListener('click', () => applyToJob(btn.dataset.id, btn));
      });

      if (pages > 1) {
        for (let i = 1; i <= pages; i++) {
          const pb = document.createElement('button');
          pb.className  = 'page-btn' + (i === page ? ' active' : '');
          pb.textContent = i;
          pb.addEventListener('click', () => { currentPage = i; loadJobs(i); });
          pagination.appendChild(pb);
        }
      }
    } catch (err) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <h3>Failed to load tasks</h3><p>${escHtml(err.message)}</p></div>`;
    }
  }

  async function applyToJob(jobId, btn) {
    if (!Auth.isLoggedIn()) { window.location.href = '/login.html'; return; }

    // Ask for a short message
    const message = prompt('Add a short message to the poster (optional):\ne.g. "I\'m available this weekend and have my own equipment."') ?? '';
    if (message === null) return; // cancelled

    btn.disabled    = true;
    btn.textContent = 'Applying…';
    try {
      await API.apply(jobId, message.trim());
      btn.textContent = '✓ Applied';
      btn.classList.remove('btn--accent');
      btn.style.color = 'var(--accent)';
    } catch (err) {
      alert(err.message);
      btn.disabled    = false;
      btn.textContent = 'Apply';
    }
  }

  document.getElementById('filterBtn')?.addEventListener('click', () => {
    currentPage = 1; loadJobs(1);
  });
  ['filterCategory', 'filterCity', 'filterZip'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { currentPage = 1; loadJobs(1); }
    });
  });

  loadJobs(1);

  // ── Post task form (no auth) ─────────────────────────────
  const postForm     = document.getElementById('postTaskForm');
  const descArea     = document.getElementById('taskDesc');
  const descCount    = document.getElementById('taskDescCount');
  const postErrorEl  = document.getElementById('postTaskError');
  const postSuccessEl= document.getElementById('postTaskSuccess');
  const postBtn      = document.getElementById('postTaskBtn');

  descArea?.addEventListener('input', () => {
    descCount.textContent = `${descArea.value.length} / 1000`;
  });

  // ID photo preview
  const idInput   = document.getElementById('posterIdPhoto');
  const idPreview = document.getElementById('idPreview');
  const idPreviewImg = document.getElementById('idPreviewImg');
  const fileLabel = document.getElementById('fileLabel');

  idInput?.addEventListener('change', () => {
    const file = idInput.files[0];
    if (!file) return;
    fileLabel.textContent = file.name;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        idPreviewImg.src = e.target.result;
        idPreview.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    } else {
      idPreview.classList.add('hidden');
    }
  });

  postForm?.addEventListener('submit', async e => {
    e.preventDefault();
    postErrorEl.classList.add('hidden');
    postSuccessEl.classList.add('hidden');
    postBtn.disabled    = true;
    postBtn.textContent = 'Posting…';

    // Build FormData for multipart upload (ID photo)
    const formData = new FormData();
    formData.append('poster_name',    document.getElementById('posterName').value.trim());
    formData.append('poster_email',   document.getElementById('posterEmail').value.trim());
    formData.append('poster_phone',   document.getElementById('posterPhone').value.trim());
    formData.append('poster_address', document.getElementById('posterAddress').value.trim());
    formData.append('poster_dob',     document.getElementById('posterDob').value.trim());
    formData.append('poster_id_type', document.getElementById('posterIdType').value);
    formData.append('poster_id_num',  document.getElementById('posterIdNum').value.trim());
    formData.append('poster_agreed',  String(document.getElementById('posterAgreed').checked));
    formData.append('poster_agreed_guidelines', String(document.getElementById('posterAgreedGuidelines')?.checked || false));
    formData.append('title',          document.getElementById('taskTitle').value.trim());
    formData.append('category',       document.getElementById('taskCategory').value);
    formData.append('description',    document.getElementById('taskDesc').value.trim());
    formData.append('pay',            document.getElementById('taskPay').value);
    formData.append('duration_estimate', document.getElementById('taskDuration')?.value.trim() || '');
    formData.append('has_pets',       String(document.getElementById('hasPets')?.checked || false));
    formData.append('has_stairs',     String(document.getElementById('hasStairs')?.checked || false));
    formData.append('heavy_lifting',  String(document.getElementById('heavyLifting')?.checked || false));
    formData.append('address',        document.getElementById('taskAddress').value.trim());
    formData.append('city',           document.getElementById('taskCity').value.trim());
    formData.append('state',          document.getElementById('taskState').value.trim());
    formData.append('zip',            document.getElementById('taskZip').value.trim());

    const idPhotoFile = document.getElementById('posterIdPhoto').files[0];
    if (idPhotoFile) formData.append('poster_id_photo', idPhotoFile);

    const posterEmail = document.getElementById('posterEmail').value.trim();

    try {
      // Use raw fetch for multipart — don't set Content-Type header (browser sets boundary)
      const res  = await fetch('/api/jobs', { method: 'POST', body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Post failed.');

      postSuccessEl.innerHTML = `
        ✅ <strong>Task posted!</strong> Verified students near you can now apply.<br />
        <span style="font-size:.85rem">
          Save this link to manage your task, view applicants, and mark it complete:<br />
          <a href="/manage.html?job=${escHtml(result.jobId)}&amp;email=${encodeURIComponent(posterEmail)}"
             style="color:var(--accent);word-break:break-all">
            campushands.app/manage.html?job=${escHtml(result.jobId)}
          </a>
        </span>
      `;
      postSuccessEl.classList.remove('hidden');
      postForm.reset();
      descCount.textContent = '0 / 1000';
      idPreview.classList.add('hidden');
      setTimeout(() => loadJobs(1), 800);
    } catch (err) {
      postErrorEl.textContent = err.message;
      postErrorEl.classList.remove('hidden');
    } finally {
      postBtn.disabled    = false;
      postBtn.textContent = 'Post Task →';
    }
  });
});
