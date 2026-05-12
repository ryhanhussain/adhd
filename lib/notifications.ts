/**
 * Web Notifications wrapper. Permission is requested lazily on first use
 * (e.g. when starting a Pomodoro) rather than on app load, so the prompt
 * appears in context.
 */

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
