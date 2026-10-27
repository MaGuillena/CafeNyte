/* ==========================================================================
   reservations.js — Screen 6: Reservation Management
   Staff create and manage reservations on behalf of customers (there is no
   customer-facing booking portal). All conflict checking lives in
   Rules.validateReservation() so the future backend can reuse the same rules.
   ========================================================================== */
'use strict';

const Reservations = {
  title: 'Reservations',

  render(container) {
    container.innerHTML = `
      ${UI.pageHeader({
        title: 'Reservations',
        subtitle: 'Book stations for customers ahead of time',
        actionsHtml: `<button type="button" class="btn btn-primary" data-action="add">${icon('plus')} Create Reservation</button>`,
      })}
      <div class="toolbar card">
        <div class="search-box">
          ${icon('search')}
          <label class="sr-only" for="resv-search">Search reservations</label>
          <input id="resv-search" type="search" placeholder="Search by ID, customer or station" data-filter autocomplete="off">
        </div>
        <div class="toolbar-field">
          <label for="resv-status-filter">Status</label>
          <select id="resv-status-filter" data-filter>
            ${UI.options([
              { value: 'all', label: 'All statuses' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'ongoing', label: 'Ongoing' },
              { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' },
            ])}
          </select>
        </div>
        <div class="toolbar-field">
          <label for="resv-date-filter">Date</label>
          <input id="resv-date-filter" type="date" data-filter>
        </div>
        <button type="button" class="btn btn-ghost" data-action="clear-filters">Clear filters</button>
      </div>
      <section class="card" aria-label="Reservation list"><div id="resv-table"></div></section>`;
  },

  refresh() {
    const holder = $('#resv-table');
    if (!holder) return;
    const query = $('#resv-search').value.trim().toLowerCase();
    const statusFilter = $('#resv-status-filter').value;
    const dateFilter = $('#resv-date-filter').value;

    const rows = DB.data.reservations
      .filter((r) => {
        const haystack = `${r.id} ${Rules.customerName(r.customerId)} ${Rules.stationName(r.stationId)}`.toLowerCase();
        return (!query || haystack.includes(query))
          && (statusFilter === 'all' || Rules.reservationState(r) === statusFilter)
          && (!dateFilter || r.date === dateFilter);
      })
      .sort((a, b) => {
        // Open bookings first (soonest at top), then finished/cancelled ones (newest at top).
        const aOpen = ['upcoming', 'ongoing'].includes(Rules.reservationState(a));
        const bOpen = ['upcoming', 'ongoing'].includes(Rules.reservationState(b));
        const diff = Rules.reservationWindow(a).start - Rules.reservationWindow(b).start;
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        return aOpen ? diff : -diff;
      });

    holder.innerHTML = UI.table({
      caption: 'Reservations',
      rows,
      empty: { title: 'No reservations match', text: 'Clear the filters or create a new reservation.' },
      columns: [
        { label: 'Reservation', render: (r) => esc(r.id) },
        { label: 'Customer', render: (r) => `<strong>${esc(Rules.customerName(r.customerId))}</strong>` },
        { label: 'Station', render: (r) => (r.stationId ? esc(Rules.stationName(r.stationId)) : '<span class="muted">Not assigned</span>') },
        { label: 'Date', render: (r) => Fmt.dateKeyLabel(r.date) },
        { label: 'Start', render: (r) => Fmt.timeOfDay(r.startTime) },
        { label: 'End', render: (r) => Fmt.timeOfDay(r.endTime) },
        { label: 'Status', render: (r) => UI.badge(Rules.reservationState(r)) },
        { label: 'Actions', render: (r) => this.rowActions(r) },
      ],
    });
  },

  rowActions(r) {
    const state = Rules.reservationState(r);
    const id = { id: r.id };
    return `<span class="row-actions">
      ${UI.iconButton({ name: 'eye', label: `View ${r.id}`, action: 'details', data: id })}
      ${state === 'upcoming' ? UI.iconButton({ name: 'edit', label: `Edit ${r.id}`, action: 'edit', data: id }) : ''}
      ${['upcoming', 'ongoing'].includes(state) ? UI.iconButton({ name: 'x', label: `Cancel ${r.id}`, action: 'cancel', data: id, tone: 'danger' }) : ''}
    </span>`;
  },

  /** Create (no argument) or edit (reservation id) modal. */
  openForm(reservationId = null) {
    const resv = reservationId ? Rules.getReservation(reservationId) : null;
    const isEdit = Boolean(resv);
    if (isEdit && Rules.reservationState(resv) !== 'upcoming') {
      UI.toast('Only upcoming reservations can be edited.', 'error');
      return;
    }

    const customers = [...DB.data.customers].sort((a, b) => a.fullName.localeCompare(b.fullName));
    const stations = DB.data.stations.filter((s) => s.active)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    // Maintenance stations stay in the list ON PURPOSE: choosing one shows the validation message explaining why it can't be booked.
    const stationOptions = [{ value: '', label: 'No station yet (assign later)' },
      ...stations.map((s) => ({ value: s.id, label: `${s.name}${s.status === 'maintenance' ? ' (under maintenance)' : ''}` }))];

    UI.modal({
      title: isEdit ? `Edit ${resv.id}` : 'Create reservation',
      subtitle: 'Reservations must be in the future and cannot overlap on the same station.',
      submitLabel: isEdit ? 'Save changes' : 'Create reservation',
      body: [
        UI.field({ label: 'Customer', name: 'customerId', required: true, value: resv?.customerId || '',
          options: [{ value: '', label: 'Select a customer' }, ...customers.map((c) => ({ value: c.id, label: `${c.fullName} (${c.id})` }))] }),
        UI.field({ label: 'Station', name: 'stationId', value: resv?.stationId || '', options: stationOptions }),
        UI.field({ label: 'Date', name: 'date', type: 'date', required: true, value: resv?.date || '', attrs: `min="${Rules.todayKey()}"` }),
        `<div class="field-row">
          ${UI.field({ label: 'Start time', name: 'startTime', type: 'time', required: true, value: resv?.startTime || '' })}
          ${UI.field({ label: 'End time', name: 'endTime', type: 'time', required: true, value: resv?.endTime || '' })}
        </div>`,
      ].join(''),
      onSubmit: (v) => {
        const input = { id: resv?.id, customerId: v.customerId, stationId: v.stationId, date: v.date, startTime: v.startTime, endTime: v.endTime };
        const problem = Rules.validateReservation(input);
        if (problem) return UI.fail('This reservation can’t be saved. See the details below.', problem.errors);

        if (isEdit) {
          Object.assign(resv, { customerId: input.customerId, stationId: input.stationId, date: input.date, startTime: input.startTime, endTime: input.endTime });
          UI.toast(`Reservation ${resv.id} updated.`);
        } else {
          // TODO(API): POST /api/reservations — the backend must run the same conflict checks.
          DB.data.reservations.push({
            id: DB.nextId('reservation', 'R'), ...input, status: 'confirmed',
            createdAt: new Date().toISOString(), createdBy: App.user.id,
          });
          UI.toast('Reservation created.');
        }
        App.commit();
      },
    });
  },

  openDetails(reservationId) {
    const r = Rules.getReservation(reservationId);
    if (!r) return;
    UI.modal({
      title: `Reservation ${r.id}`,
      submitLabel: null,
      body: UI.detailList([
        ['Status', UI.badge(Rules.reservationState(r))],
        ['Customer', esc(Rules.customerName(r.customerId))],
        ['Station', r.stationId ? esc(Rules.stationName(r.stationId)) : '<span class="muted">Not assigned</span>'],
        ['Date', Fmt.dateKeyLabel(r.date)],
        ['Time', `${Fmt.timeOfDay(r.startTime)} – ${Fmt.timeOfDay(r.endTime)}`],
        ['Created', Fmt.dateTime(r.createdAt)],
        ['Created by', esc(Rules.getUser(r.createdBy)?.fullName || 'Unknown')],
      ]),
    });
  },

  actions: {
    add() { Reservations.openForm(); },
    edit(data) { Reservations.openForm(data.id); },
    details(data) { Reservations.openDetails(data.id); },

    cancel(data) {
      const r = Rules.getReservation(data.id);
      UI.confirm({
        title: `Cancel reservation ${r.id}?`,
        message: `${Rules.customerName(r.customerId)} on ${Fmt.dateKeyLabel(r.date)}, ${Fmt.timeOfDay(r.startTime)} – ${Fmt.timeOfDay(r.endTime)}. This cannot be undone.`,
        confirmLabel: 'Cancel reservation', cancelLabel: 'Keep reservation', danger: true,
      }).then((ok) => {
        if (!ok) return;
        r.status = 'cancelled'; // TODO(API): PATCH /api/reservations/:id { status:'cancelled' }
        UI.toast(`Reservation ${r.id} cancelled.`);
        App.commit();
      });
    },

    'clear-filters'() {
      $('#resv-search').value = '';
      $('#resv-status-filter').value = 'all';
      $('#resv-date-filter').value = '';
      Reservations.refresh();
    },
  },
};