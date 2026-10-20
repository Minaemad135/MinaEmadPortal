/* ---------- Auth: users, roles & permissions ---------- */

(function () {
  const STORAGE_KEY = "mina.users";

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

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (raw && Array.isArray(raw.users)) {
        raw.users = raw.users.map((u) => ({
          id: u.id || uid(),
          name: u.name || "User",
          passwordHash: u.passwordHash || "",
          role: ["admin", "student", "custom"].includes(u.role) ? u.role : "custom",
          perms: permsFor(u.role, u.perms),
        }));
        return raw;
      }
    } catch (e) {
      /* ignore */
    }
    return { users: [], currentUserId: null };
  }

  let store = read();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      /* ignore */
    }
  }

  const currentUser = () => store.users.find((u) => u.id === store.currentUserId) || null;

  function can(perm) {
    const user = currentUser();
    if (!user) return false;
    if (user.role === "admin") return true;
    return !!user.perms[perm];
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

  const locked = !currentUser();

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
        const user = {
          id: uid(),
          name,
          passwordHash: hashPassword(password),
          role: "admin",
          perms: permsFor("admin"),
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
    top.append(el("span", "user-chip-name", user.name), el("span", "user-chip-role", user.role));
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

  const user = currentUser();

  if (!user) {
    buildLogin();
  } else {
    renderSidebar();
    gateDataPerms();
    if (!can(PAGE_PERM[pageKey()])) buildDenied(user);
  }

  window.MinaAuth = {
    PERM_GROUPS,
    ALL_PERMS,
    PRESETS,
    can,
    currentUser,
    hashPassword,
    permsFor,
    gate: (selector, perm) => {
      const allow = can(perm);
      document.querySelectorAll(selector).forEach((node) => (node.hidden = !allow));
      return allow;
    },
    isLocked: locked,
  };
})();
