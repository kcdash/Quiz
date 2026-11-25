/* Shared data layer for the quiz.
   - If config.js has Firebase keys -> live mode (phones anywhere on the internet).
   - If not -> REHEARSAL mode: data stays in this browser only (open the phone page in other tabs). */
(function () {
  const FIREBASE_VERSION = '13.4.0';
  const cfg = (window.QUIZ_CONFIG && window.QUIZ_CONFIG.firebase) || {};
  const LIVE = !!(cfg.apiKey && cfg.databaseURL);
  const clean = p => String(p).replace(/^\/+|\/+$/g, '');

  /* ---------- Live: Firebase Realtime Database ---------- */
  async function connectFirebase() {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
    const [{ initializeApp }, db] = await Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-database.js'),
    ]);
    const app = initializeApp(cfg);
    const database = db.getDatabase(app);
    let offset = 0;
    db.onValue(db.ref(database, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
    const r = p => db.ref(database, clean(p));
    return {
      live: true,
      TS: db.serverTimestamp(),
      now: () => Date.now() + offset,
      set: (p, v) => db.set(r(p), v),
      update: (p, v) => db.update(r(p), v),
      remove: p => db.remove(r(p)),
      get: async p => (await db.get(r(p))).val(),
      on: (p, cb) => db.onValue(r(p), s => cb(s.val())),
      onConnection: cb => db.onValue(db.ref(database, '.info/connected'), s => cb(!!s.val())),
    };
  }

  /* ---------- Rehearsal: localStorage shared between tabs of this browser ---------- */
  function connectLocal() {
    const PRE = 'quizdb/';
    const listeners = [];
    const TS = { __ts: true };
    const keysUnder = p => {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k === PRE + p || k.startsWith(PRE + p + '/')) out.push(k);
      }
      return out;
    };
    const read = p => {
      p = clean(p);
      let result = null;
      for (const k of keysUnder(p)) {
        const val = JSON.parse(localStorage.getItem(k));
        const rest = k.slice((PRE + p).length).split('/').filter(Boolean);
        if (!rest.length) return val;
        if (result === null) result = {};
        let node = result;
        rest.forEach((part, i) => {
          if (i === rest.length - 1) node[part] = val;
          else node = node[part] = node[part] || {};
        });
      }
      return result;
    };
    const writeLeaves = (p, v) => {
      if (v === null || v === undefined) return;
      if (v && v.__ts) v = Date.now();
      if (typeof v === 'object') {
        for (const k of Object.keys(v)) writeLeaves(p + '/' + k, v[k]);
      } else localStorage.setItem(PRE + p, JSON.stringify(v));
    };
    const fire = () => listeners.forEach(l => {
      const v = read(l.p), j = JSON.stringify(v);
      if (j !== l.last) { l.last = j; l.cb(v); }
    });
    window.addEventListener('storage', fire);
    const set = (p, v) => {
      p = clean(p);
      // answers can only be written once, same as the Firebase rule
      if (/\/answers\/\d+\/[^/]+$/.test(p) && read(p) !== null) return Promise.reject(new Error('already answered'));
      keysUnder(p).forEach(k => localStorage.removeItem(k));
      writeLeaves(p, v);
      fire();
      return Promise.resolve();
    };
    return {
      live: false,
      TS,
      now: () => Date.now(),
      set,
      update: async (p, v) => { for (const k of Object.keys(v)) await set(clean(p) + '/' + k, v[k]); },
      remove: p => set(p, null),
      get: async p => read(p),
      on: (p, cb) => {
        p = clean(p);
        const l = { p, cb, last: undefined };
        listeners.push(l);
        setTimeout(() => { const v = read(p); l.last = JSON.stringify(v); cb(v); }, 0);
      },
      onConnection: cb => {
        cb(navigator.onLine);
        window.addEventListener('online', () => cb(true));
        window.addEventListener('offline', () => cb(false));
      },
    };
  }

  window.Quiz = {
    LIVE,
    connect: () => (LIVE ? connectFirebase() : Promise.resolve(connectLocal())),
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    LETTERS: ['A', 'B', 'C', 'D'],
  };
})();
