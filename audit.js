/* ---------- Audit: activity logging (Supabase) ---------- */

(function () {
  /*
   * Supabase config lives in supabase.js (shared with auth.js).
   * Run the SQL from that file's header comment once in the SQL editor.
   */
  const SUPABASE = window.MinaSupabase
    ? window.MinaSupabase.config
    : { enabled: false, url: "", anonKey: "" };
  const TABLE = "audit_log";

  function actorInfo() {
    const auth = window.MinaAuth;
    if (!auth) return { userId: null, userName: "anonymous", role: "none" };
    const user = auth.currentUser();
    if (!user)
      return { userId: null, userName: "anonymous", role: "none" };
    const role = auth.roleOf(user);
    return {
      userId: user.id,
      userName: user.name,
      role: role ? role.name : "none",
    };
  }

  function page() {
    const file = location.pathname.split("/").pop().toLowerCase();
    return file || "index.html";
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function supabaseReady() {
    return !!(window.MinaSupabase && window.MinaSupabase.ready());
  }

  function baseUrl() {
    return window.MinaSupabase.rest(TABLE);
  }

  function authHeaders(extra) {
    return window.MinaSupabase.headers(extra);
  }

  function sendToSupabase(entry) {
    if (!supabaseReady()) return;
    const row = {
      id: entry.id,
      ts: entry.ts,
      user_id: entry.userId,
      user_name: entry.userName,
      role_name: entry.role,
      action: entry.action,
      detail: entry.detail,
      page: entry.page,
    };
    try {
      fetch(baseUrl(), {
        method: "POST",
        headers: authHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
        body: JSON.stringify(row),
        keepalive: true,
        mode: "cors",
      })
        .then(function (res) {
          if (!res.ok) {
            res
              .text()
              .then(function (t) {
                console.warn(
                  "[MinaAudit] Supabase insert failed:",
                  res.status,
                  t,
                );
              })
              .catch(function () {});
          }
        })
        .catch(function (err) {
          console.warn("[MinaAudit] Supabase network error:", err);
        });
    } catch (e) {
      console.warn("[MinaAudit] Supabase exception:", e);
    }
  }

  function log(action, detail) {
    try {
      const actor = actorInfo();
      const entry = {
        id: uid(),
        ts: new Date().toISOString(),
        userId: actor.userId,
        userName: actor.userName,
        role: actor.role,
        action: String(action || "unknown"),
        detail: detail == null ? null : detail,
        page: page(),
      };
      sendToSupabase(entry);
      return entry;
    } catch (e) {
      /* logging must never break the app */
      return null;
    }
  }

  /* Fetch logs from Supabase (newest first). Returns [] on any failure. */
  function listRemote(limit) {
    if (!supabaseReady()) return Promise.resolve([]);
    const n = Math.min(Math.max(Number(limit) || 200, 1), 1000);
    const url = baseUrl() + "?select=*&order=ts.desc&limit=" + n;
    return fetch(url, {
      method: "GET",
      headers: authHeaders(),
      mode: "cors",
    })
      .then(function (res) {
        if (!res.ok) {
          console.warn(
            "[MinaAudit] Supabase select failed:",
            res.status,
            "(did you run the RLS policy SQL?)",
          );
          return [];
        }
        return res.json();
      })
      .then(function (rows) {
        if (!Array.isArray(rows)) return [];
        return rows.map(function (r) {
          return {
            id: r.id,
            ts: r.ts,
            userId: r.user_id,
            userName: r.user_name,
            role: r.role_name,
            action: r.action,
            detail: r.detail,
            page: r.page,
          };
        });
      })
      .catch(function () {
        return [];
      });
  }

  /* Insert + read back a test row; resolves { ok, step, status, message } */
  function testConnection() {
    if (!supabaseReady()) {
      return Promise.resolve({
        ok: false,
        step: "config",
        message: "Supabase is disabled or url/anonKey is empty in audit.js",
      });
    }
    const id = "test-" + uid();
    const row = {
      id: id,
      ts: new Date().toISOString(),
      user_id: null,
      user_name: "connection-test",
      role_name: "none",
      action: "debug.testConnection",
      detail: { by: "Test Supabase button" },
      page: "logs.html",
    };
    return fetch(baseUrl(), {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
      body: JSON.stringify(row),
      mode: "cors",
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            var msg = t;
            try {
              msg = JSON.parse(t).message || t;
            } catch (e) {}
            return {
              ok: false,
              step: "insert",
              status: res.status,
              message: msg,
            };
          });
        }
        return fetch(baseUrl() + "?id=eq." + id + "&select=id", {
          method: "GET",
          headers: authHeaders(),
          mode: "cors",
        })
          .then(function (r2) {
            if (!r2.ok) {
              return {
                ok: false,
                step: "select",
                status: r2.status,
                message:
                  "INSERT worked but SELECT failed (check the select RLS policy)",
              };
            }
            return r2.json().then(function (rows) {
              if (Array.isArray(rows) && rows.length) {
                return {
                  ok: true,
                  step: "done",
                  message: "Insert + read OK — Supabase is working.",
                };
              }
              return {
                ok: false,
                step: "select",
                message:
                  "INSERT worked but SELECT returned 0 rows (check the select RLS policy)",
              };
            });
          });
      })
      .catch(function (err) {
        return { ok: false, step: "network", message: String(err) };
      });
  }

  function exportJson(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const blob = new Blob([JSON.stringify(list, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "mina-audit-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  window.MinaAudit = {
    log,
    listRemote,
    testConnection,
    exportJson,
    supabase: SUPABASE,
  };
})();
