const STORAGE_KEY = "mina.attendance";

const yearInput = document.getElementById("attYear");
const studentInput = document.getElementById("studentName");
const addStudentBtn = document.getElementById("addStudent");
const weekdaysEl = document.getElementById("weekdays");
const specialDayInput = document.getElementById("specialDay");
const specialTitleInput = document.getElementById("specialTitle");
const addDayBtn = document.getElementById("addDay");
const filterMonthEl = document.getElementById("filterMonth");
const filterTypeEl = document.getElementById("filterType");
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

const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");

menuToggle.addEventListener("click", () => navLinks.classList.toggle("open"));

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

function migrate(saved) {
  const weekdays = Array.isArray(saved.weekdays)
    ? saved.weekdays.filter((n) => n >= 0 && n <= 6)
    : [5];

  const specialDays = (saved.specialDays || []).map((d) =>
    typeof d === "string" ? { date: d, title: "" } : { date: d.date, title: d.title || "" }
  );

  return {
    year: saved.year || new Date().getFullYear(),
    weekdays,
    students: Array.isArray(saved.students) ? saved.students : [],
    specialDays,
    records: saved.records || {},
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") return migrate(saved);
  } catch (e) {
    /* ignore */
  }
  return { year: new Date().getFullYear(), weekdays: [5], students: [], specialDays: [], records: {} };
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* ignore */
  }
}

/* ---------- Columns & filters ---------- */

function attendanceDates(year) {
  const out = [];
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    if (state.weekdays.includes(d.getDay())) out.push(toISO(d));
  }
  return out;
}

const specialsForYear = () => state.specialDays.filter((s) => s.date.startsWith(`${state.year}-`));
const specialInfo = (iso) => specialsForYear().find((s) => s.date === iso) || null;

function allColumns() {
  const set = new Set(attendanceDates(state.year));
  specialsForYear().forEach((s) => set.add(s.date));
  return [...set].sort();
}

function visibleColumns() {
  let cols = allColumns();
  if (filterMonth !== "all") {
    const m = Number(filterMonth);
    cols = cols.filter((c) => parseISO(c).getMonth() === m);
  }
  if (filterType === "regular") cols = cols.filter((c) => !specialInfo(c));
  else if (filterType === "special") cols = cols.filter((c) => specialInfo(c));
  return cols;
}

function visibleStudents() {
  const q = filterStudent.trim().toLowerCase();
  return q ? state.students.filter((s) => s.name.toLowerCase().includes(q)) : state.students;
}

/* ---------- Mutations ---------- */

function cycle(studentId, iso) {
  if (!state.records[studentId]) state.records[studentId] = {};
  const current = state.records[studentId][iso];
  const next = current === undefined ? "present" : current === "present" ? "absent" : undefined;

  if (next === undefined) delete state.records[studentId][iso];
  else state.records[studentId][iso] = next;

  save();
  render();
}

function addStudent() {
  const name = studentInput.value.trim();
  if (!name) return;
  state.students.push({ id: uid(), name });
  studentInput.value = "";
  studentInput.focus();
  save();
  render();
}

function removeStudent(id) {
  state.students = state.students.filter((s) => s.id !== id);
  delete state.records[id];
  save();
  render();
}

function toggleWeekday(value) {
  if (state.weekdays.includes(value)) {
    state.weekdays = state.weekdays.filter((v) => v !== value);
  } else {
    state.weekdays = [...state.weekdays, value].sort((a, b) => a - b);
  }
  save();
  render();
}

function addSpecialDay() {
  const value = specialDayInput.value;
  if (!value) return;

  const year = Number(value.slice(0, 4));
  if (year !== state.year) {
    state.year = year;
    yearInput.value = year;
  }

  const title = specialTitleInput.value.trim();
  const existing = state.specialDays.find((s) => s.date === value);
  if (existing) existing.title = title;
  else state.specialDays.push({ date: value, title });

  specialDayInput.value = "";
  specialTitleInput.value = "";
  save();
  render();
}

function removeSpecialDay(iso) {
  state.specialDays = state.specialDays.filter((s) => s.date !== iso);
  save();
  render();
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

function syncWeekdays() {
  weekdaysEl.querySelectorAll("button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(state.weekdays.includes(Number(btn.dataset.dow))));
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

function renderChips() {
  dayChips.innerHTML = "";
  specialsForYear()
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

      chip.append(text, remove);
      dayChips.appendChild(chip);
    });
}

function renderTable(cols, students) {
  const table = document.createElement("table");
  table.className = "att-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  const nameTh = document.createElement("th");
  nameTh.className = "name-col";
  nameTh.textContent = "Student";
  headRow.appendChild(nameTh);

  cols.forEach((iso) => {
    const info = specialInfo(iso);
    const th = document.createElement("th");
    if (info) th.classList.add("special");

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
    const nameSpan = document.createElement("span");
    nameSpan.textContent = student.name;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del-student";
    del.textContent = "\u00d7";
    del.setAttribute("aria-label", `Remove ${student.name}`);
    del.addEventListener("click", () => removeStudent(student.id));

    nameTd.append(nameSpan, del);
    row.appendChild(nameTd);

    let present = 0;
    let absent = 0;

    cols.forEach((iso) => {
      const record = (state.records[student.id] || {})[iso];
      if (record === "present") present += 1;
      else if (record === "absent") absent += 1;

      const td = document.createElement("td");
      td.className = "cell";

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
  yearInput.value = state.year;
  syncWeekdays();
  renderChips();

  const cols = visibleColumns();
  const students = visibleStudents();

  if (!state.students.length || !students.length) {
    tableWrap.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = state.students.length
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
    attHint.textContent = allColumns().length
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

  renderTable(cols, pageStudents);
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
  if (year >= 2000 && year <= 2100) {
    state.year = year;
    save();
    render();
  } else {
    yearInput.value = state.year;
  }
});

filterMonthEl.addEventListener("change", () => {
  filterMonth = filterMonthEl.value;
  currentPage = 1;
  render();
});

filterTypeEl.addEventListener("change", () => {
  filterType = filterTypeEl.value;
  currentPage = 1;
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

state.weekdays = [];

buildWeekdays();
buildMonths();

filterMonth = "all";
filterType = "all";
filterStudent = "";
filterMonthEl.value = "all";
filterTypeEl.value = "all";
filterStudentEl.value = "";
pageSize = 10;
pageSizeEl.value = "10";
currentPage = 1;

render();
