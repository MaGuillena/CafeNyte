/* ==========================================================================
   reports.js — Screen 8: Reports
   --------------------------------------------------------------------------
   Everything on this page is DERIVED from DB.data through Rules.* so it
   updates automatically whenever sessions or payments change. This is a
   simple report page, not an accounting module.
   ========================================================================== */
'use strict';

const Reports = {
  title: 'Reports',
  MAX_DAYS: 366, // WHY a cap: protects the daily table from absurdly large ranges

  render(container) {
    const today = Rules.todayKey();
    container.innerHTML = `
      ${UI.pageHeader({
        title: 'Reports',
        subtitle: 'Revenue, sessions and station usage',
        actionsHtml: `<button type="button" class="btn btn-secondary" data-action="export">${icon('download')} Export CSV</button>`,
      })}
      <div class="toolbar card">
        <div class="toolbar-field"><label for="report-from">From</label><input id="report-from" type="date" value="${Rules.addDaysToKey(today, -6)}" max="${today}" data-filter></div>
        <div class="toolbar-field"><label for="report-to">To</label><input id="report-to" type="date" value="${today}" max="${today}" data-filter></div>
        <div class="preset-group" role="group" aria-label="Quick date ranges">
          <button type="button" class="btn btn-ghost btn-sm" data-action="preset" data-range="today">Today</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="preset" data-range="week">Last 7 days</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="preset" data-range="month">This month</button>
        </div>
      </div>
      <p class="form-error" id="report-error" role="alert" hidden></p>
      <div id="report-body">
        <section class="stat-grid" id="report-stats" aria-label="Report summary"></section>
        <div class="grid-2 even">
          <section class="card"><div class="card-head"><h2>Daily revenue</h2></div><div id="report-daily"></div></section>
          <section class="card"><div class="card-head"><h2>Station usage</h2></div><div id="report-usage"></div></section>
        </div>
        <section class="card"><div class="card-head"><h2>Transactions in range</h2></div><div id="report-transactions"></div></section>
      </div>`;
  },

  /** Reads and validates the date range. Returns { from, to } or null (and shows an inline error). */
  getRange() {
    const from = $('#report-from').value;
    const to = $('#report-to').value;
    const error = $('#report-error');
    let message = '';

    if (!from || !to) message = 'Choose both a start and an end date.';
    else if (from > to) message = 'The start date must be on or before the end date.';
    else if ((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000 + 1 > this.MAX_DAYS) {
      message = `Choose a range of ${this.MAX_DAYS} days or fewer.`;
    }
    error.hidden = !message;
    error.textContent = message;
    $('#report-body').hidden = Boolean(message);
    return message ? null : { from, to };
  },

  refresh() {
    if (!$('#report-from')) return;
    const range = this.getRange();
    if (!range) return;
    const { from, to } = range;
    const today = Rules.todayKey();

    const payments = Rules.paymentsInRange(from, to);
    const endedSessions = Rules.sessionsEndedInRange(from, to);
    const rangeRevenue = Rules.revenueBetween(from, to);

    $('#report-stats').innerHTML = [
      { icon: 'peso', label: 'Daily revenue (today)', value: Fmt.currency(Rules.revenueBetween(today, today)), tone: 'green', hint: 'Independent of the date range' },
      { icon: 'chart', label: 'Revenue in range', value: Fmt.currency(rangeRevenue), tone: 'purple', hint: `${Fmt.dateKeyLabel(from)} – ${Fmt.dateKeyLabel(to)}` },
      { icon: 'gamepad', label: 'Completed sessions', value: endedSessions.length, tone: 'magenta', hint: 'Ended within the range' },
      { icon: 'card', label: 'Recorded payments', value: payments.length, tone: 'amber', hint: 'Payment records in range' },
      { icon: 'alert', label: 'Outstanding balances', value: Fmt.currency(Rules.outstandingFor(endedSessions)), tone: 'red', hint: 'Unpaid part of sessions in range' },
    ].map((c) => UI.statCard(c)).join('');

    // ---- Daily revenue: one row per calendar day in the range (newest first) ----
    const days = [];
    for (let key = from; key <= to; key = Rules.addDaysToKey(key, 1)) days.push(key);
    const dailyRows = days.reverse().map((key) => ({
      key,
      revenue: Rules.revenueBetween(key, key),
      paymentCount: Rules.paymentsInRange(key, key).length,
      sessionCount: Rules.sessionsEndedInRange(key, key).length,
    }));
    $('#report-daily').innerHTML = UI.table({
      caption: 'Revenue per day',
      rows: dailyRows,
      empty: { title: 'No days in range' },
      columns: [
        { label: 'Date', render: (r) => Fmt.dateKeyLabel(r.key) },
        { label: 'Sessions', className: 'num', render: (r) => r.sessionCount },
        { label: 'Payments', className: 'num', render: (r) => r.paymentCount },
        { label: 'Revenue', className: 'num', render: (r) => `<strong>${Fmt.currency(r.revenue)}</strong>` },
      ],
    });

    // ---- Station usage summary ----
    const usage = Rules.stationUsage(from, to).sort((a, b) => a.station.name.localeCompare(b.station.name, undefined, { numeric: true }));
    $('#report-usage').innerHTML = UI.table({
      caption: 'Station usage in range',
      rows: usage,
      empty: { title: 'No stations' },
      columns: [
        { label: 'Station', render: (u) => `<strong>${esc(u.station.name)}</strong>` },
        { label: 'Sessions', className: 'num', render: (u) => u.sessionCount },
        { label: 'Hours played', className: 'num', render: (u) => (u.minutes / 60).toFixed(1) },
        { label: 'Charges', className: 'num', render: (u) => Fmt.currency(u.charges) },
      ],
    });

    // ---- Readable transaction table (same rows as the CSV export) ----
    $('#report-transactions').innerHTML = UI.table({
      caption: 'Transactions in the selected range',
      rows: [...payments].sort((a, b) => new Date(b.date) - new Date(a.date)),
      empty: { title: 'No payments in this range', text: 'Try a wider date range.' },
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

  /** Quick range buttons so staff don't have to pick two dates for the common cases. */
  applyPreset(kind) {
    const today = Rules.todayKey();
    const first = `${today.slice(0, 8)}01`; // first day of the current month
    const ranges = { today: [today, today], week: [Rules.addDaysToKey(today, -6), today], month: [first, today] };
    [$('#report-from').value, $('#report-to').value] = ranges[kind] || ranges.week;
    this.refresh();
  },

  /**
   * Downloads the transaction table as a CSV file.
   * WHY a Blob + temporary link: it works fully in the browser with no server.
   * TODO(API): a backend could generate the file instead (GET /api/reports/transactions.csv).
   */
  exportCsv() {
    const range = this.getRange();
    if (!range) { UI.toast('Fix the date range before exporting.', 'error'); return; }

    const header = ['Payment ID', 'Date', 'Time', 'Customer', 'Session', 'Station', 'Method', 'Amount (PHP)'];
    const lines = Rules.paymentsInRange(range.from, range.to)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((p) => {
        const session = Rules.getSession(p.sessionId);
        return [p.id, Rules.dateKey(p.date), Fmt.time(p.date), Rules.customerName(p.customerId), p.sessionId, session ? Rules.stationName(session.stationId) : '', p.method, p.amount.toFixed(2)];
      });

    // Quote every cell, double any quotes, and neutralise leading = + - @ so spreadsheet apps never run a typed name as a formula.
    const cell = (value) => {
      let text = String(value);
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = [header, ...lines].map((row) => row.map(cell).join(',')).join('\r\n');

    // The BOM (\ufeff) makes Excel read the ₱-free UTF-8 file with correct characters.
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cafenyte-transactions_${range.from}_to_${range.to}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    UI.toast(`Exported ${lines.length} transaction${lines.length === 1 ? '' : 's'} to CSV.`);
  },

  actions: {
    preset(data) { Reports.applyPreset(data.range); },
    export() { Reports.exportCsv(); },
  },
};