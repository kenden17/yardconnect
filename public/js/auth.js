// public/js/auth.js — Auth state (students only)
const Auth = (() => {
  const TOKEN_KEY = 'ch_token';
  const USER_KEY  = 'ch_user';

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function isLoggedIn() {
    return !!localStorage.getItem(TOKEN_KEY) && !!getUser();
  }

  function updateNav() {
    const user    = getUser();
    const navAuth = document.getElementById('navAuth');
    const navUser = document.getElementById('navUser');
    const navName = document.getElementById('navName');
    if (user && navAuth && navUser) {
      navAuth.classList.add('hidden');
      navUser.classList.remove('hidden');
      if (navName) navName.textContent = user.name.split(' ')[0];
    }
  }

  function bindLogout() {
    document.querySelectorAll('#logoutBtn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await API.logout(); } catch (_) {}
        clearSession();
        window.location.href = '/';
      });
    });
  }

  function requireAuth() {
    if (!isLoggedIn()) { window.location.href = '/login.html'; return null; }
    return getUser();
  }

  function bindHamburger() {
    const btn    = document.getElementById('hamburger');
    const drawer = document.getElementById('navDrawer');
    if (!btn || !drawer) return;
    btn.addEventListener('click', () => {
      const open = drawer.classList.toggle('open');
      btn.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', e => {
      if (!btn.contains(e.target) && !drawer.contains(e.target)) {
        drawer.classList.remove('open');
        btn.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Validate the stored token against the server on every page load.
  // If the token is missing, expired, or rejected, clear the session immediately.
  async function validateSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token },
        credentials: 'include',
      });
      if (!res.ok) {
        clearSession();
        updateNav();
        return;
      }
      // Refresh stored user data with latest from server (e.g. has_stripe updated)
      const data = await res.json().catch(() => null);
      if (data?.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        updateNav();
      }
    } catch (_) {
      // Network error — leave session as-is
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateNav();
    bindLogout();
    bindHamburger();
    validateSession();

    // Nav elevation on scroll
    const nav = document.querySelector('.nav');
    if (nav) {
      const onScroll = () => nav.classList.toggle('nav--scrolled', window.scrollY > 8);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    document.querySelectorAll('.toggle-pw').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = btn.closest('.input-wrap').querySelector('input');
        inp.type = inp.type === 'password' ? 'text' : 'password';
      });
    });
  });

  // ── Global toast ─────────────────────────────────────────
  function toast(msg, type = 'success', duration = 4000) {
    let container = document.getElementById('ch-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ch-toast-container';
      container.style.cssText = [
        'position:fixed', 'bottom:24px', 'right:24px', 'z-index:9999',
        'display:flex', 'flex-direction:column', 'gap:10px', 'pointer-events:none',
        'max-width:340px',
      ].join(';');
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    const bg = type === 'error'   ? '#fef2f2'
             : type === 'warning' ? '#fffbeb'
             : '#f0fdf4';
    const border = type === 'error'   ? '#fecaca'
                 : type === 'warning' ? '#fde68a'
                 : '#bbf7d0';
    const color  = type === 'error'   ? '#b91c1c'
                 : type === 'warning' ? '#92400e'
                 : '#15803d';
    el.style.cssText = [
      `background:${bg}`, `border:1.5px solid ${border}`, `color:${color}`,
      'padding:12px 16px', 'border-radius:10px', 'font-size:.88rem', 'font-weight:500',
      'box-shadow:0 4px 16px rgba(0,0,0,.1)', 'pointer-events:all', 'line-height:1.5',
      'transition:opacity .3s, transform .3s',
      'opacity:0', 'transform:translateY(8px)',
    ].join(';');
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 320);
    }, duration);
  }

  return { getUser, setSession, clearSession, isLoggedIn, requireAuth, updateNav, toast };
})();
