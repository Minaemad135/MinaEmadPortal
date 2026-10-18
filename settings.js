const S = window.MinaSettings;

const themeOptions = document.querySelectorAll("#themeOptions .option");
const designOptions = document.querySelectorAll("#designOptions .option");
const status = document.getElementById("settingsStatus");

const menuToggle = document.getElementById("menuToggle");
const siteNav = document.getElementById("siteNav");

menuToggle.addEventListener("click", () => siteNav.classList.toggle("open"));

function setPressed(nodes, key, value) {
  nodes.forEach((node) => node.setAttribute("aria-pressed", String(node.dataset[key] === value)));
}

function sync() {
  const s = S.get();
  setPressed(themeOptions, "theme", s.theme);
  setPressed(designOptions, "design", s.design);
}

function flash(message) {
  status.textContent = message;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => (status.textContent = ""), 2500);
}

themeOptions.forEach((btn) =>
  btn.addEventListener("click", () => {
    if (!A.can("changeAppearance")) return;
    S.save({ theme: btn.dataset.theme });
    flash(`Theme set to ${btn.querySelector(".option-label").textContent}.`);
  })
);

designOptions.forEach((btn) =>
  btn.addEventListener("click", () => {
    if (!A.can("changeAppearance")) return;
    S.save({ design: btn.dataset.design });
    flash(`Design set to ${btn.querySelector(".option-label").textContent}.`);
  })
);

/* ---------- Classes / groups (shared with the Attendance page) ---------- */

const ATT_KEY = "mina.attendance";
const groupListEl = document.getElementById("groupList");
const newGroupNameEl = document.getElementById("newGroupName");
const addGroupBtnEl = document.getElementById("addGroupBtn");

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function normGroup(g) {
  return {
    id: g.id || uid(),
    name: g.name || "Class 1",
    year: g.year || new Date().getFullYear(),
    weekdays: Array.isArray(g.weekdays) ? g.weekdays.filter((n) => n >= 0 && n <= 6) : [5],
    students: Array.isArray(g.students) ? g.students : [],
    specialDays: Array.isArray(g.specialDays) ? g.specialDays : [],
    records: g.records && typeof g.records === "object" ? g.records : {},
  };
}

function loadAtt() {
  try {
    const raw = JSON.parse(localStorage.getItem(ATT_KEY));
    if (raw && Array.isArray(raw.groups)) {
      const groups = raw.groups.map(normGroup);
      const active = groups.some((g) => g.id === raw.activeGroup)
        ? raw.activeGroup
        : groups.length
          ? groups[0].id
          : "";
      return { activeGroup: active, groups };
    }
  } catch (e) {
    /* ignore */
  }
  return { activeGroup: "", groups: [] };
}

let att = loadAtt();

function saveAtt() {
  try {
    localStorage.setItem(ATT_KEY, JSON.stringify(att));
  } catch (e) {
    /* ignore */
  }
}

function studentLabel(n) {
  return `${n} student${n === 1 ? "" : "s"}`;
}

function miniBtn(label, extra) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mini-btn" + (extra ? ` ${extra}` : "");
  btn.textContent = label;
  return btn;
}

function renderGroups() {
  groupListEl.innerHTML = "";

  if (!att.groups.length) {
    const empty = document.createElement("li");
    empty.className = "group-empty";
    empty.textContent = "No classes yet. Add one below — it will show up on the Attendance page.";
    groupListEl.appendChild(empty);
    return;
  }

  att.groups.forEach((g) => {
    const li = document.createElement("li");
    li.className = "group-item";

    const name = document.createElement("span");
    name.className = "group-name";
    name.textContent = g.name;
    name.title = g.name;

    const meta = document.createElement("span");
    meta.className = "group-meta";
    const isActive = g.id === att.activeGroup;
    meta.textContent = studentLabel(g.students.length) + (isActive ? " · active" : "");
    if (isActive) meta.classList.add("active-tag");

    const actions = document.createElement("div");
    actions.className = "group-actions";

    const renameBtn = miniBtn("Rename");
    renameBtn.addEventListener("click", () => startRename(g, name, actions));

    const deleteBtn = miniBtn("Delete", "danger");
    deleteBtn.disabled = att.groups.length <= 1;
    if (att.groups.length <= 1) deleteBtn.title = "At least one class is required";
    deleteBtn.addEventListener("click", () => deleteGroup(g));

    actions.append(renameBtn, deleteBtn);
    li.append(name, meta, actions);
    groupListEl.appendChild(li);
  });
}

function startRename(g, nameEl, actions) {
  if (!A.can("manageClasses")) return;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "group-rename";
  input.value = g.name;
  nameEl.replaceWith(input);

  const saveBtn = miniBtn("Save", "primary");
  const cancelBtn = miniBtn("Cancel");
  actions.innerHTML = "";
  actions.append(saveBtn, cancelBtn);

  saveBtn.addEventListener("mousedown", (e) => e.preventDefault());
  cancelBtn.addEventListener("mousedown", (e) => e.preventDefault());

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    if (commit && !A.can("manageClasses")) commit = false;
    if (commit) {
      const value = input.value.trim();
      if (value && value !== g.name) {
        g.name = value;
        saveAtt();
        flash(`Renamed to "${value}".`);
      }
    }
    renderGroups();
  };

  saveBtn.addEventListener("click", () => finish(true));
  cancelBtn.addEventListener("click", () => finish(false));
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });

  input.focus();
  input.select();
}

function deleteGroup(g) {
  if (!A.can("manageClasses")) return;
  const count = g.students.length;
  if (!confirm(`Delete "${g.name}"${count ? ` and its ${count} student(s) and attendance records` : ""}?`)) return;
  att.groups = att.groups.filter((x) => x.id !== g.id);
  if (att.activeGroup === g.id) att.activeGroup = att.groups.length ? att.groups[0].id : "";
  saveAtt();
  renderGroups();
  flash(`"${g.name}" deleted.`);
}

function addGroup() {
  if (!A.can("manageClasses")) return;
  const name = newGroupNameEl.value.trim();
  if (!name) {
    newGroupNameEl.focus();
    return;
  }
  const g = normGroup({ id: uid(), name, year: new Date().getFullYear(), weekdays: [5] });
  att.groups.push(g);
  if (!att.activeGroup) att.activeGroup = g.id;
  newGroupNameEl.value = "";
  saveAtt();
  renderGroups();
  flash(`"${name}" added.`);
  newGroupNameEl.focus();
}

addGroupBtnEl.addEventListener("click", addGroup);
newGroupNameEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addGroup();
  }
});

renderGroups();

/* ---------- Users & permissions ---------- */

const A = window.MinaAuth || {
  can: () => true,
  PERM_GROUPS: [],
  ALL_PERMS: [],
  PRESETS: {},
  permsFor: (role, perms) => perms || {},
  hashPassword: (t) => String(t),
};
const USERS_KEY = "mina.users";

const userListEl = document.getElementById("userList");
const newUserNameEl = document.getElementById("newUserName");
const newUserPasswordEl = document.getElementById("newUserPassword");
const newUserRoleEl = document.getElementById("newUserRole");
const addUserBtnEl = document.getElementById("addUserBtn");
const newUserPermsEl = document.getElementById("newUserPerms");

const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function loadUsers() {
  try {
    const raw = JSON.parse(localStorage.getItem(USERS_KEY));
    if (raw && Array.isArray(raw.users)) return raw;
  } catch (e) {
    /* ignore */
  }
  return { users: [], currentUserId: null };
}

let userStore = loadUsers();

function saveUsers() {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(userStore));
  } catch (e) {
    /* ignore */
  }
}

function renderPermGroups(container, perms, disabled) {
  container.innerHTML = "";

  A.PERM_GROUPS.forEach((group) => {
    const box = document.createElement("div");
    box.className = "perm-group";

    const title = document.createElement("span");
    title.className = "perm-group-title";
    title.textContent = group.page;
    box.appendChild(title);

    group.perms.forEach((p) => {
      const label = document.createElement("label");
      label.className = "perm-item";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!perms[p.key];
      cb.disabled = disabled;
      cb.dataset.key = p.key;

      const text = document.createElement("span");
      text.textContent = p.label;

      label.append(cb, text);
      box.appendChild(label);
    });

    container.appendChild(box);
  });
}

function readPermGroups(container) {
  const perms = {};
  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    perms[cb.dataset.key] = cb.checked;
  });
  return perms;
}

function presetPerms(role) {
  const perms = {};
  A.ALL_PERMS.forEach((key) => {
    perms[key] = role === "admin" ? true : role === "student" ? A.PRESETS.student.includes(key) : false;
  });
  return perms;
}

function syncNewUserPerms() {
  const role = newUserRoleEl.value;
  renderPermGroups(newUserPermsEl, presetPerms(role), role === "admin");
  const details = document.getElementById("newUserPermDetails");
  if (details) details.hidden = role === "admin";
}

newUserRoleEl.addEventListener("change", syncNewUserPerms);
syncNewUserPerms();

function permissionCount(user) {
  return A.ALL_PERMS.filter((key) => user.role === "admin" || user.perms[key]).length;
}

function renderUsers() {
  userListEl.innerHTML = "";

  if (!userStore.users.length) {
    const empty = document.createElement("li");
    empty.className = "group-empty";
    empty.textContent = "No users yet. Add one below — it will be able to sign in right away.";
    userListEl.appendChild(empty);
    return;
  }

  userStore.users.forEach((u) => {
    const li = document.createElement("li");
    li.className = "group-item user-item";

    const name = document.createElement("span");
    name.className = "group-name";
    name.textContent = u.name;
    name.title = u.name;

    const isMe = u.id === userStore.currentUserId;
    const meta = document.createElement("span");
    meta.className = "group-meta";
    meta.textContent =
      `${u.role} · ${permissionCount(u)}/${A.ALL_PERMS.length} permissions` + (isMe ? " · you" : "");
    if (isMe) meta.classList.add("active-tag");

    const actions = document.createElement("div");
    actions.className = "group-actions";

    const permsBtn = miniBtn("Permissions");
    permsBtn.addEventListener("click", () => openPermEditor(u, li));

    const deleteBtn = miniBtn("Delete", "danger");
    deleteBtn.addEventListener("click", () => deleteUser(u));

    actions.append(permsBtn, deleteBtn);
    li.append(name, meta, actions);
    userListEl.appendChild(li);
  });
}

function closePermEditor() {
  const open = document.getElementById("permEditor");
  if (open) open.remove();
}

function field(labelText, input) {
  const wrap = document.createElement("label");
  wrap.className = "auth-field perm-editor-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  wrap.append(span, input);
  return wrap;
}

function openPermEditor(user, li) {
  if (!A.can("manageUsers")) return;
  closePermEditor();

  const editor = document.createElement("div");
  editor.className = "perm-editor";
  editor.id = "permEditor";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = user.name;
  nameInput.autocomplete = "off";

  const passInput = document.createElement("input");
  passInput.type = "password";
  passInput.placeholder = "Leave blank to keep";
  passInput.autocomplete = "new-password";

  const top = document.createElement("div");
  top.className = "perm-editor-row";
  top.append(field("Name", nameInput), field("New password", passInput));

  const roleSel = document.createElement("select");
  ["admin", "student", "custom"].forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r.charAt(0).toUpperCase() + r.slice(1);
    roleSel.appendChild(opt);
  });
  roleSel.value = user.role;

  const groups = document.createElement("div");
  groups.className = "perm-groups";
  renderPermGroups(groups, user.perms, user.role === "admin");

  roleSel.addEventListener("change", () => {
    renderPermGroups(groups, presetPerms(roleSel.value), roleSel.value === "admin");
  });

  const actions = document.createElement("div");
  actions.className = "perm-editor-actions";

  const saveBtn = miniBtn("Save", "primary");
  const cancelBtn = miniBtn("Cancel");

  saveBtn.addEventListener("click", () => {
    const name = nameInput.value.trim() || user.name;
    const clash = userStore.users.some(
      (x) => x.id !== user.id && x.name.toLowerCase() === name.toLowerCase()
    );
    if (clash) {
      flash(`Another user is already called "${name}".`);
      nameInput.focus();
      return;
    }
    if (passInput.value && passInput.value.length < 4) {
      flash("Password must be at least 4 characters.");
      passInput.focus();
      return;
    }

    const wasMe = user.id === userStore.currentUserId;
    user.name = name;
    if (passInput.value) user.passwordHash = A.hashPassword(passInput.value);
    user.role = roleSel.value;
    user.perms = A.permsFor(user.role, readPermGroups(groups));
    saveUsers();
    closePermEditor();
    renderUsers();
    flash(`Saved "${user.name}".`);
    if (wasMe) location.reload();
  });

  cancelBtn.addEventListener("click", closePermEditor);

  actions.append(saveBtn, cancelBtn);
  editor.append(top, field("Role", roleSel), groups, actions);
  li.insertAdjacentElement("afterend", editor);
  nameInput.focus();
  nameInput.select();
}

function deleteUser(user) {
  if (!A.can("manageUsers")) return;
  if (!confirm(`Delete user "${user.name}"?`)) return;
  const wasMe = user.id === userStore.currentUserId;
  userStore.users = userStore.users.filter((x) => x.id !== user.id);
  if (wasMe) userStore.currentUserId = null;
  saveUsers();
  closePermEditor();
  renderUsers();
  flash(`"${user.name}" deleted.`);
  if (wasMe) location.reload();
}

function addUser() {
  if (!A.can("manageUsers")) return;
  const name = newUserNameEl.value.trim();
  const password = newUserPasswordEl.value;
  const role = newUserRoleEl.value;

  if (!name) {
    flash("Enter a name for the new user.");
    newUserNameEl.focus();
    return;
  }
  if (userStore.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    flash(`A user named "${name}" already exists.`);
    newUserNameEl.focus();
    return;
  }
  if (password.length < 4) {
    flash("Password must be at least 4 characters.");
    newUserPasswordEl.focus();
    return;
  }

  const perms = role === "admin" ? presetPerms("admin") : readPermGroups(newUserPermsEl);
  userStore.users.push({
    id: makeId(),
    name,
    passwordHash: A.hashPassword(password),
    role,
    perms: A.permsFor(role, perms),
  });
  saveUsers();

  newUserNameEl.value = "";
  newUserPasswordEl.value = "";
  syncNewUserPerms();
  renderUsers();
  flash(`"${name}" can now sign in.`);
  newUserNameEl.focus();
}

addUserBtnEl.addEventListener("click", addUser);
newUserPasswordEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addUser();
  }
});
newUserNameEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    newUserPasswordEl.focus();
  }
});

renderUsers();

document.addEventListener("minasettings:change", sync);

sync();
