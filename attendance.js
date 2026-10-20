const STORAGE_KEY = "mina.attendance";
const Auth = window.MinaAuth || { can: () => true };

const yearInput = document.getElementById("attYear");
const groupSelectEl = document.getElementById("groupSelect");
const studentInput = document.getElementById("studentName");
const addStudentBtn = document.getElementById("addStudent");
const weekdaysEl = document.getElementById("weekdays");
const specialDayInput = document.getElementById("specialDay");
const specialTitleInput = document.getElementById("specialTitle");
const addDayBtn = document.getElementById("addDay");
const filterMonthEl = document.getElementById("filterMonth");
const filterTypeGroupEl = document.getElementById("filterTypeGroup");
const filterStudentEl = document.getElementById("filterStudent");
const dayChips = document.getElementById("dayChips");
const tableWrap = document.getElementById("tableWrap");
const emptyState = document.getElementById("attEmpty");
const attHint = document.getElementById("attHint");
const paginationEl = document.getElementById("pagination");
const pageSizeEl = document.getElementById("pageSize");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const pageInfoEl = document.getElementById("pageInfo");
const todayBtn = document.getElementById("todayBtn");
const exportBtn = document.getElementById("exportBtn");

const modalEl = document.getElementById("modal");
const modalTitleEl = document.getElementById("modalTitle");
const modalBodyEl = document.getElementById("modalBody");
const modalSaveBtn = document.getElementById("modalSave");

const menuToggle = document.getElementById("menuToggle");
const siteNav = document.getElementById("siteNav");

const DOW = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString(undefined, { month: "long" })
);

let filterMonth = "all";
let filterType = "all";
let filterStudent = "";
let pageSize = 10;
let currentPage = 1;

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const dowLabel = (iso) => parseISO(iso).toLocaleDateString(undefined, { weekday: "short" });
const dayMonth = (iso) => parseISO(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
const fullDate = (iso) =>
  parseISO(iso).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

/* ---------- State ---------- */

function normStudent(s) {
  return {
    id: s.id || uid(),
    name: s.name || "",
    code: /^\d{6}$/.test(s.code || "") ? s.code : "",
    notes: s.notes || "",
  };
}

function normGroup(g) {
  const weekdays = Array.isArray(g.weekdays) ? g.weekdays.filter((n) => n >= 0 && n <= 6) : [5];
  const specialDays = (g.specialDays || []).map((d) =>
    typeof d === "string" ? { date: d, title: "" } : { date: d.date, title: d.title || "" }
  );
  return {
    id: g.id || uid(),
    name: g.name || "Class 1",
    year: g.year || new Date().getFullYear(),
    weekdays,
    students: Array.isArray(g.students) ? g.students.map(normStudent) : [],
    specialDays,
    records: g.records || {},
  };
}

function migrate(saved) {
  if (Array.isArray(saved.groups) && saved.groups.length) {
    const groups = saved.groups.map(normGroup);
    const active = groups.some((g) => g.id === saved.activeGroup) ? saved.activeGroup : groups[0].id;
    return { activeGroup: active, groups };
  }

  const g = normGroup({
    name: "Class 1",
    year: saved.year,
    weekdays: saved.weekdays,
    students: saved.students,
    specialDays: saved.specialDays,
    records: saved.records,
  });
  return { activeGroup: g.id, groups: [g] };
}

function load() {
  try {
    const saved =
      window.MinaDB && window.MinaDB.get
        ? window.MinaDB.get(STORAGE_KEY)
        : JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") return migrate(saved);
  } catch (e) {
    /* ignore */
  }
  const g = normGroup({});
  return { activeGroup: g.id, groups: [g] };
}

/* ---------- Student codes (6 digits, unique across all classes) ---------- */

const CODE_RE = /^\d{6}$/;

function allCodes() {
  const set = new Set();
  state.groups.forEach((g) =>
    g.students.forEach((s) => {
      if (CODE_RE.test(s.code || "")) set.add(s.code);
    })
  );
  return set;
}

function makeCode(taken) {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (taken.has(code));
  taken.add(code);
  return code;
}

function ensureCodes() {
  const taken = allCodes();
  let changed = false;
  state.groups.forEach((g) =>
    g.students.forEach((s) => {
      if (!CODE_RE.test(s.code || "")) {
        s.code = makeCode(taken);
        changed = true;
      }
    })
  );
  return changed;
}

let state = load();

if (ensureCodes()) save();

const activeGroup = () => state.groups.find((g) => g.id === state.activeGroup) || state.groups[0];

function save() {
  try {
    if (window.MinaDB && window.MinaDB.set) {
      window.MinaDB.set(STORAGE_KEY, state);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (e) {
    /* ignore */
  }
}

/* ---------- Columns & filters ---------- */

function attendanceDates(g) {
  const out = [];
  for (let d = new Date(g.year, 0, 1); d.getFullYear() === g.year; d.setDate(d.getDate() + 1)) {
    if (g.weekdays.includes(d.getDay())) out.push(toISO(d));
  }
  return out;
}

const specialsForYear = (g) => g.specialDays.filter((s) => s.date.startsWith(`${g.year}-`));
const specialInfo = (g, iso) => specialsForYear(g).find((s) => s.date === iso) || null;

function allColumns(g) {
  const set = new Set(attendanceDates(g));
  specialsForYear(g).forEach((s) => set.add(s.date));
  return [...set].sort();
}

function visibleColumns(g) {
  let cols = allColumns(g);
  if (filterMonth !== "all") {
    const m = Number(filterMonth);
    cols = cols.filter((c) => parseISO(c).getMonth() === m);
  }
  if (filterType === "regular") cols = cols.filter((c) => !specialInfo(g, c));
  else if (filterType === "special") cols = cols.filter((c) => specialInfo(g, c));
  return cols;
}

function visibleStudents(g) {
  const q = filterStudent.trim().toLowerCase();
  if (!q) return g.students;
  return g.students.filter((s) => s.name.toLowerCase().includes(q) || (s.code || "").includes(q));
}

/* ---------- Modal ---------- */

let modalSubmit = null;

function openModal(title, fields, onSubmit) {
  modalTitleEl.textContent = title;
  modalBodyEl.innerHTML = "";

  const inputs = {};
  fields.forEach((f) => {
    const label = document.createElement("label");
    label.className = "modal-field";

    const span = document.createElement("span");
    span.textContent = f.label;

    let input;
    if (f.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 3;
    } else {
      input = document.createElement("input");
      input.type = f.type || "text";
    }
    input.value = f.value || "";
    if (f.placeholder) input.placeholder = f.placeholder;
    if (f.readonly) input.readOnly = true;
    input.dataset.key = f.key;

    label.append(span, input);
    modalBodyEl.appendChild(label);
    inputs[f.key] = input;
  });

  modalSubmit = () => {
    const values = {};
    Object.entries(inputs).forEach(([k, el]) => (values[k] = el.value.trim()));
    onSubmit(values);
  };

  modalEl.hidden = false;
  const first = modalBodyEl.querySelector("input, textarea");
  if (first) {
    first.focus();
    if (first.select) first.select();
  }
}

function closeModal() {
  modalEl.hidden = true;
  modalSubmit = null;
  modalBodyEl.innerHTML = "";
}

modalSaveBtn.addEventListener("click", () => modalSubmit && modalSubmit());
modalEl.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (modalEl.hidden) return;
  if (e.key === "Escape") closeModal();
  else if (e.key === "Enter" && e.target.tagName === "INPUT") {
    e.preventDefault();
    if (modalSubmit) modalSubmit();
  }
});

/* ---------- Mutations: records & students ---------- */

function cycle(studentId, iso) {
  if (!Auth.can("markAttendance")) return;
  const g = activeGroup();
  if (!g.records[studentId]) g.records[studentId] = {};
  const current = g.records[studentId][iso];
  const next = current === undefined ? "present" : current === "present" ? "absent" : undefined;

  if (next === undefined) delete g.records[studentId][iso];
  else g.records[studentId][iso] = next;

  save();
  render();
}

function addStudent() {
  if (!Auth.can("addStudent")) return;
  const name = studentInput.value.trim();
  if (!name) return;
  const g = activeGroup();
  g.students.push({
    id: uid(),
    name,
    code: makeCode(allCodes()),
    notes: "",
  });
  studentInput.value = "";
  studentInput.focus();
  save();
  render();
}

function removeStudent(id) {
  if (!Auth.can("deleteStudent")) return;
  const g = activeGroup();
  const s = g.students.find((x) => x.id === id);
  if (s && !confirm(`Remove "${s.name}"?`)) return;
  g.students = g.students.filter((x) => x.id !== id);
  delete g.records[id];
  save();
  render();
}

function editStudent(id) {
  if (!Auth.can("editStudent")) return;
  const g = activeGroup();
  const s = g.students.find((x) => x.id === id);
  if (!s) return;
  openModal(
    "Edit student",
    [
      { key: "name", label: "Name", value: s.name },
      { key: "code", label: "Code (auto-generated)", value: s.code, readonly: true },
      { key: "notes", label: "Notes", value: s.notes, type: "textarea", placeholder: "optional" },
    ],
    (v) => {
      s.name = v.name || s.name;
      s.notes = v.notes;
      save();
      closeModal();
      render();
    }
  );
}

function toggleWeekday(value) {
  if (!Auth.can("manageDays")) return;
  const g = activeGroup();
  if (g.weekdays.includes(value)) {
    g.weekdays = g.weekdays.filter((v) => v !== value);
  } else {
    g.weekdays = [...g.weekdays, value].sort((a, b) => a - b);
  }
  save();
  render();
}

function addSpecialDay() {
  if (!Auth.can("manageDays")) return;
  const g = activeGroup();
  const value = specialDayInput.value;
  if (!value) return;

  const year = Number(value.slice(0, 4));
  if (year !== g.year) g.year = year;

  const title = specialTitleInput.value.trim();
  const existing = g.specialDays.find((s) => s.date === value);
  if (existing) existing.title = title;
  else g.specialDays.push({ date: value, title });

  specialDayInput.value = "";
  specialTitleInput.value = "";
  save();
  render();
}

function removeSpecialDay(iso) {
  if (!Auth.can("manageDays")) return;
  const g = activeGroup();
  g.specialDays = g.specialDays.filter((s) => s.date !== iso);
  save();
  render();
}

/* ---------- Today & export ---------- */

function goToToday() {
  const g = activeGroup();
  const now = new Date();
  const today = toISO(now);

  if (now.getFullYear() !== g.year && g.weekdays.includes(now.getDay())) {
    g.year = now.getFullYear();
    save();
  }

  if (!visibleColumns(g).includes(today) && allColumns(g).includes(today)) {
    filterMonth = "all";
    filterType = "all";
    filterMonthEl.value = "all";
    syncFilterType();
    currentPage = 1;
  }

  render();

  const th = tableWrap.querySelector(`th[data-date="${today}"]`);
  if (!th) {
    attHint.hidden = false;
    attHint.textContent = `Today (${fullDate(today)}) is not an attendance day in "${g.name}". Pick its weekday or add it as a special day.`;
    return;
  }

  th.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  tableWrap.querySelectorAll(".flash").forEach((el) => el.classList.remove("flash"));
  tableWrap
    .querySelectorAll(`th[data-date="${today}"], .cell[data-date="${today}"]`)
    .forEach((el) => {
      void el.offsetWidth;
      el.classList.add("flash");
    });
}

function csvEscape(value) {
  const s = String(value == null ? "" : value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  if (!Auth.can("useFilters")) return;
  const g = activeGroup();
  const cols = visibleColumns(g);
  const students = visibleStudents(g);

  if (!students.length || !cols.length) {
    attHint.hidden = false;
    attHint.textContent = "Nothing to export yet — add students and attendance days first.";
    return;
  }

  const header = [
    "Student",
    "Code",
    "Notes",
    ...cols.map((c) => {
      const info = specialInfo(g, c);
      return info && info.title ? `${fullDate(c)} - ${info.title}` : fullDate(c);
    }),
    "Present",
    "Absent",
  ];

  const rows = [header.map(csvEscape).join(",")];

  students.forEach((s) => {
    let present = 0;
    let absent = 0;
    const cells = cols.map((iso) => {
      const r = (g.records[s.id] || {})[iso];
      if (r === "present") {
        present += 1;
        return "P";
      }
      if (r === "absent") {
        absent += 1;
        return "A";
      }
      return "";
    });
    rows.push([s.name, s.code || "", s.notes || "", ...cells, present, absent].map(csvEscape).join(","));
  });

  const csv = "\uFEFF" + rows.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${(g.name || "class").replace(/[^\w-]+/g, "_")}-${g.year}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Rendering ---------- */

function buildWeekdays() {
  DOW.forEach(({ value, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.dow = String(value);
    btn.textContent = label;
    btn.addEventListener("click", () => toggleWeekday(value));
    weekdaysEl.appendChild(btn);
  });
}

function syncWeekdays(g) {
  weekdaysEl.querySelectorAll("button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(g.weekdays.includes(Number(btn.dataset.dow))));
  });
}

function buildMonths() {
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "All months";
  filterMonthEl.appendChild(all);

  MONTHS.forEach((name, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = name;
    filterMonthEl.appendChild(opt);
  });
}

function renderGroupSelect(g) {
  groupSelectEl.innerHTML = "";
  state.groups.forEach((grp) => {
    const opt = document.createElement("option");
    opt.value = grp.id;
    opt.textContent = grp.name;
    groupSelectEl.appendChild(opt);
  });
  groupSelectEl.value = g.id;
}

function renderChips(g) {
  dayChips.innerHTML = "";
  specialsForYear(g)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(({ date, title }) => {
      const chip = document.createElement("span");
      chip.className = "chip";

      const text = document.createElement("span");
      text.textContent = title ? `${title} · ${fullDate(date)}` : fullDate(date);
      if (title) chip.title = `${title} — ${fullDate(date)}`;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip-x";
      remove.textContent = "\u00d7";
      remove.setAttribute("aria-label", `Remove special day ${date}`);
      remove.addEventListener("click", () => removeSpecialDay(date));
      remove.hidden = !Auth.can("manageDays");

      chip.append(text, remove);
      dayChips.appendChild(chip);
    });
}

function renderTable(g, cols, students) {
  const today = toISO(new Date());
  const table = document.createElement("table");
  table.className = "att-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  const nameTh = document.createElement("th");
  nameTh.className = "name-col";
  nameTh.textContent = "Student";
  headRow.appendChild(nameTh);

  cols.forEach((iso) => {
    const info = specialInfo(g, iso);
    const th = document.createElement("th");
    if (info) th.classList.add("special");
    if (iso === today) th.classList.add("is-today");
    th.dataset.date = iso;

    const dow = document.createElement("span");
    dow.className = "dow";
    dow.textContent = dowLabel(iso);

    const dm = document.createElement("span");
    dm.className = "dm";
    dm.textContent = dayMonth(iso);

    th.append(dow, dm);

    if (info && info.title) {
      const ttl = document.createElement("span");
      ttl.className = "ttl";
      ttl.textContent = info.title;
      ttl.title = info.title;
      th.appendChild(ttl);
    }

    th.title = fullDate(iso) + (info && info.title ? ` — ${info.title}` : "");
    headRow.appendChild(th);
  });

  const sumTh = document.createElement("th");
  sumTh.className = "sum-col";
  sumTh.textContent = "P / A";
  headRow.appendChild(sumTh);

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  students.forEach((student) => {
    const row = document.createElement("tr");

    const nameTd = document.createElement("td");
    nameTd.className = "name-col";

    const cell = document.createElement("div");
    cell.className = "name-cell";

    const info = document.createElement("div");
    info.className = "student-info";

    const nameSpan = document.createElement("span");
    nameSpan.className = "student-name";
    nameSpan.textContent = student.name;
    info.appendChild(nameSpan);

    const meta = document.createElement("span");
    meta.className = "student-meta";

    const code = document.createElement("span");
    code.className = "student-code";
    code.textContent = student.code;
    code.title = `Code ${student.code}`;
    meta.appendChild(code);

    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "student-actions";

    const canEdit = Auth.can("editStudent");
    const canDelete = Auth.can("deleteStudent");

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "icon-btn edit-student";
    edit.textContent = "\u270e";
    edit.title = "Edit";
    edit.setAttribute("aria-label", `Edit ${student.name}`);
    edit.addEventListener("click", () => editStudent(student.id));
    edit.hidden = !canEdit;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn del-student";
    del.textContent = "\u00d7";
    del.title = "Remove";
    del.setAttribute("aria-label", `Remove ${student.name}`);
    del.addEventListener("click", () => removeStudent(student.id));
    del.hidden = !canDelete;

    actions.hidden = !canEdit && !canDelete;
    actions.append(edit, del);
    cell.append(info, actions);
    nameTd.appendChild(cell);
    row.appendChild(nameTd);

    let present = 0;
    let absent = 0;

    cols.forEach((iso) => {
      const record = (g.records[student.id] || {})[iso];
      if (record === "present") present += 1;
      else if (record === "absent") absent += 1;

      const td = document.createElement("td");
      td.className = "cell";
      td.dataset.date = iso;
      if (iso === today) td.classList.add("is-today");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mark" + (record ? ` ${record}` : "");
      btn.dataset.student = student.id;
      btn.dataset.date = iso;
      btn.textContent = record === "present" ? "\u2713" : record === "absent" ? "\u2717" : "";
      btn.setAttribute(
        "aria-label",
        `${student.name} on ${iso}: ${record || "not marked"}. Click to change.`
      );

      td.appendChild(btn);
      row.appendChild(td);
    });

    const sumTd = document.createElement("td");
    sumTd.className = "sum-col";
    const p = document.createElement("span");
    p.className = "p";
    p.textContent = present;
    const a = document.createElement("span");
    a.className = "a";
    a.textContent = absent;
    sumTd.append(p, document.createTextNode(" / "), a);
    row.appendChild(sumTd);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);

  tableWrap.innerHTML = "";
  tableWrap.appendChild(table);
}

function render() {
  const g = activeGroup();

  renderGroupSelect(g);
  yearInput.value = g.year;
  syncWeekdays(g);
  renderChips(g);

  const cols = visibleColumns(g);
  const students = visibleStudents(g);

  if (!g.students.length || !students.length) {
    tableWrap.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = g.students.length
      ? "No students match your search."
      : "No students yet. Add one above to start taking attendance.";
    attHint.hidden = true;
    paginationEl.hidden = true;
    return;
  }

  emptyState.hidden = true;

  if (!cols.length) {
    tableWrap.innerHTML = "";
    attHint.hidden = false;
    attHint.textContent = allColumns(g).length
      ? "No dates match this filter. Try \u201cAll months\u201d or a different month."
      : "No attendance days selected. Pick the weekdays above or add a special day to show date columns.";
    paginationEl.hidden = true;
    return;
  }

  attHint.hidden = true;

  const totalPages = Math.max(1, Math.ceil(students.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * pageSize;
  const pageStudents = students.slice(start, start + pageSize);

  renderTable(g, cols, pageStudents);
  renderPagination(students.length, totalPages);
}

function renderPagination(total, totalPages) {
  if (!total) {
    paginationEl.hidden = true;
    return;
  }

  paginationEl.hidden = false;
  pageInfoEl.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

/* ---------- Events ---------- */

tableWrap.addEventListener("click", (e) => {
  const btn = e.target.closest(".mark");
  if (btn) cycle(btn.dataset.student, btn.dataset.date);
});

addStudentBtn.addEventListener("click", addStudent);
studentInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addStudent();
  }
});

addDayBtn.addEventListener("click", addSpecialDay);
specialTitleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addSpecialDay();
  }
});

yearInput.addEventListener("change", () => {
  const year = parseInt(yearInput.value, 10);
  const g = activeGroup();
  if (year >= 2000 && year <= 2100) {
    g.year = year;
    save();
    render();
  } else {
    yearInput.value = g.year;
  }
});

groupSelectEl.addEventListener("change", () => {
  state.activeGroup = groupSelectEl.value;
  currentPage = 1;
  save();
  render();
});

todayBtn.addEventListener("click", goToToday);
exportBtn.addEventListener("click", exportCsv);

filterMonthEl.addEventListener("change", () => {
  filterMonth = filterMonthEl.value;
  currentPage = 1;
  render();
});

function syncFilterType() {
  filterTypeGroupEl.querySelectorAll(".seg").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.type === filterType);
  });
}

filterTypeGroupEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".seg");
  if (!btn || btn.dataset.type === filterType) return;
  filterType = btn.dataset.type;
  currentPage = 1;
  syncFilterType();
  render();
});

filterStudentEl.addEventListener("input", () => {
  filterStudent = filterStudentEl.value;
  currentPage = 1;
  render();
});

prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage -= 1;
    render();
  }
});

nextPageBtn.addEventListener("click", () => {
  currentPage += 1;
  render();
});

pageSizeEl.addEventListener("change", () => {
  pageSize = Number(pageSizeEl.value) || 10;
  currentPage = 1;
  render();
});

/* ---------- Init ---------- */

buildWeekdays();
buildMonths();

filterMonth = "all";
filterType = "all";
filterStudent = "";
filterMonthEl.value = "all";
syncFilterType();
filterStudentEl.value = "";
pageSize = 10;
pageSizeEl.value = "10";
currentPage = 1;

render();

/* Reflect remote changes (Firestore) from other tabs/pages. */
if (window.MinaDB && window.MinaDB.ready) {
  window.MinaDB.ready().then(() => {
    const loaded = load();
    state = loaded;
    if (ensureCodes()) save();
    render();
  });
  if (window.MinaDB.onChange) {
    window.MinaDB.onChange(STORAGE_KEY, (value) => {
      if (!value || typeof value !== "object") return;
      if (JSON.stringify(value) === JSON.stringify(state)) return;
      state = migrate(value);
      if (ensureCodes()) save();
      render();
    });
  }
}
