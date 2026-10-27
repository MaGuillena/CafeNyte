/* ==========================================================================
   customers.js — Screen 4: Customer Management
   Only the minimum data is stored (name + optional contact number) to avoid
   collecting unnecessary personal information.
   ========================================================================== */
'use strict';

const Customers = {
  title: 'Customers',

  render(container) {
    container.innerHTML = `
      ${UI.pageHeader({
        title: 'Customers',
        subtitle: 'Register and look up café customers',
        actionsHtml: `<button type="button" class="btn btn-primary" data-action="add">${icon('plus')} Add Customer</button>`,
      })}
      <div class="toolbar card">
        <div class="search-box">
          ${icon('search')}
          <label class="sr-only" for="customer-search">Search customers</label>
          <input id="customer-search" type="search" placeholder="Search by name or customer ID" data-filter autocomplete="off">
        </div>
      </div>
      <section class="card" aria-label="Customer list"><div id="customer-table"></div></section>`;
  },

  refresh() {
    const holder = $('#customer-table');
    if (!holder) return;
    const query = $('#customer-search').value.trim().toLowerCase();
    const rows = DB.data.customers
      .filter((c) => !query || c.fullName.toLowerCase().includes(query) || c.id.toLowerCase().includes(query))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    holder.innerHTML = UI.table({
      caption: 'Customers',
      rows,
      empty: { title: 'No customers found', text: query ? 'Check the spelling or try the customer ID.' : 'Add your first customer to get started.' },
      columns: [
        { label: 'Customer ID', render: (c) => esc(c.id) },
        { label: 'Full name', render: (c) => `<strong>${esc(c.fullName)}</strong>` },
        { label: 'Contact number', render: (c) => (c.contactNumber ? esc(c.contactNumber) : '<span class="muted">Not provided</span>') },
        { label: 'Registered', render: (c) => Fmt.date(c.registeredAt) },
        { label: 'Sessions', className: 'num', render: (c) => Rules.sessionsForCustomer(c.id).length },
        {
          label: 'Actions',
          render: (c) => `<span class="row-actions">
            ${UI.iconButton({ name: 'eye', label: `View ${c.fullName}`, action: 'view', data: { id: c.id } })}
            ${UI.iconButton({ name: 'edit', label: `Edit ${c.fullName}`, action: 'edit', data: { id: c.id } })}
          </span>`,
        },
      ],
    });
  },

  /** Add/Edit modal (also opened from the Dashboard quick action). */
  openForm(customerId = null) {
    const customer = customerId ? Rules.getCustomer(customerId) : null;
    const isEdit = Boolean(customer);

    UI.modal({
      title: isEdit ? 'Edit customer' : 'Add customer',
      subtitle: isEdit ? customer.id : 'Only a name is required.',
      submitLabel: isEdit ? 'Save changes' : 'Add customer',
      body: [
        UI.field({ label: 'Full name', name: 'fullName', required: true, value: customer?.fullName || '', placeholder: 'e.g. Juan Dela Cruz', attrs: 'maxlength="60" autocomplete="off"' }),
        UI.field({ label: 'Contact number', name: 'contactNumber', type: 'tel', value: customer?.contactNumber || '', placeholder: 'Optional', hint: 'Optional. Digits, spaces, + and - only.', attrs: 'maxlength="20" autocomplete="off"' }),
      ].join(''),
      onSubmit: (v) => {
        const errors = {};
        const fullName = v.fullName.trim().replace(/\s+/g, ' ');
        const contactNumber = v.contactNumber.trim();

        if (!fullName) errors.fullName = 'Enter the customer’s full name.';
        else if (fullName.length < 2) errors.fullName = 'The name needs at least 2 characters.';
        // 7-15 digits once spaces and symbols are ignored.
        if (contactNumber) {
          const digits = contactNumber.replace(/\D/g, '').length;
          if (!/^[0-9+\-\s()]+$/.test(contactNumber) || digits < 7 || digits > 15) {
            errors.contactNumber = 'Enter a valid number (7–15 digits), or leave it blank.';
          }
        }
        if (Object.keys(errors).length) return UI.fail('Please fix the highlighted fields.', errors);

        if (isEdit) {
          Object.assign(customer, { fullName, contactNumber });
          UI.toast(`${fullName} updated.`);
        } else {
          // TODO(API): POST /api/customers
          DB.data.customers.push({ id: DB.nextId('customer', 'C', 3), fullName, contactNumber, registeredAt: new Date().toISOString() });
          UI.toast(`${fullName} added as a customer.`);
        }
        App.commit();
      },
    });
  },

  /** Customer details + gaming session history. */
  openDetails(customerId) {
    const customer = Rules.getCustomer(customerId);
    if (!customer) return;
    const totals = Rules.customerTotals(customer.id);
    const history = Rules.sessionsForCustomer(customer.id).sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    UI.modal({
      title: customer.fullName,
      subtitle: customer.id,
      size: 'modal-wide',
      submitLabel: null,
      body: UI.detailList([
        ['Contact number', customer.contactNumber ? esc(customer.contactNumber) : '<span class="muted">Not provided</span>'],
        ['Registered', Fmt.date(customer.registeredAt)],
        ['Recorded sessions', totals.sessionCount],
        ['Total paid', Fmt.currency(totals.totalPaid)],
        ['Outstanding balance', totals.outstanding > 0 ? `<strong class="text-danger">${Fmt.currency(totals.outstanding)}</strong>` : Fmt.currency(0)],
      ]) + `<h3 class="modal-subtitle">Gaming session history</h3>` + UI.table({
        caption: `Session history for ${customer.fullName}`,
        rows: history,
        empty: { title: 'No sessions yet', text: 'This customer has not played yet.' },
        columns: [
          { label: 'Session', render: (s) => esc(s.id) },
          { label: 'Station', render: (s) => esc(Rules.stationName(s.stationId)) },
          { label: 'Started', render: (s) => Fmt.dateTime(s.startTime) },
          { label: 'Duration', render: (s) => Fmt.duration(Rules.elapsedMinutes(s.startTime, s.endTime)) },
          { label: 'Charge', className: 'num', render: (s) => Fmt.currency(Rules.sessionCharge(s)) },
          { label: 'Payment', render: (s) => UI.badge(Rules.billing(s).status) },
        ],
      }),
    });
  },

  actions: {
    add() { Customers.openForm(); },
    edit(data) { Customers.openForm(data.id); },
    view(data) { Customers.openDetails(data.id); },
  },
};