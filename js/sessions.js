/* ==========================================================================
   sessions.js — Screen 5: Gaming Session Management
   Sessions are started and ended manually by staff (no automatic detection
   of computer activity in this prototype).
   ========================================================================== */
'use strict';

const Sessions = {
  title: 'Gaming Sessions',

  render(container) {
    container.innerHTML = `
      ${UI.pageHeader({
        title: 'Gaming Sessions',
        subtitle: 'Start, monitor and end customer sessions',
        actionsHtml: `<button type="button" class="btn btn-primary" data-action="start">${icon('play')} Start Session</button>`,
      })}
      <div class="toolbar card">
        <div class="search-box">
          ${icon('search')}
          <label class="sr-only" for="session-search">Search sessions</label>
          <input id="session-search" type="search" placeholder="Search by session ID, customer or station" data-filter autocomplete="off">
        </div>
        <div class="toolbar-field">
          <label for="session-status-filter">Status</label>
          <select id="session-status-filter" data-filter>
            ${UI.options([{ value: 'all', label: 'All sessions' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }])}
          </select>
        </div>
      </div>
      <section class="card" aria-label="Session list"><div id="session-table"></div></section>`;
  },

  refresh() {
    const holder = $('#session-table');
    if (!holder) return;
    const query = $('#session-search').value.trim().toLowerCase();
    const statusFilter = $('#session-status-filter').value;

    const rows = DB.data.sessions
      .filter((s) => {
        const haystack = `${s.id} ${Rules.customerName(s.customerId)} ${Rules.stationName(s.stationId)}`.toLowerCase();
        return (!query || haystack.includes(query)) && (statusFilter === 'all' || s.status === statusFilter);
      })
      // Running sessions first (staff need them most), then newest to oldest.
      .sort((a, b) => (a.status === b.status ? new Date(b.startTime) - new Date(a.startTime) : a.status === 'active' ? -1 : 1));

    holder.innerHTML = UI.table({
      caption: 'Gaming sessions',
      rows,
      empty: { title: 'No sessions match', text: 'Change the filters, or start a new session.' },
      columns: [
        { label: 'Session', render: (s) => esc(s.id) },
        { label: 'Customer', render: (s) => `<strong>${esc(Rules.customerName(s.customerId))}</strong>` },
        { label: 'Station', render: (s) => esc(Rules.stationName(s.stationId)) },
        { label: 'Start', render: (s) => Fmt.dateTime(s.startTime) },
        { label: 'End', render: (s) => (s.endTime ? Fmt.dateTime(s.endTime) : '<span class="muted">Running</span>') },
        { label: 'Duration', render: (s) => Fmt.duration(Rules.elapsedMinutes(s.startTime, s.endTime)) },
        {
          label: 'Charge', className: 'num',
          render: (s) => `${Fmt.currency(Rules.sessionCharge(s))}${s.status === 'active' ? '<small class="muted block">so far</small>' : ''}`,
        },
        { label: 'Status', render: (s) => UI.badge(s.status) },
        { label: 'Actions', render: (s) => this.rowActions(s) },
      ],
    });
  },

  rowActions(session) {
    const id = { id: session.id };
    let main = '';
    if (session.status === 'active') {
      main = `<button type="button" class="btn btn-sm btn-secondary" data-action="end" data-id="${esc(session.id)}">${icon('stop')} End</button>`;
    } else if (Rules.billing(session).balance > 0) {
      main = `<button type="button" class="btn btn-sm btn-secondary" data-action="pay" data-id="${esc(session.id)}">${icon('peso')} Pay</button>`;
    }
    return `<span class="row-actions">${main}${UI.iconButton({ name: 'eye', label: `View details of ${session.id}`, action: 'details', data: id })}</span>`;
  },

  /* ------------------------------ Start a session ------------------------------ */
  openStartModal(preselectedStationId = null) {
    const customers = [...DB.data.customers].sort((a, b) => a.fullName.localeCompare(b.fullName));
    // Only stations that pass Rules.canStartSession() are offered, so staff can't pick an invalid one.
    const freeStations = DB.data.stations
      .filter((s) => Rules.canStartSession(s.id).ok)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const noneFree = freeStations.length === 0;
    UI.modal({
      title: 'Start session',
      subtitle: 'The start time is recorded when you confirm.',
      submitLabel: 'Start session',
      body: `
        ${noneFree ? `<p class="notice notice-warning">${icon('alert')} Every station is in use, reserved or under maintenance right now.</p>` : ''}
        ${UI.field({
          label: 'Customer', name: 'customerId', required: true, value: '',
          options: [{ value: '', label: 'Select a customer' }, ...customers.map((c) => ({ value: c.id, label: `${c.fullName} (${c.id})` }))],
        })}
        ${UI.field({
          label: 'Available station', name: 'stationId', required: true, value: preselectedStationId || '',
          options: [{ value: '', label: noneFree ? 'No station available' : 'Select a station' },
            ...freeStations.map((s) => ({ value: s.id, label: `${s.name} · ${s.specs.split(' · ')[1] || 'Gaming PC'} · ${Fmt.currency(s.hourlyRate)}/hr` }))],
        })}
        <div class="field"><span class="label-like">Current hourly rate</span><output id="start-rate" class="rate-output" for="f-stationId">Select a station</output></div>`,
      onOpen: (form) => {
        // WHY: show the rate right away so staff can quote the price before confirming.
        const select = $('#f-stationId', form);
        const showRate = () => {
          const station = Rules.getStation(select.value);
          $('#start-rate', form).textContent = station ? `${Fmt.currency(station.hourlyRate)} per hour` : 'Select a station';
        };
        select.addEventListener('change', showRate);
        showRate();
      },
      onSubmit: (v) => {
        const errors = {};
        if (!v.customerId) errors.customerId = 'Choose a customer.';
        if (!v.stationId) errors.stationId = 'Choose an available station.';
        else {
          // Re-check at the moment of saving: another staff member may have taken the station since the modal opened.
          const check = Rules.canStartSession(v.stationId);
          if (!check.ok) errors.stationId = check.reason;
        }
        if (Object.keys(errors).length) return UI.fail('This session can’t be started yet.', errors);

        const station = Rules.getStation(v.stationId);
        // TODO(API): POST /api/sessions — the SERVER must stamp startTime so staff can't change it.
        // The station becomes "In Use" automatically because its status is derived from this active session.
        DB.data.sessions.push({
          id: DB.nextId('session', 'S'),
          customerId: v.customerId,
          stationId: station.id,
          startTime: new Date().toISOString(),
          endTime: null,
          hourlyRate: station.hourlyRate,
          status: 'active',
          charge: null,
          startedBy: App.user.id,
        });
        UI.toast(`Session started on ${station.name} for ${Rules.customerName(v.customerId)}.`);
        App.commit();
      },
    });
  },

  /* ------------------------------ End a session ------------------------------ */
  openEndModal(sessionId) {
    const session = Rules.getSession(sessionId);
    if (!session || session.status !== 'active') {
      UI.toast('That session is no longer active.', 'error');
      return;
    }
    const minutes = Rules.elapsedMinutes(session.startTime);
    const charge = Rules.calculateCharge(session.hourlyRate, minutes);

    UI.modal({
      title: `End session ${session.id}`,
      subtitle: 'Review the charge before ending.',
      submitLabel: 'End session',
      body: `${UI.detailList([
        ['Customer', esc(Rules.customerName(session.customerId))],
        ['Station', esc(Rules.stationName(session.stationId))],
        ['Started', Fmt.dateTime(session.startTime)],
        ['Elapsed so far', Fmt.duration(minutes)],
        ['Hourly rate', Fmt.currency(session.hourlyRate)],
        ['Charge so far', `<strong>${Fmt.currency(charge)}</strong>`],
      ])}
      <p class="field-hint">The final end time and charge are recorded the moment you confirm.</p>
      <label class="checkbox"><input type="checkbox" name="payNow" checked> Record the payment right after ending</label>`,
      onSubmit: (v) => {
        // Re-read the session: it may have been ended elsewhere while this dialog was open.
        const live = Rules.getSession(sessionId);
        if (!live || live.status !== 'active') return UI.fail('This session was already ended.');

        const end = new Date();
        live.endTime = end.toISOString();
        live.charge = Rules.calculateCharge(live.hourlyRate, Rules.elapsedMinutes(live.startTime, live.endTime));
        live.status = 'completed'; // station becomes Available again automatically (derived status)

        UI.toast(`Session ${live.id} ended. Charge: ${Fmt.currency(live.charge)}.`);
        App.commit();
        if (v.payNow && live.charge > 0) return { done: () => Payments.openRecordModal(live.id) };
      },
    });
  },

  /* ------------------------------ Details ------------------------------ */
  openDetails(sessionId) {
    const session = Rules.getSession(sessionId);
    if (!session) return;
    const bill = Rules.billing(session);
    const paymentRows = Rules.paymentsForSession(session.id);

    UI.modal({
      title: `Session ${session.id}`,
      size: 'modal-wide',
      submitLabel: null,
      body: UI.detailList([
        ['Customer', esc(Rules.customerName(session.customerId))],
        ['Station', esc(Rules.stationName(session.stationId))],
        ['Started', Fmt.dateTime(session.startTime)],
        ['Ended', session.endTime ? Fmt.dateTime(session.endTime) : '<span class="muted">Still running</span>'],
        ['Duration', Fmt.duration(Rules.elapsedMinutes(session.startTime, session.endTime))],
        ['Hourly rate', Fmt.currency(session.hourlyRate)],
        ['Charge', Fmt.currency(bill.charge)],
        ['Paid', Fmt.currency(bill.paid)],
        ['Balance', Fmt.currency(bill.balance)],
        ['Payment status', UI.badge(bill.status)],
      ]) + `<h3 class="modal-subtitle">Payments for this session</h3>` + UI.table({
        caption: `Payments for ${session.id}`,
        rows: paymentRows,
        empty: { title: 'No payments recorded', text: session.status === 'active' ? 'Payments can be recorded after the session ends.' : 'Use Record Payment to add one.' },
        columns: [
          { label: 'Payment', render: (p) => esc(p.id) },
          { label: 'Date & time', render: (p) => Fmt.dateTime(p.date) },
          { label: 'Method', render: (p) => esc(p.method) },
          { label: 'Amount', className: 'num', render: (p) => Fmt.currency(p.amount) },
        ],
      }),
    });
  },

  actions: {
    start() { Sessions.openStartModal(); },
    end(data) { Sessions.openEndModal(data.id); },
    pay(data) { Payments.openRecordModal(data.id); },
    details(data) { Sessions.openDetails(data.id); },
  },
};