const STORAGE_KEY = "portfolio.todos";
const Auth = window.MinaAuth || { can: () => true };

const form = document.getElementById("todoForm");
const input = document.getElementById("todoInput");
const list = document.getElementById("todoList");
const itemsLeft = document.getElementById("itemsLeft");
const emptyState = document.getElementById("emptyState");
const filtersEl = document.getElementById("filters");
const clearCompletedBtn = document.getElementById("clearCompleted");
const menuToggle = document.getElementById("menuToggle");
const siteNav = document.getElementById("siteNav");

let todos = loadTodos();
let currentFilter = "all";

function loadTodos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
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
  const todo = { id: Date.now().toString(), text: text.trim(), done: false };
  todos.unshift(todo);
  saveTodos();
  if (Auth.logAction) Auth.logAction("Todo added", { text: todo.text });
  render();
}

function toggleTodo(id) {
  if (!Auth.can("completeTodo")) return;
  const todo = todos.find((t) => t.id === id);
  if (todo) {
    todo.done = !todo.done;
    saveTodos();
    if (Auth.logAction) Auth.logAction(todo.done ? "Todo completed" : "Todo uncompleted", { text: todo.text });
  }
  render();
}

function deleteTodo(id) {
  if (!Auth.can("deleteTodo")) return;
  const todo = todos.find((t) => t.id === id);
  todos = todos.filter((t) => t.id !== id);
  saveTodos();
  if (Auth.logAction && todo) Auth.logAction("Todo deleted", { text: todo.text });
  render();
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
  filtersEl.querySelectorAll(".filter").forEach((b) => b.classList.toggle("active", b === btn));
  render();
});

clearCompletedBtn.addEventListener("click", () => {
  if (!Auth.can("deleteTodo")) return;
  const count = todos.filter((t) => t.done).length;
  todos = todos.filter((t) => !t.done);
  saveTodos();
  if (Auth.logAction && count) Auth.logAction("Completed todos cleared", { count });
  render();
});

render();
