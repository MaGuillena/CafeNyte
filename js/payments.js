/* ==========================================================================
   payments.js — Screen 7: Billing and Payments
   --------------------------------------------------------------------------
   Two views of the same data:
     Billing         one row per completed session (charge, paid, balance, status)
     Payment history one row per payment that was actually recorded
   Payments are recorded manually (Cash / GCash / Maya / Other). There is NO
   online payment gateway in this project.

   Money rules:
     - Revenue is only the sum of payment records (see Rules.revenueBetween), so
       a payment can never be counted twice.
     - A session is "Paid" only when payments >= charge; otherwise "Partial".
     - Overpayment and zero/negative amounts are rejected.
   ========================================================================== */
'use strict';

const Payments = {
  title: 'Billing & Payments',
  tab: 'billing', // which view is showing: 'billing' | 'history'

  render(container) {
    container.innerHTML = `
      ${UI.pageHeader({
        title: 'Billing & Payments',
        subtitle: 'Record manual payments and track unpaid balances',
        actionsHtml: `<button type="button" class="btn btn-primary" data-action="record">${icon('peso')} Record Payment</button>`,
      })}
      <section class="stat-grid" id="pay-stats" aria-label="Billing summary"></section>
      <div class="toolbar card">
        <div class="search-box">
          ${icon('search')}
          <label class="sr-only" for="pay-search">Search billing records</label>
          <input id="pay-search" type="search" placeholder="Search by customer, session or payment ID" data-filter autocomplete="off">
        </div>
        <div class="toolbar-field">
          <label for="pay-status-filter">Payment status</label>
          <select id="pay-status-filter" data-filter>
            ${UI.options([{ value: 'all', label: 'All' }, { value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partial' }, { value: 'unpaid', label: 'Unpaid' }])}
          </select>
        </div>
        <div class="toolbar-field"><label for="pay-from">From</label><input id="pay-from" type="date" data-filter></div>
        <div class="toolbar-field"><label for="pay-to">To</label><input id="pay-to" type="date" data-filter></div>
        <button type="button" class="btn btn-ghost" data-action="clear-filters">Clear filters</button>
      </div>
      <section class="card">
        <div class="tabs" role="tablist" aria-label="Billing views">
          <button type="button" role="tab" id="tab-billing" data-action="tab" data-tab="billing" aria-controls="pay-panel">Billing by session</button>
          <button type="button" role="tab" id="tab-history" data-action="tab" data-tab="history" aria-controls="pay-panel">Payment history</button>
        </div>
        <div id="pay-panel" role="tabpanel"></div>
      </section>`;
  },

  refresh() {
    const panel = $('#pay-panel');
    if (!panel) return;

    // ---- Summary cards (all derived from the payment + session records) ----
    const today = Rules.todayKey();
    const completed = DB.data.sessions.filter((s) => s.status === 'completed');
    const billed = completed.map((s) => ({ session: s, bill: Rules.billing(s) }));
    $('#pay-stats').innerHTML = [
      { icon: 'peso', label: 'Today’s recorded revenue', value: Fmt.currency(Rules.revenueBetween(today, today)), tone: 'green', hint: 'From recorded payments' },
      { icon: 'alert', label: 'Outstanding balance', value: Fmt.currency(Rules.outstandingFor(completed)), tone: 'red', hint: 'Completed sessions only' },
      { icon: 'x', label: 'Unpaid sessions', value: billed.filter((b) => b.bill.status === 'unpaid').length, tone: 'amber', hint: 'Nothing paid yet' },
      { icon: 'minus', label: 'Partially paid', value: billed.filter((b) => b.bill.status === 'partial').length, tone: 'purple', hint: 'Balance remaining' },
    ].map((c) => UI.statCard(c)).join('');

    // ---- Tab state (aria-selected tells screen readers which tab is active) ----
    $$('[role="tab"]', $('#page-content')).forEach((btn) => {
      const on = btn.dataset.tab === this.tab;
      btn.setAttribute('aria-selected', String(on));
      btn.classList.toggle('active', on);
    });
    panel.setAttribute('aria-labelledby', `tab-${this.tab}`);

    const filters = {
      query: $('#pay-search').value.trim().toLowerCase(),
      status: $('#pay-status-filter').value,
      from: $('#pay-from').value,
      to: $('#pay-to').value,
    };
    panel.innerHTML = this.tab === 'billing' ? this.billingTable(billed, filters) : this.historyTable(filters);
  },

  /** True if a date key falls inside the optional from/to filter. */
  inDateRange(key, { from, to }) {
    return (!from || key >= from) && (!to || key <= to);
  },

  billingTable(billed, filters) {
    const rows = billed
      .filter(({ session, bill }) => {
        const text = `${session.id} ${Rules.customerName(session.customerId)} ${Rules.stationName(session.stationId)}`.toLowerCase();
        return (!filters.query || text.includes(filters.query))
          && (filters.status === 'all' || bill.status === filters.status)
          && this.inDateRange(Rules.dateKey(session.endTime), filters);
      })
      .sort((a, b) => new Date(b.session.endTime) - new Date(a.session.endTime));

    return UI.table({
      caption: 'Billing by completed session',
      rows,
      empty: { title: 'No billing records match', text: 'Active sessions appear here once they are ended.' },
      columns: [
        { label: 'Session', render: ({ session }) => esc(session.id) },
        { label: 'Customer', render: ({ session }) => `<strong>${esc(Rules.customerName(session.customerId))}</strong>` },
        { label: 'Ended', render: ({ session }) => Fmt.dateTime(session.endTime) },
        { label: 'Charge', className: 'num', render: ({ bill }) => Fmt.currency(bill.charge) },
        { label: 'Paid', className: 'num', render: ({ bill }) => Fmt.currency(bill.paid) },
        { label: 'Balance', className: 'num', render: ({ bill }) => (bill.balance > 0 ? `<strong class="text-danger">${Fmt.currency(bill.balance)}</strong>` : Fmt.currency(0)) },
        { label: 'Status', render: ({ bill }) => UI.badge(bill.status) },
        {
          label: 'Actions',
          render: ({ session, bill }) => `<span class="row-actions">
            ${bill.balance > 0 ? `<button type="button" class="btn btn-sm btn-secondary" data-action="record" data-id="${esc(session.id)}">${icon('peso')} Pay</button>` : ''}
            ${UI.iconButton({ name: 'eye', label: `View billing details of ${session.id}`, action: 'session-details', data: { id: session.id } })}
          </span>`,
        },
      ],
    });
  },

  historyTable(filters) {
    const rows = DB.data.payments
      .filter((p) => {
        const session = Rules.getSession(p.sessionId);
        const status = session ? Rules.billing(session).status : 'paid';
        const text = `${p.id} ${p.sessionId} ${Rules.customerName(p.customerId)}`.toLowerCase();
        return (!filters.query || text.includes(filters.query))
          && (filters.status === 'all' || status === filters.status)
          && this.inDateRange(Rules.dateKey(p.date), filters);
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    return UI.table({
      caption: 'Payment history',
      rows,
      empty: { title: 'No payments match', text: 'Recorded payments will appear here.' },
      columns: [
        { label: 'Payment', render: (p) => esc(p.id) },
        { label: 'Date & time', render: (p) => Fmt.dateTime(p.date) },
        { label: 'Customer', render: (p) => `<strong>${esc(Rules.customerName(p.customerId))}</strong>` },
        { label: 'Session', render: (p) => esc(p.sessionId) },
        { label: 'Session charge', className: 'num', render: (p) => Fmt.currency(Rules.sessionCharge(Rules.getSession(p.sessionId))) },
        { label: 'Amount paid', className: 'num', render: (p) => `<strong>${Fmt.currency(p.amount)}</strong>` },
        { label: 'Method', render: (p) => esc(p.method) },
        { label: 'Session status', render: (p) => UI.badge(Rules.billing(Rules.getSession(p.sessionId)).status) },
        { label: 'Actions', render: (p) => UI.iconButton({ name: 'eye', label: `View payment ${p.id}`, action: 'payment-details', data: { id: p.id } }) },
      ],
    });
  },

  /* ------------------------------ Record a payment ------------------------------ */
  /** Opens the Record Payment modal. Pass a session id to preselect it (from Pay buttons). */
  openRecordModal(sessionId = null) {
    const candidates = DB.data.sessions
      .filter((s) => s.status === 'completed' && Rules.billing(s).balance > 0)
      .sort((a, b) => new Date(b.endTime) - new Date(a.endTime));

    if (!candidates.length) {
      UI.toast('Every completed session is fully paid. There is nothing to record.', 'info');
      return;
    }

    UI.modal({
      title: 'Record payment',
      subtitle: 'Payments are recorded manually; no online gateway is connected.',
      submitLabel: 'Record payment',
      body: `
        ${UI.field({
          label: 'Session', name: 'sessionId', required: true, value: sessionId || '',
          options: [{ value: '', label: 'Select a session with a balance' },
            ...candidates.map((s) => ({ value: s.id, label: `${s.id} · ${Rules.customerName(s.customerId)} · ${Rules.stationName(s.stationId)} · balance ${Fmt.currency(Rules.billing(s).balance)}` }))],
        })}
        <div id="pay-summary" class="summary-box" aria-live="polite"></div>
        ${UI.field({ label: 'Amount paid (₱)', name: 'amount', type: 'number', required: true, attrs: 'min="0.01" step="0.01" inputmode="decimal"', hint: 'Defaults to the full balance. Enter less for a partial payment.' })}
        ${UI.field({ label: 'Payment method', name: 'method', required: true, value: 'Cash', options: Rules.PAYMENT_METHODS.map((m) => ({ value: m, label: m })) })}`,
      onOpen: (form) => {
        const select = $('#f-sessionId', form);
        const amount = $('#f-amount', form);
        const summary = $('#pay-summary', form);

        // Shows charge/paid/balance for the chosen session and prefills the amount.
        const update = (prefill) => {
          const session = Rules.getSession(select.value);
          if (!session) { summary.innerHTML = '<p class="muted">Choose a session to see its balance.</p>'; return; }
          const bill = Rules.billing(session);
          summary.innerHTML = UI.detailList([['Charge', Fmt.currency(bill.charge)], ['Already paid', Fmt.currency(bill.paid)], ['Outstanding balance', `<strong>${Fmt.currency(bill.balance)}</strong>`]]);
          if (prefill) amount.value = bill.balance.toFixed(2);
        };
        select.addEventListener('change', () => update(true));
        update(Boolean(select.value));
      },
      onSubmit: (v) => {
        const errors = {};
        const session = Rules.getSession(v.sessionId);
        if (!session) errors.sessionId = 'Choose the session being paid.';

        const amount = Number(v.amount);
        const balance = session ? Rules.billing(session).balance : 0; // re-read: could have changed since the modal opened
        if (v.amount === '' || !Number.isFinite(amount)) errors.amount = 'Enter the amount as a number.';
        else if (amount <= 0) errors.amount = 'The amount must be greater than ₱0.00. Negative payments are not allowed.';
        else if (session && Rules.round2(amount) > balance) errors.amount = `That is more than the outstanding balance of ${Fmt.currency(balance)}.`;
        if (!Rules.PAYMENT_METHODS.includes(v.method)) errors.method = 'Choose a payment method.';
        if (Object.keys(errors).length) return UI.fail('The payment was not recorded.', errors);

        // TODO(API): POST /api/payments — the server must recompute the balance itself.
        DB.data.payments.push({
          id: DB.nextId('payment', 'P'),
          sessionId: session.id,
          customerId: session.customerId,
          amount: Rules.round2(amount),
          method: v.method,
          date: new Date().toISOString(),
          recordedBy: App.user.id,
        });
        const after = Rules.billing(session);
        UI.toast(after.status === 'paid'
          ? `Payment recorded. ${session.id} is fully paid.`
          : `Partial payment recorded. ${Fmt.currency(after.balance)} still unpaid on ${session.id}.`);
        App.commit();
      },
    });
  },

  openPaymentDetails(paymentId) {
    const p = Rules.getPayment(paymentId);
    if (!p) return;
    const session = Rules.getSession(p.sessionId);
    const bill = Rules.billing(session);
    UI.modal({
      title: `Payment ${p.id}`,
      submitLabel: null,
      body: UI.detailList([
        ['Customer', esc(Rules.customerName(p.customerId))],
        ['Session', esc(p.sessionId)],
        ['Amount paid', `<strong>${Fmt.currency(p.amount)}</strong>`],
        ['Method', esc(p.method)],
        ['Recorded', Fmt.dateTime(p.date)],
        ['Recorded by', esc(Rules.getUser(p.recordedBy)?.fullName || 'Unknown')],
        ['Session charge', Fmt.currency(bill.charge)],
        ['Total paid so far', Fmt.currency(bill.paid)],
        ['Remaining balance', Fmt.currency(bill.balance)],
        ['Session payment status', UI.badge(bill.status)],
      ]),
    });
  },

  actions: {
    record(data) { Payments.openRecordModal(data.id || null); },
    'session-details'(data) { Sessions.openDetails(data.id); },
    'payment-details'(data) { Payments.openPaymentDetails(data.id); },
    tab(data) { Payments.tab = data.tab; Payments.refresh(); },
    'clear-filters'() {
      ['#pay-search', '#pay-from', '#pay-to'].forEach((sel) => { $(sel).value = ''; });
      $('#pay-status-filter').value = 'all';
      Payments.refresh();
    },
  },
};