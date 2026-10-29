(function () {
  const A = window.MinaAuth;
  if (!A) return;

  const logsBody = document.getElementById("logsBody");
  const logsEmpty = document.getElementById("logsEmpty");
  const logsSearch = document.getElementById("logsSearch");
  const logsUserFilter = document.getElementById("logsUserFilter");
  const logsActionFilter = document.getElementById("logsActionFilter");
  const exportLogs = document.getElementById("exportLogs");
  const clearLogs = document.getElementById("clearLogs");

  let logs = A.getLogs ? A.getLogs() : [];

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch (e) {
      return iso || "";
    }
  }

  function describeDetails(details) {
    if (!details || typeof details !== "object") return "";
    const entries = Object.entries(details).filter(([, v]) => v !== undefined && v !== null && v !== "");
    if (!entries.length) return "";
    return entries
      .map(([k, v]) => {
        if (typeof v === "object") {
          try {
            return `${k}: ${JSON.stringify(v)}`;
          } catch (e) {
            return `${k}: [object]`;
          }
        }
        return `${k}: ${v}`;
      })
      .join("\n");
  }

  function renderFilters() {
    const users = new Set();
    const actions = new Set();
    logs.forEach((log) => {
      if (log.userName) users.add(log.userName);
      if (log.action) actions.add(log.action);
    });

    if (logsUserFilter) {
      const current = logsUserFilter.value;
      logsUserFilter.innerHTML = '<option value="all">All users</option>';
      Array.from(users)
        .sort((a, b) => a.localeCompare(b))
        .forEach((name) => {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          logsUserFilter.appendChild(opt);
        });
      if (Array.from(users).includes(current)) logsUserFilter.value = current;
    }

    if (logsActionFilter) {
      const current = logsActionFilter.value;
      logsActionFilter.innerHTML = '<option value="all">All actions</option>';
      Array.from(actions)
        .sort((a, b) => a.localeCompare(b))
        .forEach((action) => {
          const opt = document.createElement("option");
          opt.value = action;
          opt.textContent = action;
          logsActionFilter.appendChild(opt);
        });
      if (Array.from(actions).includes(current)) logsActionFilter.value = current;
    }
  }

  function render() {
    if (!logsBody) return;
    logsBody.innerHTML = "";

    const search = (logsSearch && logsSearch.value ? logsSearch.value.toLowerCase() : "");
    const userFilter = logsUserFilter ? logsUserFilter.value : "all";
    const actionFilter = logsActionFilter ? logsActionFilter.value : "all";

    const filtered = logs.filter((log) => {
      if (userFilter !== "all" && log.userName !== userFilter) return false;
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (!search) return true;
      const hay = [log.userName, log.action, describeDetails(log.details)].join(" ").toLowerCase();
      return hay.includes(search);
    });

    if (logsEmpty) logsEmpty.hidden = filtered.length !== 0;

    filtered.forEach((log) => {
      const tr = document.createElement("tr");

      const timeTd = document.createElement("td");
      timeTd.className = "logs-time";
      timeTd.textContent = formatTime(log.at);

      const userTd = document.createElement("td");
      userTd.className = "logs-user";
      userTd.textContent = log.userName || "Unknown";

      const actionTd = document.createElement("td");
      actionTd.className = "logs-action";
      actionTd.textContent = log.action || "-";

      const detailsTd = document.createElement("td");
      detailsTd.className = "logs-details";
      const desc = describeDetails(log.details);
      if (desc) {
        desc.split("\n").forEach((line) => {
          if (!line) return;
          const span = document.createElement("span");
          span.className = "logs-detail-line";
          span.textContent = line;
          detailsTd.appendChild(span);
        });
      } else {
        detailsTd.textContent = "-";
      }

      tr.append(timeTd, userTd, actionTd, detailsTd);
      logsBody.appendChild(tr);
    });
  }

  if (logsSearch) logsSearch.addEventListener("input", render);
  if (logsUserFilter) logsUserFilter.addEventListener("change", render);
  if (logsActionFilter) logsActionFilter.addEventListener("change", render);

  if (exportLogs) {
    exportLogs.addEventListener("click", () => {
      const search = (logsSearch && logsSearch.value ? logsSearch.value.toLowerCase() : "");
      const userFilter = logsUserFilter ? logsUserFilter.value : "all";
      const actionFilter = logsActionFilter ? logsActionFilter.value : "all";
      const filtered = logs.filter((log) => {
        if (userFilter !== "all" && log.userName !== userFilter) return false;
        if (actionFilter !== "all" && log.action !== actionFilter) return false;
        if (!search) return true;
        const hay = [log.userName, log.action, describeDetails(log.details)].join(" ").toLowerCase();
        return hay.includes(search);
      });

      const header = ["Time", "User", "Action", "Details"];
      const rows = [header.join(",")];
      filtered.forEach((log) => {
        const time = formatTime(log.at).replace(/,/g, " ");
        const user = (log.userName || "Unknown").replace(/,/g, " ");
        const action = (log.action || "-").replace(/,/g, " ");
        const details = describeDetails(log.details).replace(/\n/g, " | ").replace(/,/g, " ");
        rows.push([time, user, action, details || "-"].join(","));
      });

      const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mina-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  if (clearLogs) {
    clearLogs.addEventListener("click", () => {
      if (!A.can("manageLogs")) return;
      if (!confirm("Clear all logs? This cannot be undone.")) return;
      if (A.clearLogs) A.clearLogs();
      logs = [];
      renderFilters();
      render();
    });
  }

  renderFilters();
  render();
})();
