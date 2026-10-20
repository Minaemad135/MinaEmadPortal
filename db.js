/* ---------- Data layer: Firestore (one collection per table, one doc per row) ---------- */
/* Public API (all methods are safe to call before ready() resolves):
     MinaDB.ready()              -> Promise, resolves when initial load finished
     MinaDB.get(key)             -> cached value (object) or null, synchronous
     MinaDB.getRaw(key)          -> cached JSON string or null, synchronous
     MinaDB.set(key, value)      -> Promise, writes to Firestore + cache
     MinaDB.onChange(key, fn)    -> subscribe; fn(value) on every change
     MinaDB.isOnline()           -> boolean, whether Firestore is reachable
     MinaDB.status               -> "loading" | "online" | "offline"

   Storage shape:
     Each "table" is its own Firestore collection, and every row is its own
     document. Documents use auto-generated Firestore ids; the row's own `id`
     field is what the app uses, so we keep a live id -> docId map per table.

       users table      -> collection "users"       (each user  = 1 doc)
       roles table      -> collection "roles"       (each role  = 1 doc)
       attendance groups-> collection "groups"      (each group = 1 doc)
       scalars          -> collection "meta"        (doc holds activeGroup)

   The public API is unchanged: MinaDB.get("mina.users") still returns
   { users, roles }, and get("mina.attendance") still returns
   { activeGroup, groups }. Only the storage internals differ.

   localStorage mirrors every key so the app still works with no connection. */

(function () {
  const SCHEMA = {
    "mina.users": {
      rows: [
        { collection: "users", field: "users" },
        { collection: "roles", field: "roles" },
      ],
      meta: null,
    },
    "mina.attendance": {
      rows: [{ collection: "groups", field: "groups" }],
      meta: { collection: "meta", doc: "attendance", fields: ["activeGroup"] },
    },
  };
  const KEYS = Object.keys(SCHEMA);

  const cache = {};
  const listeners = {};
  const dirty = {}; // keys changed locally while offline, to retry later
  const pendingDocs = {}; // set of docIds we just wrote, to ignore the echo
  const docIds = {}; // key -> collection -> rowId -> firestore docId

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

  function pendingKey(key, collection) {
    return `${key}::${collection}`;
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

  /* ---- assemble a logical value from its collections ---- */

  function rowMap(key, collection) {
    docIds[key] = docIds[key] || {};
    docIds[key][collection] = docIds[key][collection] || {};
    return docIds[key][collection];
  }

  // Read every row collection + meta doc for a key, and build the value object.
  async function pullOne(fs, key) {
    const spec = SCHEMA[key];
    const value = {};

    for (const row of spec.rows) {
      const snap = await fs.collection(row.collection).get();
      const items = [];
      const map = rowMap(key, row.collection);
      Object.keys(map).forEach((k) => delete map[k]);
      snap.forEach((doc) => {
        const data = doc.data() || {};
        items.push(data);
        if (data.id != null) map[String(data.id)] = doc.id;
      });
      value[row.field] = items;
    }

    if (spec.meta) {
      const snap = await fs.collection(spec.meta.collection).doc(spec.meta.doc).get();
      const data = snap.exists ? snap.data() || {} : {};
      spec.meta.fields.forEach((f) => {
        if (f in data) value[f] = data[f];
      });
    }

    return value;
  }

  // Write the whole value: diff the rows against what's already stored.
  async function pushOne(fs, key) {
    const spec = SCHEMA[key];
    const value = cache[key] || {};

    for (const row of spec.rows) {
      const items = Array.isArray(value[row.field]) ? value[row.field] : [];
      const col = fs.collection(row.collection);

      // Always re-read the live id -> docId map so we update existing row docs
      // instead of inserting duplicates when several writers race on first run.
      const map = {};
      const snap = await col.get();
      snap.forEach((doc) => {
        const data = doc.data() || {};
        if (data.id != null) map[String(data.id)] = doc.id;
      });

      const seen = new Set();
      const batch = [];

      for (const item of items) {
        const id = item && item.id != null ? String(item.id) : null;
        if (id) seen.add(id);
        const docId = id ? map[id] : null;
        if (docId) {
          pendingDocs[row.collection + "/" + docId] = true;
          batch.push(col.doc(docId).set(item));
        } else {
          const ref = col.doc();
          if (id) map[id] = ref.id;
          pendingDocs[row.collection + "/" + ref.id] = true;
          batch.push(ref.set(item));
        }
      }

      // Remove documents whose row id is gone.
      Object.keys(map).forEach((rowId) => {
        if (seen.has(rowId)) return;
        const docId = map[rowId];
        pendingDocs[row.collection + "/" + docId] = true;
        batch.push(col.doc(docId).delete());
        delete map[rowId];
      });

      await Promise.all(batch);

      // Refresh the cached map for listeners.
      const live = rowMap(key, row.collection);
      Object.keys(live).forEach((k) => delete live[k]);
      Object.keys(map).forEach((k) => (live[k] = map[k]));
    }

    if (spec.meta) {
      const data = {};
      spec.meta.fields.forEach((f) => {
        if (f in value) data[f] = value[f];
      });
      await fs.collection(spec.meta.collection).doc(spec.meta.doc).set(data);
    }

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
        KEYS.map((key) => pullOne(db, key).then((v) => ({ key, v })).catch((e) => ({ key, v: null, e })))
      );

      for (const { key, v, e } of results) {
        if (e) {
          note(`Could not read "${key}" (check Firestore rules)`, e);
          continue;
        }
        if (v === null) continue;
        const empty = SCHEMA[key].rows.every((row) => (v[row.field] || []).length === 0);
        if (empty) {
          // No rows in Firestore.
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

  // Rebuild one key's value from the live collections, then emit.
  async function subscribeCollection(key, row) {
    const spec = SCHEMA[key];
    let first = true;
    db.collection(row.collection).onSnapshot(
      (snap) => {
        online = true;
        status = "online";
        if (dirty[key]) return; // local change pending; don't clobber it

        // Ignore snapshots that only echo our own writes.
        let onlyEcho = true;
        snap.docChanges().forEach((ch) => {
          const token = row.collection + "/" + ch.doc.id;
          if (pendingDocs[token]) {
            delete pendingDocs[token];
          } else {
            onlyEcho = false;
          }
        });
        if (first) {
          first = false;
          onlyEcho = false;
        }
        if (onlyEcho) return;

        const items = [];
        const map = rowMap(key, row.collection);
        Object.keys(map).forEach((k) => delete map[k]);
        snap.forEach((doc) => {
          const data = doc.data() || {};
          items.push(data);
          if (data.id != null) map[String(data.id)] = doc.id;
        });

        const current = cache[key] || {};
        const next = { ...current, [row.field]: items };
        cache[key] = next;
        lsSet(key, next);
        emit(key);
      },
      () => {
        online = false;
        status = "offline";
        note(`Lost connection to "${row.collection}" (check Firestore rules)`);
      }
    );
  }

  function subscribeMeta(key) {
    const spec = SCHEMA[key];
    if (!spec.meta) return;
    db.collection(spec.meta.collection)
      .doc(spec.meta.doc)
      .onSnapshot(
        (snap) => {
          online = true;
          status = "online";
          if (!snap.exists || dirty[key]) return;
          const data = snap.data() || {};
          const current = cache[key] || {};
          const next = { ...current };
          spec.meta.fields.forEach((f) => {
            if (f in data) next[f] = data[f];
          });
          cache[key] = next;
          lsSet(key, next);
          emit(key);
        },
        () => {
          online = false;
          status = "offline";
          note(`Lost connection to "${spec.meta.collection}" (check Firestore rules)`);
        }
      );
  }

  async function subscribeAll() {
    if (!db) return;
    KEYS.forEach((key) => {
      const spec = SCHEMA[key];
      spec.rows.forEach((row) => subscribeCollection(key, row));
      subscribeMeta(key);
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
    SCHEMA,
  };

  // Kick off the async load immediately.
  bootstrap();

  // Retry pending writes when the connection comes back.
  window.addEventListener("online", retryDirty);
})();
