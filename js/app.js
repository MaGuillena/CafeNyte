/* ==========================================================================
   app.js — application shell
   --------------------------------------------------------------------------
   Responsibilities (and WHY each lives here):
     - Login / logout ........ decides who is using the app
     - Router ................ swaps the visible page without reloading
     - Event delegation ...... ONE listener serves every button in every page
     - App.commit() .......... the single "data changed" hook
     - Notifications ......... derived from data, so they can never go stale
   Loaded LAST, after every page module, because it references them all.
   ========================================================================== */
'use strict';

/* Page registry: the URL hash (#stations) maps to a page module. */
const PAGES = {
  dashboard: Dashboard,
  stations: Stations,
  customers: Customers,
  sessions: Sessions,
  reservations: Reservations,
  payments: Payments,
  reports: Reports,
  users: Users,
  settings: Settings,
};

const SESSION_KEY = 'cafenyte_session_user'; // sessionStorage: who is signed in (cleared when the tab closes)
const REMEMBER_KEY = 'cafenyte_remembered_username'; // localStorage: username prefill only, never the password

const App = {
  user: null,
  currentPage: null,

  /* =============================== Startup =============================== */
  init() {
    DB.load();
    UI.hydrateIcons();
    this.initLogo();
    this.applyPreferences();
    this.bindLogin();
    this.bindShell();

    // Keep the signed-in user across a page refresh (same tab).
    const savedId = sessionStorage.getItem(SESSION_KEY);
    const saved = savedId ? Rules.getUser(savedId) : null;
    if (saved && saved.active) this.startSession(saved);
    else this.showLogin();

    // Running sessions and "upcoming" reservations depend on the clock, so redraw every 30 s.
    setInterval(() => { if (this.user) this.refresh(); }, 30000);
  },

  /**
   * Logo fallback logic.
   * WHY: the real logo file (assets/cafenyte-logo.png) doesn't exist yet. The <img> stays
   * hidden and the controller icon shows until the file loads successfully.
   * (JS listeners are used instead of an inline onerror="" attribute to keep the HTML clean.)
   */
  initLogo() {
    $$('[data-logo]').forEach((img) => {
      const holder = img.closest('.brand-logo');
      const showImage = () => { img.hidden = false; holder.classList.add('has-image'); };
      img.addEventListener('load', showImage);
      img.addEventListener('error', () => { img.hidden = true; holder.classList.remove('has-image'); });
      if (img.complete && img.naturalWidth > 0) showImage(); // image was already cached before this ran
    });
  },

  applyPreferences() {
    const prefs = DB.data.settings.prefs;
    document.body.classList.toggle('compact', Boolean(prefs.compactTables));
    document.body.classList.toggle('reduce-motion', Boolean(prefs.reduceMotion));
  },

  /* ============================ Login / logout ============================ */
  bindLogin() {
    const form = $('#login-form');
    const usernameInput = $('#login-username');
    const passwordInput = $('#login-password');
    const toggle = $('#toggle-password');

    usernameInput.value = localStorage.getItem(REMEMBER_KEY) || '';
    $('#login-remember').checked = Boolean(usernameInput.value);

    // Show/hide password. aria-pressed tells screen readers the current state.
    toggle.addEventListener('click', () => {
      const show = passwordInput.type === 'password';
      passwordInput.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      toggle.innerHTML = icon(show ? 'eyeOff' : 'eye');
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      const errors = { username: '', password: '', form: '' };

      if (!username) errors.username = 'Enter your username.';
      if (!password) errors.password = 'Enter your password.';
      if (!errors.username && !errors.password) {
        // TODO(API): POST /api/auth/login — the server verifies a password HASH and returns a token/session.
        const user = DB.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
        // WHY one vague message: never reveal whether the username or the password was wrong.
        if (!user) errors.form = 'Incorrect username or password.';
        else if (!user.active) errors.form = 'This account is deactivated. Ask an administrator to activate it.';
        else {
          if ($('#login-remember').checked) localStorage.setItem(REMEMBER_KEY, user.username);
          else localStorage.removeItem(REMEMBER_KEY);
          passwordInput.value = '';
          this.startSession(user);
          UI.toast(`Welcome back, ${user.fullName.split(' ')[0]}.`);
          return;
        }
      }

      $('#login-username-error').textContent = errors.username;
      $('#login-password-error').textContent = errors.password;
      usernameInput.toggleAttribute('aria-invalid', Boolean(errors.username));
      passwordInput.toggleAttribute('aria-invalid', Boolean(errors.password));
      const banner = $('#login-error');
      banner.hidden = !errors.form;
      banner.textContent = errors.form;
      (errors.username ? usernameInput : passwordInput).focus();
    });
  },

  showLogin() {
    this.user = null;
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
    $('#login-password').value = '';
    $('#login-error').hidden = true;
    ['#login-username-error', '#login-password-error'].forEach((sel) => { $(sel).textContent = ''; });
    ($('#login-username').value ? $('#login-password') : $('#login-username')).focus();
  },

  startSession(user) {
    this.user = user;
    sessionStorage.setItem(SESSION_KEY, user.id);
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    this.showUserInfo();
    this.route();
  },

  /** Fills the name/role areas and hides admin-only navigation for staff accounts. */
  showUserInfo() {
    const user = this.user;
    const initials = user.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    $$('[data-user-name]').forEach((el) => { el.textContent = user.fullName; });
    $$('[data-user-role]').forEach((el) => { el.textContent = STATUS_META[user.role].label; });
    $$('[data-user-initials]').forEach((el) => { el.textContent = initials; });
    // UI convenience only — see the security note in users.js.
    $$('[data-admin-only]').forEach((el) => { el.hidden = user.role !== 'admin'; });
  },

  logout() {
    UI.confirm({
      title: 'Log out of CafeNyte?',
      message: 'You will return to the login screen.',
      confirmLabel: 'Log out', cancelLabel: 'Stay signed in',
    }).then((ok) => {
      if (!ok) return;
      sessionStorage.removeItem(SESSION_KEY);
      this.closeSidebar();
      history.replaceState(null, '', location.pathname);
      this.currentPage = null;
      this.showLogin();
    });
  },

  /* ================================ Router ================================ */
  /** Reads the URL hash and shows the matching page. Runs on login and on every hash change. */
  route() {
    if (!this.user) return;
    let page = location.hash.replace('#', '') || 'dashboard';
    if (!PAGES[page]) page = 'dashboard';
    if (PAGES[page].adminOnly && this.user.role !== 'admin') {
      UI.toast('Only administrators can open that page.', 'error');
      location.hash = '#dashboard';
      return;
    }
    this.showPage(page);
  },

  showPage(page) {
    const module = PAGES[page];
    this.currentPage = page;
    const container = $('#page-content');
    container.innerHTML = '';
    module.render(container);
    UI.hydrateIcons(container);
    module.refresh();

    $('#breadcrumb-page').textContent = module.title;
    document.title = `${module.title} · CafeNyte`;
    $$('.nav-link').forEach((link) => {
      const active = link.dataset.page === page;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    this.closeSidebar();
    this.updateNotifications();
    window.scrollTo(0, 0);
    container.focus({ preventScroll: true }); // moves keyboard/screen-reader focus to the new page
  },

  /* ============================ Data-change hook ============================ */
  /**
   * Call after ANY change to DB.data. One function = no screen can forget to update.
   * TODO(API): once the backend exists, this becomes "re-fetch the affected data, then refresh()".
   */
  commit() {
    DB.save();
    this.refresh();
  },

  refresh() {
    if (!this.user || !this.currentPage) return;
    PAGES[this.currentPage].refresh();
    this.updateNotifications();
  },

  /* ============================ Shell interactions ============================ */
  bindShell() {
    const content = $('#page-content');

    // Event delegation: ONE click listener handles every [data-action] button on any page.
    // WHY: pages are redrawn constantly; per-button listeners would be lost each time.
    content.addEventListener('click', (event) => {
      const el = event.target.closest('[data-action]');
      if (!el) return;
      const page = PAGES[this.currentPage];
      const handler = page.actions && page.actions[el.dataset.action];
      if (handler) handler.call(page, el.dataset, el);
    });

    // Search boxes / selects marked data-filter just ask the page to redraw its list.
    ['input', 'change'].forEach((type) => {
      content.addEventListener(type, (event) => {
        if (event.target.matches('[data-filter]')) PAGES[this.currentPage].refresh();
      });
    });

    window.addEventListener('hashchange', () => this.route());
    $('#logout-btn').addEventListener('click', () => this.logout());

    // --- Sidebar: collapsible on desktop, slide-in drawer on small screens ---
    const body = document.body;
    $('#menu-toggle').addEventListener('click', () => {
      const open = !body.classList.contains('sidebar-open');
      body.classList.toggle('sidebar-open', open);
      $('#menu-toggle').setAttribute('aria-expanded', String(open));
    });
    $('#sidebar-overlay').addEventListener('click', () => this.closeSidebar());
    $('#sidebar-collapse').addEventListener('click', (event) => {
      const collapsed = body.classList.toggle('sidebar-collapsed');
      event.currentTarget.setAttribute('aria-pressed', String(collapsed));
      event.currentTarget.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    });

    // --- Notifications dropdown ---
    const bell = $('#notif-btn');
    const panel = $('#notif-panel');
    const setPanel = (open) => { panel.hidden = !open; bell.setAttribute('aria-expanded', String(open)); };
    bell.addEventListener('click', () => { this.updateNotifications(); setPanel(panel.hidden); });
    document.addEventListener('click', (event) => {
      if (!panel.hidden && !event.target.closest('.notif-wrap')) setPanel(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!panel.hidden) { setPanel(false); bell.focus(); }
      this.closeSidebar();
    });
    panel.addEventListener('click', (event) => { if (event.target.closest('a')) setPanel(false); });

    $('#topbar-date').textContent = Fmt.date(new Date());
  },

  closeSidebar() {
    document.body.classList.remove('sidebar-open');
    const toggle = $('#menu-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  },

  /* ============================== Notifications ==============================
     WHY computed from data instead of stored: an alert like "PC-04 reservation in
     20 minutes" is only true right now, so it is rebuilt every time. */
  buildNotifications() {
    const now = new Date();
    const items = [];

    Rules.pendingReservations(now).forEach((r) => {
      const minutes = (Rules.reservationWindow(r).start - now) / 60000;
      if (minutes > 0 && minutes <= 60) {
        items.push({ icon: 'calendar', href: '#reservations', text: `${Rules.customerName(r.customerId)} has ${Rules.stationName(r.stationId)} reserved at ${Fmt.timeOfDay(r.startTime)} (in ${Math.ceil(minutes)} min).` });
      }
    });
    Rules.activeSessions().forEach((s) => {
      const minutes = Rules.elapsedMinutes(s.startTime);
      if (minutes >= Rules.CONFIG.longSessionWarningMinutes) {
        items.push({ icon: 'clock', href: '#sessions', text: `${Rules.stationName(s.stationId)} has been running for ${Fmt.duration(minutes)} (${Rules.customerName(s.customerId)}).` });
      }
    });
    const completed = DB.data.sessions.filter((s) => s.status === 'completed');
    const unpaid = completed.filter((s) => Rules.billing(s).balance > 0);
    if (unpaid.length) {
      items.push({ icon: 'peso', href: '#payments', text: `${unpaid.length} session${unpaid.length > 1 ? 's have' : ' has'} an unpaid balance totalling ${Fmt.currency(Rules.outstandingFor(completed))}.` });
    }
    const down = DB.data.stations.filter((s) => s.active && s.status === 'maintenance');
    if (down.length) {
      items.push({ icon: 'wrench', href: '#stations', text: `${down.map((s) => s.name).join(', ')} ${down.length > 1 ? 'are' : 'is'} under maintenance.` });
    }
    return items;
  },

  updateNotifications() {
    if (!this.user) return;
    const items = this.buildNotifications();
    const badge = $('#notif-count');
    badge.hidden = items.length === 0;
    badge.textContent = items.length;
    $('#notif-btn').setAttribute('aria-label', items.length ? `Notifications, ${items.length} item${items.length > 1 ? 's' : ''}` : 'Notifications, none');
    $('#notif-list').innerHTML = items.length
      ? items.map((i) => `<li><a href="${i.href}">${icon(i.icon)}<span>${esc(i.text)}</span></a></li>`).join('')
      : `<li class="notif-empty">You’re all caught up.</li>`;
  },
};

App.init();