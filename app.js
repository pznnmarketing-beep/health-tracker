const STORAGE_ENTRIES = "health-tracker:entries";
const STORAGE_GOALS = "health-tracker:goals";

const RING_CIRC = 2 * Math.PI * 52; // 326.726…

const loadEntries = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_ENTRIES)) || []; }
  catch { return []; }
};
const saveEntries = (e) => localStorage.setItem(STORAGE_ENTRIES, JSON.stringify(e));

const loadGoals = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_GOALS)) || {}; }
  catch { return {}; }
};
const saveGoals = (g) => localStorage.setItem(STORAGE_GOALS, JSON.stringify(g));

const $ = (id) => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0, 10);

const numOrNull = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmt = (n, suffix = "") => (n === null || n === undefined) ? "—" : `${n}${suffix}`;

// ---------- tabs ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "dashboard") renderDashboard();
    if (btn.dataset.tab === "history") renderHistory();
  });
});

// ---------- entry form ----------
$("entry-date").value = todayISO();

$("entry-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const date = $("entry-date").value;
  if (!date) { showFeedback("save-feedback", "Pick a date.", true); return; }

  const entry = {
    date,
    sleepHours: numOrNull($("sleep-hours").value),
    sleepQuality: numOrNull($("sleep-quality").value),
    mood: numOrNull($("mood").value),
    stress: numOrNull($("stress").value),
    moodNotes: $("mood-notes").value.trim(),
    calories: numOrNull($("calories").value),
    water: numOrNull($("water").value),
    exercise: numOrNull($("exercise").value),
    savedAt: new Date().toISOString()
  };

  const entries = loadEntries();
  const existingIdx = entries.findIndex((e) => e.date === date);
  if (existingIdx >= 0) entries[existingIdx] = entry;
  else entries.push(entry);
  entries.sort((a, b) => b.date.localeCompare(a.date));
  saveEntries(entries);

  showFeedback("save-feedback", existingIdx >= 0 ? "Updated " + date : "Saved " + date);
  $("entry-form").reset();
  $("entry-date").value = todayISO();
  renderHeroRings();
});

// ---------- goals form ----------
function loadGoalsToForm() {
  const goals = loadGoals();
  const map = {
    "goal-sleep": "sleep",
    "goal-sleep-quality": "sleepQuality",
    "goal-mood": "mood",
    "goal-stress": "stress",
    "goal-calories": "calories",
    "goal-water": "water",
    "goal-exercise": "exercise"
  };
  Object.entries(map).forEach(([id, key]) => {
    if (goals[key] !== undefined && goals[key] !== null) $(id).value = goals[key];
  });
}
loadGoalsToForm();

$("goals-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const goals = {
    sleep: numOrNull($("goal-sleep").value),
    sleepQuality: numOrNull($("goal-sleep-quality").value),
    mood: numOrNull($("goal-mood").value),
    stress: numOrNull($("goal-stress").value),
    calories: numOrNull($("goal-calories").value),
    water: numOrNull($("goal-water").value),
    exercise: numOrNull($("goal-exercise").value)
  };
  saveGoals(goals);
  showFeedback("goals-feedback", "Goals saved.");
  renderHeroRings();
});

// ---------- hero rings ----------
function setRing(id, percent, color) {
  const el = $(id);
  if (!el) return;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = RING_CIRC * (1 - clamped / 100);
  el.setAttribute("stroke-dashoffset", offset.toFixed(2));
  if (color) el.setAttribute("stroke", color);
}

function renderHeroRings() {
  const entries = loadEntries();
  const goals = loadGoals();
  const today = entries.find((e) => e.date === todayISO()) || {};

  // RECOVERY: derived from mood (1–10) and stress (1–10).
  // recovery = (mood + (11 - stress)) / 2 * 10  → percent
  let recoveryPct = null;
  if (today.mood != null && today.stress != null) {
    recoveryPct = ((today.mood + (11 - today.stress)) / 2) * 10;
  } else if (today.mood != null) {
    recoveryPct = today.mood * 10;
  } else if (today.stress != null) {
    recoveryPct = (11 - today.stress) * 10;
  }

  let recoveryColor = "#16ec06";
  let recoveryClass = "recovery-color";
  if (recoveryPct != null) {
    if (recoveryPct < 33) { recoveryColor = "#ff2a3d"; recoveryClass = "recovery-low-color"; }
    else if (recoveryPct < 67) { recoveryColor = "#ffd400"; recoveryClass = "recovery-mid-color"; }
  }
  setRing("ring-recovery", recoveryPct ?? 0, recoveryColor);
  const rv = $("recovery-value");
  rv.className = "ring-value " + recoveryClass;
  rv.innerHTML = recoveryPct == null
    ? '--<span class="ring-unit">%</span>'
    : `${Math.round(recoveryPct)}<span class="ring-unit">%</span>`;
  $("recovery-sub").textContent = recoveryPct == null
    ? "Log mood + stress"
    : recoveryPct >= 67 ? "Green — ready" : recoveryPct >= 33 ? "Yellow — moderate" : "Red — recover";

  // STRAIN: scaled from exercise minutes. 0 min → 0, 60+ min → 21.
  let strain = null;
  if (today.exercise != null) {
    strain = Math.min(21, (today.exercise / 60) * 21);
  }
  const strainPct = strain == null ? 0 : (strain / 21) * 100;
  setRing("ring-strain", strainPct, "#0093e7");
  $("strain-value").textContent = strain == null ? "--" : strain.toFixed(1);
  $("strain-sub").textContent = strain == null
    ? "Log exercise minutes"
    : strain >= 14 ? "All-out" : strain >= 10 ? "Strenuous" : strain >= 5 ? "Moderate" : "Light";

  // SLEEP: percentage of goal (default 8 hours).
  const sleepGoal = goals.sleep ?? 8;
  let sleepPct = null;
  if (today.sleepHours != null) {
    sleepPct = (today.sleepHours / sleepGoal) * 100;
  }
  setRing("ring-sleep", Math.min(100, sleepPct ?? 0), "#7a5cff");
  $("sleep-value").innerHTML = sleepPct == null
    ? '--<span class="ring-unit">%</span>'
    : `${Math.round(sleepPct)}<span class="ring-unit">%</span>`;
  $("sleep-sub").textContent = today.sleepHours == null
    ? "Log sleep hours"
    : `${today.sleepHours}h of ${sleepGoal}h goal`;
}

// ---------- dashboard ----------
function renderDashboard() {
  renderHeroRings();
  const goals = loadGoals();
  const entries = loadEntries();
  const today = entries.find((e) => e.date === todayISO());

  const container = $("dashboard-goals");
  const items = [
    { key: "sleep", label: "Sleep", suffix: "h", value: today?.sleepHours, goal: goals.sleep, dir: "up" },
    { key: "sleepQuality", label: "Sleep Quality", value: today?.sleepQuality, goal: goals.sleepQuality, dir: "up", max: 10 },
    { key: "mood", label: "Mood", value: today?.mood, goal: goals.mood, dir: "up", max: 10 },
    { key: "stress", label: "Stress", value: today?.stress, goal: goals.stress, dir: "down", max: 10 },
    { key: "calories", label: "Calories", value: today?.calories, goal: goals.calories, dir: "target" },
    { key: "water", label: "Water", value: today?.water, goal: goals.water, dir: "up", suffix: " gl" },
    { key: "exercise", label: "Exercise", value: today?.exercise, goal: goals.exercise, dir: "up", suffix: " min" }
  ];

  const active = items.filter((i) => i.goal !== null && i.goal !== undefined);
  if (active.length === 0) {
    container.innerHTML = '<p class="empty">No goals set yet. Open the Goals tab.</p>';
  } else {
    const rows = active.map((it) => {
      const val = it.value;
      const goal = it.goal;
      let percent = 0;
      let cls = "";
      let valueText = `${fmt(val)} / ${goal}${it.suffix || ""}`;

      if (val === null || val === undefined) {
        valueText = `— / ${goal}${it.suffix || ""}`;
      } else if (it.dir === "up") {
        percent = Math.min(100, (val / goal) * 100);
        cls = percent >= 100 ? "ok" : percent >= 60 ? "warn" : "bad";
      } else if (it.dir === "down") {
        percent = Math.min(100, (val / goal) * 100);
        cls = val <= goal ? "ok" : val <= goal * 1.25 ? "warn" : "bad";
      } else if (it.dir === "target") {
        percent = Math.min(100, (val / goal) * 100);
        const off = Math.abs(val - goal) / goal;
        cls = off <= 0.05 ? "ok" : off <= 0.15 ? "warn" : "bad";
      }

      return `
        <div class="goal-row">
          <div class="goal-row-head">
            <span class="goal-label">${it.label}</span>
            <span class="goal-value">${valueText}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${cls}" style="width: ${percent.toFixed(0)}%"></div>
          </div>
        </div>
      `;
    });
    container.innerHTML = rows.join("");
  }

  // 7-day averages
  const avgContainer = $("dashboard-averages");
  const recent = entries.slice(0, 7);
  if (recent.length === 0) {
    avgContainer.innerHTML = '<p class="empty">Log entries to see averages.</p>';
  } else {
    const avg = (key) => {
      const vals = recent.map((e) => e[key]).filter((v) => typeof v === "number");
      if (vals.length === 0) return null;
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    };
    const avgStats = [
      { label: "Sleep", val: avg("sleepHours"), unit: "h", dp: 1 },
      { label: "Quality", val: avg("sleepQuality"), dp: 1 },
      { label: "Mood", val: avg("mood"), dp: 1 },
      { label: "Stress", val: avg("stress"), dp: 1 },
      { label: "Calories", val: avg("calories"), dp: 0 },
      { label: "Water", val: avg("water"), unit: "gl", dp: 1 },
      { label: "Exercise", val: avg("exercise"), unit: "min", dp: 0 }
    ];
    avgContainer.innerHTML = avgStats.map((s) => `
      <div class="stat">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.val === null ? "—" : s.val.toFixed(s.dp)}${s.unit ? `<span class="stat-unit">${s.unit}</span>` : ""}</div>
      </div>
    `).join("");
  }

  // sleep bar chart — last 7 days
  renderSleepChart(entries);
}

function renderSleepChart(entries) {
  const chart = $("sleep-chart");
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const entry = entries.find((e) => e.date === iso);
    days.push({
      iso,
      label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1),
      hours: entry?.sleepHours ?? 0
    });
  }
  const max = Math.max(10, ...days.map((d) => d.hours));
  chart.innerHTML = days.map((d) => {
    const heightPct = (d.hours / max) * 100;
    return `
      <div class="bar-col" title="${d.iso}: ${d.hours}h">
        <div class="bar" style="height: ${heightPct}%; background: ${d.hours >= 7 ? '#7a5cff' : d.hours > 0 ? '#5a4ab8' : '#26262b'}"></div>
        <div class="bar-label">${d.label}</div>
      </div>
    `;
  }).join("");
}

// ---------- history ----------
function renderHistory() {
  const entries = loadEntries();
  const list = $("history-list");
  if (entries.length === 0) {
    list.innerHTML = '<p class="empty">No entries yet. Log your first one.</p>';
    return;
  }
  list.innerHTML = entries.map((e, idx) => `
    <div class="history-entry">
      <div class="history-head">
        <span class="history-date">${formatDate(e.date)}</span>
        <button class="btn small danger" data-delete="${idx}">Delete</button>
      </div>
      <div class="history-stats">
        <div><span class="h-label">Sleep</span><span class="h-val">${fmt(e.sleepHours, "h")}</span></div>
        <div><span class="h-label">Quality</span><span class="h-val">${fmt(e.sleepQuality)}</span></div>
        <div><span class="h-label">Mood</span><span class="h-val">${fmt(e.mood)}</span></div>
        <div><span class="h-label">Stress</span><span class="h-val">${fmt(e.stress)}</span></div>
        <div><span class="h-label">Calories</span><span class="h-val">${fmt(e.calories)}</span></div>
        <div><span class="h-label">Water</span><span class="h-val">${fmt(e.water)}</span></div>
        <div><span class="h-label">Exercise</span><span class="h-val">${fmt(e.exercise, "m")}</span></div>
      </div>
      ${e.moodNotes ? `<div class="history-notes">"${escapeHTML(e.moodNotes)}"</div>` : ""}
    </div>
  `).join("");

  list.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.delete);
      const entries = loadEntries();
      const removed = entries[idx];
      if (confirm(`Delete entry for ${removed.date}?`)) {
        entries.splice(idx, 1);
        saveEntries(entries);
        renderHistory();
        renderHeroRings();
      }
    });
  });
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

// ---------- export ----------
$("export-btn").addEventListener("click", () => {
  const data = { entries: loadEntries(), goals: loadGoals(), exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `health-tracker-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

function showFeedback(id, msg, isError = false) {
  const el = $(id);
  el.textContent = msg;
  el.classList.toggle("error", isError);
  setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 3000);
}

// initial render
renderDashboard();
renderHistory();
