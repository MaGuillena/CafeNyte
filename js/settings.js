/* ==========================================================================
   settings.js — Screen 10: Settings and Account Information
   Kept intentionally small: account info, basic café info, two interface
   preferences, and a reset button for the demo data.
   ========================================================================== */
'use strict';

const Settings = {
  title: 'Settings',

  render(container) {
    const user = App.user;
    const s = DB.data.settings;
    const isAdmin = user.role === 'admin';
    // Staff can read the café info but only administrators may change it.
    const lock = isAdmin ? '' : 'readonly';

    container.innerHTML = `
      ${UI.pageHeader({ title: 'Settings', subtitle: 'Your account, café details and interface preferences' })}
      <div class="grid-2 even">
        <section class="card" aria-labelledby="set-account-title">
          <div class="card-head"><h2 id="set-account-title">Account information</h2></div>
          ${UI.detailList([
            ['Full name', esc(user.fullName)],
            ['Username', esc(user.username)],
            ['Role', UI.badge(user.role)],
            ['User ID', esc(user.id)],
          ])}
        </section>

        <section class="card" aria-labelledby="set-cafe-title">
          <div class="card-head"><h2 id="set-cafe-title">Café information</h2></div>
          <div id="cafe-form">
            <div class="field"><span class="label-like">System name</span><output class="rate-output">CafeNyte · Gaming Café Management System</output></div>
            ${UI.field({ label: 'Café name', name: 'cafeName', required: true, value: s.cafeName, attrs: `maxlength="60" ${lock}` })}
            ${UI.field({ label: 'Address', name: 'address', value: s.address, attrs: `maxlength="120" ${lock}` })}
            ${UI.field({ label: 'Contact number', name: 'contactNumber', value: s.contactNumber, attrs: `maxlength="20" ${lock}` })}
            ${UI.field({ label: 'Opening hours', name: 'openingHours', value: s.openingHours, attrs: `maxlength="60" ${lock}` })}
            ${isAdmin
              ? `<button type="button" class="btn btn-primary" data-action="save-cafe">${icon('check')} Save café information</button>`
              : '<p class="muted">Only administrators can change café information.</p>'}
          </div>
        </section>
      </div>

      <section class="card" aria-labelledby="set-prefs-title">
        <div class="card-head"><h2 id="set-prefs-title">Interface preferences</h2></div>
        <label class="checkbox"><input type="checkbox" data-action="pref-compact" ${s.prefs.compactTables ? 'checked' : ''}> Compact tables (smaller row spacing)</label>
        <label class="checkbox"><input type="checkbox" data-action="pref-motion" ${s.prefs.reduceMotion ? 'checked' : ''}> Reduce animations</label>
      </section>

      ${isAdmin ? `<section class="card" aria-labelledby="set-demo-title">
        <div class="card-head"><h2 id="set-demo-title">Demo data</h2></div>
        <p class="muted">This prototype stores sample data in this browser only (localStorage). It is not a real database. Resetting rebuilds the sample customers, sessions, reservations and payments relative to the current time.</p>
        <button type="button" class="btn btn-danger" data-action="reset-demo">${icon('power')} Reset demo data</button>
      </section>` : ''}`;
  },

  // Nothing to refresh: this page only shows static values and editable inputs we must not overwrite.
  refresh() {},

  actions: {
    'save-cafe'() {
      const form = $('#cafe-form');
      UI.clearErrors(form);
      const value = (name) => $(`[name="${name}"]`, form).value.trim();
      if (!value('cafeName')) {
        UI.showErrors(form, { cafeName: 'Enter the café name.' });
        return;
      }
      Object.assign(DB.data.settings, {
        cafeName: value('cafeName'), address: value('address'),
        contactNumber: value('contactNumber'), openingHours: value('openingHours'),
      });
      UI.toast('Café information saved.'); // TODO(API): PUT /api/settings
      App.commit();
    },

    'pref-compact'(data, el) {
      DB.data.settings.prefs.compactTables = el.checked;
      App.applyPreferences();
      App.commit();
    },

    'pref-motion'(data, el) {
      DB.data.settings.prefs.reduceMotion = el.checked;
      App.applyPreferences();
      App.commit();
    },

    'reset-demo'() {
      UI.confirm({
        title: 'Reset all demo data?',
        message: 'Every change you made in this browser will be replaced with fresh sample data. This cannot be undone.',
        confirmLabel: 'Reset data', danger: true,
      }).then((ok) => {
        if (!ok) return;
        DB.reset();
        // Sample user IDs are the same after a reset; refresh the signed-in user's object from the new data.
        App.user = Rules.getUser(App.user.id) || DB.data.users[0];
        App.applyPreferences();
        UI.toast('Demo data reset.');
        App.showPage(App.currentPage);
      });
    },
  },
};