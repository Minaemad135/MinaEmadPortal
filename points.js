/* ---------- Points board: live class roster from attendance ---------- */

(function () {
  const ATT_KEY = "mina.attendance";
  const POINTS_KEY = "mina.points";
  const Auth = window.MinaAuth || { can: () => true };

  const groupSelect = document.getElementById("pointsGroup");
  const refreshBtn = document.getElementById("pointsRefresh");
  const statsEl = document.getElementById("pointsStats");
  const listEl = document.getElementById("pointsList");
  const boardEl = document.getElementById("pointsBoard");
  const emptyEl = document.getElementById("pointsEmpty");
  const countEl = document.getElementById("pointsCount");
  const boardMetaEl = document.getElementById("pointsBoardMeta");
  const statusEl = document.getElementById("pointsStatus");

  const tabButtons = Array.from(document.querySelectorAll("[data-points-tab]"));
  const tabPanels = {
    roster: document.getElementById("pointsTabRoster"),
    analysis: document.getElementById("pointsTabAnalysis"),
  };
  const analysisGroupSelect = document.getElementById("analysisGroup");
  const analysisScopeEl = document.getElementById("analysisScope");
  const analysisStatsEl = document.getElementById("analysisStats");
  const analysisGroupBody = document.getElementById("analysisGroupBody");
  const analysisDistributionEl = document.getElementById("analysisDistribution");
  const analysisTopEl = document.getElementById("analysisTop");
  const analysisLeaderBody = document.getElementById("analysisLeaderBody");

  if (!groupSelect || !listEl) return;

  let attendance = loadAttendance();
  let scores = loadScores();
  let selectedGroupId = "";
  let analysisGroupId = "all";

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const averageText = (value) => (value % 1 ? value.toFixed(1) : String(Math.round(value)));

  function studentInitials(name) {
    const words = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return "?";
    return words
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();
  }

  function normStudent(raw, index) {
    const s = raw && typeof raw === "object" ? raw : {};
    return {
      id: s.id || `legacy-${index}`,
      name: s.name || `Student ${index + 1}`,
      code: s.code || "",
      notes: s.notes || "",
    };
  }

  function normGroup(raw) {
    const g = raw && typeof raw === "object" ? raw : {};
    return {
      id: g.id || uid(),
      name: g.name || "Class 1",
      students: Array.isArray(g.students) ? g.students.map(normStudent) : [],
      records: g.records && typeof g.records === "object" ? g.records : {},
    };
  }

  function loadAttendance() {
    try {
      const raw = JSON.parse(localStorage.getItem(ATT_KEY));
      if (raw && typeof raw === "object") {
        if (Array.isArray(raw.groups) && raw.groups.length) {
          const groups = raw.groups.map(normGroup);
          const activeGroup = groups.some((g) => g.id === raw.activeGroup)
            ? raw.activeGroup
            : groups[0].id;
          return { groups, activeGroup };
        }
        if (Array.isArray(raw.students)) {
          const group = normGroup(raw);
          return { groups: [group], activeGroup: group.id };
        }
      }
    } catch (e) {
      /* ignore corrupt storage */
    }
    return { groups: [], activeGroup: "" };
  }

  function loadScores() {
    try {
      const raw = JSON.parse(localStorage.getItem(POINTS_KEY));
      return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch (e) {
      return {};
    }
  }

  function saveScores() {
    try {
      localStorage.setItem(POINTS_KEY, JSON.stringify(scores));
      return true;
    } catch (e) {
      return false;
    }
  }

  function currentGroup() {
    return attendance.groups.find((g) => g.id === selectedGroupId) || null;
  }

  function scoreFor(groupId, studentId) {
    const group = scores[groupId];
    if (!group || !Object.prototype.hasOwnProperty.call(group, studentId)) return 0;
    const value = Number(group[studentId]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function setScore(groupId, studentId, value) {
    const safe = Math.max(0, Math.floor(Number(value) || 0));
    if (!scores[groupId] || typeof scores[groupId] !== "object") scores[groupId] = {};
    scores[groupId][studentId] = safe;
    return saveScores();
  }

  function canAward() {
    return typeof Auth.can !== "function" || Auth.can("markAttendance");
  }

  function renderGroupSelect() {
    groupSelect.innerHTML = "";
    if (!attendance.groups.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No classes available";
      groupSelect.appendChild(option);
      groupSelect.disabled = true;
      selectedGroupId = "";
      return;
    }

    groupSelect.disabled = false;
    attendance.groups.forEach((group) => {
      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = group.name;
      groupSelect.appendChild(option);
    });

    if (!attendance.groups.some((g) => g.id === selectedGroupId)) {
      selectedGroupId = attendance.groups.some((g) => g.id === attendance.activeGroup)
        ? attendance.activeGroup
        : attendance.groups[0].id;
    }
    groupSelect.value = selectedGroupId;
  }

  function statCard(label, value, note, accent) {
    const card = document.createElement("div");
    card.className = "points-stat";

    const labelEl = document.createElement("span");
    labelEl.className = "points-stat-label";
    labelEl.textContent = label;

    const valueEl = document.createElement("span");
    valueEl.className = "points-stat-value" + (accent ? " is-accent" : "");
    valueEl.textContent = value;

    const noteEl = document.createElement("span");
    noteEl.className = "points-stat-note";
    noteEl.textContent = note;
    noteEl.title = note;

    card.append(labelEl, valueEl, noteEl);
    return card;
  }

  function renderStats(students) {
    const group = currentGroup();
    const total = students.reduce(
      (sum, student) => sum + scoreFor(selectedGroupId, student.id),
      0
    );
    const average = students.length ? total / students.length : 0;
    let leader = null;
    let topScore = 0;

    students.forEach((student) => {
      const score = scoreFor(selectedGroupId, student.id);
      if (!leader || score > topScore) {
        leader = student;
        topScore = score;
      }
    });

    statsEl.innerHTML = "";
    statsEl.append(
      statCard("Students", String(students.length), group ? group.name : "No class selected", false),
      statCard("Total points", String(total), "Across this class", true),
      statCard(
        "Average",
        students.length ? average.toFixed(average % 1 ? 1 : 0) : "0",
        "Points per student",
        false
      ),
      statCard(
        "Top score",
        String(leader ? topScore : 0),
        leader ? leader.name : "No leader yet",
        false
      )
    );
  }

  /* ---------- Analysis: all classes or one filtered group ---------- */

  function renderAnalysisGroupSelect() {
    if (!analysisGroupSelect) return;

    analysisGroupSelect.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All students";
    analysisGroupSelect.appendChild(allOption);

    attendance.groups.forEach((group) => {
      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = group.name;
      analysisGroupSelect.appendChild(option);
    });

    if (
      analysisGroupId !== "all" &&
      !attendance.groups.some((group) => group.id === analysisGroupId)
    ) {
      analysisGroupId = "all";
    }
    analysisGroupSelect.value = analysisGroupId;
  }

  function analysisSelection() {
    const groups =
      analysisGroupId === "all"
        ? attendance.groups
        : attendance.groups.filter((group) => group.id === analysisGroupId);

    const entries = [];
    groups.forEach((group) => {
      group.students.forEach((student) => {
        entries.push({
          group,
          student,
          score: scoreFor(group.id, student.id),
        });
      });
    });

    return { groups, entries };
  }

  function tableCell(text, className) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = text;
    return cell;
  }

  function emptyTableRow(body, columns, message) {
    body.innerHTML = "";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = columns;
    cell.className = "analysis-empty-cell";
    cell.textContent = message;
    row.appendChild(cell);
    body.appendChild(row);
  }

  function renderAnalysisStats(groups, entries) {
    if (!analysisStatsEl) return;

    const total = entries.reduce((sum, entry) => sum + entry.score, 0);
    const withPoints = entries.filter((entry) => entry.score > 0).length;
    const participation = entries.length ? Math.round((withPoints / entries.length) * 100) : 0;

    analysisStatsEl.innerHTML = "";
    analysisStatsEl.append(
      statCard(
        "Students",
        String(entries.length),
        analysisGroupId === "all" ? "All classes" : "Selected class",
        false
      ),
      statCard(
        "Classes",
        String(groups.length),
        analysisGroupId === "all" ? "In the analysis" : "Current filter",
        false
      ),
      statCard("With points", String(withPoints), `${participation}% of students`, false),
      statCard("Total points", String(total), "Across the selection", true),
      statCard(
        "Average",
        entries.length ? averageText(total / entries.length) : "0",
        "Points per student",
        false
      )
    );
  }

  function renderClassBreakdown(groups) {
    if (!analysisGroupBody) return;

    if (!groups.length) {
      emptyTableRow(analysisGroupBody, 5, "No classes available to analyse yet.");
      return;
    }

    const rows = groups.map((group) => {
      const items = group.students.map((student) => ({
        student,
        score: scoreFor(group.id, student.id),
      }));
      const total = items.reduce((sum, item) => sum + item.score, 0);
      const top = items
        .slice()
        .sort(
          (a, b) =>
            b.score - a.score || a.student.name.localeCompare(b.student.name)
        )[0];
      return {
        group,
        count: items.length,
        total,
        average: items.length ? total / items.length : 0,
        top,
      };
    });

    rows.sort((a, b) => b.total - a.total || a.group.name.localeCompare(b.group.name));

    analysisGroupBody.innerHTML = "";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.append(
        tableCell(row.group.name, "analysis-class-name"),
        tableCell(String(row.count)),
        tableCell(String(row.total), "analysis-strong"),
        tableCell(averageText(row.average)),
        tableCell(
          row.top ? `${row.top.student.name} · ${row.top.score} pts` : "—",
          "analysis-top-cell"
        )
      );
      analysisGroupBody.appendChild(tr);
    });
  }

  function renderDistribution(entries) {
    if (!analysisDistributionEl) return;

    analysisDistributionEl.innerHTML = "";
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "analysis-empty";
      empty.textContent = "No students in this selection.";
      analysisDistributionEl.appendChild(empty);
      return;
    }

    const tiers = [
      { label: "0 pts", test: (score) => score === 0 },
      { label: "1–4 pts", test: (score) => score >= 1 && score <= 4 },
      { label: "5–9 pts", test: (score) => score >= 5 && score <= 9 },
      { label: "10–19 pts", test: (score) => score >= 10 && score <= 19 },
      { label: "20+ pts", test: (score) => score >= 20 },
    ];

    const counts = tiers.map(
      (tier) => entries.filter((entry) => tier.test(entry.score)).length
    );
    const max = Math.max(1, ...counts);

    tiers.forEach((tier, index) => {
      const count = counts[index];
      const row = document.createElement("div");
      row.className = "distribution-row";

      const label = document.createElement("span");
      label.className = "distribution-label";
      label.textContent = tier.label;

      const track = document.createElement("span");
      track.className = "distribution-track";
      const fill = document.createElement("span");
      fill.className = "distribution-fill";
      fill.style.width = `${count ? Math.max(5, (count / max) * 100) : 0}%`;
      track.appendChild(fill);

      const value = document.createElement("span");
      value.className = "distribution-count";
      value.textContent = String(count);

      row.append(label, track, value);
      analysisDistributionEl.appendChild(row);
    });
  }

  function renderTopPerformers(entries) {
    if (!analysisTopEl) return;

    analysisTopEl.innerHTML = "";

    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "analysis-empty";
      empty.textContent = "No students in this selection.";
      analysisTopEl.appendChild(empty);
      return;
    }

    if (!entries.some((entry) => entry.score > 0)) {
      const empty = document.createElement("p");
      empty.className = "analysis-empty";
      empty.textContent = "Award points to build the top performers list.";
      analysisTopEl.appendChild(empty);
      return;
    }

    const top = entries
      .slice()
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.student.name.localeCompare(b.student.name) ||
          a.group.name.localeCompare(b.group.name)
      )
      .slice(0, 3);

    top.forEach((entry, index) => {
      const item = document.createElement("li");
      item.className = "top-performer";

      const rank = document.createElement("span");
      rank.className = "top-rank";
      rank.textContent = String(index + 1);

      const info = document.createElement("div");
      info.className = "top-info";
      const name = document.createElement("span");
      name.className = "top-name";
      name.textContent = entry.student.name;
      const group = document.createElement("span");
      group.className = "top-group";
      group.textContent = entry.group.name;
      info.append(name, group);

      const score = document.createElement("span");
      score.className = "top-score";
      score.textContent = `${entry.score} pts`;

      item.append(rank, info, score);
      analysisTopEl.appendChild(item);
    });
  }

  function renderLeaderboard(entries) {
    if (!analysisLeaderBody) return;

    if (!entries.length) {
      emptyTableRow(analysisLeaderBody, 5, "No students in this selection.");
      return;
    }

    const ranked = entries
      .slice()
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.student.name.localeCompare(b.student.name) ||
          a.group.name.localeCompare(b.group.name)
      );

    analysisLeaderBody.innerHTML = "";
    ranked.forEach((entry, index) => {
      const tr = document.createElement("tr");

      const rankCell = document.createElement("td");
      const rank = document.createElement("span");
      rank.className = "analysis-rank" + (index < 3 ? " analysis-rank--top" : "");
      rank.textContent = String(index + 1);
      rankCell.appendChild(rank);

      tr.append(
        rankCell,
        tableCell(entry.student.name, "analysis-student-name"),
        tableCell(entry.group.name),
        tableCell(entry.student.code || "—"),
        tableCell(`${entry.score} pts`, "analysis-points")
      );
      analysisLeaderBody.appendChild(tr);
    });
  }

  function renderAnalysis() {
    if (!analysisGroupSelect) return;

    const { groups, entries } = analysisSelection();

    analysisScopeEl.textContent = !groups.length
      ? "No classes available"
      : analysisGroupId === "all"
        ? `${groups.length} class${groups.length === 1 ? "" : "es"} · ${entries.length} student${
            entries.length === 1 ? "" : "s"
          }`
        : `${groups[0].name} · ${entries.length} student${entries.length === 1 ? "" : "s"}`;

    renderAnalysisStats(groups, entries);
    renderClassBreakdown(groups);
    renderDistribution(entries);
    renderTopPerformers(entries);
    renderLeaderboard(entries);
  }

  function makeButton(action, label, symbol, disabled, studentName) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `points-btn points-btn--${action === "inc" ? "plus" : "minus"}`;
    button.dataset.action = action;
    button.textContent = symbol;
    button.disabled = disabled;
    button.setAttribute("aria-label", label);
    button.title = disabled && action === "dec" ? "Points cannot go below 0" : label;
    button.dataset.studentName = studentName;
    return button;
  }

  function updateRow(row, score, student) {
    const valueEl = row.querySelector(".points-value");
    if (valueEl) {
      valueEl.textContent = String(score);
      valueEl.classList.remove("is-bump");
      void valueEl.offsetWidth;
      valueEl.classList.add("is-bump");
      window.setTimeout(() => valueEl.classList.remove("is-bump"), 320);
    }

    const minus = row.querySelector('[data-action="dec"]');
    if (minus) {
      minus.disabled = !canAward() || score <= 0;
      minus.title = score <= 0 ? "Points cannot go below 0" : `Remove one point from ${student.name}`;
    }
  }

  function renderList(students) {
    listEl.innerHTML = "";
    const awardable = canAward();

    students.forEach((student) => {
      const score = scoreFor(selectedGroupId, student.id);

      const row = document.createElement("article");
      row.className = "points-row";
      row.dataset.studentId = student.id;

      const person = document.createElement("div");
      person.className = "points-person";

      const avatar = document.createElement("span");
      avatar.className = "points-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = studentInitials(student.name);

      const personText = document.createElement("div");
      personText.className = "points-person-text";

      const name = document.createElement("div");
      name.className = "points-name";
      name.textContent = student.name;
      name.title = student.name;

      const meta = document.createElement("div");
      meta.className = "points-meta";
      meta.textContent = student.code ? `Code ${student.code}` : "No student code";

      personText.append(name, meta);
      person.append(avatar, personText);

      const scoreBox = document.createElement("div");
      scoreBox.className = "points-score";
      const scoreValue = document.createElement("span");
      scoreValue.className = "points-value";
      scoreValue.textContent = String(score);
      const scoreUnit = document.createElement("span");
      scoreUnit.className = "points-unit";
      scoreUnit.textContent = "pts";
      scoreBox.append(scoreValue, scoreUnit);

      const controls = document.createElement("div");
      controls.className = "points-controls";

      const minus = makeButton(
        "dec",
        `Remove one point from ${student.name}`,
        "\u2212",
        !awardable || score <= 0,
        student.name
      );
      if (score <= 0) minus.title = "Points cannot go below 0";

      const plus = makeButton(
        "inc",
        `Add one point to ${student.name}`,
        "+",
        !awardable,
        student.name
      );
      if (!awardable) plus.title = "You do not have permission to change points";

      controls.append(minus, plus);
      row.append(person, scoreBox, controls);
      listEl.appendChild(row);
    });
  }

  function showStatus(message) {
    statusEl.textContent = message;
    window.clearTimeout(showStatus.timer);
    showStatus.timer = window.setTimeout(() => (statusEl.textContent = ""), 2400);
  }

  function setTab(name) {
    tabButtons.forEach((button) => {
      const active = button.dataset.pointsTab === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    Object.keys(tabPanels).forEach((key) => {
      const panel = tabPanels[key];
      if (panel) panel.hidden = key !== name;
    });

    if (name === "analysis") renderAnalysis();
  }

  function render() {
    const group = currentGroup();
    const students = group ? group.students : [];
    const awardable = canAward();

    renderStats(students);
    renderList(students);
    countEl.textContent = `${students.length} student${students.length === 1 ? "" : "s"}`;

    boardMetaEl.textContent = group
      ? `All students in ${group.name}`
      : "Choose a class to see its roster";

    boardEl.hidden = !students.length;
    emptyEl.hidden = !!students.length;

    if (!awardable && students.length) {
      showStatus("You can view points, but your role cannot change them.");
    }
  }

  function bootstrap(message) {
    attendance = loadAttendance();
    scores = loadScores();

    renderGroupSelect();
    renderAnalysisGroupSelect();
    render();
    renderAnalysis();

    if (message) showStatus(message);
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.pointsTab));
  });

  groupSelect.addEventListener("change", () => {
    selectedGroupId = groupSelect.value;
    render();
  });

  if (analysisGroupSelect) {
    analysisGroupSelect.addEventListener("change", () => {
      analysisGroupId = analysisGroupSelect.value;
      renderAnalysis();
    });
  }

  refreshBtn.addEventListener("click", () => {
    bootstrap("Class roster refreshed.");
  });

  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !listEl.contains(button)) return;

    const row = button.closest(".points-row");
    const group = currentGroup();
    if (!row || !group) return;

    const student = group.students.find((item) => item.id === row.dataset.studentId);
    if (!student) return;

    if (!canAward()) {
      showStatus("Your role does not have permission to change points.");
      return;
    }

    const current = scoreFor(selectedGroupId, student.id);
    const next = button.dataset.action === "inc" ? current + 1 : Math.max(0, current - 1);
    if (next === current) return;

    if (!setScore(selectedGroupId, student.id, next)) {
      showStatus("Could not save points in this browser.");
      return;
    }

    updateRow(row, next, student);
    renderStats(group.students);
    renderAnalysis();
    const A = window.MinaAuth;
    if (A && A.logAction) {
      const delta = next - current;
      A.logAction(delta > 0 ? "Points added" : "Points removed", { student: student.name, group: group.name, delta: Math.abs(delta), total: next });
    }
    showStatus(`${student.name} now has ${next} point${next === 1 ? "" : "s"}.`);
  });

  window.addEventListener("storage", (event) => {
    if (event.key === ATT_KEY || event.key === POINTS_KEY) {
      bootstrap();
    }
  });

  bootstrap();
})();
