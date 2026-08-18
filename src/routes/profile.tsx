import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, LogOut, MessageSquare, Settings, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, ScreenHeader } from "@/components/echo/AppShell";
import { getProfile, listReminders, listSessions } from "@/lib/db";
import type { Profile } from "@/lib/types";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Echo Mind" },
      { name: "description", content: "Your local Echo Mind profile, learning streak and session stats." },
      { property: "og:title", content: "Profile — Echo Mind" },
      { property: "og:description", content: "Your local profile and learning stats." },
    ],
  }),
  component: ProfileScreen,
});

function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState({ sessions: 0, notes: 0, reminders: 0, days: 0 });

  useEffect(() => {
    getProfile().then((p) => setProfile(p ?? null)).catch(() => {});
    Promise.all([listSessions(), listReminders()])
      .then(([sessions, reminders]) => {
        const days = new Set(sessions.map((s) => new Date(s.createdAt).toDateString())).size;
        setStats({
          sessions: sessions.length,
          notes: sessions.filter((s) => (s.analysis?.notes.length ?? 0) > 0).length,
          reminders: reminders.length,
          days,
        });
      })
      .catch(() => {});
  }, []);

  return (
    <AppShell>
      <ScreenHeader
        title=""
        right={
          <Link to="/settings" aria-label="Settings" className="text-foreground">
            <Settings className="size-[18px]" strokeWidth={1.7} />
          </Link>
        }
      />

      <div className="flex flex-col items-center pb-6">
        <div className="size-[86px] overflow-hidden rounded-full border border-border bg-surface-2">
          {profile?.avatar ? (
            <img src={profile.avatar} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-2xl">
              {(profile?.name ?? "E").charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <p className="mt-4 text-[20px] font-semibold tracking-tight">{profile?.name ?? "Local user"}</p>
        <p className="mt-1 text-[12px] text-muted-foreground">Local profile</p>
      </div>

      <div className="card-echo grid grid-cols-2 divide-x divide-border">
        <div className="p-5">
          <p className="text-[11px] text-muted-foreground">Learning Streak</p>
          <p className="mt-2 text-[22px] font-semibold leading-none">🔥 {stats.days}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Days</p>
        </div>
        <div className="p-5">
          <p className="text-[11px] text-muted-foreground">Total Sessions</p>
          <p className="mt-2 text-[22px] font-semibold leading-none">{stats.sessions}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Notes Created {stats.notes}</p>
        </div>
      </div>

      <div className="mt-6 divide-y divide-border">
        <Link to="/points" className="flex items-center gap-3 py-4 text-[13px]">
          <Star className="size-[18px] text-amber-400" strokeWidth={1.7} /> My Achievements
          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
        </Link>
        <Link to="/notes" className="flex items-center gap-3 py-4 text-[13px]">
          <MessageSquare className="size-[18px] text-sky-400" strokeWidth={1.7} /> Feedback
          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
        </Link>
        <Link to="/setup" className="flex items-center gap-3 py-4 text-[13px]">
          <LogOut className="size-[18px] text-rose-400" strokeWidth={1.7} /> Log Out
          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
        </Link>
      </div>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
        Echo uses a local-first architecture. Learning history is stored on this device, while AI
        processing runs securely on the server.
      </p>
    </AppShell>
  );
}
