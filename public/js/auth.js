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
  // If the token is missing, expired, or rejected, clear the session immediately
  // so the user is never shown a false "logged in" state.
  async function validateSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return; // nothing to validate

    try {
      const data = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token },
        credentials: 'include',
      });
      if (!data.ok) {
        clearSession();
        updateNav();
      }
    } catch (_) {
      // Network error — leave session as-is so offline use isn't broken
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateNav();
    bindLogout();
    bindHamburger();
    validateSession();
    document.querySelectorAll('.toggle-pw').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = btn.closest('.input-wrap').querySelector('input');
        inp.type = inp.type === 'password' ? 'text' : 'password';
      });
    });
  });

  return { getUser, setSession, clearSession, isLoggedIn, requireAuth, updateNav };
})();
