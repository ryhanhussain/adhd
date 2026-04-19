# ADDit — Feature Improvement Ideas

## Context

Parked ideas from the 2026-04-19 audit session. **None are scheduled.** Reference this file when you want to pick one up for a future planning session. Each idea is sized roughly: **S** = half day, **M** = 1–2 days, **L** = 3–5 days. All framed through an ADHD design lens: reduce friction, externalise working memory, reward consistency without shame, never punish.

---

## 1. "What am I avoiding?" nudge — L

**Problem.** Open intentions that sit untouched for a day are the ones that got avoided. Users either feel guilt when they see them or silently let them roll for weeks.

**Idea.** Once per day, scan intentions where `completed === false && createdAt < now - 18h && text hasn't been edited`. Show a single compact chip near the Daily Intentions header: "Still there from yesterday — reframe or defer?" Two actions only:
- **Reframe.** Opens the intention inline with a nudge ("make it smaller") and re-submits.
- **Defer.** Stamp to tomorrow's date, no guilt.

No streaks broken, no red indicators, no modal wall. Scan happens client-side from IndexedDB on home mount.

**Why ADHD-shaped.** Names the avoidance gently, gives agency, removes the emotional tax of seeing a stale task without a handle on it.

---

## 2. Voice "just start" timer — S

**Problem.** The biggest wall is the blank-page moment before logging begins. "What am I doing?" is itself a distraction.

**Idea.** Long-press the mic in the home dock → immediately starts a 5-minute `Entry` with placeholder text like "Focus burst" and `endTime === 0` (existing ongoing sentinel). No transcript required. At the 5-minute mark, show a quiet toast: "Still going? Tap to add a note." Timer auto-ends at 25 min if no interaction; user can extend.

No new schema. Leverages the existing ongoing-timer machinery.

**Why ADHD-shaped.** Body-doubles the user into starting. Starting is the win; categorisation can come later.

---

## 3. Pattern callouts in weekly insights — M

**Problem.** Weekly charts show *what* happened but rarely *why* or *what to do about it*. Raw bars don't drive behaviour change.

**Idea.** Add a single narrative line above the week chart. Heuristics from existing data only — no new LLM call needed (or one tiny cached call per week):
- "4 'scattered' afternoons this week. You shifted to 'high' after a walk entry on Tue and Thu."
- "Your longest focus blocks this week were in the 9-11 am slot."
- "You completed 3/5 intentions on days where you did a brain dump vs 1/5 when you didn't."

Rotate a few patterns so it feels fresh. Dismissible per-week.

**Why ADHD-shaped.** Externalises patterns the user lives through but doesn't register. Feels like a friend noticing, not a dashboard judging.

---

## 4. Friction-free re-categorize — S

**Problem.** When Gemini mis-categorises an entry, users rarely go back to fix it — too many taps, too much cognitive load. Wrong tags poison future suggestion scoring.

**Idea.** Long-press an entry in Timeline → floating popover with category chips (existing `useCategories` palette). One tap swaps the tag. Optional: store `userCorrected: true` on the entry so we can later fine-tune the prompt with these as implicit labels.

**Why ADHD-shaped.** Zero-friction correction = corrections actually happen. Also creates a quiet feedback loop for prompt quality over time.

---

## 5. Weekly auto-export digest — M

**Problem.** Insights live in the app only. Users forget to open the app on weekends, which is when reflection is most valuable.

**Idea.** Opt-in in Settings: Sunday morning email with a small PDF/HTML recap — top categories, mood trend, a standout pattern, and a single "plan the week" prompt with a deep link back to brain dump. Leverage Cloudflare Workers Cron + Resend/Postmark. No stored PII beyond what Supabase already has.

Cost is low: once/week/user, small payload.

**Why ADHD-shaped.** Creates a ritual the user looks forward to rather than a notification they dismiss. Reflection happens passively even if the app isn't opened.

---

## 6. "Now" Lock Screen / Home widget — L (React Native prereq)

**Problem.** The single biggest re-engagement opportunity is *while an activity is ongoing*. Phones live on lock screens; the app doesn't.

**Idea.** Native iOS/Android widget:
- If there's an active timer: show it live with elapsed time + one-tap "Just finished" button.
- If nothing active: show a single-tap "Log now" that opens the app straight into the input.

Requires the planned React Native port. Widget uses the existing `endTime === 0` sentinel.

**Why ADHD-shaped.** Surfaces the right affordance at exactly the moment a distraction ends. Biggest single unlock for completion rates.

---

## 7. Shared-device / account-switch guard — S

**Problem.** If the app is opened under a different Supabase account (family member borrowing a device, user signing into work account on personal phone), local IndexedDB still holds the previous user's entries. Current sync will either overwrite them remotely or leave them stranded locally with ambiguous ownership.

**Idea.** On sign-in, compare a lightweight fingerprint (count + max `updatedAt` of local entries) against the newly-signed-in user's remote fingerprint. If they look like different users, prompt once: "Found 23 entries on this device. Upload them to this account, or clear them?" Default: clear, because the safer option is not to leak someone else's data into the new account. User can explicitly opt-in to merge.

**Why ADHD-shaped.** Prevents silent data loss *and* silent data leakage — both of which erode trust faster than any missing feature.

---

## 8. "Decompression" reflection prompts — S

**Problem.** The end-of-day reflection asks one question. Some days the user is tapped out and skips it. Streak breaks, shame spiral.

**Idea.** If reflection is opened but abandoned mid-way (partial mood, no note) by 11 pm, auto-save `{mood, note: ""}` with a gentle copy next morning: "Yesterday was a mood-only day — that counts." Streak preserved. No guilt, no lost data.

**Why ADHD-shaped.** Recognises low-battery days as valid data, not failed attempts.

---

## Picking one

If the user comes back asking "which first?", rough recommendation:
1. **#7 shared-device guard** — trust/safety, ships in a day, enables safer public release.
2. **#4 re-categorize** — highest compounding value (improves prompt quality over months).
3. **#3 pattern callouts** — biggest perceived-value lift for minimal ML.

#6 (widget) is by far the biggest re-engagement lever but gated on the React Native port, so schedule around that milestone.
