const SUPABASE_URL = "https://dugyrawoqiztodugzwmi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1Z3lyYXdvcWl6dG9kdWd6d21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDA2OTUsImV4cCI6MjA5NzQ3NjY5NX0.A_HQwb6IXldqsoEYab56Nng2pSytFSi6OTZbhUNIeHc";

// Do not name this variable "supabase". The CDN already exposes window.supabase.
// Naming it supabase causes: Identifier 'supabase' has already been declared.
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const STORAGE_KEYS = {
  profile: "tinyTenant.profile",
  checklist: "tinyTenant.checklist",
  expenses: "tinyTenant.expenses",
  budget: "tinyTenant.budget",
  theme: "tinyTenant.theme"
};

const DEFAULT_CHECKLIST = [
  { id: crypto.randomUUID(), category: "Nursery", item_name: "Crib", completed: false },
  { id: crypto.randomUUID(), category: "Nursery", item_name: "Mattress", completed: false },
  { id: crypto.randomUUID(), category: "Nursery", item_name: "Monitor", completed: false },
  { id: crypto.randomUUID(), category: "Nursery", item_name: "Dresser", completed: false },
  { id: crypto.randomUUID(), category: "Feeding", item_name: "Bottles", completed: false },
  { id: crypto.randomUUID(), category: "Feeding", item_name: "Pump", completed: false },
  { id: crypto.randomUUID(), category: "Feeding", item_name: "Formula", completed: false },
  { id: crypto.randomUUID(), category: "Feeding", item_name: "Nursing Supplies", completed: false },
  { id: crypto.randomUUID(), category: "Travel", item_name: "Car Seat", completed: false },
  { id: crypto.randomUUID(), category: "Travel", item_name: "Stroller", completed: false },
  { id: crypto.randomUUID(), category: "Travel", item_name: "Diaper Bag", completed: false }
];

const DEVELOPMENT_BY_WEEK = {
  4: ["<0.1 oz", "<0.1 in", "The earliest structures are forming.", "Tiny Tenant has officially filed the paperwork."],
  8: ["~0.04 oz", "~0.6 in", "Major organs are beginning to form.", "A tiny blueprint is under active construction."],
  12: ["~0.5 oz", "~2.1 in", "Reflexes and facial features continue developing.", "The tenant is small, dramatic, and very busy."],
  16: ["~3.5 oz", "~4.6 in", "Movement may begin soon.", "Baby is growing quickly and practicing tiny motions."],
  20: ["~10.5 oz", "~6.5 in", "Hearing and movement are becoming more noticeable.", "Halfway-ish. The calendar is now emotionally loaded."],
  24: ["~1.3 lbs", "~12 in", "Hearing is becoming more developed.", "Baby is gaining weight steadily and developing facial features."],
  28: ["~2.2 lbs", "~14.8 in", "Eyes may open and close.", "The third trimester has entered the chat."],
  32: ["~3.8 lbs", "~16.7 in", "Baby is practicing breathing movements.", "Growth mode is fully activated."],
  36: ["~5.8 lbs", "~18.7 in", "Baby is gaining fat and preparing for birth.", "Move-in day is getting suspiciously close."],
  40: ["~7.5 lbs", "~20 in", "Baby is considered full term around this stage.", "Final walkthrough pending."]
};

const SIZE_BY_WEEK = [
  [4, "Poppy Seed"], [5, "Sesame Seed"], [6, "Lentil"], [7, "Blueberry"],
  [8, "Raspberry"], [9, "Grape"], [10, "Kumquat"], [11, "Fig"],
  [12, "Lime"], [13, "Lemon"], [14, "Peach"], [15, "Apple"],
  [16, "Avocado"], [17, "Turnip"], [18, "Bell Pepper"], [19, "Mango"],
  [20, "Banana"], [21, "Carrot"], [22, "Papaya"], [23, "Grapefruit"],
  [24, "Corn Cob"], [25, "Rutabaga"], [26, "Scallion Bundle"], [27, "Cauliflower"],
  [28, "Eggplant"], [29, "Butternut Squash"], [30, "Cabbage"], [31, "Coconut"],
  [32, "Jicama"], [33, "Pineapple"], [34, "Cantaloupe"], [35, "Honeydew"],
  [36, "Romaine Lettuce"], [37, "Swiss Chard"], [38, "Leek"], [39, "Watermelon"],
  [40, "Small Pumpkin"]
];

let state = {
  profile: readLocal(STORAGE_KEYS.profile, { due_date: "" }),
  checklist: readLocal(STORAGE_KEYS.checklist, DEFAULT_CHECKLIST),
  expenses: readLocal(STORAGE_KEYS.expenses, []),
  budget: readLocal(STORAGE_KEYS.budget, { monthly_budget: 0 })
};

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  bindEvents();
  await loadFromSupabase();
  renderAll();
});

function $(id) {
  return document.getElementById(id);
}

function readLocal(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (error) {
    console.warn("Local read failed:", key, error);
    return fallback;
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function bindEvents() {
  $("themeToggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.body.classList.toggle("dark", next === "dark");
    localStorage.setItem(STORAGE_KEYS.theme, next);
  });

  $("profileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const dueDate = $("dueDate").value;
    if (!dueDate) return;

    const computed = calculatePregnancy(dueDate);
    state.profile = {
      id: "main",
      due_date: dueDate,
      current_week: computed.week,
      trimester: computed.trimester
    };

    writeLocal(STORAGE_KEYS.profile, state.profile);
    renderPregnancy();

    const { error } = await saveProfileToSupabase(state.profile);
    if (error) showToast("Saved locally. Supabase did not save yet. Check SQL/RLS.");
    else showToast("Due date saved.");
  });

  $("checklistForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const category = $("checklistCategory").value;
    const itemName = $("checklistItem").value.trim();
    if (!itemName) return;

    const item = {
      id: crypto.randomUUID(),
      category,
      item_name: itemName,
      completed: false,
      created_at: new Date().toISOString()
    };

    state.checklist.push(item);
    $("checklistItem").value = "";
    writeLocal(STORAGE_KEYS.checklist, state.checklist);
    renderChecklist();
    await saveChecklistItemToSupabase(item);
  });

  $("budgetSettingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const monthlyBudget = Number($("monthlyBudget").value || 0);
    state.budget = { id: "main", monthly_budget: monthlyBudget };
    writeLocal(STORAGE_KEYS.budget, state.budget);
    renderBudget();
    await saveBudgetToSupabase(state.budget);
    showToast("Budget saved.");
  });

  $("expenseForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const expense = {
      id: crypto.randomUUID(),
      category: $("expenseCategory").value,
      amount: Number($("expenseAmount").value || 0),
      expense_date: $("expenseDate").value,
      notes: $("expenseNotes").value.trim(),
      created_at: new Date().toISOString()
    };

    state.expenses.push(expense);
    writeLocal(STORAGE_KEYS.expenses, state.expenses);
    event.target.reset();
    renderBudget();
    await saveExpenseToSupabase(expense);
    showToast("Expense added.");
  });
}

function applyTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    document.body.classList.add("dark");
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    document.body.classList.remove("dark");
  }
}

async function loadFromSupabase() {
  if (!supabaseClient) return;

  try {
    const [profileRes, checklistRes, expensesRes, budgetRes] = await Promise.all([
      supabaseClient.from("pregnancy_profile").select("*").eq("id", "main").maybeSingle(),
      supabaseClient.from("pregnancy_nursery_checklist").select("*").order("created_at", { ascending: true }),
      supabaseClient.from("pregnancy_budget_expenses").select("*").order("expense_date", { ascending: false }),
      supabaseClient.from("pregnancy_budget_settings").select("*").eq("id", "main").maybeSingle()
    ]);

    if (profileRes.data) {
      state.profile = profileRes.data;
      writeLocal(STORAGE_KEYS.profile, state.profile);
    }

    if (Array.isArray(checklistRes.data) && checklistRes.data.length) {
      state.checklist = checklistRes.data;
      writeLocal(STORAGE_KEYS.checklist, state.checklist);
    }

    if (Array.isArray(expensesRes.data)) {
      state.expenses = expensesRes.data;
      writeLocal(STORAGE_KEYS.expenses, state.expenses);
    }

    if (budgetRes.data) {
      state.budget = budgetRes.data;
      writeLocal(STORAGE_KEYS.budget, state.budget);
    }

    [profileRes, checklistRes, expensesRes, budgetRes].forEach((res) => {
      if (res.error) console.warn("Supabase load warning:", res.error.message);
    });
  } catch (error) {
    console.warn("Supabase load failed. Using localStorage.", error);
  }
}

async function saveProfileToSupabase(profile) {
  if (!supabaseClient) return { error: null };
  const { error } = await supabaseClient.from("pregnancy_profile").upsert({
    id: "main",
    due_date: profile.due_date,
    current_week: profile.current_week,
    trimester: profile.trimester
  }, { onConflict: "id" });
  if (error) console.error("Profile save failed:", error);
  return { error };
}

async function saveChecklistItemToSupabase(item) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from("pregnancy_nursery_checklist").upsert(item, { onConflict: "id" });
  if (error) console.error("Checklist save failed:", error);
}

async function updateChecklistItemInSupabase(item) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from("pregnancy_nursery_checklist").update({
    completed: item.completed
  }).eq("id", item.id);
  if (error) console.error("Checklist update failed:", error);
}

async function saveBudgetToSupabase(budget) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from("pregnancy_budget_settings").upsert({
    id: "main",
    monthly_budget: budget.monthly_budget || 0
  }, { onConflict: "id" });
  if (error) console.error("Budget save failed:", error);
}

async function saveExpenseToSupabase(expense) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from("pregnancy_budget_expenses").upsert(expense, { onConflict: "id" });
  if (error) console.error("Expense save failed:", error);
}

async function deleteExpenseFromSupabase(id) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from("pregnancy_budget_expenses").delete().eq("id", id);
  if (error) console.error("Expense delete failed:", error);
}

function renderAll() {
  if (state.profile?.due_date) $("dueDate").value = state.profile.due_date;
  if (state.budget?.monthly_budget) $("monthlyBudget").value = state.budget.monthly_budget;
  const today = new Date().toISOString().slice(0, 10);
  if ($("expenseDate")) $("expenseDate").value = today;

  renderPregnancy();
  renderChecklist();
  renderBudget();
}

function calculatePregnancy(dueDateValue) {
  const dueDate = parseDate(dueDateValue);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalDays = 280;
  const conceptionStart = new Date(dueDate);
  conceptionStart.setDate(conceptionStart.getDate() - totalDays);

  const daysPregnant = clamp(Math.floor((today - conceptionStart) / 86400000), 0, totalDays);
  const daysRemaining = Math.max(0, Math.ceil((dueDate - today) / 86400000));
  const week = Math.floor(daysPregnant / 7);
  const day = daysPregnant % 7;
  const percent = Math.round((daysPregnant / totalDays) * 100);
  const trimester = week < 14 ? "First Trimester" : week < 28 ? "Second Trimester" : "Third Trimester";
  const size = getBabySize(week);

  return { daysPregnant, daysRemaining, week, day, percent, trimester, size };
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function clamp(number, min, max) {
  return Math.min(Math.max(number, min), max);
}

function getBabySize(week) {
  let size = "Tiny blueprint";
  for (const [minWeek, label] of SIZE_BY_WEEK) {
    if (week >= minWeek) size = label;
  }
  return size;
}

function getDevelopment(week) {
  const available = Object.keys(DEVELOPMENT_BY_WEEK).map(Number).sort((a, b) => a - b);
  let match = available[0];
  available.forEach((candidate) => {
    if (week >= candidate) match = candidate;
  });
  return DEVELOPMENT_BY_WEEK[match];
}

function renderPregnancy() {
  const dueDate = state.profile?.due_date;
  if (!dueDate) {
    $("weekDay").textContent = "Set your due date";
    $("trimester").textContent = "Trimester appears here";
    return;
  }

  const calc = calculatePregnancy(dueDate);
  const [weight, length, milestone, summary] = getDevelopment(calc.week);

  $("progressRing").style.setProperty("--progress", calc.percent);
  $("progressPercent").textContent = `${calc.percent}%`;
  $("weekDay").textContent = `Week ${calc.week} Day ${calc.day}`;
  $("trimester").textContent = calc.trimester;
  $("daysRemaining").textContent = calc.daysRemaining;
  $("countdownText").textContent = "Days until move-in day";
  $("babySize").textContent = calc.size;
  $("pregnancyBar").style.width = `${calc.percent}%`;
  $("overviewWeek").textContent = `Week ${calc.week} Day ${calc.day}`;
  $("overviewTrimester").textContent = calc.trimester;
  $("overviewPercent").textContent = `${calc.percent}% complete`;
  $("welcomeMoveIn").textContent = `Move-in date: ${formatDate(dueDate)}`;
  $("welcomeStatus").textContent = calc.daysRemaining === 0 ? "Move-in window open" : "Under construction";
  $("developmentTitle").textContent = `Week ${calc.week} Development`;
  $("babyWeight").textContent = weight;
  $("babyLength").textContent = length;
  $("babyMilestone").textContent = milestone;
  $("babySummary").textContent = summary;
}

function renderChecklist() {
  const container = $("checklistGroups");
  if (!container) return;
  container.innerHTML = "";
  const categories = ["Nursery", "Feeding", "Travel"];

  categories.forEach((category) => {
    const items = state.checklist.filter((item) => item.category === category);
    const completed = items.filter((item) => item.completed).length;
    const percent = items.length ? Math.round((completed / items.length) * 100) : 0;

    const group = document.createElement("div");
    group.className = "checklist-group";
    group.innerHTML = `
      <div class="checklist-group-head">
        <strong>${category}</strong>
        <span>${percent}%</span>
      </div>
      <div class="mini-bar"><span style="width:${percent}%"></span></div>
    `;

    items.forEach((item) => {
      const row = document.createElement("label");
      row.className = "check-row";
      row.innerHTML = `
        <input type="checkbox" ${item.completed ? "checked" : ""} />
        <span>${escapeHtml(item.item_name)}</span>
      `;
      row.querySelector("input").addEventListener("change", async (event) => {
        item.completed = event.target.checked;
        writeLocal(STORAGE_KEYS.checklist, state.checklist);
        renderChecklist();
        await updateChecklistItemInSupabase(item);
      });
      group.appendChild(row);
    });

    container.appendChild(group);
  });

  const total = state.checklist.length;
  const done = state.checklist.filter((item) => item.completed).length;
  const overall = total ? Math.round((done / total) * 100) : 0;
  $("overallChecklist").textContent = `${overall}%`;
  $("checklistPill").textContent = `${overall}% done`;
}

function renderBudget() {
  const monthlyBudget = Number(state.budget?.monthly_budget || 0);
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthlyExpenses = state.expenses.filter((expense) => {
    const date = parseDate(expense.expense_date);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  });

  const monthlySpend = monthlyExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const totalSpend = state.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const remaining = monthlyBudget - monthlySpend;

  $("monthlySpend").textContent = money(monthlySpend);
  $("totalSpend").textContent = money(totalSpend);
  $("budgetVsActual").textContent = `${money(monthlySpend)} / ${money(monthlyBudget)}`;
  $("budgetRemaining").textContent = `${money(remaining)} left`;
  $("largestCategory").textContent = getLargestCategory() || "—";

  renderCategoryChart();
  renderExpenseList();
}

function getLargestCategory() {
  const totals = {};
  state.expenses.forEach((expense) => {
    totals[expense.category] = (totals[expense.category] || 0) + Number(expense.amount || 0);
  });
  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function renderCategoryChart() {
  const chart = $("categoryChart");
  if (!chart) return;
  chart.innerHTML = "";
  const totals = {};
  state.expenses.forEach((expense) => {
    totals[expense.category] = (totals[expense.category] || 0) + Number(expense.amount || 0);
  });

  const max = Math.max(...Object.values(totals), 1);
  Object.entries(totals).forEach(([category, total]) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `
      <span>${category}</span>
      <div class="chart-bar"><span style="width:${Math.round((total / max) * 100)}%"></span></div>
      <strong>${money(total)}</strong>
    `;
    chart.appendChild(row);
  });
}

function renderExpenseList() {
  const list = $("expenseList");
  if (!list) return;
  list.innerHTML = "";

  const sorted = [...state.expenses].sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date));
  sorted.forEach((expense) => {
    const row = document.createElement("div");
    row.className = "expense-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(expense.category)} • ${money(expense.amount)}</strong>
        <p>${formatDate(expense.expense_date)}${expense.notes ? " • " + escapeHtml(expense.notes) : ""}</p>
      </div>
      <button class="ghost-btn" type="button">Delete</button>
    `;
    row.querySelector("button").addEventListener("click", async () => {
      state.expenses = state.expenses.filter((item) => item.id !== expense.id);
      writeLocal(STORAGE_KEYS.expenses, state.expenses);
      renderBudget();
      await deleteExpenseFromSupabase(expense.id);
    });
    list.appendChild(row);
  });
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";
  return parseDate(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function showToast(message) {
  let toast = $("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // Service worker is optional. The dashboard still works without it.
    });
  });
}
