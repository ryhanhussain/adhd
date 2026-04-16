# ADDit — CLAUDE.md

## What this app is

**ADDit** is an ADHD-friendly journaling and time-tracking PWA. Core philosophy: remove cognitive friction from logging daily activities. Users type (or speak) what they're doing, AI categorizes it, and the app tracks time, shows insights, and encourages consistency through streaks.

**Run dev server:** `npm run dev`

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 + CSS custom properties for theming |
| Storage | IndexedDB via `idb` v8 — local-first, no backend |
| AI | Google Gemini API (user provides own key, stored in IndexedDB) |
| Voice | Web Speech API |
| PWA | `public/manifest.json` + apple touch icons |

No Redux, no server, no database. Fully client-side.

---

## Routes (3 pages)

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Home ("Now") — today's entries, streak, daily/weekly insights, reflection, milestone |
| `/timeline` | `app/timeline/page.tsx` | History — hourly layout, date nav, swipe, search |
| `/settings` | `app/settings/page.tsx` | Gemini API key, category management, theme toggle, data export |

Bottom `NavBar` links all three. No nested routes.

---

## Data models (`lib/db.ts`)

```typescript
Entry {
  id: string          // UUID
  text: string        // Raw journal text
  timestamp: number   // Created at
  startTime: number   // When activity started
  endTime: number     // 0 = timer currently running (sentinel value)
  date: string        // YYYY-MM-DD (index key)
  tags: string[]      // Categories e.g. ["Deep Work"]
  location: { lat, lng } | null  // Future use
  createdAt: number
}

Reflection {
  date: string        // YYYY-MM-DD (primary key)
  mood: number        // 1–5
  note: string
  summary: string     // AI-generated
  createdAt: number
}

Settings {
  geminiApiKey: string
  customCategories: string | null   // JSON-stringified Category[]
  theme: string | null              // "light" | "dark" | "system"
  lastSeenMilestone: string | null  // e.g. "30" — prevents duplicate celebrations
}

Category { name: string; color: string }  // color is hex
```

---

## Key files

```
app/
  layout.tsx              — Root layout: ThemeProvider + ActiveTimerBar + NavBar
  globals.css             — All CSS vars, dark mode, custom keyframe animations
  page.tsx                — Home page: entries, streak, insights, reflection, milestone
  timeline/page.tsx       — Timeline page wrapper
  settings/page.tsx       — Settings page

components/
  EntryInput.tsx          — Text input + voice + Gemini categorization + suggestion chips
  EntryEditSheet.tsx      — Bottom sheet: edit/delete with 5s undo toast
  Timeline.tsx            — Hourly layout, date nav, swipe, search
  TimelineEntry.tsx       — Entry card (compact + expanded)
  ActiveTimerBar.tsx      — Persistent timer bar shown on non-home pages
  DailySummary.tsx        — SVG donut chart + category bars + peak time
  WeeklyInsights.tsx      — Collapsible week card: bar chart + stats
  ReflectionPrompt.tsx    — End-of-day mood + note (shows after 7 PM only)
  MilestoneCelebration.tsx — Full-screen confetti overlay
  SuggestionChips.tsx     — Horizontal scrollable recent-activity chips
  NavBar.tsx              — Bottom nav
  ThemeProvider.tsx       — Reads theme from IndexedDB, applies html class
  BottomSheet.tsx         — Base modal

lib/
  db.ts           — IndexedDB CRUD (entries, settings, reflections)
  gemini.ts       — Gemini API: categorize + parse duration + detect isOngoing
  streaks.ts      — Streak calc (1-grace-day) + milestone detection
  suggestions.ts  — Smart chip scoring: frequency × recency × time-of-day
  insights.ts     — Weekly metrics, daily/category breakdown
  categories.ts   — Default categories + 8-color palette
  useCategories.ts — React hook: loads categories from IndexedDB
```

---

## Architecture patterns

**Timer state:** `endTime === 0` means timer is running. No separate active-timer record needed.

**State management:** React hooks + IndexedDB + `window.dispatchEvent(new Event("entry-updated"))` for cross-component sync. No Context or Redux.

**Soft delete:** Entry removed from UI immediately (satisfies impulse), actual DB delete delayed 5s with undo toast.

**Theming:** CSS custom properties (`--color-*`) in `:root` and `html.dark`. Tailwind uses `bg-[var(--color-bg)]` syntax. Theme stored in IndexedDB; ThemeProvider applies class on mount.

**Suggestion scoring:**
```
score = frequency × recency × time_relevance
recency = exp(-days_since / 7)          // 7-day half-life
time_relevance = 0.5 + 0.5 × (entries_within_±2hrs / total)
```

**Timeline collision detection:** Overlapping entries placed in adjacent columns. `PX_PER_HOUR = 60`.

**Reflection:** Shown once per day, only after 7 PM. Stored in IndexedDB by date.

**Streak:** Computed from entry dates at load time (not stored). Milestone thresholds: 7, 14, 30, 60, 100, 200, 365 days.

---

## Implemented features

All 12 planned features are complete:
- Live timer flow (log ongoing activity → timer starts → "Just Finished" closes it)
- Mini-timer bar on non-home pages
- Smart suggestion chips
- Undo on delete (5s)
- Daily summary donut chart + peak time
- Timeline search (debounced, 50-result cap)
- Theme toggle (light/system/dark)
- Weekly insights card (collapsible, week-over-week %)
- End-of-day reflection (mood 1–5 + note + AI summary)
- Milestone celebrations (confetti + overlay)
- Better empty states
- Micro-animations (success flash, breathing glow, confetti, toasts)
- Voice input
- Category customization
- JSON + CSV export

---

## Owner context

- **Builder:** Ryhan — building this for personal use + potentially open-source
- **Future:** React Native port planned
- **Design philosophy:** Minimal friction, no cognitive overload, ADHD-optimized
