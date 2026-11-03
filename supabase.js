/* ---------- Supabase: shared config + REST helpers ---------- */

/*
 * Supabase setup (free tier: https://supabase.com):
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
 *     create table if not exists public.roles (
 *       id text primary key,
 *       name text not null,
 *       perms jsonb not null default '{}'::jsonb
 *     );
 *     create table if not exists public.users (
 *       id text primary key,
 *       name text not null,
 *       password_hash text not null,
 *       role_id text,
 *       first_name text,
 *       last_name text,
 *       phone text
 *     );
 *     alter table public.roles enable row level security;
 *     alter table public.users enable row level security;
 *     drop policy if exists "roles_all" on public.roles;
 *     drop policy if exists "users_all" on public.users;
 *     create policy "roles_all"
 *       on public.roles for all
 *       to anon, authenticated using (true) with check (true);
 *     create policy "users_all"
 *       on public.users for all
 *       to anon, authenticated using (true) with check (true);
 *
 *     create table if not exists public.todos (
 *       id text primary key,
 *       user_id text not null,
 *       text text not null,
 *       done boolean not null default false,
 *       created_at timestamptz not null default now()
 *     );
 *     create index if not exists todos_user_id_idx on public.todos (user_id);
 *     alter table public.todos enable row level security;
 *     drop policy if exists "todos_all" on public.todos;
 *     create policy "todos_all"
 *       on public.todos for all
 *       to anon, authenticated using (true) with check (true);
 *
 *     create table if not exists public.classes (
 *       id text primary key,
 *       name text not null,
 *       year int not null,
 *       weekdays jsonb not null default '[5]'::jsonb,
 *       special_days jsonb not null default '[]'::jsonb,
 *       records jsonb not null default '{}'::jsonb
 *     );
 *     create table if not exists public.students (
 *       id text primary key,
 *       class_id text not null,
 *       name text not null,
 *       code text,
 *       notes text,
 *       position int not null default 0
 *     );
 *     create index if not exists students_class_id_idx on public.students (class_id);
 *     alter table public.classes enable row level security;
 *     alter table public.students enable row level security;
 *     drop policy if exists "classes_all" on public.classes;
 *     drop policy if exists "students_all" on public.students;
 *     create policy "classes_all"
 *       on public.classes for all
 *       to anon, authenticated using (true) with check (true);
 *     create policy "students_all"
 *       on public.students for all
 *       to anon, authenticated using (true) with check (true);
 *
 *     create table if not exists public.points (
 *       id text primary key,                  -- student id
 *       class_id text,
 *       student_name text,
 *       points int not null default 0,
 *       set_by text,                           -- username of the user who set them
 *       updated_at timestamptz not null default now()
 *     );
 *     create index if not exists points_class_id_idx on public.points (class_id);
 *     alter table public.points enable row level security;
 *     drop policy if exists "points_all" on public.points;
 *     create policy "points_all"
 *       on public.points for all
 *       to anon, authenticated using (true) with check (true);
 *
 *  3. Project Settings -> API -> copy Project URL + anon public key below
 *  4. Set enabled: true
 *
 * SECURITY NOTE: this app authenticates entirely in the browser, so the
 * anon key must be able to read/write users and roles. Anyone who has
 * the anon key can read password hashes (weak client-side hashes) and
 * change data. That is inherent to a client-only app; add a backend
 * if you need real server-side auth.
 */

(function () {
  const config = {
    enabled: true,
    url: "https://fcjfyzxtpjdeskjvnqof.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjamZ5enh0cGpkZXNranZucW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1MTQwODUsImV4cCI6MjEwOTA5MDA4NX0.-v1bbKgsa8mORE1Hh8-VgydcZErnAltMf95hhbrRoF8",
  };

  function ready() {
    return !!(config.enabled && config.url && config.anonKey);
  }

  function rest(table) {
    return config.url.replace(/\/$/, "") + "/rest/v1/" + table;
  }

  function headers(extra) {
    return Object.assign(
      {
        apikey: config.anonKey,
        Authorization: "Bearer " + config.anonKey,
      },
      extra || {},
    );
  }

  function fail(method, table, status, body) {
    var msg = body;
    try {
      msg = JSON.parse(body).message || body;
    } catch (e) {}
    return new Error(method + " " + table + " failed (" + status + "): " + msg);
  }

  function get(table, params) {
    if (!ready()) return Promise.reject(new Error("Supabase not configured"));
    var url = rest(table);
    if (params) {
      var q = Object.keys(params)
        .map(function (k) {
          return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
        })
        .join("&");
      if (q) url += "?" + q;
    }
    return fetch(url, {
      method: "GET",
      headers: headers(),
      mode: "cors",
    }).then(function (res) {
      return res.text().then(function (t) {
        if (!res.ok) throw fail("GET", table, res.status, t);
        if (!t) return [];
        try {
          return JSON.parse(t);
        } catch (e) {
          throw new Error(
            "GET " + table + " returned invalid JSON (status " + res.status + ")",
          );
        }
      });
    });
  }

  function post(table, rows, opts) {
    if (!ready()) return Promise.reject(new Error("Supabase not configured"));
    opts = opts || {};
    var url = rest(table);
    var prefer = [];
    if (opts.upsert) {
      prefer.push("resolution=merge-duplicates");
      prefer.push("return=representation");
      if (opts.onConflict) {
        url += "?on_conflict=" + encodeURIComponent(opts.onConflict);
      }
    } else if (opts.minimal) {
      prefer.push("return=minimal");
    } else {
      prefer.push("return=representation");
    }
    return fetch(url, {
      method: "POST",
      headers: headers({
        "Content-Type": "application/json",
        Prefer: prefer.join(","),
      }),
      body: JSON.stringify(rows),
      mode: "cors",
    }).then(function (res) {
      return res.text().then(function (t) {
        if (!res.ok) throw fail("POST", table, res.status, t);
        if (opts.minimal) return null;
        try {
          return t ? JSON.parse(t) : [];
        } catch (e) {
          return [];
        }
      });
    });
  }

  function upsert(table, rows) {
    return post(table, rows, { upsert: true, onConflict: "id" });
  }

  function patch(table, id, values) {
    if (!ready()) return Promise.reject(new Error("Supabase not configured"));
    return fetch(rest(table) + "?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
      body: JSON.stringify(values),
      mode: "cors",
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw fail("PATCH", table, res.status, t);
        });
      }
      return null;
    });
  }

  function del(table, ids) {
    if (!ready()) return Promise.reject(new Error("Supabase not configured"));
    if (!ids || !ids.length) return Promise.resolve(null);
    var filter = ids
      .map(function (id) {
        return encodeURIComponent(id);
      })
      .join(",");
    return fetch(rest(table) + "?id=in.(" + filter + ")", {
      method: "DELETE",
      headers: headers({ Prefer: "return=minimal" }),
      mode: "cors",
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw fail("DELETE", table, res.status, t);
        });
      }
      return null;
    });
  }

  window.MinaSupabase = {
    config: config,
    ready: ready,
    rest: rest,
    headers: headers,
    get: get,
    post: post,
    upsert: upsert,
    patch: patch,
    del: del,
  };
})();
