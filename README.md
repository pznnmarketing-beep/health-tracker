# Health Tracker

A Whoop-style web app to log daily sleep, mental health, calories, water, and exercise — and set goals to track progress against. Includes an optional **nightly Telegram bot** that asks you the questions and writes your entry back to this repo.

## Features

- Log entries via the web form, or via Telegram chat (see below).
- Set goals for any metric you want to track.
- Dashboard with three big progress rings (Recovery, Strain, Sleep) and a 7-day sleep bar chart.
- 7-day average stats and full history list.
- All web-app data stays in `localStorage`; Telegram entries are committed to `data.json` in this repo.
- JSON export.

## Run the app

Open `index.html` in any modern browser, or host it on GitHub Pages.

```sh
open index.html
```

## Nightly Telegram check-in

A GitHub Action (`.github/workflows/nightly-prompt.yml`) fires every night at **20:00 UTC** (= 22:00 Amsterdam summer / 21:00 Amsterdam winter). It opens a Telegram chat, walks you through the day's questions, and commits the entry to `data.json`. The web app fetches that file on load and merges it with your local data.

### One-time setup

1. **Make the repo private.** This file will contain your personal health data. In GitHub: *Settings → General → Danger Zone → Change visibility → Make private*.

2. **Create a Telegram bot.**
   - Open Telegram and message [@BotFather](https://t.me/BotFather).
   - Send `/newbot`, pick a name and username.
   - Copy the **bot token** it gives you.

3. **Get your Telegram chat ID.**
   - Send any message to your new bot (e.g. `hi`).
   - Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser.
   - Find `"chat":{"id": 123456789, ...}` in the response. That number is your **chat ID**.

4. **Add both to GitHub Secrets.**
   - Repo *Settings → Secrets and variables → Actions → New repository secret*.
   - Add `TELEGRAM_BOT_TOKEN` = the token from step 2.
   - Add `TELEGRAM_CHAT_ID` = the number from step 3.

5. **(Optional) Adjust the time.** Edit the `cron:` line in `.github/workflows/nightly-prompt.yml`. The format is `minute hour * * *` in UTC. Examples:
   - `0 20 * * *` → 22:00 Amsterdam summer / 21:00 winter (default)
   - `0 21 * * *` → 23:00 summer / 22:00 winter
   - `30 19 * * *` → 21:30 summer / 20:30 winter

6. **Test it.** Go to *Actions → Nightly health prompt → Run workflow* to fire it manually. Your bot should message you.

### How the chat works

The bot sends 8 questions in sequence:
1. Sleep hours
2. Sleep quality (1–10)
3. Mood (1–10)
4. Stress (1–10)
5. Calories
6. Water glasses
7. Exercise minutes
8. Notes

Reply with a number (or text for notes). Send `skip` for any question you want to leave blank. The conversation times out after 90 minutes of inactivity and saves whatever you've answered so far.

## Files

- `index.html` — markup and tab structure
- `styles.css` — dark Whoop-style theme
- `app.js` — state, form handling, dashboard rendering, remote fetch
- `data.json` — entries committed by the Telegram bot
- `.github/workflows/nightly-prompt.yml` — nightly cron + commit
- `.github/scripts/nightly-prompt.js` — bot logic
