/* ---------- Auth: users, roles & permissions ---------- */

(function () {
  const SESSION_KEY = "mina.session";
  const LEGACY_KEY = "mina.users";

  const PERM_GROUPS = [
    {
      page: "Home",
      perms: [{ key: "viewHome", label: "Open home page" }],
    },
    {
      page: "Attendance",
      perms: [
        { key: "viewAttendance", label: "Open attendance & points pages" },
        { key: "markAttendance", label: "Mark attendance & change points" },
        { key: "addStudent", label: "Add students" },
        { key: "editStudent", label: "Edit students" },
        { key: "deleteStudent", label: "Remove students" },
        { key: "manageDays", label: "Manage class, year & attendance days" },
        { key: "useFilters", label: "Filters, search & export CSV" },
        { key: "viewAnalysis", label: "Open reports & statistics (analysis)" },
        { key: "useAnalysisRange", label: "Change the analysis date range" },
        {
          key: "viewAttendanceRisk",
          label: "View at-risk students & attendance streaks",
        },
      ],
    },
    {
      page: "Settings",
      perms: [
        { key: "viewSettings", label: "Open settings page" },
        { key: "changeAppearance", label: "Change theme & design" },
        { key: "manageClasses", label: "Add / rename / delete classes" },
        { key: "manageUsers", label: "Add / edit / delete users" },
        { key: "manageRoles", label: "Create, edit & delete roles" },
        { key: "viewLogs", label: "View activity logs" },
      ],
    },
    {
      page: "Todo",
      perms: [
        { key: "viewTodo", label: "Open todo page" },
        { key: "addTodo", label: "Add todos" },
        { key: "completeTodo", label: "Complete / uncomplete todos" },
        { key: "deleteTodo", label: "Delete todos & clear completed" },
      ],
    },
  ];

  const ALL_PERMS = PERM_GROUPS.flatMap((g) => g.perms.map((p) => p.key));

  const PRESETS = {
    admin: ALL_PERMS,
    student: [
      "viewHome",
      "viewAttendance",
      "markAttendance",
      "useFilters",
      "viewAnalysis",
      "useAnalysisRange",
      "viewTodo",
      "addTodo",
      "completeTodo",
    ],
    custom: [],
  };

  const PAGE_PERM = {
    home: "viewHome",
    attendance: "viewAttendance",
    points: "viewAttendance",
    settings: "viewSettings",
    todo: "viewTodo",
    logs: "viewLogs",
  };

  function hashPassword(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++)
      h = ((h << 5) + h) ^ text.charCodeAt(i);
    return (h >>> 0).toString(16) + "-" + text.length.toString(16);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function permsFor(role, perms) {
    const out = {};
    const preset =
      role === "admin" ? ALL_PERMS : role === "student" ? PRESETS.student : [];
    ALL_PERMS.forEach((key) => {
      out[key] =
        perms && typeof perms[key] === "boolean"
          ? perms[key]
          : preset.includes(key);
    });
    if (role === "admin") ALL_PERMS.forEach((key) => (out[key] = true));
    return out;
  }

  function normalizePerms(perms, defaults) {
    const out = {};
    ALL_PERMS.forEach((key) => {
      out[key] =
        perms && typeof perms[key] === "boolean"
          ? perms[key]
          : !!(defaults && typeof defaults[key] === "boolean" && defaults[key]);
    });
    return out;
  }

  function migratePerms(raw) {
    const perms = raw && typeof raw === "object" ? raw : {};
    const wasFullAdmin =
      Object.keys(perms).length > 0 &&
      Object.keys(perms).every((key) => perms[key] === true);
    return normalizePerms(
      perms,
      wasFullAdmin ? permsFromKeys(ALL_PERMS) : null,
    );
  }

  function permsFromKeys(keys) {
    const out = {};
    ALL_PERMS.forEach((key) => (out[key] = keys.includes(key)));
    return out;
  }

  function defaultRoles() {
    return [
      { id: uid(), name: "Admin", perms: permsFromKeys(PRESETS.admin) },
    ];
  }

  function normalizeLegacy(raw) {
    if (!raw || !Array.isArray(raw.users)) return null;

    let roles =
      Array.isArray(raw.roles) && raw.roles.length
        ? raw.roles.map((r) => ({
            id: r.id || uid(),
            name: r.name || "Role",
            perms: migratePerms(r.perms),
          }))
        : defaultRoles();

    const users = raw.users.map((u) => {
      const base = {
        id: u.id || uid(),
        name: u.name || "User",
        passwordHash: u.passwordHash || "",
        ...(u.firstName ? { firstName: u.firstName } : {}),
        ...(u.lastName ? { lastName: u.lastName } : {}),
        ...(u.phone ? { phone: u.phone } : {}),
      };

      if (u.roleId) return { ...base, roleId: u.roleId };

      if (u.role === "admin" || u.role === "student") {
        return { ...base, roleId: u.role };
      }

      const role = {
        id: uid(),
        name: `${base.name} (custom)`,
        perms: migratePerms(u.perms),
      };
      roles.push(role);
      return { ...base, roleId: role.id };
    });

    users.forEach((u) => {
      if (!roles.some((r) => r.id === u.roleId)) u.roleId = roles[0].id;
    });
    if (!roles.length) roles = defaultRoles();

    return { users, roles, currentUserId: raw.currentUserId || null };
  }

  function readLegacy() {
    try {
      return normalizeLegacy(JSON.parse(localStorage.getItem(LEGACY_KEY)));
    } catch (e) {
      return null;
    }
  }

  function saveSession(userId) {
    try {
      if (userId) localStorage.setItem(SESSION_KEY, userId);
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function readSession() {
    try {
      return localStorage.getItem(SESSION_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function normalizeRoleRow(r) {
    return {
      id: r.id,
      name: r.name || "Role",
      perms: migratePerms(r.perms),
    };
  }

  function normalizeUserRow(u) {
    const base = {
      id: u.id,
      name: u.name || "User",
      passwordHash: u.password_hash || "",
      ...(u.first_name ? { firstName: u.first_name } : {}),
      ...(u.last_name ? { lastName: u.last_name } : {}),
      ...(u.phone ? { phone: u.phone } : {}),
    };
    if (u.role_id) return { ...base, roleId: u.role_id };
    return base;
  }

  let store = {
    users: [],
    roles: defaultRoles(),
    currentUserId: null,
  };

  function emptyStore() {
    return { users: [], roles: defaultRoles(), currentUserId: null };
  }

  function applySession() {
    const sid = readSession();
    store.currentUserId =
      sid && store.users.some((u) => u.id === sid) ? sid : null;
    if (store.currentUserId) saveSession(store.currentUserId);
  }

  function migrateLegacyToSupabase(legacy) {
    const SB = window.MinaSupabase;
    const roleIds = new Set(store.roles.map((r) => r.id));
    legacy.roles.forEach((r) => {
      if (!roleIds.has(r.id)) {
        store.roles.push(r);
        roleIds.add(r.id);
      }
    });
    store.users = legacy.users;
    store.users.forEach((u) => {
      if (!store.roles.some((r) => r.id === u.roleId))
        u.roleId = store.roles[0].id;
    });
    if (legacy.currentUserId) {
      store.currentUserId = legacy.currentUserId;
      saveSession(legacy.currentUserId);
    }
    if (!SB || !SB.ready()) return Promise.resolve(store);
    return saveState().then(
      function () {
        try {
          localStorage.removeItem(LEGACY_KEY);
        } catch (e) {}
        console.info(
          "[MinaAuth] Migrated users/roles from localStorage to Supabase",
        );
        return store;
      },
      function (err) {
        console.warn(
          "[MinaAuth] Migration to Supabase failed, using local data for this session",
          err,
        );
        return store;
      },
    );
  }

  function hydrate() {
    const SB = window.MinaSupabase;

    if (!SB || !SB.ready()) {
      const legacy = readLegacy();
      store = legacy || emptyStore();
      applySession();
      if (!legacy)
        console.warn("[MinaAuth] Supabase not configured — using empty store");
      return Promise.resolve(store);
    }

    return Promise.all([SB.get("roles"), SB.get("users")]).then(
      function (results) {
        const roleRows = results[0] || [];
        const userRows = results[1] || [];

        let roles = roleRows.length
          ? roleRows.map(normalizeRoleRow)
          : defaultRoles();
        let users = userRows.map(normalizeUserRow);

        users.forEach((u) => {
          if (!roles.some((r) => r.id === u.roleId)) u.roleId = roles[0].id;
        });
        if (!roles.length) roles = defaultRoles();

        store = { users, roles, currentUserId: null };
        applySession();

        if (!users.length) {
          const legacy = readLegacy();
          if (legacy && legacy.users.length) {
            store = { users: [], roles: roles, currentUserId: null };
            return migrateLegacyToSupabase(legacy);
          }
        }

        try {
          localStorage.removeItem(LEGACY_KEY);
        } catch (e) {}

        return store;
      },
      function (err) {
        console.error(
          "[MinaAuth] Failed to load users/roles from Supabase " +
            "(did you run the roles/users SQL?)",
          err,
        );
        const legacy = readLegacy();
        if (legacy) {
          console.warn("[MinaAuth] Falling back to localStorage data");
          store = legacy;
          applySession();
          return store;
        }
        store = emptyStore();
        applySession();
        return store;
      },
    );
  }

  const currentUser = () =>
    store.users.find((u) => u.id === store.currentUserId) || null;
  const roleById = (id) => store.roles.find((r) => r.id === id) || null;
  const roleOf = (user) => (user ? roleById(user.roleId) : null);
  const listRoles = () => store.roles;

  function can(perm) {
    const role = roleOf(currentUser());
    return !!(role && role.perms[perm]);
  }

  function isAdminPerms(perms) {
    return !!perms && ALL_PERMS.every((key) => perms[key]);
  }

  function isAdminUser(user) {
    const role = user ? roleById(user.roleId) : null;
    return !!(role && isAdminPerms(role.perms));
  }

  function adminCount() {
    return store.users.filter(isAdminUser).length;
  }

  function getState() {
    return store;
  }

  function saveState() {
    const SB = window.MinaSupabase;
    if (!SB || !SB.ready()) {
      return Promise.reject(new Error("Supabase is not configured"));
    }

    const roleRows = store.roles.map((r) => ({
      id: r.id,
      name: r.name,
      perms: r.perms || {},
    }));
    const userRows = store.users.map((u) => ({
      id: u.id,
      name: u.name,
      password_hash: u.passwordHash || "",
      role_id: u.roleId || null,
      first_name: u.firstName || null,
      last_name: u.lastName || null,
      phone: u.phone || null,
    }));

    const tasks = [];
    if (roleRows.length) tasks.push(SB.upsert("roles", roleRows));
    if (userRows.length) tasks.push(SB.upsert("users", userRows));

    return Promise.all(tasks).then(function () {
      return Promise.all([
        SB.get("roles").catch(function () {
          return null;
        }),
        SB.get("users").catch(function () {
          return null;
        }),
      ]).then(function (db) {
        const dels = [];
        const dbRoles = db[0];
        const dbUsers = db[1];
        if (Array.isArray(dbRoles)) {
          const keep = new Set(store.roles.map((r) => r.id));
          const dead = dbRoles.filter((r) => !keep.has(r.id)).map((r) => r.id);
          if (dead.length) dels.push(SB.del("roles", dead));
        }
        if (Array.isArray(dbUsers)) {
          const keep = new Set(store.users.map((u) => u.id));
          const dead = dbUsers.filter((u) => !keep.has(u.id)).map((u) => u.id);
          if (dead.length) dels.push(SB.del("users", dead));
        }
        return Promise.all(dels);
      });
    });
  }

  function refresh() {
    return hydrate();
  }

  function pageKey() {
    const file = location.pathname.split("/").pop().toLowerCase();
    if (file === "attendance.html") return "attendance";
    if (file === "points.html") return "points";
    if (file === "settings.html") return "settings";
    if (file === "todo.html") return "todo";
    if (file === "logs.html") return "logs";
    return "home";
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- UI: login / denied / gating ---------- */

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function buildLogin() {
    const isFirst = store.users.length === 0;

    const overlay = el("div", "auth-overlay");
    overlay.id = "authOverlay";

    const card = el("form", "auth-card");
    card.id = "authForm";

    const mark = el("div", "auth-logo", "M");
    const title = el(
      "h2",
      null,
      isFirst ? "Create the first admin" : "Sign in",
    );
    const sub = el(
      "p",
      "auth-sub",
      isFirst ? "This account gets every permission." : "",
    );

    const nameField = el("label", "auth-field");
    nameField.appendChild(el("span", null, "Username"));
    const nameInput = el("input");
    nameInput.type = "text";
    nameInput.id = "authName";
    nameInput.autocomplete = "username";
    nameInput.placeholder = "e.g. mina_emad";
    nameInput.required = true;
    nameField.appendChild(nameInput);

    const passField = el("label", "auth-field");
    passField.appendChild(el("span", null, "Password"));
    const passInput = el("input");
    passInput.type = "password";
    passInput.id = "authPassword";
    passInput.autocomplete = isFirst ? "new-password" : "current-password";
    passInput.placeholder = "••••••";
    passInput.required = true;
    passField.appendChild(passInput);

    card.append(mark, title, sub, nameField, passField);

    let confirmField = null;
    let confirmInput = null;
    if (isFirst) {
      confirmField = el("label", "auth-field");
      confirmField.appendChild(el("span", null, "Confirm password"));
      confirmInput = el("input");
      confirmInput.type = "password";
      confirmInput.autocomplete = "new-password";
      confirmInput.placeholder = "••••••";
      confirmInput.required = true;
      confirmField.appendChild(confirmInput);
      card.appendChild(confirmField);
    }

    const error = el("p", "auth-error");
    error.id = "authError";
    card.appendChild(error);

    const submit = el(
      "button",
      "btn auth-submit",
      isFirst ? "Create admin" : "Sign in",
    );
    submit.type = "submit";
    card.appendChild(submit);

    if (!isFirst) {
      const list = el("div", "auth-accounts");
      list.appendChild(el("span", null, "Accounts:"));
      store.users.forEach((u) => {
        const chip = el("button", "auth-account", u.name);
        chip.type = "button";
        chip.addEventListener("click", () => {
          nameInput.value = u.name;
          passInput.focus();
        });
        list.appendChild(chip);
      });
      card.appendChild(list);
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const fail = (msg, meta) => {
      error.textContent = msg;
      passInput.value = "";
      passInput.focus();
      if (window.MinaAudit)
        window.MinaAudit.log("auth.loginFailed", {
          msg,
          ...(meta || {}),
        });
    };

    function validateUsernameAuth(name) {
      if (!name) return "Enter a username.";
      if (/\s/.test(name)) return "Username cannot contain spaces.";
      if (!/^[A-Za-z0-9._-]+$/.test(name))
        return "Username can only use letters, numbers, ., _, -";
      if (name.length < 3) return "Username must be at least 3 characters.";
      if (name.length > 11) return "Username must be exactly 11 characters.";
      return null;
    }

    card.addEventListener("submit", (e) => {
      e.preventDefault();
      const rawName = nameInput.value.trim();
      const password = passInput.value;

      const nameErr = validateUsernameAuth(rawName);
      if (nameErr) return fail(nameErr, { username: rawName });
      const name = rawName;
      if (password.length < 4)
        return fail("Password must be at least 4 characters.", {
          username: rawName,
        });

      if (isFirst) {
        if (password !== confirmInput.value)
          return fail("Passwords do not match.", { username: rawName });
        let adminRole =
          store.roles.find((r) => isAdminPerms(r.perms)) ||
          store.roles.find((r) => r.name === "Admin");
        if (!adminRole) {
          adminRole = {
            id: uid(),
            name: "Admin",
            perms: permsFromKeys(ALL_PERMS),
          };
          store.roles.unshift(adminRole);
        }
        const user = {
          id: uid(),
          name,
          passwordHash: hashPassword(password),
          roleId: adminRole.id,
        };
        store.users.push(user);
        store.currentUserId = user.id;
        saveSession(user.id);
        submit.disabled = true;
        saveState().then(
          function () {
            if (window.MinaAudit)
              window.MinaAudit.log("auth.firstAdminCreated", {
                username: name,
                userId: user.id,
              });
            location.reload();
          },
          function (err) {
            submit.disabled = false;
            fail(
              "Could not save to Supabase: " +
                (err && err.message ? err.message : err),
              { username: rawName },
            );
          },
        );
        return;
      }

      const user = store.users.find(
        (u) => u.name.toLowerCase() === name.toLowerCase(),
      );
      if (!user)
        return fail(`No account named "${name}".`, { username: rawName });
      if (user.passwordHash !== hashPassword(password))
        return fail("Wrong password.", { username: rawName });

      store.currentUserId = user.id;
      saveSession(user.id);
      if (window.MinaAudit)
        window.MinaAudit.log("auth.login", { username: name, userId: user.id });
      location.reload();
    });

    document.body.classList.add("auth-locked");
    setTimeout(() => nameInput.focus(), 50);
  }

  function ensureFullAdminRole() {
    const full = store.roles.find((r) => isAdminPerms(r.perms));
    if (full) return full;
    let name = "Admin";
    if (store.roles.some((r) => r.name.toLowerCase() === name.toLowerCase()))
      name = "Admin (restored)";
    const role = { id: uid(), name, perms: permsFromKeys(ALL_PERMS) };
    store.roles.push(role);
    return role;
  }

  function buildRecovery() {
    document.body.classList.add("auth-locked");

    const overlay = el("div", "auth-overlay");
    overlay.id = "authRecovery";

    const card = el("form", "auth-card");
    card.id = "recoveryForm";

    card.append(
      el("div", "auth-logo", "!"),
      el("h2", null, "No admin account"),
      el(
        "p",
        "auth-sub",
        "Every account has been demoted, so nobody can manage users any more. Pick an account, enter its password, and it will be given full admin access.",
      ),
    );

    const userField = el("label", "auth-field");
    userField.appendChild(el("span", null, "Account"));
    const userSel = el("select");
    userSel.id = "recoveryUser";
    store.users.forEach((u) => {
      const opt = el("option", null, u.name);
      opt.value = u.id;
      userSel.appendChild(opt);
    });
    userField.appendChild(userSel);
    card.appendChild(userField);

    const passField = el("label", "auth-field");
    passField.appendChild(el("span", null, "Password"));
    const passInput = el("input");
    passInput.type = "password";
    passInput.id = "recoveryPassword";
    passInput.autocomplete = "current-password";
    passInput.placeholder = "\u2022\u2022\u2022\u2022\u2022\u2022";
    passInput.required = true;
    passField.appendChild(passInput);
    card.appendChild(passField);

    const error = el("p", "auth-error");
    error.id = "recoveryError";
    card.appendChild(error);

    const submit = el("button", "btn auth-submit", "Restore admin access");
    submit.type = "submit";
    card.appendChild(submit);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    card.addEventListener("submit", (e) => {
      e.preventDefault();
      const user = store.users.find((u) => u.id === userSel.value);
      const password = passInput.value;
      if (!user) return;
      if (password.length < 4) {
        error.textContent = "Password must be at least 4 characters.";
        if (window.MinaAudit)
          window.MinaAudit.log("auth.recoveryFailed", {
            username: user.name,
            msg: "Password too short",
          });
        return;
      }
      if (user.passwordHash !== hashPassword(password)) {
        error.textContent = "Wrong password.";
        passInput.value = "";
        passInput.focus();
        if (window.MinaAudit)
          window.MinaAudit.log("auth.recoveryFailed", {
            username: user.name,
            msg: "Wrong password",
          });
        return;
      }
      const role = ensureFullAdminRole();
      user.roleId = role.id;
      store.currentUserId = user.id;
      saveSession(user.id);
      submit.disabled = true;
      saveState().then(
        function () {
          if (window.MinaAudit)
            window.MinaAudit.log("auth.adminRecovery", {
              username: user.name,
              userId: user.id,
            });
          location.reload();
        },
        function (err) {
          submit.disabled = false;
          error.textContent =
            "Could not save to Supabase: " +
            (err && err.message ? err.message : err);
        },
      );
    });

    setTimeout(() => passInput.focus(), 50);
  }

  function buildDenied(user) {
    document.body.classList.add("auth-denied");
    const box = el("div", "auth-denied-box");
    const card = el("div", "auth-card auth-card-static");
    card.append(
      el("div", "auth-logo", "!"),
      el("h2", null, "No access"),
      el(
        "p",
        "auth-sub",
        `You are signed in as ${user.name}, and this account does not have permission to open this page.`,
      ),
    );
    const back = el("a", "btn auth-submit", "Go to home page");
    back.href = "index.html";
    back.style.textAlign = "center";
    card.appendChild(back);
    box.appendChild(card);
    document.body.appendChild(box);
  }

  function gateDataPerms() {
    document.querySelectorAll("[data-perm]").forEach((node) => {
      if (!can(node.dataset.perm)) node.hidden = true;
    });
    collapseEmpty();
  }

  function collapseEmpty() {
    const nodes = [...document.querySelectorAll("[data-collapse], .panel")];
    nodes.sort(
      (a, b) =>
        a.getElementsByTagName("*").length - b.getElementsByTagName("*").length,
    );
    nodes.forEach((node) => {
      const kids = [...node.children];
      if (kids.length && kids.every((k) => k.hidden)) node.hidden = true;
    });
  }

  function renderSidebar() {
    const siteNav = document.getElementById("siteNav");
    if (!siteNav) return;

    siteNav.querySelectorAll(".nav-links a").forEach((link) => {
      const href = (link.getAttribute("href") || "").toLowerCase();
      const key = href.includes("attendance")
        ? "attendance"
        : href.includes("points")
          ? "points"
          : href.includes("settings")
            ? "settings"
            : href.includes("todo")
              ? "todo"
              : href.includes("logs")
                ? "logs"
                : "home";
      const li = link.closest("li");
      if (li) li.hidden = !can(PAGE_PERM[key]);
    });

    const themeToggle = document.getElementById("themeToggle");
    if (themeToggle) themeToggle.hidden = false;

    const user = currentUser();
    if (!user) return;

    const chip = el("div", "user-chip");
    const top = el("div", "user-chip-top");
    const role = roleOf(user);
    top.append(
      el("span", "user-chip-name", user.name),
      el("span", "user-chip-role", role ? role.name : "no role"),
    );
    const logout = el("button", "user-logout", "Log out");
    logout.type = "button";
    logout.addEventListener("click", () => {
      const u = currentUser();
      store.currentUserId = null;
      saveSession(null);
      if (window.MinaAudit)
        window.MinaAudit.log("auth.logout", {
          username: u ? u.name : "unknown",
          userId: u ? u.id : null,
        });
      location.reload();
    });
    chip.append(top, logout);
    siteNav.appendChild(chip);
  }

  function formatLogoName(name) {
    if (!name || typeof name !== "string") return "MinaEmad";
    const trimmed = name.trim();
    if (!trimmed) return "MinaEmad";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "MinaEmad";

    let base = parts[0].replace(/[^A-Za-z]/g, "");
    if (!base) return "MinaEmad";

    base = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();

    if (base.length > 11) {
      base = base.slice(0, 11);
    }

    return base;
  }

  function updateLogos() {
    const user = currentUser();
    if (!user) {
      document.querySelectorAll(".logo").forEach((logo) => {
        const markEl = logo.querySelector(".logo-mark");
        const textEl = logo.querySelector(".logo-text");
        if (markEl) markEl.textContent = "M";
        if (textEl) textEl.textContent = "MinaEmad";
      });
      return;
    }
    const display = formatLogoName(user.name);
    if (display.length === 0) {
      document.querySelectorAll(".logo").forEach((logo) => {
        const markEl = logo.querySelector(".logo-mark");
        const textEl = logo.querySelector(".logo-text");
        if (markEl) markEl.textContent = "M";
        if (textEl) textEl.textContent = "MinaEmad";
      });
      return;
    }
    const mark = display.charAt(0).toUpperCase();
    const text = display;
    document.querySelectorAll(".logo").forEach((logo) => {
      const markEl = logo.querySelector(".logo-mark");
      const textEl = logo.querySelector(".logo-text");
      if (markEl) markEl.textContent = mark;
      if (textEl) textEl.textContent = text;
    });
  }

  function bootstrap() {
    const user = currentUser();
    const noAdminsLeft = store.users.length > 0 && adminCount() === 0;

    if (noAdminsLeft) {
      buildRecovery();
    } else if (!user) {
      buildLogin();
    } else {
      renderSidebar();
      gateDataPerms();
      if (!can(PAGE_PERM[pageKey()])) buildDenied(user);
    }
    updateLogos();
  }

  const ready = hydrate().then(
    function () {
      bootstrap();
      return true;
    },
    function (err) {
      console.error("[MinaAuth] hydrate failed", err);
      bootstrap();
      return false;
    },
  );

  window.MinaAuth = {
    PERM_GROUPS,
    ALL_PERMS,
    PRESETS,
    can,
    currentUser,
    roleById,
    roleOf,
    listRoles,
    isAdminPerms,
    isAdminUser,
    adminCount,
    hashPassword,
    permsFor,
    normalizePerms,
    permsFromKeys,
    defaultRoles,
    uid,
    getState,
    saveState,
    refresh,
    ready,
    gate: (selector, perm) => {
      const allow = can(perm);
      document
        .querySelectorAll(selector)
        .forEach((node) => (node.hidden = !allow));
      return allow;
    },
    get isLocked() {
      return !currentUser();
    },
  };
})();
