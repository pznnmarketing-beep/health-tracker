// Nightly Telegram prompt: walks the user through a conversational health log,
// then writes/updates data.json. Runs inside a GitHub Action on a cron schedule.

const fs = require("fs");
const path = require("path");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env vars.");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const REPLY_TIMEOUT_MS = 90 * 60 * 1000; // 90 minutes total to finish the chat

async function send(text) {
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "Markdown" })
  });
  const json = await res.json();
  if (!json.ok) console.error("sendMessage failed:", json);
  return json;
}

async function getUpdates(offset, timeoutSec) {
  const url = `${API}/getUpdates?offset=${offset}&timeout=${timeoutSec}`;
  const res = await fetch(url);
  return res.json();
}

async function discardPendingUpdates() {
  const res = await fetch(`${API}/getUpdates?timeout=0&offset=-1`);
  const json = await res.json();
  if (json.ok && json.result.length) {
    return json.result[json.result.length - 1].update_id + 1;
  }
  return 0;
}

async function waitForReply(startOffset, deadline) {
  let offset = startOffset;
  while (Date.now() < deadline) {
    const remainingSec = Math.max(1, Math.min(50, Math.floor((deadline - Date.now()) / 1000)));
    let data;
    try {
      data = await getUpdates(offset, remainingSec);
    } catch (e) {
      console.error("getUpdates error:", e.message);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!data.ok) {
      console.error("getUpdates not ok:", data);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    for (const upd of data.result) {
      offset = upd.update_id + 1;
      const msg = upd.message;
      if (!msg || !msg.text) continue;
      if (String(msg.chat.id) !== String(CHAT_ID)) continue;
      return { text: msg.text, offset };
    }
  }
  return { timeout: true, offset };
}

const parseNum = (max) => (txt) => {
  const cleaned = txt.replace(",", ".").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  if (max != null && n > max) return null;
  return n;
};

async function ask(question, parser, startOffset, deadline) {
  let offset = startOffset;
  await send(question + "\n_Send 'skip' to leave blank._");
  while (true) {
    const r = await waitForReply(offset, deadline);
    if (r.timeout) return { value: null, offset: r.offset, timeout: true };
    offset = r.offset;
    const t = r.text.trim();
    if (/^(skip|-|n\/a)$/i.test(t)) return { value: null, offset };
    const parsed = parser(t);
    if (parsed === null) {
      await send("Couldn't read that — send a number or 'skip'.");
      continue;
    }
    return { value: parsed, offset };
  }
}

async function askText(question, startOffset, deadline) {
  await send(question + "\n_Send 'skip' to leave blank._");
  const r = await waitForReply(startOffset, deadline);
  if (r.timeout) return { value: "", offset: r.offset, timeout: true };
  const t = r.text.trim();
  if (/^(skip|-|n\/a)$/i.test(t)) return { value: "", offset: r.offset };
  return { value: t, offset: r.offset };
}

async function main() {
  const deadline = Date.now() + REPLY_TIMEOUT_MS;
  let offset = await discardPendingUpdates();

  const today = new Date().toISOString().slice(0, 10);

  await send(
    `*Evening check-in*\n\nLet's log your day for *${today}*. I'll ask a few quick questions — reply with a number, or send 'skip' to leave blank.`
  );

  const entry = { date: today, source: "telegram" };

  const steps = [
    ["sleepHours",   "💤 How many hours did you sleep last night?", parseNum(24)],
    ["sleepQuality", "⭐ Sleep quality (1–10)?", parseNum(10)],
    ["mood",         "🙂 Mood today (1–10)?", parseNum(10)],
    ["stress",       "⚡ Stress today (1–10)?", parseNum(10)],
    ["calories",     "🍽️ Calories consumed today?", parseNum(20000)],
    ["water",        "💧 Glasses of water?", parseNum(50)],
    ["exercise",     "🏃 Exercise minutes?", parseNum(600)]
  ];

  for (const [key, question, parser] of steps) {
    const r = await ask(question, parser, offset, deadline);
    offset = r.offset;
    entry[key] = r.value;
    if (r.timeout) {
      await send("Timed out — saving what we have so far.");
      break;
    }
  }

  if (Date.now() < deadline) {
    const r = await askText("📝 Any notes about your day?", offset, deadline);
    offset = r.offset;
    entry.moodNotes = r.value || "";
  } else {
    entry.moodNotes = "";
  }

  entry.savedAt = new Date().toISOString();

  // merge into data.json
  const dataPath = path.join(process.cwd(), "data.json");
  let data = [];
  if (fs.existsSync(dataPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      if (Array.isArray(parsed)) data = parsed;
    } catch (e) {
      console.error("Failed to read data.json:", e.message);
    }
  }
  const idx = data.findIndex((e) => e.date === entry.date);
  if (idx >= 0) data[idx] = entry;
  else data.push(entry);
  data.sort((a, b) => b.date.localeCompare(a.date));
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");

  // summary message
  const fmt = (v, suffix = "") => (v === null || v === undefined ? "—" : `${v}${suffix}`);
  const summary = [
    `*Logged for ${entry.date}* ✅`,
    "",
    `💤 Sleep: ${fmt(entry.sleepHours, "h")} (quality ${fmt(entry.sleepQuality)})`,
    `🙂 Mood: ${fmt(entry.mood)} | ⚡ Stress: ${fmt(entry.stress)}`,
    `🍽️ Calories: ${fmt(entry.calories)} | 💧 Water: ${fmt(entry.water)}`,
    `🏃 Exercise: ${fmt(entry.exercise, " min")}`
  ];
  if (entry.moodNotes) summary.push("", `📝 ${entry.moodNotes}`);
  await send(summary.join("\n"));
}

main().catch(async (e) => {
  console.error(e);
  try { await send(`⚠️ Error during nightly prompt: ${e.message}`); } catch {}
  process.exit(1);
});
