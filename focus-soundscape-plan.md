# Simple Focus Soundscape Plan

## Summary

Replace the current `/focus` soundscape idea with a lightweight Pomodoro sound picker: five pre-recorded looping sounds from Supabase Storage, one volume slider, one ambient on/off control, and a clean timer view inspired by `E _ Soundscape.html`.

No Howler.js, no audio search APIs, no mix-ins, no profile sync, and no new database tables.

## Key Changes

- Use a public Supabase Storage bucket named `focus-soundscapes`.
- Expect exactly five uploaded `.mp3` files:
  - `rain-on-tent.mp3`
  - `forest-dawn.mp3`
  - `cafe-murmur.mp3`
  - `lofi-loop.mp3`
  - `brown-noise.mp3`
- Add a small hardcoded catalog in the app with `id`, `label`, and `fileName`.
- Use native `HTMLAudioElement` for looping playback, volume, mute/stop, cleanup, and sound switching.
- Keep Pomodoro completion sounds as the existing generated tones in `lib/notifications.ts`.

## Focus Page Behavior

- Keep the existing Pomodoro session model and task behavior.
- Starting a focus session starts the selected loop if ambient sound is enabled.
- Pause pauses the timer and the ambient loop.
- Resume resumes the timer and ambient loop only if ambient sound is still enabled.
- Users can stop/mute the ambient loop without pausing the timer.
- Changing the selected sound while running switches immediately to that loop.
- Completing, cancelling, timer finishing, or leaving the page stops the ambient loop.
- Volume is controlled by one slider and persisted locally with selected sound and ambient enabled state.

## UI Direction

- Keep the page lightweight and clean, borrowing from the reference HTML:
  - dark slate focus panel
  - `Currently playing · {sound}`
  - large countdown
  - simple current-task line
  - five compact sound choices
  - one volume control
- Replace the circular timer emphasis with a horizontal waveform-style progress visual.
- The waveform is visual timer progress, not an audio-analyzed waveform: it fills from left to right based on Pomodoro progress.
- No mix-in row, no layered mixer, no credits UI, no heavy dashboard layout.

## Test Plan

- Run `npx tsc --noEmit`.
- Run `npm run build`.
- Verify `/focus` with no tasks, one task, many tasks, and `?task=` links.
- Verify sound selection, volume persistence, ambient stop/mute, and sound switching.
- Verify start, pause, resume, finish, cancel, and timer-complete all control audio correctly.
- Verify the existing Pomodoro completion tone still plays.
- Verify missing audio files fail quietly without breaking the timer.
- Check mobile and desktop layouts for clean spacing and no overlapping text.

## Assumptions

- Supabase Storage is used only for hosting the five audio files.
- Uploading/replacing audio is done manually in Supabase, not through an app UI.
- Soundscape preferences are device-local for v1.
- Only `.mp3` files are required for the first version.
- The existing focus-session entry and intention completion behavior stays unchanged.
