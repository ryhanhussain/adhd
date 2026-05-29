# DeepSeek + Hourly Home Plan

## Summary

- This is moderate work, not a full rewrite. The DeepSeek switch is small; the new Home is larger because intentions need scheduled-day/start/duration fields, drag/drop, and an AI preview/apply flow.
- Use DeepSeek `deepseek-v4-flash` through its OpenAI-compatible `/chat/completions` API with `thinking: { type: "disabled" }`, JSON responses, tight token caps, and the existing auth/quota guard.
- The DeepSeek API key must be added to Cloudflare Pages as a server-side secret named `DEEPSEEK_API_KEY`. Because the key was pasted into chat, rotate it first, then use the new key locally and in Cloudflare.

## Key Changes

- Replace Gemini runtime code with provider-neutral AI code:
  - Rename client usage from `lib/gemini.ts` to an AI client module.
  - Move routes from `/api/gemini/*` to `/api/ai/*`, keeping compatibility only if useful.
  - Replace `GEMINI_API_KEY` with `DEEPSEEK_API_KEY`; update `.env.local.example`.
  - Keep the existing Supabase quota RPC/table for v1 to avoid a risky database rename, but update code/comments to treat it as AI quota.
- Add scheduling fields to `Intention`:
  - `plannedDate?: string | null`
  - `plannedStartMinute?: number | null`
  - `plannedDurationMinutes?: number | null`
  - Supabase migration adds matching nullable columns plus checks for valid minute/duration ranges.
- Rebuild `/` as the new Home:
  - Today timeline starts at the user's browser-local current hour.
  - Tomorrow is allowed, but no dates beyond tomorrow are exposed or accepted.
  - Dropped tasks get duration from effort: quick 15m, medium 30m, long 60m, unset 30m.
  - Unscheduled active tasks appear in Inbox; existing active tasks remain safe and will initially show there.
  - Add manual quick-add to Inbox and "send to tomorrow" flow.
- Use `@dnd-kit/core` for reliable desktop/mobile drag and drop, with a tap/select fallback for mobile ergonomics.
- Add daily AI chat above Inbox:
  - Local IndexedDB/settings-backed daily chat history only.
  - Each local date starts a fresh chat.
  - Chat sends only compact task context: active inbox/today/tomorrow task IDs, text, priority, effort, planned slot.
  - AI returns assistant text plus proposed actions; user previews and taps Apply.
  - Allowed actions: create task, edit task text, schedule/unschedule task. Unknown IDs and dates beyond tomorrow are ignored.

## Cost Controls

- Use `deepseek-v4-flash`, non-thinking mode, no streaming for v1.
- Limit context to today/tomorrow/inbox tasks and the last few chat messages.
- Use JSON mode for parse and planning routes.
- Add env-configurable daily cap, default around 100 AI calls/day, with the existing burst guard.
- Keep max output small: roughly 640 tokens for parsing and 900 for chat planning.

## Cloudflare Setup

- Add a rotated key locally as `DEEPSEEK_API_KEY` in `.env.local`.
- Add the same secret to Cloudflare Pages production/preview:

```bash
npx wrangler pages secret put DEEPSEEK_API_KEY --project-name=addit
```

- Deploy after the secret exists so Edge routes can read it from `getRequestContext().env`.

## Test Plan

- Run `./node_modules/.bin/tsc --noEmit --incremental false`.
- Run `npm run build` and `npm run lint` under Node 22.
- Verify AI parse still creates tasks without exposing the key client-side.
- Verify chat can propose a schedule, preview changes, and apply only valid today/tomorrow actions.
- Verify drag/drop on desktop and mobile viewport, including moving a task back to Inbox.
- Verify Supabase sync preserves planned fields across refresh/sign-in.
- Verify old unscheduled tasks still appear and no completed/archived/deleted tasks return.

## Assumptions

- "User location" means browser-local time/timezone, not GPS geolocation.
- Tomorrow timeline starts at 08:00 by default.
- V1 does not include resizable blocks; durations are effort-based defaults.
- Chat history is local-only and resets by local date.
- DeepSeek docs confirm `deepseek-v4-flash`, OpenAI-compatible base URL, JSON output, and Cloudflare docs confirm Pages secrets via `wrangler pages secret put`:
  - https://api-docs.deepseek.com/api/create-chat-completion
  - https://developers.cloudflare.com/workers/wrangler/commands/pages/#pages-secret-put
