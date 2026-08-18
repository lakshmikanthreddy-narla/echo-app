import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, BackButton, ScreenHeader } from "@/components/echo/AppShell";
import {
  clearAllData,
  clearRecordings,
  getSettings,
  listSessions,
  putSettings,
  storageEstimate,
} from "@/lib/db";
import { notificationSupport, requestNotificationPermission } from "@/lib/notifications";
import type { AppSettings } from "@/lib/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Echo" },
      { name: "description", content: "Caption size, playback speed, notifications and local storage controls." },
      { property: "og:title", content: "Settings — Echo" },
      { property: "og:description", content: "Accessibility and storage settings for Echo." },
    ],
  }),
  component: SettingsScreen,
});

function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [usage, setUsage] = useState<string>("—");
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const refreshUsage = async () => {
    const est = await storageEstimate();
    const sessions = await listSessions().catch(() => []);
    const mb = est?.usage ? (est.usage / 1024 / 1024).toFixed(1) : "?";
    setUsage(`${sessions.length} sessions · ~${mb} MB used`);
  };

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {});
    void refreshUsage();
  }, []);

  const update = async (patch: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await putSettings(next);
  };

  if (!settings) {
    return (
      <AppShell>
        <ScreenHeader title="Settings" left={<BackButton to="/profile" />} />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ScreenHeader title="Settings" left={<BackButton to="/profile" />} />

      <section className="card-echo p-5">
        <p className="text-sm font-medium">Caption size</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {(["sm", "md", "lg", "xl"] as const).map((s) => (
            <button
              key={s}
              onClick={() => void update({ captionSize: s })}
              className={`rounded-lg py-2 text-xs uppercase ${
                settings.captionSize === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="card-echo mt-4 p-5">
        <p className="text-sm font-medium">Default playback speed</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[0.75, 1, 1.25, 1.5].map((s) => (
            <button
              key={s}
              onClick={() => void update({ playbackSpeed: s })}
              className={`rounded-lg py-2 text-xs ${
                settings.playbackSpeed === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-muted-foreground"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </section>

      <section className="card-echo mt-4 p-5">
        <p className="text-sm font-medium">Notifications</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Status: {notificationSupport()}. Web browsers can only deliver reminders while Echo is
          open; background scheduling is not reliably supported.
        </p>
        <button
          onClick={async () => {
            try {
              await requestNotificationPermission();
              await update({ notificationsEnabled: true });
              setMessage("Notifications enabled.");
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Notification permission denied.");
            }
          }}
          className="mt-3 rounded-full bg-secondary px-4 py-2 text-xs"
        >
          Request permission
        </button>
      </section>

      <section className="card-echo mt-4 p-5">
        <p className="text-sm font-medium">Developer diagnostics</p>
        <label className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={settings.showDiagnostics}
            onChange={(e) => void update({ showDiagnostics: e.target.checked })}
          />
          Show the diagnostics panel on the recording screen
        </label>
      </section>

      <section className="card-echo mt-4 p-5">
        <p className="text-sm font-medium">Storage</p>
        <p className="mt-1 text-xs text-muted-foreground">{usage}</p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={async () => {
              await clearRecordings();
              await refreshUsage();
              setMessage("All stored audio recordings were deleted.");
            }}
            className="rounded-full bg-surface-2 px-4 py-2 text-xs"
          >
            Delete all recordings
          </button>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="rounded-full border border-destructive/50 px-4 py-2 text-xs text-destructive"
            >
              Delete all local data
            </button>
          ) : (
            <div className="rounded-xl border border-destructive/50 p-3 text-xs">
              <p>This permanently deletes your profile, sessions, notes and reminders. Continue?</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={async () => {
                    await clearAllData();
                    setConfirming(false);
                    await refreshUsage();
                    setMessage("All local data deleted.");
                  }}
                  className="rounded-full bg-destructive px-4 py-2 text-destructive-foreground"
                >
                  Yes, delete everything
                </button>
                <button onClick={() => setConfirming(false)} className="rounded-full bg-surface-2 px-4 py-2">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {message ? <p className="mt-4 text-xs text-primary">{message}</p> : null}
    </AppShell>
  );
}
