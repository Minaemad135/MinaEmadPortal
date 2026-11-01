/* ---------- Activity logs page (reads from Supabase) ---------- */

(function () {
  const Audit = window.MinaAudit;

  const logListEl = document.getElementById("logList");
  const logEmptyEl = document.getElementById("logEmpty");
  const logFilterUserEl = document.getElementById("logFilterUser");
  const logFilterActionEl = document.getElementById("logFilterAction");
  const logExportBtnEl = document.getElementById("logExportBtn");
  const logRefreshBtnEl = document.getElementById("logRefreshBtn");
  const logTestBtnEl = document.getElementById("logTestBtn");
  const logSourceEl = document.getElementById("logSource");
  const logDiagEl = document.getElementById("logDiag");
  const statusEl = document.getElementById("logsStatus");

  /* entries currently loaded from Supabase (newest first) */
  let entries = [];

  function flash(message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    clearTimeout(flash._t);
    flash._t = setTimeout(() => (statusEl.textContent = ""), 2500);
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleString();
    } catch (e) {
      return ts;
    }
  }

  function formatDetail(detail) {
    if (detail == null) return "";
    if (typeof detail === "string") return detail;
    try {
      return JSON.stringify(detail);
    } catch (e) {
      return String(detail);
    }
  }

  function updateSourceLabel() {
    if (!logSourceEl) return;
    logSourceEl.textContent =
      "Source: Supabase database (" +
      entries.length +
      " logs — all devices)";
  }

  function render() {
    if (!logListEl) return;
    const userFilter = logFilterUserEl ? logFilterUserEl.value : "";
    const actionFilter = logFilterActionEl ? logFilterActionEl.value : "";

    const filtered = entries
      .filter((e) => !userFilter || e.userName === userFilter)
      .filter((e) => !actionFilter || e.action === actionFilter);

    logListEl.innerHTML = "";
    if (logEmptyEl) logEmptyEl.hidden = filtered.length > 0;

    filtered.forEach((e) => {
      const tr = document.createElement("tr");

      const time = document.createElement("td");
      time.className = "log-time";
      time.textContent = formatTime(e.ts);
      time.title = e.ts;

      const user = document.createElement("td");
      user.textContent = e.userName || "anonymous";

      const role = document.createElement("td");
      role.textContent = e.role || "—";

      const action = document.createElement("td");
      action.className = "log-action";
      action.textContent = e.action;

      const detail = document.createElement("td");
      detail.className = "log-detail";
      detail.textContent = formatDetail(e.detail);

      const page = document.createElement("td");
      page.textContent = e.page || "—";

      tr.append(time, user, role, action, detail, page);
      logListEl.appendChild(tr);
    });

    updateSourceLabel();
  }

  function refreshFilters() {
    if (!logFilterUserEl || !logFilterActionEl) return;

    const users = [...new Set(entries.map((e) => e.userName).filter(Boolean))].sort();
    const actions = [...new Set(entries.map((e) => e.action).filter(Boolean))].sort();

    const curUser = logFilterUserEl.value;
    const curAction = logFilterActionEl.value;

    logFilterUserEl.innerHTML = '<option value="">All users</option>';
    users.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      logFilterUserEl.appendChild(opt);
    });
    logFilterUserEl.value = users.includes(curUser) ? curUser : "";

    logFilterActionEl.innerHTML = '<option value="">All actions</option>';
    actions.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a;
      opt.textContent = a;
      logFilterActionEl.appendChild(opt);
    });
    logFilterActionEl.value = actions.includes(curAction) ? curAction : "";
  }

  function showDiag(text, isError) {
    if (!logDiagEl) return;
    logDiagEl.hidden = !text;
    logDiagEl.textContent = text || "";
    logDiagEl.className =
      "log-diag" + (isError ? " log-diag--error" : " log-diag--ok");
  }

  function load() {
    if (!Audit) return Promise.resolve();
    if (!Audit.supabase || !Audit.supabase.enabled) {
      entries = [];
      showDiag("Supabase is disabled in audit.js — logs are unavailable.", true);
      refreshFilters();
      render();
      return Promise.resolve();
    }
    return Audit.listRemote(500).then((remote) => {
      entries = remote;
      if (remote.length) {
        showDiag("");
      } else {
        showDiag(
          "Supabase returned 0 logs — either the table is empty or the SELECT RLS policy is missing. Click \"Test Supabase\".",
          true,
        );
      }
      refreshFilters();
      render();
    });
  }

  if (Audit && logListEl) {
    load();

    if (logFilterUserEl) logFilterUserEl.addEventListener("change", render);
    if (logFilterActionEl) logFilterActionEl.addEventListener("change", render);

    if (logRefreshBtnEl)
      logRefreshBtnEl.addEventListener("click", () => {
        flash("Refreshing…");
        load().then(() => flash("Loaded from Supabase."));
      });

    if (logTestBtnEl)
      logTestBtnEl.addEventListener("click", () => {
        logTestBtnEl.disabled = true;
        showDiag("Testing…", false);
        Audit.testConnection().then((r) => {
          logTestBtnEl.disabled = false;
          showDiag((r.ok ? "✔ " : "✘ [" + r.step + "] ") + r.message, !r.ok);
          if (r.ok) load();
        });
      });

    if (logExportBtnEl)
      logExportBtnEl.addEventListener("click", () => {
        Audit.exportJson(entries);
        flash("Logs exported.");
      });
  }
})();
