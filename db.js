/* ---------- Data layer: Firestore with localStorage cache ---------- */
/* Public API (all methods are safe to call before ready() resolves):
     MinaDB.ready()              -> Promise, resolves when initial load finished
     MinaDB.get(key)             -> cached value (object) or null, synchronous
     MinaDB.getRaw(key)          -> cached JSON string or null, synchronous
     MinaDB.set(key, value)      -> Promise, writes to Firestore + cache
     MinaDB.onChange(key, fn)    -> subscribe; fn(value) on every change
     MinaDB.isOnline()           -> boolean, whether Firestore is reachable
     MinaDB.status               -> "loading" | "online" | "offline"

   Backed by a single Firestore document per key under the `store` collection,
   e.g. collection "store", document "auth". The document holds { value: <object> }.
   localStorage mirrors every key so the app still works with no connection. */

(function () {
  const COLLECTION = "store";
  const KEYS = ["mina.users", "mina.attendance"];

  const cache = {};
  const listeners = {};
  const dirty = {}; // keys changed locally while offline, to retry later
  const pendingWrite = {}; // fingerprint of our own last write, to ignore the echo

  let db = null;
  let online = false;
  let status = "loading";
  let lastError = null;
  let readyResolve;
  const readyPromise = new Promise((res) => (readyResolve = res));

  function note(msg, err) {
    lastError = err ? `${msg}: ${(err && err.message) || err}` : msg;
    // eslint-disable-next-line no-console
    console.warn("[MinaDB]", lastError);
  }

  /* ---- localStorage helpers ---- */

  function lsGet(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* ignore quota / private mode */
    }
  }

  function lsGetRaw(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  /* ---- listeners ---- */

  function emit(key) {
    (listeners[key] || []).forEach((fn) => {
      try {
        fn(cache[key]);
      } catch (e) {
        /* keep other listeners alive */
      }
    });
  }

  /* ---- Firestore init ---- */

  function initFirebase() {
    if (!window.firebase) return null;
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.projectId) return null;
    try {
      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(cfg);
      }
      return window.firebase.firestore();
    } catch (e) {
      return null;
    }
  }

  async function pullOne(fs, key) {
    const snap = await fs.collection(COLLECTION).doc(key).get();
    if (snap.exists) {
      const data = snap.data();
      return data && typeof data === "object" && "value" in data ? data.value : data;
    }
    return undefined; // undefined == document missing
  }

  async function pushOne(fs, key) {
    const value = cache[key];
    pendingWrite[key] = JSON.stringify(value);
    await fs.collection(COLLECTION).doc(key).set({ value });
    dirty[key] = false;
  }

  async function bootstrap() {
    db = initFirebase();

    // Seed the cache from localStorage first so the UI can render instantly.
    KEYS.forEach((key) => {
      const cached = lsGet(key);
      if (cached !== null) cache[key] = cached;
    });

    if (!db) {
      status = "offline";
      note("Firebase SDK not loaded or config missing — using local storage only");
      readyResolve();
      return;
    }

    try {
      const results = await Promise.all(
        KEYS.map((key) => pullOne(db, key).then((v) => ({ key, v })).catch((e) => ({ key, v: undefined, e })))
      );

      for (const { key, v, e } of results) {
        if (e) {
          note(`Could not read "${key}" (check Firestore rules)`, e);
          continue;
        }
        if (v === undefined) {
          // No document in Firestore.
          if (cache[key] != null) {
            // Migrate: push the existing local data up on first run.
            try {
              await pushOne(db, key);
              note(`Migrated "${key}" to Firestore`);
            } catch (err) {
              dirty[key] = true;
              note(`Could not write "${key}" (check Firestore rules)`, err);
            }
          }
        } else {
          cache[key] = v;
          lsSet(key, v);
        }
      }

      await subscribeAll();
      online = true;
      status = "online";
    } catch (e) {
      online = false;
      status = "offline";
    }

    retryDirty();
    readyResolve();
  }

  async function subscribeAll() {
    if (!db) return;
    KEYS.forEach((key) => {
      db.collection(COLLECTION)
        .doc(key)
        .onSnapshot(
          (snap) => {
            online = true;
            status = "online";
            if (!snap.exists) return;
            if (dirty[key]) return; // local change pending; don't clobber it
            const data = snap.data();
            const value = data && typeof data === "object" && "value" in data ? data.value : data;
            // Ignore the echo of a write we just made ourselves.
            const fp = JSON.stringify(value);
            if (pendingWrite[key] === fp) {
              pendingWrite[key] = null;
              return;
            }
            cache[key] = value;
            lsSet(key, value);
            emit(key);
          },
          () => {
            online = false;
            status = "offline";
            note(`Lost connection to "${key}" (check Firestore rules)`);
          }
        );
    });
  }

  function retryDirty() {
    if (!db) return;
    KEYS.filter((key) => dirty[key]).forEach((key) => {
      pushOne(db, key)
        .then(() => note(`Retried write of "${key}" successfully`))
        .catch(() => {});
    });
  }

  /* ---- public API ---- */

  async function set(key, value) {
    cache[key] = value;
    lsSet(key, value);
    emit(key);

    if (!db) {
      dirty[key] = true;
      return;
    }
    try {
      await pushOne(db, key);
      online = true;
      status = "online";
    } catch (e) {
      dirty[key] = true;
      online = false;
      status = "offline";
      note(`Could not save "${key}" to Firestore (check Firestore rules)`, e);
    }
  }

  function get(key) {
    return cache[key] === undefined ? null : cache[key];
  }

  function getRaw(key) {
    return get(key) === null ? null : JSON.stringify(cache[key]);
  }

  function onChange(key, fn) {
    (listeners[key] = listeners[key] || []).push(fn);
    return () => {
      listeners[key] = (listeners[key] || []).filter((f) => f !== fn);
    };
  }

  window.MinaDB = {
    ready: () => readyPromise,
    get,
    getRaw,
    set,
    onChange,
    isOnline: () => online,
    isFirebaseConfigured: () => !!db,
    get lastError() {
      return lastError;
    },
    get status() {
      return status;
    },
    KEYS,
  };

  // Kick off the async load immediately.
  bootstrap();

  // Retry pending writes when the connection comes back.
  window.addEventListener("online", retryDirty);
})();
