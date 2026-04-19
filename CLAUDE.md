# ADDit

ADHD-friendly journaling + time-tracking PWA. User types or speaks what they're doing; Gemini categorizes it, writes a short summary, infers energy level, and parses time references; the app tracks time, streaks, intentions, and daily/weekly insights. Client-first UI (IndexedDB) with Supabase auth gating access and Cloudflare Pages Edge Functions securely handling the centralized background Gemini API key.

**Dev:** `npm run dev`
**Deploy:** `npm run deploy` — uploads directly to Cloudflare Pages **production**. Never run `wrangler pages deploy` without `--branch=main` or it lands as a preview deployment. GitHub integration is intentionally disconnected; the CLI script is the only deploy path.
**Builder:** Ryhan (personal use, possible open-source, React Native port planned).

---

## Stack

Next.js 15 (App Router) · React 19 · TypeScript 5 strict · Tailwind 4 (CSS vars for theming) · IndexedDB via `idb` v8 · Supabase (auth + quota tracking) · Google Gemini API (secure server-side key via Cloudflare Pages proxy) · Web Speech API · PWA via `public/manifest.json`.

No Redux. State = React hooks + IndexedDB, synced across components via `window.dispatchEvent(new Event("entry-updated"))`. App is gated behind `LoginGate`. Entries, reflections, intentions, and both custom activity categories + intention buckets all sync to Supabase (cross-device, offline-first, LWW); sync modules: `lib/entriesSync.ts`, `lib/reflectionsSync.ts`, `lib/intentionsSync.ts`, `lib/categoriesSync.ts` (covers both category kinds in one round-trip).

---

## Routes

- `/` — Home: greeting, check-in garden, active-timer card, daily intentions, Ta-Da list, daily + weekly insights, end-of-day reflection. Pinned dock with "Log Activity" and "Plan Day" (brain dump).
- `/timeline` — Hourly history with week-strip nav, date swipe, debounced search.
- `/settings` — Activity categories, Intention buckets (up to 3, user-described), theme, JSON + CSV export, sign-out.

Bottom `NavBar` links all three.

---

## Data models (`lib/db.ts`)

```ts
Entry              { id, text, timestamp, startTime, endTime, date: "YYYY-MM-DD",
                     tags[], location|null, energy?: "high"|"medium"|"low"|"scattered"|null,
                     summary?: string|null, createdAt }
Intention          { id, text, date, completed, completedAt, entryId|null, order,
                     categoryId?: string|null, createdAt }
Reflection         { date (pk), mood 1–5, note, summary, createdAt }
Settings           { customCategories, customIntentionCategories (JSON strings),
                     theme, lastSeenMilestone, ...syncedAt timestamps }
Category           { name, color (hex) }
IntentionCategory  { id, name, description, color }   // user-defined bucket, ≤3
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
- Up to 3 user-defined intention buckets, each with a 1-sentence description. The brain-dump prompt is built dynamically from those descriptions so Gemini sorts tasks by the user's own mental model. `IntentionsCard` groups items under bucket headers; falls back to a flat list when no buckets exist
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
- **Gemini proxy quota:** per-user daily cap enforced via an atomic Postgres RPC (`increment_and_check_quota`, SECURITY DEFINER with row lock) plus a 1.5s burst guard. Fails CLOSED on DB errors.
- **Bounded history reads:** streak/garden compute over the last 400 days via `getEntriesSince`, not `getAllEntries`, so cost stays constant as logs accumulate.

---

## Design philosophy

Minimal friction. No cognitive overload. ADHD-optimized — logging must be faster than the urge to stop.
