import { openDB, type IDBPDatabase } from "idb";
import type { AppSettings, Profile, Reminder, Session } from "./types";

const DB_NAME = "echo-db";
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this browser.");
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("reminders")) {
          db.createObjectStore("reminders", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv");
        }
      },
    });
  }
  return dbPromise;
}

export const defaultSettings: AppSettings = {
  captionSize: "md",
  playbackSpeed: 1,
  notificationsEnabled: false,
  showDiagnostics: true,
};

/** Fired whenever a reminder is created, updated or deleted, so open screens and the watcher refresh instantly. */
export const REMINDERS_CHANGED = "echo:reminders-changed";

function notifyRemindersChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(REMINDERS_CHANGED));
}

export async function listSessions(): Promise<Session[]> {
  const db = await getDB();
  const all = (await db.getAll("sessions")) as Session[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDB();
  return (await db.get("sessions", id)) as Session | undefined;
}

export async function putSession(session: Session) {
  const db = await getDB();
  await db.put("sessions", session);
}

export async function deleteSession(id: string) {
  const db = await getDB();
  await db.delete("sessions", id);
  const reminders = await listReminders();
  await Promise.all(reminders.filter((r) => r.sessionId === id).map((r) => deleteReminder(r.id)));
}

export async function listReminders(): Promise<Reminder[]> {
  const db = await getDB();
  const all = (await db.getAll("reminders")) as Reminder[];
  return all.sort((a, b) => {
    const at = a.deadline ? Date.parse(a.deadline) : Number.MAX_SAFE_INTEGER;
    const bt = b.deadline ? Date.parse(b.deadline) : Number.MAX_SAFE_INTEGER;
    return at - bt;
  });
}

export async function putReminder(reminder: Reminder) {
  const db = await getDB();
  await db.put("reminders", reminder);
  notifyRemindersChanged();
}

export async function deleteReminder(id: string) {
  const db = await getDB();
  await db.delete("reminders", id);
  notifyRemindersChanged();
}

export async function getProfile(): Promise<Profile | undefined> {
  const db = await getDB();
  return (await db.get("kv", "profile")) as Profile | undefined;
}

export async function putProfile(profile: Profile) {
  const db = await getDB();
  await db.put("kv", profile, "profile");
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB();
  const stored = (await db.get("kv", "settings")) as Partial<AppSettings> | undefined;
  return { ...defaultSettings, ...(stored ?? {}) };
}

export async function putSettings(settings: AppSettings) {
  const db = await getDB();
  await db.put("kv", settings, "settings");
}

export async function clearAllData() {
  const db = await getDB();
  await db.clear("sessions");
  await db.clear("reminders");
  await db.clear("kv");
}

export async function clearRecordings() {
  const sessions = await listSessions();
  for (const s of sessions) {
    if (s.audio) {
      delete s.audio;
      delete s.audioType;
      await putSession(s);
    }
  }
}

export async function storageEstimate() {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}
