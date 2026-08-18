import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, BellRing, Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, EmptyState, ScreenHeader, Segmented } from "@/components/echo/AppShell";
import { REMINDERS_CHANGED, deleteReminder, listReminders, putReminder } from "@/lib/db";
import { formatDeadline } from "@/lib/format";
import {
  REMINDER_EVENT,
  requestNotificationPermission,
} from "@/lib/notifications";
import type { Reminder } from "@/lib/types";

export const Route = createFileRoute("/reminders")({
  head: () => ({
    meta: [
      { title: "Smart Reminders — Echo Mind" },
      { name: "description", content: "Tasks and deadlines Echo Mind detected in your real lectures." },
      { property: "og:title", content: "Smart Reminders — Echo Mind" },
      { property: "og:description", content: "Deadlines detected from real speech." },
    ],
  }),
  component: RemindersScreen,
});

function RemindersScreen() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [tab, setTab] = useState<"upcoming" | "completed">("upcoming");
  const [, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");

  const load = () => listReminders().then(setReminders).catch(() => {});
  useEffect(() => {
    void load();
    void requestNotificationPermission().catch(() => {});
    const onFired = () => void load();
    window.addEventListener(REMINDER_EVENT, onFired);
    window.addEventListener(REMINDERS_CHANGED, onFired);
    document.addEventListener("visibilitychange", onFired);
    const id = setInterval(() => void load(), 15000);
    return () => {
      window.removeEventListener(REMINDER_EVENT, onFired);
      window.removeEventListener(REMINDERS_CHANGED, onFired);
      document.removeEventListener("visibilitychange", onFired);
      clearInterval(id);
    };
  }, []);

  const shown = reminders.filter((r) => (tab === "upcoming" ? !r.done : r.done));

  return (
    <AppShell>
      <ScreenHeader title="Smart Reminders" />

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "upcoming", label: "Upcoming" },
          { value: "completed", label: "Completed" },
        ]}
      />

      {shown.length === 0 ? (
        <EmptyState
          title={tab === "upcoming" ? "No reminders" : "Nothing completed yet"}
          hint="Echo creates a reminder when a task or deadline is actually spoken during a recording."
        />
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((r) => (
            <li key={r.id} className="card-echo flex items-start gap-3 p-4">
              <Bell className="mt-0.5 size-[18px] text-foreground" strokeWidth={1.6} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{r.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDeadline(r.deadline)}</p>
                {r.notified && !r.done ? (
                  <p className="mt-0.5 text-[10px] text-foreground">Alerted</p>
                ) : null}
                {r.sessionId ? (
                  <Link
                    to="/sessions/$id"
                    params={{ id: r.sessionId }}
                    className="mt-1 inline-block text-[11px] text-muted-foreground underline"
                  >
                    Open session
                  </Link>
                ) : null}
              </div>
              <button
                aria-label="Toggle complete"
                onClick={async () => {
                  await putReminder({ ...r, done: !r.done });
                  void load();
                }}
                className={r.done ? "text-foreground" : "text-muted-foreground"}
              >
                {r.done ? <Check className="size-4" /> : <BellRing className="size-4" strokeWidth={1.6} />}
              </button>
              <button
                aria-label="Delete reminder"
                onClick={async () => {
                  await deleteReminder(r.id);
                  void load();
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" strokeWidth={1.6} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="card-echo mt-4 space-y-3 p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Reminder title"
            className="w-full rounded-xl border border-input bg-surface-2 px-4 py-3 text-[13px] outline-none"
          />
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full rounded-xl border border-input bg-surface-2 px-4 py-3 text-[13px] outline-none"
          />
          <div className="flex gap-3">
            <button
              onClick={async () => {
                if (!title.trim()) return;
                await putReminder({
                  id: crypto.randomUUID(),
                  sessionId: "",
                  title: title.trim(),
                  deadline: when ? new Date(when).toISOString() : null,
                  createdAt: Date.now(),
                  done: false,
                  notified: false,
                });
                setTitle("");
                setWhen("");
                setAdding(false);
                void load();
              }}
              className="flex-1 rounded-full bg-primary py-3 text-[13px] font-medium text-primary-foreground"
            >
              Save
            </button>
            <button
              onClick={() => setAdding(false)}
              className="flex-1 rounded-full border border-border py-3 text-[13px]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="card-echo mt-5 flex w-full items-center justify-center gap-2 py-4 text-[13px] font-medium"
        >
          <Plus className="size-4" strokeWidth={2} /> Add Reminder
        </button>
      )}
    </AppShell>
  );
}
