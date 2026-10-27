/* ==========================================================================
   rules.js — business rules, lookups and calculations
   --------------------------------------------------------------------------
   WHY A SEPARATE FILE
   Screens (HTML) should only DISPLAY things. Every decision — "can this
   station start a session?", "how much is the charge?", "does this
   reservation overlap?" — lives here once. Pages and the future backend can
   share the same logic instead of copying it, and calculation bugs get fixed
   in one place.

   Nothing in here changes data except where a comment says so.
   ========================================================================== */
'use strict';

const Rules = {
  /* ------------------------------------------------------------------
     Configurable pricing / booking rules.
     WHY exposed here: the brief says extra rules must be configurable and
     documented, never silent. Defaults below keep the plain formula.
     ------------------------------------------------------------------ */
  CONFIG: {
    // 0 = pure formula (Hourly Rate × Minutes ÷ 60). Set to e.g. 15 to bill at least 15 minutes.
    minimumBillableMinutes: 0,
    // A reservation cannot START within this many minutes of a station that is still running a session
    // (the session has no end time, so we assume it may continue for a while).
    activeSessionBufferMinutes: 30,
    // Dashboard/notification warning for very long sessions.
    longSessionWarningMinutes: 180,
  },

  PAYMENT_METHODS: ['Cash', 'GCash', 'Maya', 'Other'],

  /* ============================== Basics ============================== */

  /** Rounds to 2 decimals. WHY: floating point maths (0.1 + 0.2) would otherwise show ₱0.30000000000000004. */
  round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  },

  pad(n) {
    return String(n).padStart(2, '0');
  },

  /** Local calendar day as "YYYY-MM-DD". WHY local: staff think in café time, not UTC. */
  dateKey(value) {
    const d = value instanceof Date ? value : new Date(value);
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
  },

  todayKey() {
    return this.dateKey(new Date());
  },

  addDaysToKey(key, delta) {
    const d = new Date(`${key}T00:00:00`);
    d.setDate(d.getDate() + delta);
    return this.dateKey(d);
  },

  /** Combines "2026-10-27" + "14:30" into a Date in local time. */
  parseLocal(dateKey, hhmm) {
    return new Date(`${dateKey}T${hhmm}:00`);
  },

  /* ============================== Lookups ============================== */
  getUser(id) { return DB.data.users.find((u) => u.id === id) || null; },
  getCustomer(id) { return DB.data.customers.find((c) => c.id === id) || null; },
  getStation(id) { return DB.data.stations.find((s) => s.id === id) || null; },
  getSession(id) { return DB.data.sessions.find((s) => s.id === id) || null; },
  getReservation(id) { return DB.data.reservations.find((r) => r.id === id) || null; },
  getPayment(id) { return DB.data.payments.find((p) => p.id === id) || null; },

  customerName(id) { const c = this.getCustomer(id); return c ? c.fullName : 'Unknown customer'; },
  stationName(id) { const s = this.getStation(id); return s ? s.name : '—'; },

  /* ============================== Billing ============================== */

  /** Minutes between two timestamps (end defaults to "now" for running sessions). */
  elapsedMinutes(startIso, endIso = null) {
    const end = endIso ? new Date(endIso) : new Date();
    return Math.max(0, (end.getTime() - new Date(startIso).getTime()) / 60000);
  },

  /** THE billing formula: Session Charge = Hourly Rate × (Elapsed Minutes ÷ 60), rounded to 2 decimals. */
  calculateCharge(hourlyRate, elapsedMinutes) {
    const billable = Math.max(elapsedMinutes, this.CONFIG.minimumBillableMinutes);
    return this.round2(hourlyRate * (billable / 60));
  },

  /** Completed sessions use their saved charge; running sessions show a live estimate. */
  sessionCharge(session) {
    if (session.status === 'completed') return session.charge;
    return this.calculateCharge(session.hourlyRate, this.elapsedMinutes(session.startTime));
  },

  paymentsForSession(sessionId) {
    return DB.data.payments.filter((p) => p.sessionId === sessionId);
  },

  amountPaid(sessionId) {
    return this.round2(this.paymentsForSession(sessionId).reduce((sum, p) => sum + p.amount, 0));
  },

  /**
   * Charge / paid / balance / status for a session.
   * WHY computed instead of stored: a stored "paid" flag could drift out of
   * sync with the payment records. Computing it from the payments means
   * the status is always correct.
   */
  billing(session) {
    const charge = this.sessionCharge(session);
    const paid = this.amountPaid(session.id);
    const balance = this.round2(Math.max(charge - paid, 0));
    let status;
    if (session.status !== 'completed') status = 'in_progress';
    else if (balance <= 0) status = 'paid';
    else if (paid > 0) status = 'partial';
    else status = 'unpaid';
    return { charge, paid, balance, status };
  },

  /* ============================== Sessions ============================== */
  activeSessions() {
    return DB.data.sessions.filter((s) => s.status === 'active');
  },

  activeSessionForStation(stationId) {
    return DB.data.sessions.find((s) => s.status === 'active' && s.stationId === stationId) || null;
  },

  sessionsForCustomer(customerId) {
    return DB.data.sessions.filter((s) => s.customerId === customerId);
  },

  /* ============================ Reservations ============================ */
  reservationWindow(r) {
    return { start: this.parseLocal(r.date, r.startTime), end: this.parseLocal(r.date, r.endTime) };
  },

  /**
   * Display state of a reservation. WHY derived: only 'confirmed' / 'cancelled'
   * are stored; whether it is upcoming, ongoing or completed depends on the clock.
   */
  reservationState(r, now = new Date()) {
    if (r.status === 'cancelled') return 'cancelled';
    const { start, end } = this.reservationWindow(r);
    if (end <= now) return 'completed';
    if (start <= now) return 'ongoing';
    return 'upcoming';
  },

  /** Upcoming + ongoing reservations, soonest first. */
  pendingReservations(now = new Date()) {
    return DB.data.reservations
      .filter((r) => ['upcoming', 'ongoing'].includes(this.reservationState(r, now)))
      .sort((a, b) => this.reservationWindow(a).start - this.reservationWindow(b).start);
  },

  currentReservationForStation(stationId, now = new Date()) {
    return DB.data.reservations.find((r) => r.stationId === stationId && this.reservationState(r, now) === 'ongoing') || null;
  },

  timesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  },

  /**
   * Checks a reservation form BEFORE saving.
   * Returns null when valid, otherwise { errors: { fieldName: message } }.
   * Field names match the <input name="..."> values so the UI can show each
   * message right under the correct field.
   * TODO(API): the backend must repeat these checks — never trust the browser alone.
   */
  validateReservation(input, now = new Date()) {
    const errors = {};
    if (!input.customerId) errors.customerId = 'Choose a customer.';
    if (!input.date) errors.date = 'Choose a reservation date.';
    if (!input.startTime) errors.startTime = 'Enter a start time.';
    if (!input.endTime) errors.endTime = 'Enter an end time.';
    if (Object.keys(errors).length) return { errors };

    const start = this.parseLocal(input.date, input.startTime);
    const end = this.parseLocal(input.date, input.endTime);

    if (end <= start) {
      return { errors: { endTime: 'End time must be later than the start time.' } };
    }
    if (start < now) {
      return { errors: { startTime: 'That time slot has already started or passed. Choose a future start time.' } };
    }

    if (input.stationId) {
      const station = this.getStation(input.stationId);
      if (!station || !station.active) {
        return { errors: { stationId: 'That station is not available for booking.' } };
      }
      if (station.status === 'maintenance') {
        return { errors: { stationId: `${station.name} is under maintenance and cannot be reserved.` } };
      }

      // Overlap with another confirmed reservation on the same station and day.
      const clash = DB.data.reservations.find((r) => {
        if (r.id === input.id || r.status === 'cancelled' || r.stationId !== station.id || r.date !== input.date) return false;
        const w = this.reservationWindow(r);
        return this.timesOverlap(start, end, w.start, w.end);
      });
      if (clash) {
        return {
          errors: {
            stationId: `${station.name} is already reserved by ${this.customerName(clash.customerId)} from ${Fmt.timeOfDay(clash.startTime)} to ${Fmt.timeOfDay(clash.endTime)} (${clash.id}). Pick another time or station.`,
          },
        };
      }

      // A running session has no end time, so keep new bookings a safe distance away.
      const running = this.activeSessionForStation(station.id);
      const buffer = this.CONFIG.activeSessionBufferMinutes;
      if (running && start.getTime() - now.getTime() < buffer * 60000) {
        return {
          errors: {
            stationId: `${station.name} has an active session (${this.customerName(running.customerId)}, started ${Fmt.time(running.startTime)}). A reservation cannot start within ${buffer} minutes of a running session.`,
          },
        };
      }
    }
    return null;
  },

  /* ============================== Stations ============================== */

  /**
   * The ONE place that decides a station's status.
   * Priority: inactive > maintenance > in use > reserved (right now) > available.
   */
  stationStatus(station, now = new Date()) {
    if (!station.active) return 'inactive';
    if (station.status === 'maintenance') return 'maintenance';
    if (this.activeSessionForStation(station.id)) return 'in_use';
    if (this.currentReservationForStation(station.id, now)) return 'reserved';
    return 'available';
  },

  stationCounts() {
    const counts = { total: 0, available: 0, in_use: 0, reserved: 0, maintenance: 0 };
    DB.data.stations.filter((s) => s.active).forEach((s) => {
      counts.total += 1;
      counts[this.stationStatus(s)] += 1;
    });
    return counts;
  },

  /** Rule: only an "available" station may start a new session. Returns { ok, reason }. */
  canStartSession(stationId) {
    const station = this.getStation(stationId);
    if (!station) return { ok: false, reason: 'Station not found.' };
    const status = this.stationStatus(station);
    const reasons = {
      available: '',
      in_use: `${station.name} is already in use.`,
      reserved: `${station.name} is reserved for the current time.`,
      maintenance: `${station.name} is under maintenance.`,
      inactive: `${station.name} is deactivated.`,
    };
    return { ok: status === 'available', reason: reasons[status] };
  },

  /* ============================== Revenue ============================== */

  /**
   * Revenue = money actually recorded as payments within the date range.
   * WHY payments only: unpaid or running session charges are NOT revenue yet,
   * and summing the payments array once guarantees nothing is counted twice.
   */
  paymentsInRange(fromKey, toKey) {
    return DB.data.payments.filter((p) => {
      const key = this.dateKey(p.date);
      return key >= fromKey && key <= toKey;
    });
  },

  revenueBetween(fromKey, toKey) {
    return this.round2(this.paymentsInRange(fromKey, toKey).reduce((sum, p) => sum + p.amount, 0));
  },

  /** Revenue per day for the last N days (oldest first) — used by the dashboard chart. */
  dailyRevenue(days) {
    const today = this.todayKey();
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = this.addDaysToKey(today, -i);
      const d = new Date(`${key}T00:00:00`);
      out.push({
        key,
        label: `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`,
        total: this.revenueBetween(key, key),
        isToday: i === 0,
      });
    }
    return out;
  },

  /* ============================== Reports ============================== */
  sessionsEndedInRange(fromKey, toKey) {
    return DB.data.sessions.filter((s) => {
      if (s.status !== 'completed') return false;
      const key = this.dateKey(s.endTime);
      return key >= fromKey && key <= toKey;
    });
  },

  stationUsage(fromKey, toKey) {
    const ended = this.sessionsEndedInRange(fromKey, toKey);
    return DB.data.stations.map((station) => {
      const mine = ended.filter((s) => s.stationId === station.id);
      return {
        station,
        sessionCount: mine.length,
        minutes: mine.reduce((sum, s) => sum + this.elapsedMinutes(s.startTime, s.endTime), 0),
        charges: this.round2(mine.reduce((sum, s) => sum + s.charge, 0)),
      };
    });
  },

  /** Total unpaid balance across a list of completed sessions. */
  outstandingFor(sessionList) {
    return this.round2(sessionList.reduce((sum, s) => sum + this.billing(s).balance, 0));
  },

  customerTotals(customerId) {
    const mine = this.sessionsForCustomer(customerId);
    const completed = mine.filter((s) => s.status === 'completed');
    return {
      sessionCount: mine.length,
      totalPaid: this.round2(DB.data.payments.filter((p) => p.customerId === customerId).reduce((sum, p) => sum + p.amount, 0)),
      outstanding: this.outstandingFor(completed),
    };
  },
};