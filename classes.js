/* ---------- Classes & students: Supabase-backed shared store ---------- */

(function () {
  const LS_ATT = "mina.attendance";
  const LS_ACTIVE = "mina.activeGroup";

  let state = { activeGroup: "", groups: [] };
  let hydrated = false;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function normStudent(s) {
    s = s && typeof s === "object" ? s : {};
    return {
      id: s.id || uid(),
      name: s.name || "",
      code: /^\d{6}$/.test(s.code || "") ? s.code : "",
      notes: s.notes || "",
    };
  }

  function normGroup(g) {
    g = g && typeof g === "object" ? g : {};
    const weekdays = Array.isArray(g.weekdays)
      ? g.weekdays.filter((n) => n >= 0 && n <= 6)
      : [5];
    const specialDays = (Array.isArray(g.specialDays) ? g.specialDays : []).map(
      (d) =>
        typeof d === "string"
          ? { date: d, title: "" }
          : { date: d.date, title: d.title || "" },
    );
    return {
      id: g.id || uid(),
      name: g.name || "Class 1",
      year: g.year || new Date().getFullYear(),
      weekdays,
      students: Array.isArray(g.students) ? g.students.map(normStudent) : [],
      specialDays,
      records: g.records && typeof g.records === "object" ? g.records : {},
    };
  }

  function readLegacy() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_ATT));
      if (raw && Array.isArray(raw.groups) && raw.groups.length) {
        const groups = raw.groups.map(normGroup);
        const active = groups.some((g) => g.id === raw.activeGroup)
          ? raw.activeGroup
          : groups[0].id;
        return { activeGroup: active, groups };
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function syncActive() {
    try {
      if (state.activeGroup)
        localStorage.setItem(LS_ACTIVE, state.activeGroup);
      else localStorage.removeItem(LS_ACTIVE);
    } catch (e) {
      /* ignore */
    }
  }

  function readActive(groups) {
    try {
      const a = localStorage.getItem(LS_ACTIVE);
      if (a && groups.some((g) => g.id === a)) return a;
    } catch (e) {
      /* ignore */
    }
    return groups[0] ? groups[0].id : "";
  }

  function fromDb(classRows, studentRows) {
    const students = Array.isArray(studentRows) ? studentRows : [];
    return (classRows || []).map((c) => ({
      id: c.id,
      name: c.name || "Class 1",
      year: c.year || new Date().getFullYear(),
      weekdays: Array.isArray(c.weekdays) ? c.weekdays : [5],
      specialDays: Array.isArray(c.special_days) ? c.special_days : [],
      records:
        c.records && typeof c.records === "object" ? c.records : {},
      students: students
        .filter((s) => s.class_id === c.id)
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map(normStudent),
    }));
  }

  function toDb() {
    const classRows = [];
    const studentRows = [];
    state.groups.forEach((g) => {
      classRows.push({
        id: g.id,
        name: g.name,
        year: g.year,
        weekdays: g.weekdays,
        special_days: g.specialDays,
        records: g.records,
      });
      g.students.forEach((s, i) => {
        studentRows.push({
          id: s.id,
          class_id: g.id,
          name: s.name,
          code: s.code || null,
          notes: s.notes || null,
          position: i,
        });
      });
    });
    return { classRows, studentRows };
  }

  function save(next) {
    if (next) state = next;
    const SB = window.MinaSupabase;
    if (!SB || !SB.ready()) {
      return Promise.reject(new Error("Supabase is not configured"));
    }
    const { classRows, studentRows } = toDb();
    const tasks = [];
    if (classRows.length) tasks.push(SB.upsert("classes", classRows));
    if (studentRows.length) tasks.push(SB.upsert("students", studentRows));

    return Promise.all(tasks).then(function () {
      syncActive();
      return Promise.all([
        SB.get("classes").catch(function () {
          return null;
        }),
        SB.get("students").catch(function () {
          return null;
        }),
      ]).then(function (db) {
        const dels = [];
        const dbClasses = db[0];
        const dbStudents = db[1];
        if (Array.isArray(dbClasses)) {
          const keep = new Set(state.groups.map((g) => g.id));
          const dead = dbClasses
            .filter((c) => !keep.has(c.id))
            .map((c) => c.id);
          if (dead.length) dels.push(SB.del("classes", dead));
        }
        if (Array.isArray(dbStudents)) {
          const keep = new Set(studentRows.map((s) => s.id));
          const dead = dbStudents
            .filter((s) => !keep.has(s.id))
            .map((s) => s.id);
          if (dead.length) {
            dels.push(SB.del("students", dead));
            dels.push(
              SB.del("points", dead).catch(function (err) {
                console.warn("[MinaClasses] Could not clean up points rows", err);
              }),
            );
          }
        }
        return Promise.all(dels);
      });
    });
  }

  function migrateLegacy(legacy) {
    state = legacy;
    syncActive();
    const SB = window.MinaSupabase;
    if (!SB || !SB.ready()) {
      hydrated = true;
      return Promise.resolve(state);
    }
    return save().then(
      function () {
        try {
          localStorage.removeItem(LS_ATT);
        } catch (e) {}
        console.info(
          "[MinaClasses] Migrated classes/students to Supabase",
        );
        hydrated = true;
        return state;
      },
      function (err) {
        console.warn(
          "[MinaClasses] Migration to Supabase failed, using local data",
          err,
        );
        hydrated = true;
        return state;
      },
    );
  }

  function hydrate() {
    const SB = window.MinaSupabase;
    if (!SB || !SB.ready()) {
      state = readLegacy() || { activeGroup: "", groups: [] };
      hydrated = true;
      return Promise.resolve(state);
    }

    return Promise.all([SB.get("classes"), SB.get("students")]).then(
      function (results) {
        const classRows = results[0] || [];
        const studentRows = results[1] || [];

        if (!classRows.length) {
          const legacy = readLegacy();
          if (legacy) return migrateLegacy(legacy);
          state = { activeGroup: "", groups: [] };
          hydrated = true;
          return state;
        }

        const groups = fromDb(classRows, studentRows);
        state = { activeGroup: readActive(groups), groups };
        try {
          localStorage.removeItem(LS_ATT);
        } catch (e) {}
        hydrated = true;
        return state;
      },
      function (err) {
        console.error(
          "[MinaClasses] Failed to load from Supabase " +
            "(did you run the classes/students SQL?)",
          err,
        );
        state = readLegacy() || { activeGroup: "", groups: [] };
        hydrated = true;
        return state;
      },
    );
  }

  const ready = hydrate();

  window.MinaClasses = {
    ready: ready,
    load: function () {
      return state;
    },
    setState: function (next) {
      state = next;
    },
    save: save,
    get hydrated() {
      return hydrated;
    },
  };
})();
