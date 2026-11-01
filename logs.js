/* ---------- Activity logs page ---------- */

(function () {
  const Audit = window.MinaAudit;
  const Auth = window.MinaAuth;

  const logListEl = document.getElementById("logList");
  const logEmptyEl = document.getElementById("logEmpty");
  const logFilterUserEl = document.getElementById("logFilterUser");
  const logFilterActionEl = document.getElementById("logFilterAction");
  const logExportBtnEl = document.getElementById("logExportBtn");
  const logClearBtnEl = document.getElementById("logClearBtn");
  const statusEl = document.getElementById("logsStatus");

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

  function render() {
    if (!logListEl || !Audit) return;
    const userFilter = logFilterUserEl ? logFilterUserEl.value : "";
    const actionFilter = logFilterActionEl ? logFilterActionEl.value : "";

    const entries = Audit.list()
      .slice()
      .reverse()
      .filter((e) => !userFilter || e.userName === userFilter)
      .filter((e) => !actionFilter || e.action === actionFilter);

    logListEl.innerHTML = "";
    if (logEmptyEl) logEmptyEl.hidden = entries.length > 0;

    entries.forEach((e) => {
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
  }

  function refreshFilters() {
    if (!Audit || !logFilterUserEl || !logFilterActionEl) return;
    const entries = Audit.list();

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

  if (Audit && logListEl) {
    refreshFilters();
    render();

    if (logFilterUserEl) logFilterUserEl.addEventListener("change", render);
    if (logFilterActionEl) logFilterActionEl.addEventListener("change", render);

    if (logExportBtnEl)
      logExportBtnEl.addEventListener("click", () => {
        Audit.exportJson();
        flash("Logs exported.");
      });

    if (logClearBtnEl)
      logClearBtnEl.addEventListener("click", () => {
        if (Auth && !Auth.can("manageUsers")) return;
        if (!confirm("Clear all local activity logs?")) return;
        Audit.clear();
        Audit.log("logs.cleared", {
          by: Auth && Auth.currentUser() ? Auth.currentUser().name : "unknown",
        });
        refreshFilters();
        render();
        flash("Logs cleared.");
      });
  }
})();
