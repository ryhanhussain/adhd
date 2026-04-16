# ADDit

ADHD-friendly journaling + time-tracking PWA. User types or speaks what they're doing; Gemini categorizes it, writes a short summary, infers energy level, and parses time references; the app tracks time, streaks, intentions, and daily/weekly insights. Client-first UI (IndexedDB) with Supabase auth gating access and Cloudflare Pages Edge Functions securely handling the centralized background Gemini API key.

**Dev:** `npm run dev`
**Builder:** Ryhan (personal use, possible open-source, React Native port planned).

---

## Stack

Next.js 15 (App Router) · React 19 · TypeScript 5 strict · Tailwind 4 (CSS vars for theming) · IndexedDB via `idb` v8 · Supabase (auth + quota tracking) · Google Gemini API (secure server-side key via Cloudflare Pages proxy) · Web Speech API · PWA via `public/manifest.json`.

No Redux. State = React hooks + IndexedDB, synced across components via `window.dispatchEvent(new Event("entry-updated"))`. App is gated behind `LoginGate`; all entry/reflection/intention data stays local in IndexedDB.

---

## Routes

- `/` — Home: greeting, check-in garden, active-timer card, daily intentions, Ta-Da list, daily + weekly insights, end-of-day reflection. Pinned dock with "Log Activity" and "Plan Day" (brain dump).
- `/timeline` — Hourly history with week-strip nav, date swipe, debounced search.
- `/settings` — Category management, theme, JSON + CSV export, sign-out.

Bottom `NavBar` links all three.

---

## Data models (`lib/db.ts`)

```ts
Entry       { id, text, timestamp, startTime, endTime, date: "YYYY-MM-DD",
              tags[], location|null, energy?: "high"|"medium"|"low"|"scattered"|null,
              summary?: string|null, createdAt }
Intention   { id, text, date, completed, completedAt, entryId|null, order, createdAt }
Reflection  { date (pk), mood 1–5, note, summary, createdAt }
Settings    { customCategories (JSON string), theme, lastSeenMilestone }
Category    { name, color (hex) }
```

`endTime === 0` → timer running (sentinel, no separate active-timer record).
Completing an intention creates an `Entry` and links back via `entryId`.

---

## Features

**Logging**
- Text or voice (Web Speech API) input
- Gemini parses: category tags, time offsets (start/end relative to now), `isOngoing`, 12-word summary, energy level
- Ongoing activities start a live timer; "Just Finished" card closes it
- Mini `ActiveTimerBar` shown on non-home pages
- Suggestion chips: frequency × recency × time-of-day score
- Soft delete with 5s undo toast

**Planning**
- Brain Dump modal: voice/text → Gemini splits into discrete intentions (fallback: local sentence split)
- `IntentionsCard` on Home — tap to complete, which logs a new Entry

**Insights**
- `DailySummary`: SVG donut chart, category bars, peak time
- `EnergyInsights`: breakdown of today's energy levels
- `WeeklyInsights` (collapsible): bar chart, week-over-week %, totals
- `WeeklyEnergyHeatmap`: 7-day energy pattern
- `VibeCloud`: word cloud from recent entries

**Motivation**
- Streak tracking (1-grace-day), computed at load time, not stored
- `CheckInGarden`: plant grows as streak builds
- Milestone celebrations (confetti + overlay) at 7, 14, 30, 60, 100, 200, 365 days; deduped via `lastSeenMilestone`

**Reflection**
- End-of-day prompt (after 7 PM only, once per day): mood 1–5 + note + Gemini-generated accomplishment summary

**Timeline**
- Hourly layout, `PX_PER_HOUR = 60`, overlapping entries placed in adjacent columns
- Week-strip date nav + swipe between days
- Debounced search (50-result cap)

**Settings / Data**
- Supabase email auth; Next.js Edge API routes automatically handle Gemini API interactions for all users with server-side quota tracking.
- Category customization with 8-color palette
- JSON + CSV export of all entries

---

## Key patterns

- **Theming:** `--color-*` vars on `:root` / `html.dark`. `ThemeProvider` reads theme from IndexedDB and applies class on mount. Tailwind uses `bg-[var(--color-bg)]`.
- **Soft delete:** UI removes immediately; DB delete delayed 5s with undo toast.
- **Suggestion scoring:** `frequency × exp(-days/7) × (0.5 + 0.5 × entries_within_±2hrs / total)`.
- **Reflection gate:** shown only after 19:00, once per date.
- **Entry date:** derived from `startTime` via `toLocalDateStr` (local tz, not UTC) whenever startTime is updated.

---

## Design philosophy

Minimal friction. No cognitive overload. ADHD-optimized — logging must be faster than the urge to stop.
