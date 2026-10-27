/* ==========================================================================
   data.js — CafeNyte prototype data layer
   --------------------------------------------------------------------------
   WHY THIS FILE EXISTS
   Every screen reads from ONE central object (DB.data). Keeping the data in
   one place means the dashboard, tables and reports can never disagree with
   each other.

   !! UI DEMONSTRATION DATA ONLY !!
   Nothing in here is a real database record. Later, the group will replace
   DB.load() / DB.save() / DB.nextId() with fetch() calls to the Node.js +
   Express + MySQL backend. Look for "TODO(API)" comments across the project.

   Load order: data.js -> rules.js -> ui.js -> page modules -> app.js
   ========================================================================== */
'use strict';

// Key used in the browser's localStorage so demo changes survive a refresh.
const STORAGE_KEY = 'cafenyte_demo_db_v1';

/**
 * Builds a fresh set of sample data.
 *
 * WHY relative dates: sessions, payments and reservations are generated
 * relative to "right now" so the dashboard always looks alive (active sessions,
 * upcoming reservations, today's revenue) no matter when the demo is opened.
 * Click "Reset demo data" in Settings to regenerate it at any time.
 */
function buildSeedData() {
  const MIN = 60000;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const minutesAgo = (m) => new Date(now.getTime() - m * MIN);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgoAt = (days, hour, minute) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour, minute);
  const toDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toHHMM = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  /* ---------- Users (staff accounts) ----------
     DEMO ONLY: passwords are stored in plain text so the login screen can be
     tested. A real system must NEVER do this — the backend must hash passwords
     (e.g. bcrypt) and issue a session/JWT. */
  const users = [
    { id: 'U-001', fullName: 'Alex Rivera',   username: 'admin',   password: 'admin123', role: 'admin', active: true },
    { id: 'U-002', fullName: 'Jamie Santos',  username: 'staff',   password: 'staff123', role: 'staff', active: true },
    { id: 'U-003', fullName: 'Mika Dela Cruz', username: 'mika.d', password: 'staff123', role: 'staff', active: true },
    { id: 'U-004', fullName: 'Paolo Reyes',   username: 'paolo.r', password: 'staff123', role: 'staff', active: false },
  ];

  /* ---------- Customers (fictional names, fictional numbers) ---------- */
  const customers = [
    ['Juan Dela Cruz', '0917 555 0101', 60],
    ['Maria Santos', '0917 555 0102', 55],
    ['Javier Mendoza', '', 50],
    ['Carla Ramos', '0917 555 0104', 45],
    ['Miguel Torres', '0917 555 0105', 40],
    ['Angela Bautista', '', 35],
    ['Rafael Cruz', '0917 555 0107', 30],
    ['Sofia Reyes', '0917 555 0108', 25],
    ['Daniel Garcia', '0917 555 0109', 20],
    ['Bea Villanueva', '0917 555 0110', 15],
    ['Kenji Aquino', '', 12],
    ['Liza Navarro', '0917 555 0112', 10],
  ].map(([fullName, contactNumber, daysAgo], i) => ({
    id: `C-${String(i + 1).padStart(3, '0')}`,
    fullName,
    contactNumber,
    registeredAt: daysAgoAt(daysAgo, 10, 0).toISOString(),
  }));

  /* ---------- Computer stations ----------
     WHY `status` only stores 'available' or 'maintenance': "In Use" and
     "Reserved" are DERIVED from sessions/reservations (see Rules.stationStatus).
     That way a station can never say "In Use" with no session behind it. */
  const stations = [
    ['PC-01', 'Intel i5-12400F · RTX 3050 · 16GB RAM · 144Hz', 40],
    ['PC-02', 'Intel i5-12400F · RTX 3050 · 16GB RAM · 144Hz', 40],
    ['PC-03', 'Intel i5-12400F · RTX 3050 · 16GB RAM · 144Hz', 40],
    ['PC-04', 'Intel i5-12400F · RTX 3050 · 16GB RAM · 144Hz', 40],
    ['PC-05', 'Intel i5-13400F · RTX 4060 · 16GB RAM · 165Hz', 50],
    ['PC-06', 'Intel i5-13400F · RTX 4060 · 16GB RAM · 165Hz', 50],
    ['PC-07', 'Intel i5-13400F · RTX 4060 · 16GB RAM · 165Hz', 50],
    ['PC-08', 'Ryzen 7 7700 · RTX 4070 · 32GB RAM · 240Hz', 60],
    ['PC-09', 'Ryzen 7 7700 · RTX 4070 · 32GB RAM · 240Hz', 60],
    ['PC-10', 'Ryzen 7 7800X3D · RTX 4070 Ti · 32GB RAM · 240Hz (VIP)', 80],
  ].map(([name, specs, hourlyRate], i) => ({
    id: `ST-${pad(i + 1)}`,
    name,
    specs,
    hourlyRate,
    status: name === 'PC-09' ? 'maintenance' : 'available',
    active: true,
  }));

  const customerByName = (n) => customers.find((c) => c.fullName === n);
  const stationByName = (n) => stations.find((s) => s.name === n);

  /* ---------- Sessions + payments ---------- */
  const sessions = [];
  const payments = [];
  let sessionNo = 1000;
  let paymentNo = 5000;

  /**
   * Adds one session (and its payment, if any) to the sample arrays.
   * WHY a helper: ~35 sample sessions are created below; one function keeps
   * IDs, charge maths and payment records consistent.
   * `Rules` is defined in rules.js; it exists by the time DB.load() runs.
   */
  const addSession = ({ customer, station, start, end = null, paidFraction = 1, method = 'Cash', clampToday = false }) => {
    const id = `S-${++sessionNo}`;
    const minutes = end ? (end.getTime() - start.getTime()) / MIN : 0;
    const charge = end ? Rules.calculateCharge(station.hourlyRate, minutes) : null;
    sessions.push({
      id,
      customerId: customer.id,
      stationId: station.id,
      startTime: start.toISOString(),
      endTime: end ? end.toISOString() : null,
      hourlyRate: station.hourlyRate, // snapshot: later rate edits must not change old sessions
      status: end ? 'completed' : 'active',
      charge,
      startedBy: 'U-002',
    });
    if (end && charge > 0 && paidFraction > 0) {
      let payAt = new Date(Math.min(now.getTime(), end.getTime() + 2 * MIN));
      if (clampToday) payAt = new Date(Math.max(payAt.getTime(), startOfToday.getTime() + MIN));
      payments.push({
        id: `P-${++paymentNo}`,
        sessionId: id,
        customerId: customer.id,
        amount: Rules.round2(charge * paidFraction),
        method,
        date: payAt.toISOString(),
        recordedBy: 'U-002',
      });
    }
  };

  // Past 6 days of completed history (drives the 7-day revenue chart).
  // A tiny seeded random generator keeps the history identical on every reset.
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const methods = ['Cash', 'GCash', 'Maya', 'Cash', 'GCash'];
  const durations = [45, 60, 90, 120, 150, 180];
  for (let day = 6; day >= 1; day--) {
    const count = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const start = daysAgoAt(day, 11 + Math.floor(rand() * 8), [0, 15, 30, 45][Math.floor(rand() * 4)]);
      const minutes = durations[Math.floor(rand() * durations.length)];
      addSession({
        customer: customers[Math.floor(rand() * customers.length)],
        station: stations[(day * 3 + i) % stations.length], // distinct station per session within a day
        start,
        end: new Date(start.getTime() + minutes * MIN),
        method: methods[Math.floor(rand() * methods.length)],
        // two deliberate leftovers so Billing shows "Partial" and "Unpaid" examples
        paidFraction: day === 3 && i === 0 ? 0.5 : day === 2 && i === 1 ? 0 : 1,
      });
    }
  }

  // Today — completed sessions (fully paid, partially paid, unpaid)
  addSession({ customer: customerByName('Maria Santos'), station: stationByName('PC-04'), start: minutesAgo(270), end: minutesAgo(150), method: 'Cash', clampToday: true });
  addSession({ customer: customerByName('Carla Ramos'), station: stationByName('PC-07'), start: minutesAgo(160), end: minutesAgo(100), method: 'GCash', clampToday: true });
  addSession({ customer: customerByName('Miguel Torres'), station: stationByName('PC-08'), start: minutesAgo(130), end: minutesAgo(70), method: 'Cash', paidFraction: 0.5, clampToday: true });
  addSession({ customer: customerByName('Angela Bautista'), station: stationByName('PC-10'), start: minutesAgo(100), end: minutesAgo(40), paidFraction: 0 });

  // Today — sessions still running (no end time, no charge yet, NOT revenue)
  addSession({ customer: customerByName('Juan Dela Cruz'), station: stationByName('PC-01'), start: minutesAgo(85) });
  addSession({ customer: customerByName('Javier Mendoza'), station: stationByName('PC-02'), start: minutesAgo(130) });
  addSession({ customer: customerByName('Sofia Reyes'), station: stationByName('PC-03'), start: minutesAgo(40) });
  addSession({ customer: customerByName('Daniel Garcia'), station: stationByName('PC-06'), start: minutesAgo(25) });

  /* ---------- Reservations ---------- */
  const reservations = [];
  let reservationNo = 2000;
  const addReservation = ({ customer, station, start, minutes, status = 'confirmed' }) => {
    let end = new Date(start.getTime() + minutes * MIN);
    // Keep every reservation inside one calendar day (the form enforces the same).
    if (toDateKey(end) !== toDateKey(start)) {
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59);
    }
    reservations.push({
      id: `R-${++reservationNo}`,
      customerId: customer.id,
      stationId: station.id,
      date: toDateKey(start),
      startTime: toHHMM(start),
      endTime: toHHMM(end),
      status,
      createdAt: minutesAgo(600).toISOString(),
      createdBy: 'U-002',
    });
  };

  const floor30 = new Date(now);
  floor30.setMinutes(now.getMinutes() < 30 ? 0 : 30, 0, 0);
  const next30 = new Date(floor30.getTime() + 30 * MIN);
  const tomorrowAt = (h, m) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m);

  addReservation({ customer: customerByName('Rafael Cruz'), station: stationByName('PC-05'), start: floor30, minutes: 120 });                        // happening now -> PC-05 "Reserved"
  addReservation({ customer: customerByName('Kenji Aquino'), station: stationByName('PC-04'), start: next30, minutes: 90 });
  addReservation({ customer: customerByName('Bea Villanueva'), station: stationByName('PC-07'), start: new Date(next30.getTime() + 60 * MIN), minutes: 120 });
  addReservation({ customer: customerByName('Liza Navarro'), station: stationByName('PC-10'), start: new Date(next30.getTime() + 120 * MIN), minutes: 120 });
  addReservation({ customer: customerByName('Maria Santos'), station: stationByName('PC-08'), start: tomorrowAt(14, 0), minutes: 120 });
  addReservation({ customer: customerByName('Javier Mendoza'), station: stationByName('PC-03'), start: tomorrowAt(10, 0), minutes: 60, status: 'cancelled' });
  addReservation({ customer: customerByName('Juan Dela Cruz'), station: stationByName('PC-02'), start: daysAgoAt(1, 17, 0), minutes: 120 });       // yesterday -> shows as Completed

  return {
    schemaVersion: 1,
    users,
    customers,
    stations,
    sessions,
    reservations,
    payments,
    settings: {
      cafeName: 'CafeNyte Gaming Café',
      address: '123 Sample Street, Calamba, Laguna',
      contactNumber: '0917 555 0000',
      openingHours: '10:00 AM – 12:00 AM',
      prefs: { compactTables: false, reduceMotion: false },
    },
    // Counters used to generate the next ID of each type (S-1013, P-5020 ...).
    counters: {
      session: sessionNo,
      payment: paymentNo,
      reservation: reservationNo,
      customer: customers.length,
      station: stations.length,
      user: users.length,
    },
  };
}

/**
 * DB — the ONLY object that touches storage.
 * WHY: if every module wrote to localStorage directly, swapping in a backend
 * would mean editing every file. With this wrapper only data.js changes.
 */
const DB = {
  data: null,

  /** TODO(API): replace with GET requests (users, customers, stations, sessions, reservations, payments, settings). */
  load() {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      console.warn('Saved demo data could not be read; using fresh sample data.', error);
    }
    this.data = stored && stored.schemaVersion === 1 ? stored : buildSeedData();
    if (!stored) this.save();
  },

  /** TODO(API): remove — the backend saves each change in its own POST/PUT/PATCH request. */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (error) {
      // Private browsing or full storage: the app still works for this tab.
      console.warn('Could not save demo data to localStorage.', error);
    }
  },

  /** Wipes saved demo data and rebuilds the sample set (used by Settings). */
  reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* ignore */ }
    this.data = buildSeedData();
    this.save();
  },

  /**
   * Generates the next ID, e.g. nextId('session', 'S') -> "S-1013".
   * TODO(API): the database (AUTO_INCREMENT / UUID) will create IDs instead.
   */
  nextId(kind, prefix, padLength = 0) {
    const next = (this.data.counters[kind] || 0) + 1;
    this.data.counters[kind] = next;
    return `${prefix}-${padLength ? String(next).padStart(padLength, '0') : next}`;
  },
};