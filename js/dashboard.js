/* ==========================================================================
   dashboard.js — Screen 2: Dashboard
   --------------------------------------------------------------------------
   Page module pattern used by EVERY screen (so the group learns it once):
     render(container)  builds the static page layout ONCE when you navigate.
     refresh()          fills in the data-driven parts; called again after any
                        change anywhere in the app (App.commit()).
     actions            handlers for buttons marked data-action="..."
   WHY split render/refresh: re-drawing the whole page after every change
   would wipe what the user is typing in search boxes. refresh() only touches
   the changing areas.
   ========================================================================== */
'use strict';

const Dashboard = {
  title: 'Dashboard',

  render(container) {
    container.innerHTML = `
      ${UI.pageHeader({ title: 'Dashboard', subtitle: 'Overview of today’s café operations' })}

      <div class="quick-actions" role="group" aria-label="Quick actions">
        <button type="button" class="btn btn-primary" data-action="start-session">${icon('play')} Start Session</button>
        <button type="button" class="btn btn-secondary" data-action="add-customer">${icon('users')} Add Customer</button>
        <button type="button" class="btn btn-secondary" data-action="new-reservation">${icon('calendar')} Create Reservation</button>
        <button type="button" class="btn btn-secondary" data-action="record-payment">${icon('peso')} Record Payment</button>
      </div>

      <section class="stat-grid" id="dash-stats" aria-label="Summary"></section>

      <div class="grid-2">
        <section class="card" aria-labelledby="dash-stations-title">
          <div class="card-head"><h2 id="dash-stations-title">Station availability</h2><a class="link" href="#stations">Manage stations</a></div>
          <div id="dash-stations" class="tile-grid"></div>
        </section>
        <section class="card" aria-labelledby="dash-revenue-title">
          <div class="card-head"><h2 id="dash-revenue-title">Revenue, last 7 days</h2></div>
          <div id="dash-revenue"></div>
        </section>
      </div>

      <div class="grid-2">
        <section class="card" aria-labelledby="dash-active-title">
          <div class="card-head"><h2 id="dash-active-title">Active gaming sessions</h2><a class="link" href="#sessions">All sessions</a></div>
          <div id="dash-active"></div>
        </section>
        <section class="card" aria-labelledby="dash-resv-title">
          <div class="card-head"><h2 id="dash-resv-title">Upcoming reservations</h2><a class="link" href="#reservations">All reservations</a></div>
          <div id="dash-reservations"></div>
        </section>
      </div>

      <section class="card" aria-labelledby="dash-tx-title">
        <div class="card-head"><h2 id="dash-tx-title">Recent transactions</h2><a class="link" href="#payments">Billing &amp; payments</a></div>
        <div id="dash-transactions"></div>
      </section>`;
  },

  /** Every number below is computed from DB.data via Rules — never typed in by hand. */
  refresh() {
    if (!$('#dash-stats')) return;
    const counts = Rules.stationCounts();
    const active = Rules.activeSessions();
    const pending = Rules.pendingReservations();
    const ongoing = pending.filter((r) => Rules.reservationState(r) === 'ongoing').length;
    const today = Rules.todayKey();
    const todaysPayments = Rules.paymentsInRange(today, today);
    const revenue = Rules.revenueBetween(today, today);

    $('#dash-stats').innerHTML = [
      { icon: 'monitor', label: 'Total stations', value: counts.total, tone: 'purple', hint: `${counts.reserved} reserved right now` },
      { icon: 'check', label: 'Available', value: counts.available, tone: 'green', hint: 'Ready for a session' },
      { icon: 'play', label: 'In use', value: counts.in_use, tone: 'magenta', hint: 'Running a session' },
      { icon: 'wrench', label: 'Under maintenance', value: counts.maintenance, tone: 'red', hint: 'Not bookable' },
      { icon: 'gamepad', label: 'Active sessions', value: active.length, tone: 'purple', hint: 'Not counted as revenue yet' },
      { icon: 'calendar', label: 'Upcoming reservations', value: pending.length, tone: 'amber', hint: ongoing ? `${ongoing} happening now` : 'None happening now' },
      { icon: 'peso', label: 'Today’s revenue', value: Fmt.currency(revenue), tone: 'green', hint: `${todaysPayments.length} recorded payment${todaysPayments.length === 1 ? '' : 's'}` },
    ].map((card) => UI.statCard(card)).join('');

    // Station tiles: icon + text label, so status is never colour-only.
    const stations = DB.data.stations.filter((s) => s.active)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    $('#dash-stations').innerHTML = stations.map((s) => {
      const status = Rules.stationStatus(s);
      return `<div class="station-tile status-${status}"><strong>${esc(s.name)}</strong><span>${icon(STATUS_META[status].icon)}${esc(STATUS_META[status].label)}</span></div>`;
    }).join('');

    this.renderRevenueChart();
    this.renderActiveSessions(active);
    this.renderReservations(pending);
    this.renderTransactions();
  },

  /** Simple CSS bar chart (no chart library needed for a student project). */
  renderRevenueChart() {
    const days = Rules.dailyRevenue(7);
    const max = Math.max(...days.map((d) => d.total), 1);
    const summary = days.map((d) => `${d.label}: ${Fmt.currency(d.total)}`).join(', ');
    $('#dash-revenue').innerHTML = `<div class="bar-chart" role="img" aria-label="Revenue per day. ${esc(summary)}">
      ${days.map((d) => `<div class="bar-col">
        <span class="bar-value">${Fmt.compactCurrency(d.total)}</span>
        <div class="bar-track"><div class="bar ${d.isToday ? 'bar-today' : ''}" data-height="${Math.max((d.total / max) * 100, d.total > 0 ? 4 : 0)}"></div></div>
        <span class="bar-label">${esc(d.label)}</span>
      </div>`).join('')}
    </div>
    <p class="chart-note muted">Recorded payments only. Unpaid and running charges are excluded.</p>`;
    UI.applyDynamicStyles($('#dash-revenue'));
  },

  renderActiveSessions(active) {
    const rows = [...active].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    $('#dash-active').innerHTML = UI.table({
      caption: 'Active gaming sessions',
      rows,
      empty: { title: 'No active sessions', text: 'Start a session to see it here.' },
      columns: [
        { label: 'Customer', render: (s) => esc(Rules.customerName(s.customerId)) },
        { label: 'Station', render: (s) => esc(Rules.stationName(s.stationId)) },
        { label: 'Started', render: (s) => Fmt.time(s.startTime) },
        { label: 'Elapsed', render: (s) => Fmt.duration(Rules.elapsedMinutes(s.startTime)) },
        { label: 'Running charge', render: (s) => Fmt.currency(Rules.sessionCharge(s)) },
        { label: 'Action', render: (s) => `<button type="button" class="btn btn-sm btn-secondary" data-action="end-session" data-id="${esc(s.id)}">${icon('stop')} End</button>` },
      ],
    });
  },

  renderReservations(pending) {
    const next = pending.slice(0, 5);
    $('#dash-reservations').innerHTML = next.length
      ? `<ul class="list">${next.map((r) => `<li>
          <div><strong>${esc(Rules.customerName(r.customerId))}</strong>
          <p class="muted">${esc(Rules.stationName(r.stationId))} · ${Fmt.dateKeyLabel(r.date)}, ${Fmt.timeOfDay(r.startTime)} – ${Fmt.timeOfDay(r.endTime)}</p></div>
          ${UI.badge(Rules.reservationState(r))}
        </li>`).join('')}</ul>`
      : UI.empty({ title: 'No upcoming reservations', text: 'Create one from the Reservations page.' });
  },

  renderTransactions() {
    const recent = [...DB.data.payments].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
    $('#dash-transactions').innerHTML = UI.table({
      caption: 'Most recent payments',
      rows: recent,
      empty: { title: 'No payments yet', text: 'Recorded payments appear here.' },
      columns: [
        { label: 'Payment', render: (p) => esc(p.id) },
        { label: 'Date & time', render: (p) => Fmt.dateTime(p.date) },
        { label: 'Customer', render: (p) => esc(Rules.customerName(p.customerId)) },
        { label: 'Session', render: (p) => esc(p.sessionId) },
        { label: 'Method', render: (p) => esc(p.method) },
        { label: 'Amount', className: 'num', render: (p) => `<strong>${Fmt.currency(p.amount)}</strong>` },
      ],
    });
  },

  // Cross-module calls: each button just opens the modal that already lives in the owning module.
  actions: {
    'start-session'() { Sessions.openStartModal(); },
    'add-customer'() { Customers.openForm(); },
    'new-reservation'() { Reservations.openForm(); },
    'record-payment'() { Payments.openRecordModal(); },
    'end-session'(data) { Sessions.openEndModal(data.id); },
  },
};