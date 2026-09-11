import { supabaseClient, PROFILE_KEY } from "./supabase.js";
import { $, escapeHtml, showToast } from "./utils.js";
import { calculatePregnancy, formatDate, getDevelopment, parseDate } from "./pregnancy.js";

const STORAGE_KEYS = {
  profile: "tinyTenant.v1.profile",
  appointments: "tinyTenant.v1.appointments"
};

const state = {
  profile: readLocal(STORAGE_KEYS.profile, { profile_key: PROFILE_KEY, due_date: "" }),
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

  $("appointmentForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
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
    const originalButtonText = submitButton?.textContent || "Add Appointment";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Saving…";
    }
    try {
      const savedAppointment = await saveAppointment(appointment);
      state.appointments = state.appointments.filter((item) => item.appointment_key !== savedAppointment.appointment_key);
      state.appointments.push(savedAppointment);
      writeLocal(STORAGE_KEYS.appointments, state.appointments);
      form.reset();
      $("appointmentDate").value = todayISO();
      renderAppointments();
      setSyncStatus("Synced");
      showToast("Appointment saved and synced.");
    } catch (error) {
      console.error("Appointment save failed:", error);
      setSyncStatus("Sync error");
      showToast(`Appointment was not saved: ${error.message}`);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    }
  });
}

async function hydrateFromSupabase() {
  if (!supabaseClient) { setSyncStatus("Offline"); return; }
  setSyncStatus("Syncing");
  try {
    const [profileRes, appointmentsRes] = await Promise.all([
      supabaseClient.from("pregnancy_profile").select("*").eq("profile_key", PROFILE_KEY).maybeSingle(),
      supabaseClient.from("pregnancy_appointments").select("*").eq("profile_key", PROFILE_KEY).order("appointment_date", { ascending: true }).order("appointment_time", { ascending: true })
    ]);
    [profileRes, appointmentsRes].forEach(throwIfError);

    if (profileRes.data) state.profile = profileRes.data;
    if (Array.isArray(appointmentsRes.data)) state.appointments = appointmentsRes.data;

    writeLocal(STORAGE_KEYS.profile, state.profile);
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

async function saveAppointment(appointment) {
  if (!supabaseClient) throw new Error("Supabase connection is unavailable.");
  const { data, error } = await supabaseClient
    .from("pregnancy_appointments")
    .insert(appointment)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Supabase did not confirm the saved appointment.");
  return data;
}

async function deleteAppointment(appointment) {
  const { error } = await supabaseClient.from("pregnancy_appointments").delete().eq("profile_key", PROFILE_KEY).eq("appointment_key", appointment.appointment_key);
  if (error) throw new Error(error.message);
}

function subscribeToRealtime() {
  if (!supabaseClient) return;
  supabaseClient.channel("tiny-tenant-shared")
    .on("postgres_changes", { event: "*", schema: "public", table: "pregnancy_profile" }, hydrateFromSupabase)
    .on("postgres_changes", { event: "*", schema: "public", table: "pregnancy_appointments" }, hydrateFromSupabase)
    .subscribe();
}

function renderAll() {
  if (state.profile?.due_date) $("dueDate").value = state.profile.due_date;
  if ($("appointmentDate")) $("appointmentDate").value = todayISO();
  renderPregnancy();
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
