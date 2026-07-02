// public/js/auth.js — Auth state management (runs on all pages)
const Auth = (() => {
  function getUser() {
    try {
      const raw = localStorage.getItem('yc_user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function setSession(token, user) {
    localStorage.setItem('yc_token', token);
    localStorage.setItem('yc_user', JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem('yc_token');
    localStorage.removeItem('yc_user');
  }

  function isLoggedIn() {
    return !!localStorage.getItem('yc_token') && !!getUser();
  }

  // Update nav based on auth state
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

  // Bind logout button(s) on the page
  function bindLogout() {
    document.querySelectorAll('#logoutBtn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await API.logout(); } catch (_) { /* ignore */ }
        clearSession();
        window.location.href = '/';
      });
    });
  }

  // Redirect to login if not authenticated (for protected pages)
  function requireAuth(role = null) {
    if (!isLoggedIn()) {
      window.location.href = '/login.html';
      return null;
    }
    const user = getUser();
    if (role && user.role !== role) {
      window.location.href = '/dashboard.html';
      return null;
    }
    return user;
  }

  // Redirect logged-in users away from auth pages
  function redirectIfLoggedIn() {
    if (isLoggedIn()) window.location.href = '/dashboard.html';
  }

  // Mobile hamburger
  function bindHamburger() {
    const btn    = document.getElementById('hamburger');
    const drawer = document.getElementById('navDrawer');
    if (!btn || !drawer) return;
    btn.addEventListener('click', () => {
      const open = drawer.classList.toggle('open');
      btn.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => {
      if (!btn.contains(e.target) && !drawer.contains(e.target)) {
        drawer.classList.remove('open');
        btn.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Init on every page
  document.addEventListener('DOMContentLoaded', () => {
    updateNav();
    bindLogout();
    bindHamburger();

    // Toggle password visibility
    document.querySelectorAll('.toggle-pw').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.closest('.input-wrap').querySelector('input');
        input.type = input.type === 'password' ? 'text' : 'password';
      });
    });
  });

  return { getUser, setSession, clearSession, isLoggedIn, requireAuth, redirectIfLoggedIn, updateNav };
})();
