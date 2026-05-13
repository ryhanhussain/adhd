# ADDit - Agent Notes

This repo is a Next.js 15 / React 19 personal productivity PWA for ADHD-friendly capture, planning, focus, reflection, and time analysis.

## Current Architecture

- Local-first IndexedDB storage in `lib/db.ts`
- Supabase auth and sync modules:
  - `lib/entriesSync.ts`
  - `lib/reflectionsSync.ts`
  - `lib/intentionsSync.ts`
  - `lib/categoriesSync.ts`
  - `lib/habitsSync.ts`
- Gemini is called only through authenticated Edge API routes under `app/api/gemini/*`
- Top-level shell is `app/layout.tsx` with `TopNav`, `AuthProvider`, `LoginGate`, `ActiveTimerBar`, and the global glass/pastel theme
- Use Node 22 (`.nvmrc`)

## Product Direction

Optimize for Ryhan's personal daily use. Prefer features that reduce choice, reduce shame, and make the next action obvious. Avoid growth/onboarding-heavy work unless explicitly requested.

The main Home loop is:

1. Capture or brain dump.
2. Work from the Best next move card.
3. Use buckets or energy view when choosing manually.
4. Start focus, log completion, or save a Just Start burst.
5. Reflect and let analysis feed tomorrow's intentions.

## Recently Added Personal Companion Pieces

- `components/home/NowCoachCard.tsx` recommends one deterministic next move.
- `lib/pomodoro.ts` supports `mode: "intention" | "burst"`.
- `PomodoroSheet` includes `Just Start · 25 min`.
- `Intention` supports `snoozedUntil` and `lastReframedAt`.
- `components/analysis/ActionablePatterns.tsx` turns deterministic patterns into intentions.
- Settings includes full JSON backup export.
- `TopNav` includes a small offline/sync/saved indicator.

## Editing Guidance

- Keep UI copy short, kind, and concrete.
- Avoid red overdue/shame states for intentions.
- Reuse existing event buses after local writes.
- Keep new data local-first and sync-safe.
- If adding Supabase columns, add a standalone migration file in `supabase/` and update relevant sync serialization.

## Checks

Run:

```bash
./node_modules/.bin/tsc --noEmit --incremental false
npm run build
npm run lint
```

If build/lint fail with `Cannot find module 'node:events'`, the shell is using an old Node version. Switch to Node 22 first.
