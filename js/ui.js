/* ==========================================================================
   ui.js — shared interface helpers
   --------------------------------------------------------------------------
   WHY THIS FILE EXISTS
   Every page needs the same building blocks: format money, show a toast, open
   a modal, draw a table, show a status badge. Writing them once here keeps
   all ten screens looking and behaving the same, and means a style change
   (e.g. a new badge colour) happens in one place.
   ========================================================================== */
'use strict';

/* ------------------------------ DOM shortcuts ------------------------------ */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/**
 * Escapes text before it is placed inside innerHTML.
 * WHY: names typed into forms (e.g. "<b>Juan</b>") must display as text and
 * never run as HTML/JavaScript (XSS). Use esc() on EVERY user-provided value.
 */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/* ----------------------------------- Icons ----------------------------------
   WHY inline SVG instead of an icon library: the app works offline (no CDN),
   and each icon inherits the surrounding text colour. Style follows Lucide. */
const ICONS = {
  gamepad: '<line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="2"/>',
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  chart: '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  edit: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  stop: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  peso: '<path d="M20 11H4"/><path d="M20 7H4"/><path d="M7 21V4a1 1 0 0 1 1-1h4a4 4 0 0 1 0 8H7"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
};

/** Returns an inline <svg>. aria-hidden because the button/label next to it carries the accessible name. */
function icon(name, extraClass = '') {
  return `<svg class="icon ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
}

/* --------------------------------- Formatting -------------------------------
   WHY centralised: the brief requires ONE consistent date/time/currency format.
   Date: "Oct 27, 2026"  Time: "2:05 PM"  Money: "₱1,250.00"  Duration: "1h 05m" */
const Fmt = {
  currency(amount) {
    const n = Number(amount) || 0;
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  /** Short money for chart labels: ₱1.2k */
  compactCurrency(amount) {
    const n = Number(amount) || 0;
    return n >= 1000 ? `₱${(n / 1000).toFixed(1)}k` : `₱${Math.round(n)}`;
  },
  toDate(value) { return value instanceof Date ? value : new Date(value); },
  date(value) {
    return this.toDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  time(value) {
    return this.toDate(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  },
  dateTime(value) { return `${this.date(value)}, ${this.time(value)}`; },
  /** "2026-10-27" (date only, no timezone) -> "Oct 27, 2026" */
  dateKeyLabel(key) { return this.date(new Date(`${key}T00:00:00`)); },
  /** "14:30" -> "2:30 PM" */
  timeOfDay(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return this.time(new Date(2000, 0, 1, h, m));
  },
  duration(minutes) {
    const total = Math.max(0, Math.floor(minutes));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  },
};

/* ------------------------------ Status badges ------------------------------
   WHY each status has an icon AND a text label: colour alone must not carry
   meaning (accessibility requirement). */
const STATUS_META = {
  available:   { label: 'Available',         tone: 'success', icon: 'check' },
  in_use:      { label: 'In Use',            tone: 'purple',  icon: 'play' },
  reserved:    { label: 'Reserved',          tone: 'warning', icon: 'clock' },
  maintenance: { label: 'Under Maintenance', tone: 'danger',  icon: 'wrench' },
  inactive:    { label: 'Inactive',          tone: 'muted',   icon: 'power' },
  active:      { label: 'Active',            tone: 'purple',  icon: 'play' },
  completed:   { label: 'Completed',         tone: 'success', icon: 'check' },
  upcoming:    { label: 'Upcoming',          tone: 'info',    icon: 'calendar' },
  ongoing:     { label: 'Ongoing',           tone: 'purple',  icon: 'play' },
  cancelled:   { label: 'Cancelled',         tone: 'muted',   icon: 'x' },
  paid:        { label: 'Paid',              tone: 'success', icon: 'check' },
  partial:     { label: 'Partial',           tone: 'warning', icon: 'minus' },
  unpaid:      { label: 'Unpaid',            tone: 'danger',  icon: 'alert' },
  in_progress: { label: 'In Progress',       tone: 'info',    icon: 'clock' },
  admin:       { label: 'Administrator',     tone: 'purple',  icon: 'shield' },
  staff:       { label: 'Staff',             tone: 'info',    icon: 'user' },
  deactivated: { label: 'Deactivated',       tone: 'muted',   icon: 'power' },
};

/* ---------------------------------- UI object --------------------------------- */
const UI = {
  badge(status) {
    const meta = STATUS_META[status] || { label: status, tone: 'muted', icon: 'minus' };
    return `<span class="badge badge-${meta.tone}">${icon(meta.icon)}${esc(meta.label)}</span>`;
  },

  /** Replaces <span data-icon="name"> placeholders in static HTML with the SVG. */
  hydrateIcons(root = document) {
    $$('[data-icon]', root).forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  },

  /**
   * Applies data-driven sizes (chart bars) through the DOM instead of inline
   * style="" attributes in the HTML strings, keeping markup free of inline CSS.
   */
  applyDynamicStyles(root = document) {
    $$('[data-height]', root).forEach((el) => { el.style.height = `${el.dataset.height}%`; });
  },

  pageHeader({ title, subtitle = '', actionsHtml = '' }) {
    return `<div class="page-header">
      <div><h1 class="page-title">${esc(title)}</h1>${subtitle ? `<p class="page-subtitle">${esc(subtitle)}</p>` : ''}</div>
      ${actionsHtml ? `<div class="page-actions">${actionsHtml}</div>` : ''}
    </div>`;
  },

  /** Icon-only button. aria-label gives screen-reader users the same meaning the icon gives sighted users. */
  iconButton({ name, label, action, data = {}, tone = '' }) {
    const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
    return `<button type="button" class="icon-btn ${tone}" data-action="${action}" ${attrs} aria-label="${esc(label)}" title="${esc(label)}">${icon(name)}</button>`;
  },

  /** Friendly empty state. WHY: a blank table looks broken; this tells the user what to do next. */
  empty({ title = 'Nothing to show', text = '' } = {}) {
    return `<div class="empty-state">${icon('inbox')}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
  },

  /**
   * Builds an accessible table from column definitions.
   * columns: [{ label, render(row) -> html, className }]
   * WHY data-label on every <td>: on phones CSS turns rows into stacked cards
   * and uses data-label as the caption for each value.
   */
  table({ columns, rows, caption, empty }) {
    if (!rows.length) return UI.empty(empty);
    const head = columns.map((c) => `<th scope="col" class="${c.className || ''}">${esc(c.label)}</th>`).join('');
    const body = rows.map((row) =>
      `<tr>${columns.map((c) => `<td data-label="${esc(c.label)}" class="${c.className || ''}">${c.render(row)}</td>`).join('')}</tr>`
    ).join('');
    return `<div class="table-wrap" role="region" aria-label="${esc(caption)}" tabindex="0">
      <table class="data-table"><caption class="sr-only">${esc(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>`;
  },

  /** <option> list. `list` = [{ value, label, disabled }] */
  options(list, selected = '') {
    return list.map((o) =>
      `<option value="${esc(o.value)}"${String(o.value) === String(selected) ? ' selected' : ''}${o.disabled ? ' disabled' : ''}>${esc(o.label)}</option>`
    ).join('');
  },

  /**
   * One labelled form field (input or select) with a spot for its error message.
   * WHY id = "f-<name>": the <label for> must match the control id, and the
   * error text uses data-error-for="<name>" so showErrors() can find it.
   */
  field({ label, name, type = 'text', value = '', required = false, placeholder = '', hint = '', options = null, attrs = '' }) {
    const id = `f-${name}`;
    const req = required ? '<span class="req" aria-hidden="true"> *</span>' : '';
    const aria = `${required ? 'aria-required="true"' : ''} ${hint ? `aria-describedby="hint-${name}"` : ''}`;
    const control = options
      ? `<select id="${id}" name="${name}" ${aria} ${attrs}>${UI.options(options, value)}</select>`
      : `<input id="${id}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${aria} ${attrs}>`;
    return `<div class="field">
      <label for="${id}">${esc(label)}${req}</label>
      ${control}
      ${hint ? `<p class="field-hint" id="hint-${name}">${esc(hint)}</p>` : ''}
      <p class="field-error" data-error-for="${name}" role="alert"></p>
    </div>`;
  },

  /* ------------------------------ Inline validation ------------------------------ */
  clearErrors(root) {
    $$('.field-error', root).forEach((p) => { p.textContent = ''; });
    $$('[aria-invalid]', root).forEach((el) => el.removeAttribute('aria-invalid'));
    const banner = $('.form-error', root);
    if (banner) { banner.hidden = true; banner.textContent = ''; }
  },

  /** Shows { fieldName: message } under each field and focuses the first invalid one. */
  showErrors(root, errors = {}, message = '') {
    let firstInvalid = null;
    Object.entries(errors).forEach(([name, text]) => {
      const holder = $(`[data-error-for="${name}"]`, root);
      const control = $(`[name="${name}"]`, root);
      if (holder) holder.textContent = text;
      if (control) {
        control.setAttribute('aria-invalid', 'true');
        firstInvalid = firstInvalid || control;
      }
    });
    const banner = $('.form-error', root);
    if (banner && message) { banner.textContent = message; banner.hidden = false; }
    if (firstInvalid) firstInvalid.focus();
  },

  /** Return value for onSubmit handlers that failed validation. */
  fail(message, errors = {}) {
    return { failed: true, message, errors };
  },

  /* ----------------------------------- Toasts ----------------------------------- */
  toast(message, type = 'success') {
    const region = $('#toast-region');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const iconName = type === 'error' ? 'alert' : type === 'info' ? 'bell' : 'check';
    el.innerHTML = `${icon(iconName)}<span>${esc(message)}</span><button type="button" class="toast-close" aria-label="Dismiss notification">${icon('x')}</button>`;
    const remove = () => el.remove();
    $('.toast-close', el).addEventListener('click', remove);
    region.append(el);
    setTimeout(remove, type === 'error' ? 7000 : 4500);
  },

  /* ------------------------------------ Modals ------------------------------------
     WHY the native <dialog> element: it gives focus trapping, Esc-to-close and a
     backdrop for free, which makes the modals accessible without extra libraries.

     opts.onSubmit(values, form) may return:
       undefined          -> success, dialog closes
       UI.fail(msg, errs) -> keep open and show errors
       { done: fn }       -> success; fn runs AFTER the dialog closes (used to chain a second modal) */
  modal({ title, subtitle = '', body = '', submitLabel = 'Save', cancelLabel = 'Cancel', size = '', onSubmit = null, onOpen = null }) {
    const dlg = $('#modal');
    dlg.innerHTML = `<div class="modal-card ${size}">
      <header class="modal-head">
        <div><h2 id="modal-title">${esc(title)}</h2>${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}</div>
        <button type="button" class="icon-btn" data-modal-close aria-label="Close dialog">${icon('x')}</button>
      </header>
      <form class="modal-body" novalidate>
        <div class="form-error" role="alert" hidden></div>
        ${body}
        <footer class="modal-foot">
          <button type="button" class="btn btn-ghost" data-modal-close>${esc(submitLabel === null ? 'Close' : cancelLabel)}</button>
          ${submitLabel === null ? '' : `<button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>`}
        </footer>
      </form>
    </div>`;

    const form = $('form', dlg);
    // Close on the X / Cancel buttons, or when the dark backdrop outside the card is clicked.
    dlg.onclick = (event) => {
      if (event.target === dlg || event.target.closest('[data-modal-close]')) dlg.close();
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault(); // we validate with JavaScript, not the browser's default popups
      UI.clearErrors(form);
      if (!onSubmit) { dlg.close(); return; }
      const values = Object.fromEntries(new FormData(form).entries());
      const result = onSubmit(values, form);
      if (result && result.failed) {
        UI.showErrors(form, result.errors, result.message);
        return;
      }
      dlg.close();
      if (result && typeof result.done === 'function') result.done();
    });

    if (!dlg.open) dlg.showModal();
    UI.hydrateIcons(dlg);
    if (onOpen) onOpen(form);
    const firstControl = $('input:not([type="hidden"]):not([readonly]), select, textarea', form);
    if (firstControl) firstControl.focus();
  },

  /**
   * Promise-based confirmation dialog. Usage:
   *   UI.confirm({ title, message, danger: true }).then((ok) => { if (ok) ... });
   * WHY a custom dialog: the brief forbids alert()/confirm() as primary feedback.
   */
  confirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
    const dlg = $('#confirm-dialog');
    return new Promise((resolve) => {
      dlg.innerHTML = `<div class="modal-card modal-small">
        <header class="modal-head"><h2 id="confirm-title">${esc(title)}</h2></header>
        <div class="modal-body"><p>${esc(message)}</p>
          <form method="dialog" class="modal-foot">
            <button type="submit" value="cancel" class="btn btn-ghost">${esc(cancelLabel)}</button>
            <button type="submit" value="confirm" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(confirmLabel)}</button>
          </form>
        </div></div>`;
      dlg.returnValue = '';
      dlg.onclose = () => resolve(dlg.returnValue === 'confirm');
      dlg.onclick = (event) => { if (event.target === dlg) dlg.close('cancel'); };
      dlg.showModal();
      $('button[value="cancel"]', dlg).focus(); // safest default for destructive actions
    });
  },

  closeModal() {
    const dlg = $('#modal');
    if (dlg.open) dlg.close();
  },

  /** Small "label: value" list used by the details modals. rows = [[label, htmlValue], ...] */
  detailList(rows) {
    return `<dl class="detail-list">${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
  },

  /** Shared stat-card markup used by Dashboard, Payments and Reports. */
  statCard({ icon: iconName, label, value, hint = '', tone = 'purple' }) {
    return `<article class="stat-card">
      <span class="stat-icon tone-${tone}">${icon(iconName)}</span>
      <div><p class="stat-label">${esc(label)}</p><p class="stat-value">${esc(value)}</p>${hint ? `<p class="stat-hint">${esc(hint)}</p>` : ''}</div>
    </article>`;
  },
};