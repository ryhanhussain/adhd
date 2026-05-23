# Simplify ADDit To Tasks, Focus, Calendar

## Summary

- Keep login/cloud sync, keep Gemini only for task parsing, and add a separate `/calendar` tab.
- Replace the current home experience with a clean flow: brain dump -> task list -> focus.
- Remove user-facing buckets, energy levels, journaling/reflections, habits, life areas, timeline/progress views, Now/Next vault, and related UI paths.
- Default task ordering: urgency first unless the user changes the sort.

## Key Changes

- Home becomes one simple dashboard:
  - Brain dump input at the top.
  - One task-list container below it.
  - Only 5 tasks visible by default.
  - `View all` expands the same container to show every task.
  - Full list allows editing task text, urgency, and time required.
  - Sort control supports `Urgency`, `Time`, and `Manual`.
- Task model:
  - Reuse existing `priority` as UI "urgency": `high | medium | low | null`.
  - Add `timeRequired?: "quick" | "medium" | "long" | null` to `Intention`.
  - Add Supabase column `time_required text check (time_required is null or time_required in ('quick','medium','long'))`.
  - Calendar counts completed tasks from `Intention.completedAt`, not generic entries or focus bursts.
- Brain dump:
  - Simplify `BrainDumpInput` and Gemini parse route to future task parsing only.
  - Gemini returns task `text`, `priority`, and `timeRequired`.
  - Remove parsing for past logs, activity categories, buckets, life areas, energy, and why chains.
- Focus:
  - Simplify `/focus` to a Pomodoro timer for one task.
  - Keep start, pause/resume, complete, cancel, and duration selection.
  - Remove queue, habits, bucket pickers, energy display, why panels, and burst-focused workflows.
  - Completing a focus session marks the task complete and writes an `Entry` only as lightweight completion/focus history for sync.
- Calendar:
  - Add `/calendar` with a Google Calendar-like month grid.
  - Show completed task count in each day cell.
  - Include previous month, next month, and today controls.
  - Clicking a day can show the completed task titles for that date in a compact detail panel.

## Code Removal / Refactor

- Rewrite `app/page.tsx` around the simplified dashboard instead of trimming the current large home page.
- Replace or heavily simplify `components/BrainDumpInput.tsx`, `components/IntentionItem.tsx`, and `app/focus/FocusPageClient.tsx`.
- Add focused components such as `TaskList`, `TaskRow`, `TaskMetadataEditor`, and `MonthlyCalendar`.
- Update `TopNav` to show only `Home`, `Focus`, `Calendar`, and minimal `Settings`.
- Remove unused feature routes from navigation and delete unused code once imports are gone: timeline, analysis/progress, archive, habits, reflections, buckets, energy views, life-area onboarding, daily summaries, and related UI components.
- Keep only the sync paths needed for tasks and focus/completion entries: intentions sync and entries sync. Stop wiring reflection, habit, category, and life-area sync in `AuthProvider`.

## Test Plan

- Typecheck and build: `npx tsc --noEmit` and `npm run build`.
- Verify home with 0, 1-5, and 6+ tasks.
- Verify only 5 tasks show by default and `View all` exposes all tasks plus metadata editing.
- Verify sorting by urgency and time required.
- Verify Gemini brain dump creates task-only items with urgency/time metadata.
- Verify focus can start from a task, pause/resume, complete, and mark the task done.
- Verify `/calendar` shows correct completed-task counts by local date across month boundaries.
- Verify mobile and desktop layouts stay clean with no overlapping text.

## Assumptions

- Existing historical data is not deleted; removed features simply stop appearing in the app.
- Old Supabase tables/columns may remain for compatibility, but new UI and sync stop depending on them.
- Tasks with no urgency sort after `low`; tasks with no time required sort after `long`.
- Manual order remains the tie-breaker for all sorts.
