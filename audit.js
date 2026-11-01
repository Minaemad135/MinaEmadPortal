/* ---------- Audit: activity logging (localStorage + Supabase) ---------- */

(function () {
  const STORAGE_KEY = "mina.audit";
  const MAX_ENTRIES = 500;

  /*
   * Supabase setup (free tier: https://supabase.com — 500MB DB, logs kept forever):
   *  1. Create a free project at supabase.com
   *  2. In the SQL editor, run this once:
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
   *     create policy "audit insert only"
   *       on public.audit_log for insert
   *       to anon, authenticated
   *       with check (true);
   *
   *  3. Project Settings -> API -> copy Project URL + anon public key below
   *  4. Set enabled: true
   * RLS is INSERT-only: clients can write logs but cannot read/update/delete.
   */
  const SUPABASE = {
    enabled: true, // set to true after pasting url + anonKey below
    url: "https://fcjfyzxtpjdeskjvnqof.supabase.co", // e.g. "https://abcdefg.supabase.co"
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjamZ5enh0cGpkZXNranZucW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1MTQwODUsImV4cCI6MjEwOTA5MDA4NX0.-v1bbKgsa8mORE1Hh8-VgydcZErnAltMf95hhbrRoF8", // the "anon public" API key
    table: "audit_log",
  };

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function write(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      /* storage full/unavailable — drop oldest half and retry once */
      try {
        const trimmed = entries.slice(-Math.floor(MAX_ENTRIES / 2));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch (e2) {
        /* give up silently */
      }
    }
  }

  function actorInfo() {
    const auth = window.MinaAuth;
    if (!auth) return { userId: null, userName: "anonymous", role: "none" };
    const user = auth.currentUser();
    if (!user) return { userId: null, userName: "anonymous", role: "none" };
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

  function sendToSupabase(entry) {
    if (!SUPABASE.enabled || !SUPABASE.url || !SUPABASE.anonKey) return;
    /* map camelCase entry -> snake_case columns */
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
      fetch(SUPABASE.url.replace(/\/$/, "") + "/rest/v1/" + SUPABASE.table, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE.anonKey,
          Authorization: "Bearer " + SUPABASE.anonKey,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(row),
        keepalive: true,
        mode: "cors",
      }).catch(function () {
        /* never surface logging errors to the UI */
      });
    } catch (e) {
      /* ignore */
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
      const entries = read();
      entries.push(entry);
      if (entries.length > MAX_ENTRIES) {
        entries.splice(0, entries.length - MAX_ENTRIES);
      }
      write(entries);
      sendToSupabase(entry);
      return entry;
    } catch (e) {
      /* logging must never break the app */
      return null;
    }
  }

  function list() {
    return read();
  }

  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function exportJson() {
    const entries = read();
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
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
    list,
    clear,
    exportJson,
    supabase: SUPABASE,
    MAX_ENTRIES,
  };
})();
