const Auth = window.MinaAuth || {
  can: () => true,
  ready: Promise.resolve(),
  currentUser: () => null,
};
const SB = window.MinaSupabase;

const form = document.getElementById("todoForm");
const input = document.getElementById("todoInput");
const list = document.getElementById("todoList");
const itemsLeft = document.getElementById("itemsLeft");
const emptyState = document.getElementById("emptyState");
const filtersEl = document.getElementById("filters");
const clearCompletedBtn = document.getElementById("clearCompleted");
const menuToggle = document.getElementById("menuToggle");
const siteNav = document.getElementById("siteNav");

const LEGACY_KEY = "portfolio.todos";

let todos = [];
let currentFilter = "all";

function currentUserId() {
  const u = Auth.currentUser ? Auth.currentUser() : null;
  return u ? u.id : null;
}

function supabaseReady() {
  return !!(SB && SB.ready && SB.ready());
}

function mapRow(r) {
  return {
    id: r.id,
    text: r.text || "",
    done: !!r.done,
    userId: r.user_id,
    createdAt: r.created_at || null,
  };
}

function toRow(t) {
  return {
    id: t.id,
    user_id: t.userId || currentUserId(),
    text: t.text,
    done: !!t.done,
    created_at: t.createdAt || new Date().toISOString(),
  };
}

function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function readLegacyTodos() {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function clearLegacy() {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    /* ignore */
  }
}

function loadTodos() {
  const me = currentUserId();
  if (!me) return Promise.resolve([]);

  if (!supabaseReady()) {
    return Promise.resolve(readLegacyTodos());
  }

  return SB.get("todos", {
    user_id: "eq." + me,
    select: "*",
    order: "created_at.desc",
  }).then(
    function (rows) {
      const list = (rows || []).map(mapRow);
      if (list.length) {
        clearLegacy();
        return list;
      }
      const legacy = readLegacyTodos();
      if (!legacy.length) return [];
      const seeded = legacy.map((t) => ({
        id: t.id || uid(),
        text: t.text || "",
        done: !!t.done,
        userId: me,
        createdAt: new Date().toISOString(),
      }));
      return SB.upsert(
        "todos",
        seeded.map(toRow),
      ).then(
        function () {
          clearLegacy();
          return seeded;
        },
        function () {
          return seeded;
        },
      );
    },
    function (err) {
      console.error("[todo] load failed", err);
      return readLegacyTodos();
    },
  );
}

function getVisibleTodos() {
  if (currentFilter === "active") return todos.filter((t) => !t.done);
  if (currentFilter === "completed") return todos.filter((t) => t.done);
  return todos;
}

function render() {
  const visible = getVisibleTodos();
  const canToggle = Auth.can("completeTodo");
  const canDelete = Auth.can("deleteTodo");
  list.innerHTML = "";

  visible.forEach((todo) => {
    const li = document.createElement("li");
    li.className = `todo-item${todo.done ? " done" : ""}`;
    li.dataset.id = todo.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.hidden = !canToggle;
    checkbox.addEventListener("change", () => toggleTodo(todo.id));

    const span = document.createElement("span");
    span.className = "task-text";
    span.textContent = todo.text;

    const del = document.createElement("button");
    del.className = "delete-btn";
    del.innerHTML = "&times;";
    del.setAttribute("aria-label", "Delete task");
    del.hidden = !canDelete;
    del.addEventListener("click", () => deleteTodo(todo.id));

    li.append(checkbox, span, del);
    list.appendChild(li);
  });

  const remaining = todos.filter((t) => !t.done).length;
  itemsLeft.textContent = `${remaining} task${remaining === 1 ? "" : "s"} left`;

  emptyState.textContent = todos.length
    ? "No tasks match this filter."
    : "No tasks yet. Add one above.";
  emptyState.style.display = visible.length ? "none" : "block";
}

function addTodo(text) {
  if (!Auth.can("addTodo")) return;
  const me = currentUserId();
  if (!me) return;
  const todo = {
    id: uid(),
    text: text.trim(),
    done: false,
    userId: me,
    createdAt: new Date().toISOString(),
  };
  todos.unshift(todo);
  render();
  if (supabaseReady()) {
    SB.post("todos", toRow(todo), { minimal: true }).catch(function (err) {
      console.error("[todo] add failed", err);
      todos = todos.filter((t) => t.id !== todo.id);
      render();
    });
  }
  if (window.MinaAudit)
    window.MinaAudit.log("todo.create", { text: todo.text.slice(0, 120) });
}

function toggleTodo(id) {
  if (!Auth.can("completeTodo")) return;
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  todo.done = !todo.done;
  render();
  if (supabaseReady()) {
    SB.patch("todos", id, { done: todo.done }).catch(function (err) {
      console.error("[todo] toggle failed", err);
      todo.done = !todo.done;
      render();
    });
  }
  if (window.MinaAudit)
    window.MinaAudit.log("todo.toggle", {
      text: todo.text.slice(0, 120),
      done: todo.done,
    });
}

function deleteTodo(id) {
  if (!Auth.can("deleteTodo")) return;
  const todo = todos.find((t) => t.id === id);
  todos = todos.filter((t) => t.id !== id);
  render();
  if (supabaseReady()) {
    SB.del("todos", [id]).catch(function (err) {
      console.error("[todo] delete failed", err);
      if (todo) {
        todos.unshift(todo);
        render();
      }
    });
  }
  if (window.MinaAudit && todo)
    window.MinaAudit.log("todo.delete", { text: todo.text.slice(0, 120) });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!Auth.can("addTodo")) return;
  if (!input.value.trim()) return;
  addTodo(input.value);
  input.value = "";
  input.focus();
});

filtersEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter");
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  filtersEl
    .querySelectorAll(".filter")
    .forEach((b) => b.classList.toggle("active", b === btn));
  render();
});

clearCompletedBtn.addEventListener("click", () => {
  if (!Auth.can("deleteTodo")) return;
  const done = todos.filter((t) => t.done);
  if (!done.length) return;
  const ids = done.map((t) => t.id);
  todos = todos.filter((t) => !t.done);
  render();
  if (supabaseReady()) {
    SB.del("todos", ids).catch(function (err) {
      console.error("[todo] clear failed", err);
    });
  }
  if (window.MinaAudit)
    window.MinaAudit.log("todo.clearCompleted", { count: ids.length });
});

const authReady =
  Auth && Auth.ready && typeof Auth.ready.then === "function"
    ? Auth.ready
    : Promise.resolve();

authReady
  .then(function () {
    return loadTodos();
  })
  .then(function (list) {
    todos = Array.isArray(list) ? list : [];
    render();
  })
  .catch(function (err) {
    console.error("[todo] init failed", err);
    todos = [];
    render();
  });
