/* ---------- Audit: activity logging (Supabase) ---------- */

(function () {
  /*
   * Supabase setup (free tier: https://supabase.com — 500MB DB, logs kept forever):
   *  1. Create a free project at supabase.com
   *  2. In the SQL editor, run this ONCE (complete block):
   *
   *     create table if not exists public.audit_log (
   *       id text primary key,
   *       ts timestamptz not null,
   *       user_id text,
   *       user_name text,
   *       role_name text,
   *       action text not null,
   *       detail jsonb,
   *       page text
   *     );
   *     alter table public.audit_log enable row level security;
   *     drop policy if exists "audit_select" on public.audit_log;
   *     drop policy if exists "audit_insert" on public.audit_log;
   *     create policy "audit_select"
   *       on public.audit_log for select
   *       to anon, authenticated using (true);
   *     create policy "audit_insert"
   *       on public.audit_log for insert
   *       to anon, authenticated with check (true);
   *
   *  3. Project Settings -> API -> copy Project URL + anon public key below
   *  4. Set enabled: true
   */
  const SUPABASE = {
    enabled: true, // set to true after pasting url + anonKey below
    url: "https://fcjfyzxtpjdeskjvnqof.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjamZ5enh0cGpkZXNranZucW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1MTQwODUsImV4cCI6MjEwOTA5MDA4NX0.-v1bbKgsa8mORE1Hh8-VgydcZErnAltMf95hhbrRoF8",
    table: "audit_log",
  };

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
    return !!(SUPABASE.enabled && SUPABASE.url && SUPABASE.anonKey);
  }

  function baseUrl() {
    return SUPABASE.url.replace(/\/$/, "") + "/rest/v1/" + SUPABASE.table;
  }

  function authHeaders(extra) {
    return Object.assign(
      {
        apikey: SUPABASE.anonKey,
        Authorization: "Bearer " + SUPABASE.anonKey,
      },
      extra || {},
    );
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
