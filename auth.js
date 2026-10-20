/* ---------- Auth: users, roles & permissions ---------- */

(function () {
  const STORAGE_KEY = "mina.users";
  // The signed-in session is per-browser only — never synced to Firestore,
  // otherwise every visitor would share (and overwrite) one currentUserId.
  const SESSION_KEY = "mina.session";

  function readSession() {
    try {
      return localStorage.getItem(SESSION_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function writeSession(id) {
    try {
      if (id) localStorage.setItem(SESSION_KEY, id);
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  const PERM_GROUPS = [
    {
      page: "Home",
      perms: [{ key: "viewHome", label: "Open home page" }],
    },
    {
      page: "Attendance",
      perms: [
        { key: "viewAttendance", label: "Open attendance page" },
        { key: "markAttendance", label: "Mark present / absent" },
        { key: "addStudent", label: "Add students" },
        { key: "editStudent", label: "Edit students" },
        { key: "deleteStudent", label: "Remove students" },
        { key: "manageDays", label: "Manage class, year & attendance days" },
        { key: "useFilters", label: "Filters, search & export CSV" },
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
      "viewTodo",
      "addTodo",
      "completeTodo",
    ],
    custom: [],
  };

  const PAGE_PERM = {
    home: "viewHome",
    attendance: "viewAttendance",
    settings: "viewSettings",
    todo: "viewTodo",
  };

  function hashPassword(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h) ^ text.charCodeAt(i);
    return (h >>> 0).toString(16) + "-" + text.length.toString(16);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function permsFor(role, perms) {
    const out = {};
    const preset = role === "admin" ? ALL_PERMS : role === "student" ? PRESETS.student : [];
    ALL_PERMS.forEach((key) => {
      out[key] = perms && typeof perms[key] === "boolean" ? perms[key] : preset.includes(key);
    });
    if (role === "admin") ALL_PERMS.forEach((key) => (out[key] = true));
    return out;
  }

  function normalizePerms(perms) {
    const out = {};
    ALL_PERMS.forEach((key) => {
      out[key] = perms && typeof perms[key] === "boolean" ? perms[key] : false;
    });
    return out;
  }

  function permsFromKeys(keys) {
    const out = {};
    ALL_PERMS.forEach((key) => (out[key] = keys.includes(key)));
    return out;
  }

  function defaultRoles() {
    return [
      { id: "admin", name: "Admin", perms: permsFromKeys(PRESETS.admin) },
      { id: "student", name: "Student", perms: permsFromKeys(PRESETS.student) },
    ];
  }

  function read() {
    let raw = null;
    try {
      if (window.MinaDB && typeof window.MinaDB.get === "function") {
        raw = window.MinaDB.get(STORAGE_KEY);
      } else {
        raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      }
    } catch (e) {
      raw = null;
    }
    if (!raw || !Array.isArray(raw.users)) {
      return { users: [], roles: defaultRoles(), currentUserId: null };
    }

    let roles =
      Array.isArray(raw.roles) && raw.roles.length
        ? raw.roles.map((r) => ({
            id: r.id || uid(),
            name: r.name || "Role",
            perms: normalizePerms(r.perms),
          }))
        : defaultRoles();

    const users = raw.users.map((u) => {
      const base = {
        id: u.id || uid(),
        name: u.name || "User",
        passwordHash: u.passwordHash || "",
      };

      if (u.roleId) return { ...base, roleId: u.roleId };

      if (u.role === "admin" || u.role === "student") {
        return { ...base, roleId: u.role };
      }

      const role = {
        id: uid(),
        name: `${base.name} (custom)`,
        perms: normalizePerms(u.perms),
      };
      roles.push(role);
      return { ...base, roleId: role.id };
    });

    users.forEach((u) => {
      if (!roles.some((r) => r.id === u.roleId)) u.roleId = roles[0].id;
    });
    if (!roles.length) roles = defaultRoles();

    // Session is per-browser. Migrate a legacy in-document value once,
    // then strip it so it can never resurrect a logged-out session.
    const legacyId = raw.currentUserId || null;
    const sessionId = readSession() || legacyId;
    if (legacyId) {
      try {
        const shared = { users, roles };
        if (window.MinaDB && typeof window.MinaDB.set === "function") {
          window.MinaDB.set(STORAGE_KEY, shared);
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(shared));
        }
        if (sessionId) writeSession(sessionId);
      } catch (e) {
        /* ignore */
      }
    }
    return { users, roles, currentUserId: sessionId };
  }

  let store = read();

  function save() {
    try {
      // Persist only the shared parts (users + roles) to Firestore.
      const shared = { users: store.users, roles: store.roles };
      if (window.MinaDB && typeof window.MinaDB.set === "function") {
        window.MinaDB.set(STORAGE_KEY, shared);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(shared));
      }
      // Session stays local.
      writeSession(store.currentUserId);
    } catch (e) {
      /* ignore */
    }
  }

  const currentUser = () => store.users.find((u) => u.id === store.currentUserId) || null;
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
    save();
  }

  function refresh() {
    store = read();
    return store;
  }

  function pageKey() {
    const file = location.pathname.split("/").pop().toLowerCase();
    if (file === "attendance.html") return "attendance";
    if (file === "settings.html") return "settings";
    if (file === "todo.html") return "todo";
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
    const title = el("h2", null, isFirst ? "Create the first admin" : "Sign in");
    const sub = el("p", "auth-sub", isFirst ? "This account gets every permission." : "MinaEmad");

    const nameField = el("label", "auth-field");
    nameField.appendChild(el("span", null, "Name"));
    const nameInput = el("input");
    nameInput.type = "text";
    nameInput.id = "authName";
    nameInput.autocomplete = "username";
    nameInput.placeholder = "e.g. Mina";
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

    const submit = el("button", "btn auth-submit", isFirst ? "Create admin" : "Sign in");
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

    const fail = (msg) => {
      error.textContent = msg;
      passInput.value = "";
      passInput.focus();
    };

    card.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      const password = passInput.value;

      if (!name) return fail("Enter a name.");
      if (password.length < 4) return fail("Password must be at least 4 characters.");

      if (isFirst) {
        if (password !== confirmInput.value) return fail("Passwords do not match.");
        let adminRole = store.roles.find((r) => r.id === "admin");
        if (!adminRole) {
          adminRole = { id: uid(), name: "Admin", perms: permsFromKeys(ALL_PERMS) };
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
        save();
        location.reload();
        return;
      }

      const user = store.users.find((u) => u.name.toLowerCase() === name.toLowerCase());
      if (!user) return fail(`No account named "${name}".`);
      if (user.passwordHash !== hashPassword(password)) return fail("Wrong password.");

      store.currentUserId = user.id;
      save();
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
        "Every account has been demoted, so nobody can manage users any more. Pick an account, enter its password, and it will be given full admin access."
      )
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
        return;
      }
      if (user.passwordHash !== hashPassword(password)) {
        error.textContent = "Wrong password.";
        passInput.value = "";
        passInput.focus();
        return;
      }
      const role = ensureFullAdminRole();
      user.roleId = role.id;
      store.currentUserId = user.id;
      save();
      location.reload();
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
        `You are signed in as ${user.name}, and this account does not have permission to open this page.`
      )
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
    nodes.sort((a, b) => a.getElementsByTagName("*").length - b.getElementsByTagName("*").length);
    nodes.forEach((node) => {
      const kids = [...node.children];
      if (kids.length && kids.every((k) => k.hidden)) node.hidden = true;
    });
  }

  function renderSidebar() {
    const siteNav = document.getElementById("siteNav");
    if (!siteNav) return;

    // Remove any previously rendered chip to avoid duplicates on re-render.
    siteNav.querySelectorAll(".user-chip").forEach((node) => node.remove());

    siteNav.querySelectorAll(".nav-links a").forEach((link) => {
      const href = (link.getAttribute("href") || "").toLowerCase();
      const key = href.includes("attendance")
        ? "attendance"
        : href.includes("settings")
          ? "settings"
          : href.includes("todo")
            ? "todo"
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
      el("span", "user-chip-role", role ? role.name : "no role")
    );
    const logout = el("button", "user-logout", "Log out");
    logout.type = "button";
    logout.addEventListener("click", () => {
      store.currentUserId = null;
      save();
      location.reload();
    });
    chip.append(top, logout);
    siteNav.appendChild(chip);
  }

  let lastRenderSig = null;

  function renderInitial() {
    // Reveal the page now that auth has decided what to show.
    document.documentElement.classList.remove("auth-pending");
    const u = currentUser();
    const noneLeft = store.users.length > 0 && adminCount() === 0;
    if (noneLeft) {
      buildRecovery();
    } else if (!u) {
      buildLogin();
    } else {
      renderSidebar();
      gateDataPerms();
      if (!can(PAGE_PERM[pageKey()])) buildDenied(u);
    }
  }

  // Wait for the data layer (Firestore/localStorage) before rendering the UI.
  if (!window.MinaDB || !window.MinaDB.ready) {
    renderInitial();
  } else {
    // Safety net: never leave the page hidden if the network hangs.
    setTimeout(() => document.documentElement.classList.remove("auth-pending"), 8000);
    window.MinaDB.ready().then(() => {
      store = read();

      // React to remote changes from other tabs/pages without reloading the page.
      if (window.MinaDB.onChange) {
        window.MinaDB.onChange(STORAGE_KEY, (value) => {
          if (!value || !Array.isArray(value.users)) return;
          // Compare only the shared parts; the session is not part of the doc.
          const before = JSON.stringify({ users: store.users, roles: store.roles });
          const after = JSON.stringify({ users: value.users, roles: value.roles });
          if (after === before) return;
          store = read();

          // Only re-render if the signed-in user or its permissions changed.
          const me = currentUser();
          const sig = me ? `${me.id}:${me.roleId}:${JSON.stringify(roleOf(me)?.perms)}` : "none";
          if (sig === lastRenderSig) return;
          lastRenderSig = sig;
          renderInitial();
        });
      }

      const me = currentUser();
      lastRenderSig = me ? `${me.id}:${me.roleId}:${JSON.stringify(roleOf(me)?.perms)}` : "none";
      renderInitial();
    });
  }

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
    gate: (selector, perm) => {
      const allow = can(perm);
      document.querySelectorAll(selector).forEach((node) => (node.hidden = !allow));
      return allow;
    },
    isLocked: () => !currentUser(),
  };
})();
