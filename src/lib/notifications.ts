import { toast } from "sonner";
import { REMINDERS_CHANGED, listReminders, putReminder } from "./db";

export const REMINDER_EVENT = "echo:reminder-fired";

export function notificationSupport() {
  if (typeof window === "undefined") return "unsupported" as const;
  if (!("Notification" in window)) return "unsupported" as const;
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    throw new Error("This browser does not support notifications.");
  }
  const result = await Notification.requestPermission();
  if (result !== "granted") throw new Error("Notification permission was denied.");
  return result;
}

/** Best-effort: ask once, never throw. Used right after a recording detects deadlines. */
export async function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "default") {
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }
  return Notification.permission;
}

function fire(title: string, body: string, tag: string) {
  const canNotify = typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
  if (canNotify) {
    try {
      const notification = new Notification(title, { body, tag, requireInteraction: true });
      notification.onclick = () => {
        window.focus();
        window.location.assign("/reminders");
        notification.close();
      };
    } catch {
      /* The in-app alert below is always shown as a reliable fallback. */
    }
  }
  toast.warning(title, { description: body, duration: 15000 });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REMINDER_EVENT));
  }
}

export function testNotification() {
  const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  fire("Echo reminder", `Notifications are working — ${time}`, "echo-test");
}

/**
 * Browsers cannot reliably schedule background notifications from a web app.
 * Echo keeps an exact timer for every deadline while the app is open. It also
 * refreshes the schedule periodically so reminders created in another screen
 * are picked up, and always shows an in-app popup alongside native alerts.
 */
export function startReminderWatcher() {
  if (typeof window === "undefined") return () => {};
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const firing = new Set<string>();
  let stopped = false;

  const alertReminder = async (id: string) => {
    if (firing.has(id)) return;
    firing.add(id);
    try {
      const reminders = await listReminders();
      const reminder = reminders.find((item) => item.id === id);
      if (!reminder || reminder.done || reminder.notified || !reminder.deadline) return;
      // Long deadlines are woken early because timers are capped; only alert once it is actually due.
      if (Date.parse(reminder.deadline) - Date.now() > 1000) return;

      await putReminder({ ...reminder, notified: true });
      const exactTime = new Date(reminder.deadline).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      fire("Deadline now", `${reminder.title} • ${exactTime}`, reminder.id);
    } catch {
      /* storage unavailable */
    } finally {
      firing.delete(id);
    }
  };

  const schedule = async () => {
    try {
      const reminders = await listReminders();
      const activeIds = new Set(reminders.map((item) => item.id));
      for (const [id, timer] of timers) {
        if (!activeIds.has(id)) {
          clearTimeout(timer);
          timers.delete(id);
        }
      }

      for (const reminder of reminders) {
        if (reminder.done || reminder.notified || !reminder.deadline || timers.has(reminder.id)) continue;
        const due = Date.parse(reminder.deadline);
        if (Number.isNaN(due)) continue;
        const delay = Math.max(0, due - Date.now());
        const timer = setTimeout(() => {
          timers.delete(reminder.id);
          void alertReminder(reminder.id);
        }, Math.min(delay, 2_147_000_000));
        timers.set(reminder.id, timer);
      }
    } catch {
      /* storage unavailable */
    }
  };

  void schedule();
  const refreshId = setInterval(() => {
    if (!stopped) void schedule();
  }, 5000);
  const onChanged = () => {
    if (!stopped) void schedule();
  };
  window.addEventListener(REMINDERS_CHANGED, onChanged);

  return () => {
    stopped = true;
    clearInterval(refreshId);
    window.removeEventListener(REMINDERS_CHANGED, onChanged);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
