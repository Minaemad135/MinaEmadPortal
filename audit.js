/* ---------- Audit: activity logging (localStorage + Axiom) ---------- */

(function () {
  const STORAGE_KEY = "mina.audit";
  const MAX_ENTRIES = 500;

  /*
   * Axiom setup (free tier: https://axiom.co):
   *  1. Create a free account and a dataset named "mina-portal"
   *  2. Create an INGEST-ONLY API token (Axiom UI → Settings → API tokens)
   *  3. Paste the token below
   * An ingest-only token can only write, never read — safe-ish for client JS.
   */
  const AXIOM = {
    enabled: true, // set to true after pasting your token
    dataset: "mina-portal",
    token: "xaat-edac8631-f945-4a85-b0c1-f22b801baa22", // e.g. "AXP-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    endpoint: "https://api.axiom.co/v1/datasets/mina-portal/ingest",
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

  function sendToAxiom(entry) {
    if (!AXIOM.enabled || !AXIOM.token) return;
    const body = JSON.stringify([entry]);
    /* keepalive lets the request survive page unload (e.g. logout reload) */
    try {
      fetch(AXIOM.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + AXIOM.token,
        },
        body,
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
      sendToAxiom(entry);
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
    config: AXIOM,
    MAX_ENTRIES,
  };
})();
