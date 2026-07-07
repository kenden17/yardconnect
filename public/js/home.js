// public/js/home.js — Homepage: post task form + browse tasks
document.addEventListener('DOMContentLoaded', async () => {

  // ── Scroll-reveal for sections ────────────────────────────
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('revealed');
        revealObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });

  document.querySelectorAll('.how__col, .trust__item, .safety-card, .cat-card, .faq-item, .earn-card')
    .forEach(el => {
      el.classList.add('reveal-on-scroll');
      revealObserver.observe(el);
    });

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

  function skeletonCards(n = 6) {
    return Array.from({ length: n }, () => `
      <div class="skeleton-card">
        <div class="skeleton skeleton-line skeleton-line--sm"></div>
        <div class="skeleton skeleton-line skeleton-line--xl"></div>
        <div class="skeleton skeleton-line skeleton-line--lg"></div>
        <div class="skeleton skeleton-line skeleton-line--md"></div>
        <div class="skeleton skeleton-line skeleton-line--sm" style="margin-top:8px"></div>
      </div>`).join('');
  }

  async function loadJobs(page = 1) {
    const grid       = document.getElementById('jobsGrid');
    const pagination = document.getElementById('jobsPagination');
    if (!grid) return;

    grid.innerHTML       = skeletonCards(6);
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
      btn.classList.add('btn--outline');
      btn.style.color = 'var(--accent)';
    } catch (err) {
      Auth.toast(err.message, 'error');
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

    // ── Client-side validation ─────────────────────────────
    const name    = document.getElementById('posterName').value.trim();
    const email   = document.getElementById('posterEmail').value.trim();
    const phone   = document.getElementById('posterPhone').value.trim();
    const address = document.getElementById('posterAddress').value.trim();
    const dob     = document.getElementById('posterDob').value;
    const idType  = document.getElementById('posterIdType').value;
    const idNum   = document.getElementById('posterIdNum').value.trim();
    const title   = document.getElementById('taskTitle').value.trim();
    const desc    = document.getElementById('taskDesc').value.trim();
    const cat     = document.getElementById('taskCategory').value;
    const pay     = parseFloat(document.getElementById('taskPay').value);
    const tAddr   = document.getElementById('taskAddress').value.trim();
    const city    = document.getElementById('taskCity').value.trim();
    const state   = document.getElementById('taskState').value.trim().toUpperCase();
    const zip     = document.getElementById('taskZip').value.trim();
    const agreed  = document.getElementById('posterAgreed').checked;
    const agreedG = document.getElementById('posterAgreedGuidelines')?.checked;
    const photo   = document.getElementById('posterIdPhoto').files[0];

    function showErr(msg) {
      postErrorEl.textContent = msg;
      postErrorEl.classList.remove('hidden');
      postErrorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Name: at least 2 words, letters only
    const nameWords = name.split(/\s+/).filter(Boolean);
    if (!name) return showErr('Full legal name is required.');
    if (nameWords.length < 2) return showErr('Please enter your full legal name (first and last).');
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(name)) return showErr('Name should contain only letters.');

    // Email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr('Valid email address is required.');

    // Phone: 10 digits
    const phoneDigits = phone.replace(/\D/g, '');
    const phoneNorm = phoneDigits.startsWith('1') && phoneDigits.length === 11 ? phoneDigits.slice(1) : phoneDigits;
    if (!phone) return showErr('Phone number is required.');
    if (phoneNorm.length !== 10) return showErr('Phone number must be 10 digits (e.g. 555-867-5309).');
    if (parseInt(phoneNorm.slice(0,3)) < 200) return showErr('Phone number has an invalid area code.');

    if (!address) return showErr('Your home address is required.');
    if (!dob) return showErr('Date of birth is required.');
    if (!idType) return showErr('Government ID type is required.');

    // ID number format
    const idNumClean = idNum.toUpperCase().replace(/[-\s]/g, '');
    if (!idNumClean) return showErr('Government ID number is required.');
    if (idType === 'Passport') {
      if (!/^[A-Z]\d{8}$/.test(idNumClean) && !/^\d{9}$/.test(idNumClean)) {
        return showErr('US passport numbers are a letter followed by 8 digits (e.g. A12345678).');
      }
    } else {
      // Driver's License or State ID
      if (idNumClean.length < 4) return showErr('ID number appears too short. Please check your entry.');
    }

    if (!photo) return showErr('A photo of your government ID is required.');
    const allowedTypes = ['image/jpeg','image/png','image/webp','image/heic','application/pdf'];
    if (!allowedTypes.includes(photo.type) && !photo.name.match(/\.(jpg|jpeg|png|webp|heic|pdf)$/i)) {
      return showErr('ID photo must be a JPG, PNG, WEBP, HEIC, or PDF file.');
    }
    if (photo.size > 10 * 1024 * 1024) return showErr('ID photo must be under 10MB.');

    if (!agreed) return showErr('You must agree to the Terms of Responsibility.');
    if (!agreedG) return showErr('You must agree to the Community Guidelines.');

    if (!title || title.length < 5) return showErr('Task title must be at least 5 characters.');
    if (title.length > 100) return showErr('Task title must be 100 characters or less.');
    if (!desc || desc.length < 20) return showErr('Description must be at least 20 characters.');
    if (!cat) return showErr('Please select a category.');
    if (isNaN(pay) || pay < 5 || pay > 2000) return showErr('Pay must be between $5 and $2,000.');
    if (!tAddr || tAddr.length < 5) return showErr('Task street address is required.');
    if (!city || city.length < 2) return showErr('City is required.');
    if (!state || state.length !== 2 || !/^[A-Z]{2}$/.test(state)) return showErr('Enter a valid 2-letter state abbreviation (e.g. TX).');
    if (!/^\d{5}$/.test(zip)) return showErr('ZIP code must be exactly 5 digits.');

    postBtn.disabled    = true;
    postBtn.textContent = 'Posting…';

    // Build FormData for multipart upload (ID photo)
    const formData = new FormData();
    formData.append('poster_name',    name);
    formData.append('poster_email',   email);
    formData.append('poster_phone',   phone);
    formData.append('poster_address', address);
    formData.append('poster_dob',     dob);
    formData.append('poster_id_type', idType);
    formData.append('poster_id_num',  idNum);
    formData.append('poster_agreed',  String(agreed));
    formData.append('poster_agreed_guidelines', String(agreedG || false));
    formData.append('title',          title);
    formData.append('category',       cat);
    formData.append('description',    desc);
    formData.append('pay',            String(pay));
    formData.append('duration_estimate', document.getElementById('taskDuration')?.value.trim() || '');
    formData.append('has_pets',       String(document.getElementById('hasPets')?.checked || false));
    formData.append('has_stairs',     String(document.getElementById('hasStairs')?.checked || false));
    formData.append('heavy_lifting',  String(document.getElementById('heavyLifting')?.checked || false));
    formData.append('address',        tAddr);
    formData.append('city',           city);
    formData.append('state',          state);
    formData.append('zip',            zip);
    formData.append('poster_id_photo', photo);

    const posterEmail = email;

    try {
      // Use raw fetch for multipart — don't set Content-Type header (browser sets boundary)
      const res  = await fetch('/api/jobs', { method: 'POST', body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Post failed.');

      postSuccessEl.innerHTML = `
        ✅ <strong>Task posted!</strong> Verified students near you can now apply.<br />
        <span style="font-size:.85rem;display:block;margin-top:8px">
          <a href="/manage.html?email=${encodeURIComponent(posterEmail)}"
             class="btn btn--accent btn--sm" style="display:inline-block;margin-top:6px">
            Manage My Tasks →
          </a>
          <span style="display:block;margin-top:8px;color:var(--dim)">
            Bookmark that link — use it anytime to view applicants and manage your tasks.
          </span>
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
