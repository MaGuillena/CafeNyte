/* ==========================================================================
   stations.js — Screen 3: Computer Station Management
   ========================================================================== */
'use strict';

const Stations = {
  title: 'Computer Stations',

  render(container) {
    container.innerHTML = `
      ${UI.pageHeader({
        title: 'Computer Stations',
        subtitle: 'Add, edit and monitor every gaming PC',
        actionsHtml: `<button type="button" class="btn btn-primary" data-action="add">${icon('plus')} Add Station</button>`,
      })}
      <div class="toolbar card">
        <div class="search-box">
          ${icon('search')}
          <label class="sr-only" for="station-search">Search by station number</label>
          <input id="station-search" type="search" placeholder="Search by station number (e.g. PC-03)" data-filter autocomplete="off">
        </div>
        <div class="toolbar-field">
          <label for="station-status-filter">Status</label>
          <select id="station-status-filter" data-filter>
            ${UI.options([
              { value: 'all', label: 'All statuses' },
              { value: 'available', label: 'Available' },
              { value: 'in_use', label: 'In Use' },
              { value: 'reserved', label: 'Reserved' },
              { value: 'maintenance', label: 'Under Maintenance' },
              { value: 'inactive', label: 'Inactive' },
            ])}
          </select>
        </div>
      </div>
      <div id="station-grid" class="station-grid"></div>`;
  },

  /** Re-reads the search/status filters from the page and redraws the cards. */
  refresh() {
    const grid = $('#station-grid');
    if (!grid) return;
    const query = $('#station-search').value.trim().toLowerCase();
    const statusFilter = $('#station-status-filter').value;

    const list = DB.data.stations
      .filter((s) => {
        const matchesText = !query || s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query);
        const matchesStatus = statusFilter === 'all' || Rules.stationStatus(s) === statusFilter;
        return matchesText && matchesStatus;
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    grid.innerHTML = list.length
      ? list.map((s) => this.cardHtml(s)).join('')
      : UI.empty({ title: 'No stations match', text: 'Try a different station number or status filter.' });
  },

  cardHtml(station) {
    const status = Rules.stationStatus(station);
    let detail = '<p class="muted">No customer right now.</p>';

    if (status === 'in_use') {
      const session = Rules.activeSessionForStation(station.id);
      detail = `<p>${icon('user')} <strong>${esc(Rules.customerName(session.customerId))}</strong></p>
        <p class="muted">${esc(session.id)} · since ${Fmt.time(session.startTime)} (${Fmt.duration(Rules.elapsedMinutes(session.startTime))})</p>`;
    } else if (status === 'reserved') {
      const resv = Rules.currentReservationForStation(station.id);
      detail = `<p>${icon('user')} <strong>${esc(Rules.customerName(resv.customerId))}</strong></p>
        <p class="muted">${esc(resv.id)} · until ${Fmt.timeOfDay(resv.endTime)}</p>`;
    } else if (status === 'maintenance') {
      detail = '<p class="muted">Not available for sessions or bookings.</p>';
    } else if (status === 'inactive') {
      detail = '<p class="muted">Deactivated. Reactivate to use again.</p>';
    }

    const id = { id: station.id };
    // "Start" is only offered when the rules allow it (available station).
    const startButton = status === 'available'
      ? `<button type="button" class="btn btn-sm btn-primary" data-action="start" data-id="${esc(station.id)}">${icon('play')} Start session</button>` : '';
    const toggleButton = station.active
      ? UI.iconButton({ name: 'power', label: `Deactivate ${station.name}`, action: 'deactivate', data: id, tone: 'danger' })
      : UI.iconButton({ name: 'power', label: `Reactivate ${station.name}`, action: 'reactivate', data: id });

    return `<article class="station-card status-${status}">
      <header><h2>${esc(station.name)}</h2>${UI.badge(status)}</header>
      <p class="station-specs">${esc(station.specs)}</p>
      <p class="station-rate">${Fmt.currency(station.hourlyRate)}<span class="muted"> / hour</span></p>
      <div class="station-detail">${detail}</div>
      <footer>
        ${startButton}
        <span class="row-actions">
          ${UI.iconButton({ name: 'eye', label: `View details of ${station.name}`, action: 'view', data: id })}
          ${UI.iconButton({ name: 'edit', label: `Edit ${station.name}`, action: 'edit', data: id })}
          ${toggleButton}
        </span>
      </footer>
    </article>`;
  },

  /** Add/Edit modal. Pass a station id to edit; no argument to add. */
  openForm(stationId = null) {
    const station = stationId ? Rules.getStation(stationId) : null;
    const isEdit = Boolean(station);

    UI.modal({
      title: isEdit ? `Edit ${station.name}` : 'Add station',
      subtitle: isEdit ? 'Changes apply immediately.' : 'Register a new computer station.',
      submitLabel: isEdit ? 'Save changes' : 'Add station',
      body: [
        UI.field({ label: 'Station name', name: 'name', required: true, value: station?.name || '', placeholder: 'e.g. PC-11', attrs: 'maxlength="20"' }),
        UI.field({ label: 'Specifications', name: 'specs', required: true, value: station?.specs || '', placeholder: 'CPU · GPU · RAM · Monitor', attrs: 'maxlength="120"' }),
        UI.field({
          label: 'Hourly rate (₱)', name: 'hourlyRate', type: 'number', required: true, value: station?.hourlyRate ?? '',
          attrs: 'min="1" max="1000" step="0.01" inputmode="decimal"',
          hint: 'New rate applies to future sessions only; past sessions keep the rate they started with.',
        }),
        UI.field({
          label: 'Status', name: 'status', value: station?.status || 'available',
          options: [{ value: 'available', label: 'Available' }, { value: 'maintenance', label: 'Under Maintenance' }],
          hint: 'In Use and Reserved are set automatically by sessions and reservations.',
        }),
      ].join(''),
      onSubmit: (v) => {
        const errors = {};
        const name = v.name.trim();
        const specs = v.specs.trim();
        const rate = Number(v.hourlyRate);

        if (!name) errors.name = 'Enter a station name.';
        else if (DB.data.stations.some((s) => s.id !== station?.id && s.name.toLowerCase() === name.toLowerCase())) {
          errors.name = `A station named "${name}" already exists.`;
        }
        if (!specs) errors.specs = 'Enter the computer specifications.';
        if (v.hourlyRate === '' || !Number.isFinite(rate)) errors.hourlyRate = 'Enter the hourly rate as a number.';
        else if (rate <= 0) errors.hourlyRate = 'The hourly rate must be greater than ₱0.';
        else if (rate > 1000) errors.hourlyRate = 'The hourly rate looks too high (maximum ₱1,000).';
        if (isEdit && v.status === 'maintenance' && Rules.activeSessionForStation(station.id)) {
          errors.status = `${station.name} has an active session. End it before setting maintenance.`;
        }
        if (Object.keys(errors).length) return UI.fail('Please fix the highlighted fields.', errors);

        if (isEdit) {
          Object.assign(station, { name, specs, hourlyRate: Rules.round2(rate), status: v.status });
          UI.toast(`${name} updated.`);
        } else {
          // TODO(API): POST /api/stations
          DB.data.stations.push({ id: DB.nextId('station', 'ST', 2), name, specs, hourlyRate: Rules.round2(rate), status: v.status, active: true });
          UI.toast(`${name} added.`);
        }
        App.commit();
      },
    });
  },

  openDetails(stationId) {
    const station = Rules.getStation(stationId);
    if (!station) return;
    const status = Rules.stationStatus(station);
    const history = DB.data.sessions.filter((s) => s.stationId === station.id)
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    const completed = history.filter((s) => s.status === 'completed');
    const totalMinutes = completed.reduce((sum, s) => sum + Rules.elapsedMinutes(s.startTime, s.endTime), 0);

    UI.modal({
      title: `${station.name} details`,
      size: 'modal-wide',
      submitLabel: null,
      body: UI.detailList([
        ['Status', UI.badge(status)],
        ['Specifications', esc(station.specs)],
        ['Hourly rate', Fmt.currency(station.hourlyRate)],
        ['Station ID', esc(station.id)],
        ['Completed sessions', completed.length],
        ['Total play time', Fmt.duration(totalMinutes)],
      ]) + `<h3 class="modal-subtitle">Recent sessions</h3>` + UI.table({
        caption: `Recent sessions on ${station.name}`,
        rows: history.slice(0, 5),
        empty: { title: 'No sessions yet', text: 'Sessions on this station will be listed here.' },
        columns: [
          { label: 'Session', render: (s) => esc(s.id) },
          { label: 'Customer', render: (s) => esc(Rules.customerName(s.customerId)) },
          { label: 'Started', render: (s) => Fmt.dateTime(s.startTime) },
          { label: 'Charge', className: 'num', render: (s) => Fmt.currency(Rules.sessionCharge(s)) },
          { label: 'Status', render: (s) => UI.badge(s.status) },
        ],
      }),
    });
  },

  actions: {
    add() { Stations.openForm(); },
    edit(data) { Stations.openForm(data.id); },
    view(data) { Stations.openDetails(data.id); },
    start(data) { Sessions.openStartModal(data.id); },

    /** Deactivate = soft delete: the station and its history are kept, but it can no longer be used. */
    deactivate(data) {
      const station = Rules.getStation(data.id);
      if (Rules.activeSessionForStation(station.id)) {
        UI.toast(`${station.name} has an active session. End it before deactivating.`, 'error');
        return;
      }
      const pending = Rules.pendingReservations().filter((r) => r.stationId === station.id).length;
      if (pending) {
        UI.toast(`${station.name} still has ${pending} upcoming reservation${pending > 1 ? 's' : ''}. Cancel or edit them first.`, 'error');
        return;
      }
      UI.confirm({
        title: `Deactivate ${station.name}?`,
        message: 'The station will be hidden from session and reservation forms. Its history is kept and you can reactivate it later.',
        confirmLabel: 'Deactivate', danger: true,
      }).then((ok) => {
        if (!ok) return;
        station.active = false; // TODO(API): PATCH /api/stations/:id { active:false }
        UI.toast(`${station.name} deactivated.`);
        App.commit();
      });
    },

    reactivate(data) {
      const station = Rules.getStation(data.id);
      station.active = true;
      UI.toast(`${station.name} reactivated.`);
      App.commit();
    },
  },
};