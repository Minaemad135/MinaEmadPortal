const S = window.MinaSettings;

const themeOptions = document.querySelectorAll("#themeOptions .option");
const designOptions = document.querySelectorAll("#designOptions .option");
const markOptions = document.querySelectorAll("#markOptions .option");
const status = document.getElementById("settingsStatus");

function setPressed(nodes, key, value) {
  nodes.forEach((node) => node.setAttribute("aria-pressed", String(node.dataset[key] === value)));
}

function sync() {
  const s = S.get();
  setPressed(themeOptions, "theme", s.theme);
  setPressed(designOptions, "design", s.design);
  if (markOptions.length) setPressed(markOptions, "mark", s.markStyle || "classic");
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

markOptions.forEach((btn) =>
  btn.addEventListener("click", () => {
    if (!A.can("changeAppearance")) return;
    S.save({ markStyle: btn.dataset.mark });
    flash(`Attendance mark style set to ${btn.querySelector(".option-label").textContent.replace(" (Default)", "")}.`);
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

/* ---------- Roles & users ---------- */

const A = window.MinaAuth;
const store = () => A.getState();

const roleListEl = document.getElementById("roleList");
const newRoleNameEl = document.getElementById("newRoleName");
const addRoleBtnEl = document.getElementById("addRoleBtn");
const newRolePermsEl = document.getElementById("newRolePerms");
const newRolePermDetailsEl = document.getElementById("newRolePermDetails");

const userListEl = document.getElementById("userList");
const newUserNameEl = document.getElementById("newUserName");
const newUserPasswordEl = document.getElementById("newUserPassword");
const newUserRoleEl = document.getElementById("newUserRole");
const addUserBtnEl = document.getElementById("addUserBtn");

function persist() {
  A.saveState();
}

function permCount(perms) {
  return A.ALL_PERMS.filter((key) => perms[key]).length;
}

function usersWithRole(roleId) {
  return store().users.filter((u) => u.roleId === roleId).length;
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

function isAdminRole(role) {
  return !!role && A.isAdminPerms(role.perms);
}

function soleAdminGuard(user) {
  return A.isAdminUser(user) && A.adminCount() <= 1;
}

function prospectiveAdmins({
  moveRoleId = null,
  moveToRoleId = null,
  editRoleId = null,
  editPerms = null,
} = {}) {
  return store().users.filter((u) => {
    let rid = u.roleId;
    if (moveRoleId && rid === moveRoleId) rid = moveToRoleId;
    const role = editRoleId && rid === editRoleId ? { perms: editPerms } : A.roleById(rid);
    return role && A.isAdminPerms(role.perms);
  }).length;
}

function fallbackRoleFor(role) {
  const others = store().roles.filter((r) => r.id !== role.id);
  if (!others.length) return null;
  return isAdminRole(role) ? others.find(isAdminRole) || others[0] : others[0];
}

function closeEditor() {
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

/* ----- Roles ----- */

function renderRoles() {
  const roles = store().roles;
  roleListEl.innerHTML = "";

  if (!roles.length) {
    const empty = document.createElement("li");
    empty.className = "group-empty";
    empty.textContent = "No roles yet. Add one below so it can be assigned to users.";
    roleListEl.appendChild(empty);
    return;
  }

  const me = A.currentUser();

  roles.forEach((r) => {
    const li = document.createElement("li");
    li.className = "group-item role-item";

    const name = document.createElement("span");
    name.className = "group-name";
    name.textContent = r.name;
    name.title = r.name;

    const isMine = !!me && me.roleId === r.id;
    const meta = document.createElement("span");
    meta.className = "group-meta";
    meta.textContent =
      `${permCount(r.perms)}/${A.ALL_PERMS.length} permissions · ${usersWithRole(r.id)} user(s)` +
      (isMine ? " · your role" : "");
    if (isMine) meta.classList.add("active-tag");

    const actions = document.createElement("div");
    actions.className = "group-actions";

    const editBtn = miniBtn("Edit");
    editBtn.addEventListener("click", () => openRoleEditor(r, li));

    const fallback = fallbackRoleFor(r);
    const wouldLoseAdmin =
      A.adminCount() >= 1 &&
      (!fallback || prospectiveAdmins({ moveRoleId: r.id, moveToRoleId: fallback.id }) === 0);

    const deleteBtn = miniBtn("Delete", "danger");
    deleteBtn.disabled = wouldLoseAdmin;
    if (roles.length <= 1) deleteBtn.title = "At least one role is required";
    else if (wouldLoseAdmin) deleteBtn.title = "Deleting it would leave the system with no admin";
    deleteBtn.addEventListener("click", () => deleteRole(r));

    actions.append(editBtn, deleteBtn);
    li.append(name, meta, actions);
    roleListEl.appendChild(li);
  });
}

function openRoleEditor(role, li) {
  if (!A.can("manageRoles")) return;
  closeEditor();

  const editor = document.createElement("div");
  editor.className = "perm-editor";
  editor.id = "permEditor";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = role.name;
  nameInput.autocomplete = "off";

  const groups = document.createElement("div");
  groups.className = "perm-groups";
  renderPermGroups(groups, role.perms, false);

  const actions = document.createElement("div");
  actions.className = "perm-editor-actions";

  const saveBtn = miniBtn("Save", "primary");
  const cancelBtn = miniBtn("Cancel");

  saveBtn.addEventListener("click", () => {
    const name = nameInput.value.trim() || role.name;
    const clash = store().roles.some(
      (x) => x.id !== role.id && x.name.toLowerCase() === name.toLowerCase()
    );
    if (clash) {
      flash(`A role called "${name}" already exists.`);
      nameInput.focus();
      return;
    }

    const me = A.currentUser();
    const affectsMe = !!me && me.roleId === role.id;
    const newPerms = A.normalizePerms(readPermGroups(groups));
    if (A.adminCount() >= 1 && prospectiveAdmins({ editRoleId: role.id, editPerms: newPerms }) === 0) {
      flash("This is the only admin role — it must keep every permission. Make another user admin first.");
      return;
    }
    role.name = name;
    role.perms = newPerms;
    persist();
    closeEditor();
    renderRoles();
    renderUsers();
    flash(`Saved role "${name}".`);
    if (affectsMe) location.reload();
  });

  cancelBtn.addEventListener("click", closeEditor);

  actions.append(saveBtn, cancelBtn);
  editor.append(field("Role name", nameInput), groups, actions);
  li.insertAdjacentElement("afterend", editor);
  nameInput.focus();
  nameInput.select();
}

function deleteRole(role) {
  if (!A.can("manageRoles")) return;
  const fallback = fallbackRoleFor(role);
  if (!fallback) {
    flash("At least one role is required.");
    return;
  }
  if (
    A.adminCount() >= 1 &&
    prospectiveAdmins({ moveRoleId: role.id, moveToRoleId: fallback.id }) === 0
  ) {
    flash("Can't delete this role — it would leave the system with no admin.");
    return;
  }
  if (!confirm(`Delete role "${role.name}"?`)) return;

  const affectedMe = !!A.currentUser() && A.currentUser().roleId === role.id;
  store().users.forEach((u) => {
    if (u.roleId === role.id) u.roleId = fallback.id;
  });
  store().roles = store().roles.filter((r) => r.id !== role.id);
  persist();
  closeEditor();
  renderRoles();
  renderUsers();
  flash(`Role "${role.name}" deleted.`);
  if (affectedMe) location.reload();
}

function addRole() {
  if (!A.can("manageRoles")) return;
  const name = newRoleNameEl.value.trim();
  if (!name) {
    flash("Enter a name for the new role.");
    newRoleNameEl.focus();
    return;
  }
  if (store().roles.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
    flash(`A role called "${name}" already exists.`);
    newRoleNameEl.focus();
    return;
  }
  const role = { id: A.uid(), name, perms: A.normalizePerms(readPermGroups(newRolePermsEl)) };
  store().roles.push(role);
  persist();
  newRoleNameEl.value = "";
  renderPermGroups(newRolePermsEl, A.normalizePerms({}), false);
  renderRoles();
  fillRoleSelect();
  flash(`Role "${name}" created.`);
  newRoleNameEl.focus();
}

addRoleBtnEl.addEventListener("click", addRole);
newRoleNameEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addRole();
  }
});

/* ----- Users ----- */

function fillRoleSelect() {
  newUserRoleEl.innerHTML = "";
  store().roles.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name;
    newUserRoleEl.appendChild(opt);
  });
}

function renderUsers() {
  userListEl.innerHTML = "";

  if (!store().users.length) {
    const empty = document.createElement("li");
    empty.className = "group-empty";
    empty.textContent = "No users yet. Add one below — it will be able to sign in right away.";
    userListEl.appendChild(empty);
    return;
  }

  store().users.forEach((u) => {
    const li = document.createElement("li");
    li.className = "group-item user-item";

    const name = document.createElement("span");
    name.className = "group-name";
    name.textContent = u.name;
    name.title = u.name;

    const role = A.roleOf(u);
    const isMe = u.id === store().currentUserId;
    const meta = document.createElement("span");
    meta.className = "group-meta";
    meta.textContent =
      `${role ? role.name : "no role"} · ${role ? permCount(role.perms) : 0}/${A.ALL_PERMS.length} permissions` +
      (isMe ? " · you" : "");
    if (isMe) meta.classList.add("active-tag");

    const actions = document.createElement("div");
    actions.className = "group-actions";

    const editBtn = miniBtn("Edit");
    editBtn.addEventListener("click", () => openUserEditor(u, li));

    const deleteBtn = miniBtn("Delete", "danger");
    deleteBtn.disabled = soleAdminGuard(u);
    if (deleteBtn.disabled) deleteBtn.title = "This is the only admin — it can't be deleted";
    deleteBtn.addEventListener("click", () => deleteUser(u));

    actions.append(editBtn, deleteBtn);
    li.append(name, meta, actions);
    userListEl.appendChild(li);
  });
}

function openUserEditor(user, li) {
  if (!A.can("manageUsers")) return;
  closeEditor();

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
  store().roles.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name;
    roleSel.appendChild(opt);
  });
  roleSel.value = user.roleId;

  const actions = document.createElement("div");
  actions.className = "perm-editor-actions";

  const saveBtn = miniBtn("Save", "primary");
  const cancelBtn = miniBtn("Cancel");

  saveBtn.addEventListener("click", () => {
    const name = nameInput.value.trim() || user.name;
    const clash = store().users.some(
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
    if (soleAdminGuard(user) && roleSel.value !== user.roleId) {
      flash("This is the only admin — its role can't be changed. Make another user admin first.");
      return;
    }

    const wasMe = user.id === store().currentUserId;
    user.name = name;
    if (passInput.value) user.passwordHash = A.hashPassword(passInput.value);
    user.roleId = roleSel.value;
    persist();
    closeEditor();
    renderUsers();
    renderRoles();
    flash(`Saved "${user.name}".`);
    if (wasMe) location.reload();
  });

  cancelBtn.addEventListener("click", closeEditor);

  actions.append(saveBtn, cancelBtn);
  editor.append(top, field("Role", roleSel), actions);
  li.insertAdjacentElement("afterend", editor);
  nameInput.focus();
  nameInput.select();
}

function deleteUser(user) {
  if (!A.can("manageUsers")) return;
  if (soleAdminGuard(user)) {
    flash("This is the only admin account — it can't be deleted.");
    return;
  }
  if (!confirm(`Delete user "${user.name}"?`)) return;
  const wasMe = user.id === store().currentUserId;
  store().users = store().users.filter((x) => x.id !== user.id);
  if (wasMe) store().currentUserId = null;
  persist();
  closeEditor();
  renderUsers();
  renderRoles();
  flash(`"${user.name}" deleted.`);
  if (wasMe) location.reload();
}

function addUser() {
  if (!A.can("manageUsers")) return;
  const name = newUserNameEl.value.trim();
  const password = newUserPasswordEl.value;
  const roleId = newUserRoleEl.value;

  if (!name) {
    flash("Enter a name for the new user.");
    newUserNameEl.focus();
    return;
  }
  if (store().users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    flash(`A user named "${name}" already exists.`);
    newUserNameEl.focus();
    return;
  }
  if (password.length < 4) {
    flash("Password must be at least 4 characters.");
    newUserPasswordEl.focus();
    return;
  }
  if (!A.roleById(roleId)) {
    flash("Pick a role for the new user.");
    newUserRoleEl.focus();
    return;
  }

  store().users.push({
    id: A.uid(),
    name,
    passwordHash: A.hashPassword(password),
    roleId,
  });
  persist();

  newUserNameEl.value = "";
  newUserPasswordEl.value = "";
  renderUsers();
  renderRoles();
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

renderPermGroups(newRolePermsEl, A.normalizePerms({}), false);
renderRoles();
fillRoleSelect();
renderUsers();

document.addEventListener("minasettings:change", sync);

sync();
