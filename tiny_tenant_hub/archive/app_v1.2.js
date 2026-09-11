import { supabaseClient, PROFILE_KEY } from "./supabase.js";
import { $, money, escapeHtml, showToast } from "./utils.js";
import { calculatePregnancy, formatDate, getDevelopment, parseDate } from "./pregnancy.js";

const STORAGE_KEYS = {
  profile: "tinyTenant.v1.profile",
  checklist: "tinyTenant.v1.checklist",
  expenses: "tinyTenant.v1.expenses",
  budget: "tinyTenant.v1.budget",
  appointments: "tinyTenant.v1.appointments"
};

const CHECKLIST_CATEGORIES = ["Nursery", "Feeding", "Travel", "Accessories"];

const DEFAULT_CHECKLIST = [
  ["Nursery", "Crib"], ["Nursery", "Mattress"], ["Nursery", "Monitor"], ["Nursery", "Dresser"],
  ["Feeding", "Bottles"], ["Feeding", "Pump"], ["Feeding", "Formula"], ["Feeding", "Nursing Supplies"],
  ["Travel", "Car Seat"], ["Travel", "Stroller"], ["Travel", "Diaper Bag"],
  ["Accessories", "Baby Tub"], ["Accessories", "Lounger"], ["Accessories", "Swing"], ["Accessories", "Swaddles"],
  ["Accessories", "Binkies / Pacifiers"], ["Accessories", "Sound Machine"], ["Accessories", "Baby Carrier"],
  ["Accessories", "Burp Cloths"], ["Accessories", "Blankets"], ["Accessories", "Changing Pad"]
].map(([category, item_name], index) => ({
  item_key: `${category.toLowerCase()}-${index}-${slug(item_name)}`,
  profile_key: PROFILE_KEY,
  category,
  item_name,
  completed: false,
  sort_order: index
}));

const state = {
  profile: readLocal(STORAGE_KEYS.profile, { profile_key: PROFILE_KEY, due_date: "" }),
  checklist: readLocal(STORAGE_KEYS.checklist, DEFAULT_CHECKLIST),
  expenses: readLocal(STORAGE_KEYS.expenses, []),
  budget: readLocal(STORAGE_KEYS.budget, { profile_key: PROFILE_KEY, monthly_budget: 0 }),
  appointments: readLocal(STORAGE_KEYS.appointments, [])
};

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  renderAll();
  await hydrateFromSupabase();
  subscribeToRealtime();
});

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function readLocal(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setSyncStatus(text) {
  const pill = $("syncStatus");
  if (pill) pill.textContent = text;
}

function bindEvents() {
  $("profileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const dueDate = $("dueDate").value;
    if (!dueDate) return;
    const calc = calculatePregnancy(dueDate);
    state.profile = {
      profile_key: PROFILE_KEY,
      due_date: dueDate,
      current_week: calc.week,
      trimester: calc.trimester
    };
    writeLocal(STORAGE_KEYS.profile, state.profile);
    renderPregnancy();
    try {
      await saveProfile(state.profile);
      showToast("Due date saved and synced.");
    } catch (error) {
      showToast(`Saved locally only: ${error.message}`);
      setSyncStatus("Local only");
    }
  });

  $("checklistForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const itemName = $("checklistItem").value.trim();
    if (!itemName) return;
    const item = {
      item_key: crypto.randomUUID(),
      profile_key: PROFILE_KEY,
      category: $("checklistCategory").value,
      item_name: itemName,
      completed: false,
      sort_order: 999
    };
    state.checklist.push(item);
    $("checklistItem").value = "";
    persistAndRenderChecklist();
    try { await saveChecklistItem(item); showToast("Checklist item added."); }
    catch (error) { showToast(`Checklist saved locally only: ${error.message}`); }
  });

  $("budgetSettingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.budget = { profile_key: PROFILE_KEY, monthly_budget: Number($("monthlyBudget").value || 0) };
    writeLocal(STORAGE_KEYS.budget, state.budget);
    renderBudget();
    try { await saveBudget(state.budget); showToast("Budget saved and synced."); }
    catch (error) { showToast(`Budget saved locally only: ${error.message}`); }
  });

  $("expenseForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const expense = {
      expense_key: crypto.randomUUID(),
      profile_key: PROFILE_KEY,
      category: $("expenseCategory").value,
      amount: Number($("expenseAmount").value || 0),
      expense_date: $("expenseDate").value,
      notes: $("expenseNotes").value.trim()
    };
    state.expenses.unshift(expense);
    writeLocal(STORAGE_KEYS.expenses, state.expenses);
    event.target.reset();
    if ($("expenseDate")) $("expenseDate").value = todayISO();
    renderBudget();
    try { await saveExpense(expense); showToast("Expense added."); }
    catch (error) { showToast(`Expense saved locally only: ${error.message}`); }
  });

  $("appointmentForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const appointment = {
      appointment_key: crypto.randomUUID(),
      profile_key: PROFILE_KEY,
      appointment_type: $("appointmentType").value,
      title: $("appointmentTitle").value.trim(),
      appointment_date: $("appointmentDate").value,
      appointment_time: $("appointmentTime").value,
      provider: $("appointmentProvider").value.trim(),
      location: $("appointmentLocation").value.trim(),
      notes: $("appointmentNotes").value.trim()
    };
    if (!appointment.title || !appointment.appointment_date || !appointment.appointment_time) return;
    state.appointments.push(appointment);
    writeLocal(STORAGE_KEYS.appointments, state.appointments);
    event.target.reset();
    renderAppointments();
    try { await saveAppointment(appointment); showToast("Appointment added."); }
    catch (error) { showToast(`Appointment saved locally only: ${error.message}`); }
  });
}

async function hydrateFromSupabase() {
  if (!supabaseClient) { setSyncStatus("Offline"); return; }
  setSyncStatus("Syncing");
  try {
    await ensureDefaultChecklist();
    const [profileRes, checklistRes, expenseRes, budgetRes, appointmentsRes] = await Promise.all([
      supabaseClient.from("pregnancy_profile").select("*").eq("profile_key", PROFILE_KEY).maybeSingle(),
      supabaseClient.from("pregnancy_nursery_checklist").select("*").eq("profile_key", PROFILE_KEY).order("sort_order", { ascending: true }),
      supabaseClient.from("pregnancy_budget_expenses").select("*").eq("profile_key", PROFILE_KEY).order("expense_date", { ascending: false }),
      supabaseClient.from("pregnancy_budget_settings").select("*").eq("profile_key", PROFILE_KEY).maybeSingle(),
      supabaseClient.from("pregnancy_appointments").select("*").eq("profile_key", PROFILE_KEY).order("appointment_date", { ascending: true }).order("appointment_time", { ascending: true })
    ]);
    [profileRes, checklistRes, expenseRes, budgetRes, appointmentsRes].forEach(throwIfError);

    if (profileRes.data) state.profile = profileRes.data;
    if (Array.isArray(checklistRes.data) && checklistRes.data.length) state.checklist = checklistRes.data;
    if (Array.isArray(expenseRes.data)) state.expenses = expenseRes.data;
    if (budgetRes.data) state.budget = budgetRes.data;
    if (Array.isArray(appointmentsRes.data)) state.appointments = appointmentsRes.data;

    writeLocal(STORAGE_KEYS.profile, state.profile);
    writeLocal(STORAGE_KEYS.checklist, state.checklist);
    writeLocal(STORAGE_KEYS.expenses, state.expenses);
    writeLocal(STORAGE_KEYS.budget, state.budget);
    writeLocal(STORAGE_KEYS.appointments, state.appointments);
    renderAll();
    setSyncStatus("Synced");
  } catch (error) {
    console.error("Supabase sync failed:", error);
    setSyncStatus("Local only");
    showToast(`Supabase sync failed: ${error.message}`);
  }
}

function throwIfError(response) {
  if (response?.error) throw new Error(response.error.message);
}

async function ensureDefaultChecklist() {
  const rows = DEFAULT_CHECKLIST.map((item, sort_order) => ({ ...item, profile_key: PROFILE_KEY, sort_order }));
  const { error } = await supabaseClient.from("pregnancy_nursery_checklist").upsert(rows, { onConflict: "profile_key,item_key", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

async function saveProfile(profile) {
  const { error } = await supabaseClient.from("pregnancy_profile").upsert({
    profile_key: PROFILE_KEY,
    due_date: profile.due_date,
    current_week: profile.current_week,
    trimester: profile.trimester,
    updated_at: new Date().toISOString()
  }, { onConflict: "profile_key" });
  if (error) throw new Error(error.message);
  setSyncStatus("Synced");
}

async function saveChecklistItem(item) {
  const { error } = await supabaseClient.from("pregnancy_nursery_checklist").upsert(item, { onConflict: "profile_key,item_key" });
  if (error) throw new Error(error.message);
}

async function updateChecklistItem(item) {
  const { error } = await supabaseClient.from("pregnancy_nursery_checklist").update({ completed: item.completed, updated_at: new Date().toISOString() }).eq("profile_key", PROFILE_KEY).eq("item_key", item.item_key);
  if (error) throw new Error(error.message);
}

async function saveBudget(budget) {
  const { error } = await supabaseClient.from("pregnancy_budget_settings").upsert({
    profile_key: PROFILE_KEY,
    monthly_budget: budget.monthly_budget || 0,
    updated_at: new Date().toISOString()
  }, { onConflict: "profile_key" });
  if (error) throw new Error(error.message);
}

async function saveExpense(expense) {
  const { error } = await supabaseClient.from("pregnancy_budget_expenses").upsert(expense, { onConflict: "profile_key,expense_key" });
  if (error) throw new Error(error.message);
}

async function deleteExpense(expense) {
  const { error } = await supabaseClient.from("pregnancy_budget_expenses").delete().eq("profile_key", PROFILE_KEY).eq("expense_key", expense.expense_key);
  if (error) throw new Error(error.message);
}

async function saveAppointment(appointment) {
  const { error } = await supabaseClient.from("pregnancy_appointments").upsert(appointment, { onConflict: "profile_key,appointment_key" });
  if (error) throw new Error(error.message);
}

async function deleteAppointment(appointment) {
  const { error } = await supabaseClient.from("pregnancy_appointments").delete().eq("profile_key", PROFILE_KEY).eq("appointment_key", appointment.appointment_key);
  if (error) throw new Error(error.message);
}

function subscribeToRealtime() {
  if (!supabaseClient) return;
  supabaseClient.channel("tiny-tenant-shared")
    .on("postgres_changes", { event: "*", schema: "public", table: "pregnancy_profile" }, hydrateFromSupabase)
    .on("postgres_changes", { event: "*", schema: "public", table: "pregnancy_nursery_checklist" }, hydrateFromSupabase)
    .on("postgres_changes", { event: "*", schema: "public", table: "pregnancy_budget_settings" }, hydrateFromSupabase)
    .on("postgres_changes", { event: "*", schema: "public", table: "pregnancy_budget_expenses" }, hydrateFromSupabase)
    .on("postgres_changes", { event: "*", schema: "public", table: "pregnancy_appointments" }, hydrateFromSupabase)
    .subscribe();
}

function renderAll() {
  if (state.profile?.due_date) $("dueDate").value = state.profile.due_date;
  if (state.budget?.monthly_budget) $("monthlyBudget").value = state.budget.monthly_budget;
  if ($("expenseDate")) $("expenseDate").value = todayISO();
  if ($("appointmentDate")) $("appointmentDate").value = todayISO();
  renderPregnancy();
  renderChecklist();
  renderBudget();
  renderAppointments();
}

function renderPregnancy() {
  const dueDate = state.profile?.due_date;
  if (!dueDate) {
    $("weekDay").textContent = "Set your due date";
    $("trimester").textContent = "Trimester appears here";
    $("weekOfForty").textContent = "Week — of 40";
    $("timelinePercent").textContent = "0%";
    $("timelineFill").style.width = "0%";
    $("timelineMarker").style.left = "0%";
    return;
  }
  const calc = calculatePregnancy(dueDate);
  const development = getDevelopment(calc.week);
  $("progressRing").style.setProperty("--progress", calc.percent);
  $("progressPercent").textContent = `${calc.percent}%`;
  $("weekDay").textContent = `Week ${calc.week} Day ${calc.day}`;
  $("trimester").textContent = calc.trimester;
  $("daysRemaining").textContent = calc.daysRemaining;
  $("countdownText").textContent = "Days until move-in day";
  $("babySize").textContent = calc.size;
  $("weekOfForty").textContent = `Week ${calc.week} of 40`;
  $("timelinePercent").textContent = `${calc.percent}%`;
  $("timelineFill").style.width = `${calc.percent}%`;
  $("timelineMarker").style.left = `${Math.min(Math.max(calc.percent, 1), 99)}%`;
  $("overviewWeek").textContent = `Week ${calc.week} Day ${calc.day}`;
  $("overviewCountdown").textContent = `${calc.daysRemaining} days remaining`;
  $("overviewTrimester").textContent = calc.trimester;
  $("overviewPercent").textContent = `${calc.percent}% complete`;
  $("welcomeMoveIn").textContent = `Move-in date: ${formatDate(dueDate)}`;
  $("welcomeStatus").textContent = calc.daysRemaining === 0 ? "Move-in window open" : "Under construction";
  $("developmentTitle").textContent = `Week ${calc.week} Development`;
  $("sizeEmoji").textContent = calc.sizeEmoji || development.image || "🏠";
  $("sizeIllustrationLabel").textContent = calc.size;
  $("sizeIllustrationSub").textContent = `Currently about the size of a ${calc.size.toLowerCase()}.`;
  $("developmentSizeFact").textContent = `${calc.size} • ${development.weight} • ${development.length}`;
  $("babyWeight").textContent = development.weight;
  $("babyLength").textContent = development.length;
  $("babyMilestone").textContent = development.milestone;
  $("parentChangeNote").textContent = development.you;
  $("babySummary").textContent = development.summary;
}

function renderChecklist() {
  const container = $("checklistGroups");
  if (!container) return;
  container.innerHTML = "";
  CHECKLIST_CATEGORIES.forEach((category) => {
    const items = state.checklist.filter((item) => item.category === category).sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
    const completed = items.filter((item) => item.completed).length;
    const percent = items.length ? Math.round((completed / items.length) * 100) : 0;
    const group = document.createElement("div");
    group.className = "checklist-group";
    group.innerHTML = `<div class="checklist-group-head"><strong>${category}</strong><span>${percent}%</span></div><div class="mini-bar"><span style="width:${percent}%"></span></div>`;
    items.forEach((item) => {
      const row = document.createElement("label");
      row.className = "check-row";
      row.innerHTML = `<input type="checkbox" ${item.completed ? "checked" : ""} /><span>${escapeHtml(item.item_name)}</span>`;
      row.querySelector("input").addEventListener("change", async (event) => {
        item.completed = event.target.checked;
        persistAndRenderChecklist();
        try { await updateChecklistItem(item); }
        catch (error) { showToast(`Checklist updated locally only: ${error.message}`); }
      });
      group.appendChild(row);
    });
    container.appendChild(group);
  });
  const total = state.checklist.length;
  const done = state.checklist.filter((item) => item.completed).length;
  const overall = total ? Math.round((done / total) * 100) : 0;
  $("overallChecklist") && ($("overallChecklist").textContent = `${overall}%`);
  $("checklistPill").textContent = `${overall}% done`;
}

function persistAndRenderChecklist() {
  writeLocal(STORAGE_KEYS.checklist, state.checklist);
  renderChecklist();
}

function renderBudget() {
  const monthlyBudget = Number(state.budget?.monthly_budget || 0);
  const now = new Date();
  const monthlyExpenses = state.expenses.filter((expense) => {
    const date = parseDate(expense.expense_date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const monthlySpend = monthlyExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const totalSpend = state.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  $("monthlySpend").textContent = money(monthlySpend);
  $("totalSpend").textContent = money(totalSpend);
  $("budgetVsActual").textContent = `${money(monthlySpend)} / ${money(monthlyBudget)}`;
  $("budgetRemaining").textContent = `${money(monthlyBudget - monthlySpend)} left`;
  $("largestCategory").textContent = getLargestCategory() || "—";
  renderCategoryChart(); renderExpenseList();
}

function getLargestCategory() {
  const totals = {};
  state.expenses.forEach((expense) => totals[expense.category] = (totals[expense.category] || 0) + Number(expense.amount || 0));
  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function renderCategoryChart() {
  const chart = $("categoryChart");
  chart.innerHTML = "";
  const totals = {};
  state.expenses.forEach((expense) => totals[expense.category] = (totals[expense.category] || 0) + Number(expense.amount || 0));
  const max = Math.max(...Object.values(totals), 1);
  Object.entries(totals).forEach(([category, total]) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `<span>${escapeHtml(category)}</span><div class="chart-bar"><span style="width:${Math.round((total / max) * 100)}%"></span></div><strong>${money(total)}</strong>`;
    chart.appendChild(row);
  });
}

function renderExpenseList() {
  const list = $("expenseList");
  list.innerHTML = "";
  [...state.expenses].sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date)).forEach((expense) => {
    const row = document.createElement("div");
    row.className = "expense-row";
    row.innerHTML = `<div><strong>${escapeHtml(expense.category)} • ${money(expense.amount)}</strong><p>${formatDate(expense.expense_date)}${expense.notes ? " • " + escapeHtml(expense.notes) : ""}</p></div><button class="ghost-btn" type="button">Delete</button>`;
    row.querySelector("button").addEventListener("click", async () => {
      state.expenses = state.expenses.filter((item) => item.expense_key !== expense.expense_key);
      writeLocal(STORAGE_KEYS.expenses, state.expenses);
      renderBudget();
      try { await deleteExpense(expense); }
      catch (error) { showToast(`Deleted locally only: ${error.message}`); }
    });
    list.appendChild(row);
  });
}

function renderAppointments() {
  const list = $("appointmentList");
  if (!list) return;
  const now = new Date();
  const upcoming = [...state.appointments]
    .filter((appointment) => new Date(`${appointment.appointment_date}T${appointment.appointment_time || "00:00"}`) >= startOfToday(now))
    .sort((a, b) => new Date(`${a.appointment_date}T${a.appointment_time}`) - new Date(`${b.appointment_date}T${b.appointment_time}`));
  const past = [...state.appointments]
    .filter((appointment) => new Date(`${appointment.appointment_date}T${appointment.appointment_time || "00:00"}`) < startOfToday(now))
    .sort((a, b) => new Date(`${b.appointment_date}T${b.appointment_time}`) - new Date(`${a.appointment_date}T${a.appointment_time}`));

  $("appointmentPill").textContent = `${upcoming.length} upcoming`;
  const next = upcoming[0];
  if (next) {
    $("nextAppointmentDate").textContent = shortDate(next.appointment_date);
    $("nextAppointmentTitle").textContent = `${next.title} at ${formatTime(next.appointment_time)}`;
  } else {
    $("nextAppointmentDate").textContent = "—";
    $("nextAppointmentTitle").textContent = "No upcoming appointment";
  }

  list.innerHTML = "";
  renderAppointmentSection(list, "Upcoming", upcoming);
  if (past.length) renderAppointmentSection(list, "Past", past.slice(0, 6));
}

function renderAppointmentSection(container, title, appointments) {
  const section = document.createElement("div");
  section.className = "appointment-section";
  section.innerHTML = `<h3>${title}</h3>`;
  if (!appointments.length) {
    section.innerHTML += `<p class="subtle">No ${title.toLowerCase()} appointments yet.</p>`;
    container.appendChild(section);
    return;
  }
  appointments.forEach((appointment) => {
    const row = document.createElement("div");
    row.className = "appointment-row";
    row.innerHTML = `
      <div>
        <span class="appointment-type">${escapeHtml(appointment.appointment_type || "Appointment")}</span>
        <strong>${escapeHtml(appointment.title)}</strong>
        <p>${formatDate(appointment.appointment_date)} at ${formatTime(appointment.appointment_time)}${appointment.provider ? " • " + escapeHtml(appointment.provider) : ""}</p>
        ${appointment.location ? `<p>${escapeHtml(appointment.location)}</p>` : ""}
        ${appointment.notes ? `<p>${escapeHtml(appointment.notes)}</p>` : ""}
      </div>
      <div class="appointment-actions">
        <button class="ghost-btn calendar-btn" type="button">Add to Calendar</button>
        <button class="ghost-btn delete-btn" type="button">Delete</button>
      </div>
    `;
    row.querySelector(".calendar-btn").addEventListener("click", () => downloadCalendarEvent(appointment));
    row.querySelector(".delete-btn").addEventListener("click", async () => {
      state.appointments = state.appointments.filter((item) => item.appointment_key !== appointment.appointment_key);
      writeLocal(STORAGE_KEYS.appointments, state.appointments);
      renderAppointments();
      try { await deleteAppointment(appointment); }
      catch (error) { showToast(`Deleted locally only: ${error.message}`); }
    });
    section.appendChild(row);
  });
  container.appendChild(section);
}

function downloadCalendarEvent(appointment) {
  const start = localDateTime(appointment.appointment_date, appointment.appointment_time);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const title = appointment.title || appointment.appointment_type || "Appointment";
  const description = [appointment.appointment_type, appointment.provider, appointment.notes].filter(Boolean).join("\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tiny Tenant//Appointments//EN",
    "BEGIN:VEVENT",
    `UID:${appointment.appointment_key}@tiny-tenant`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${escapeICS(title)}`,
    appointment.location ? `LOCATION:${escapeICS(appointment.location)}` : "",
    description ? `DESCRIPTION:${escapeICS(description)}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Reminder: ${escapeICS(title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug(title)}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Calendar file created. Open it to add the reminder.");
}

function localDateTime(dateValue, timeValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = String(timeValue || "09:00").split(":").map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0);
}

function toICSDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function escapeICS(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function startOfToday(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(value) {
  return parseDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(value) {
  if (!value) return "—";
  const [hour, minute] = value.split(":").map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}
