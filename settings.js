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
    S.save({ theme: btn.dataset.theme });
    flash(`Theme set to ${btn.querySelector(".option-label").textContent}.`);
  })
);

designOptions.forEach((btn) =>
  btn.addEventListener("click", () => {
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
  const count = g.students.length;
  if (!confirm(`Delete "${g.name}"${count ? ` and its ${count} student(s) and attendance records` : ""}?`)) return;
  att.groups = att.groups.filter((x) => x.id !== g.id);
  if (att.activeGroup === g.id) att.activeGroup = att.groups.length ? att.groups[0].id : "";
  saveAtt();
  renderGroups();
  flash(`"${g.name}" deleted.`);
}

function addGroup() {
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

document.addEventListener("minasettings:change", sync);

sync();
