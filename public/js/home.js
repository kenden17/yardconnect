// public/js/home.js — Homepage job listing
document.addEventListener('DOMContentLoaded', () => {
  let currentPage = 1;

  async function loadJobs(page = 1) {
    const grid = document.getElementById('jobsGrid');
    const pagination = document.getElementById('jobsPagination');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-state">Loading jobs…</div>';
    pagination.innerHTML = '';

    const category = document.getElementById('filterCategory')?.value || '';
    const city     = document.getElementById('filterCity')?.value.trim() || '';
    const zip      = document.getElementById('filterZip')?.value.trim()  || '';

    try {
      const { jobs, total, pages } = await API.getJobs({ category, city, zip, page });

      if (!jobs || jobs.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1/-1">
            <h3>No jobs found</h3>
            <p>Try adjusting your search filters, or check back later.</p>
          </div>`;
        return;
      }

      const user = Auth.getUser();

      grid.innerHTML = jobs.map(job => `
        <article class="job-card">
          <div class="job-card__cat">${escHtml(job.category)}</div>
          <h3 class="job-card__title">${escHtml(job.title)}</h3>
          <p class="job-card__desc">${escHtml(job.description)}</p>
          <div class="job-card__meta">
            <span>📍 ${escHtml(job.city)}, ${escHtml(job.state)}</span>
            <span>👤 ${escHtml(job.homeowner_name)}</span>
          </div>
          <div class="job-card__pay">$${parseFloat(job.pay).toFixed(2)}</div>
          <div class="job-card__actions">
            ${user && user.role === 'student'
              ? `<button class="btn btn--accent btn--sm apply-btn" data-id="${job.id}">Apply</button>`
              : `<a href="/register.html?role=student" class="btn btn--accent btn--sm">Apply →</a>`
            }
          </div>
        </article>
      `).join('');

      // Apply buttons
      grid.querySelectorAll('.apply-btn').forEach(btn => {
        btn.addEventListener('click', () => applyToJob(btn.dataset.id, btn));
      });

      // Pagination
      if (pages > 1) {
        for (let i = 1; i <= pages; i++) {
          const pb = document.createElement('button');
          pb.className = 'page-btn' + (i === page ? ' active' : '');
          pb.textContent = i;
          pb.addEventListener('click', () => { currentPage = i; loadJobs(i); });
          pagination.appendChild(pb);
        }
      }
    } catch (err) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <h3>Failed to load jobs</h3><p>${escHtml(err.message)}</p></div>`;
    }
  }

  async function applyToJob(jobId, btn) {
    if (!Auth.isLoggedIn()) {
      window.location.href = '/login.html';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Applying…';
    try {
      await API.apply(jobId, '');
      btn.textContent = '✓ Applied';
      btn.classList.remove('btn--accent');
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
      btn.textContent = 'Apply';
    }
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  document.getElementById('filterBtn')?.addEventListener('click', () => {
    currentPage = 1;
    loadJobs(1);
  });

  ['filterCategory','filterCity','filterZip'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { currentPage = 1; loadJobs(1); }
    });
  });

  loadJobs(1);
});
