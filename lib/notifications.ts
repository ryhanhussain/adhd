/**
 * Web Notifications wrapper. Permission is requested lazily on first use
 * (e.g. when starting a Pomodoro) rather than on app load, so the prompt
 * appears in context.
 */

const POMODORO_SOUND_KEY = "addit-pomodoro-sound-enabled";

type PomodoroSoundName = "start" | "pause" | "resume" | "complete" | "next" | "switch";

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "denied";
  }
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function getPomodoroSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(POMODORO_SOUND_KEY) !== "false";
}

export function setPomodoroSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(POMODORO_SOUND_KEY, String(enabled));
  window.dispatchEvent(new Event("pomodoro-sound-updated"));
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as AudioWindow;
  const AudioContextCtor = w.AudioContext ?? w.webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioContext ??= new AudioContextCtor();
  return audioContext;
}

function tone(ctx: AudioContext, at: number, frequency: number, duration: number, gain: number) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, at);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.018);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.03);
}

export function playPomodoroSound(name: PomodoroSoundName): void {
  if (!getPomodoroSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);

  const now = ctx.currentTime + 0.02;
  const patterns: Record<PomodoroSoundName, Array<[number, number, number, number]>> = {
    start: [
      [0, 523.25, 0.16, 0.05],
      [0.1, 659.25, 0.18, 0.045],
    ],
    pause: [
      [0, 392, 0.16, 0.04],
      [0.08, 329.63, 0.18, 0.035],
    ],
    resume: [
      [0, 440, 0.12, 0.04],
      [0.08, 587.33, 0.16, 0.045],
    ],
    complete: [
      [0, 523.25, 0.18, 0.052],
      [0.12, 659.25, 0.2, 0.048],
      [0.25, 783.99, 0.28, 0.045],
    ],
    next: [
      [0, 659.25, 0.14, 0.04],
      [0.09, 880, 0.18, 0.04],
    ],
    switch: [
      [0, 587.33, 0.12, 0.04],
      [0.08, 493.88, 0.12, 0.036],
      [0.16, 659.25, 0.18, 0.04],
    ],
  };

  for (const [offset, frequency, duration, gain] of patterns[name]) {
    tone(ctx, now + offset, frequency, duration, gain);
  }
}

export function notifyPomodoroComplete(intentionText: string): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification("Pomodoro complete", {
      body: intentionText,
      tag: "addit-pomodoro",
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Some browsers reject Notification construction outside SW context — silent fallback to in-app confirm.
  }
}
