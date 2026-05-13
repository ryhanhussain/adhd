# ADDit

ADHD-friendly journaling, planning, focus, and time-tracking PWA. The product goal is low-friction personal daily use: capture what is happening, turn messy thoughts into intentions, start focus without ceremony, and reflect on patterns without shame.

**Dev:** `npm run dev`
**Node:** use Node 22 (`.nvmrc` is pinned to `22`)
**Deploy:** Cloudflare Pages. `npm run deploy` remains as a manual fallback.
**Builder:** Ryhan. Personal-use first; public/open-source polish is secondary.

---

## Stack

Next.js 15 App Router, React 19, TypeScript strict, Tailwind 4, IndexedDB via `idb`, Supabase auth/sync/quota, Gemini via server-side Cloudflare/Edge routes, and PWA manifest support.

State is local-first: React hooks + IndexedDB. Components refresh through lightweight browser events such as `entry-updated`, `entry-dirty`, `intention-dirty`, `habit-dirty`, and category/home-tab dirty events. Supabase sync runs in the background and keeps entries, reflections, intentions, habits, categories, intention buckets, and settings-ish profile fields converged.

---

## Routes

- `/` - Home / Now: date header, Best next move coach, intention buckets or energy view, habits, active timer/focus session, Ta-Da list, daily summary, week teaser, reflection prompt, pinned input dock.
- `/timeline` - day timeline, week strip, search, gap filling, backdated logging.
- `/analysis` - period windows, deterministic pattern callouts, AI period summary, stats, category/energy/mood/time analysis.
- `/archive` - archived intentions.
- `/settings` - theme, activity categories, intention buckets, habits, exports, AI quota, account.

Top navigation is `components/TopNav.tsx`; there is no bottom nav.

---

## Core Models

`Entry` is a time log. `endTime === 0` means a timer is running.

`Intention` is an active or archived planned task. It can have:
- `categoryId` for user-defined intention buckets
- `energy` for the energy view
- `snoozedUntil` to hide it from the Home backlog until a local date
- `lastReframedAt` to mark a "make smaller" edit

`PomodoroState` is device-local in `localStorage`. It now supports:
- `mode: "intention"` for a task-backed focus session
- `mode: "burst"` for a 25-minute Just Start session without a task

`Habit` tracks daily anchors with capped completion history and sync-safe merge behavior.

---

## Important Flows

- Brain dump parses text into intentions using Gemini and the user's intention bucket descriptions.
- Completing an intention creates an `Entry`, links `entryId`, and moves the task into the Ta-Da flow.
- Pomodoro/focus creates an active `Entry`; finishing either ticks the intention or saves a burst.
- The Home `NowCoachCard` recommends one next move from active timers, stale intentions, habits, energy, and backlog state.
- Stale intentions should be handled gently: make smaller, snooze, or archive. Avoid overdue/shame language.
- Analysis should prefer deterministic callouts first; AI summaries are an optional layer.

---

## Verification

Use:

```bash
./node_modules/.bin/tsc --noEmit --incremental false
npm run build
npm run lint
```

Build and lint require Node 22. Older Node versions fail before app code loads.
