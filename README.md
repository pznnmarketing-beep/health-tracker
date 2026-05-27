# Health Tracker

A simple browser-based app to log daily sleep, mental health, calories, water, and exercise — and set goals to track progress against.

## Features

- **Log entries** via a single form (date, sleep hours/quality, mood, stress, notes, calories, water, exercise).
- **Set goals** for any metric you want to track.
- **Dashboard** showing today's progress vs. goals and 7-day averages.
- **History** of every entry with delete + JSON export.
- All data is stored locally in your browser (`localStorage`) — no server, no signup.

## Run it

Open `index.html` in any modern browser. That's it.

```sh
open index.html
```

## Files

- `index.html` — markup and tab structure
- `styles.css` — visual styles
- `app.js` — state, form handling, dashboard rendering
