import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Brain, BookMarked, FileText, ListChecks, Mic, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/echo/AppShell";
import { getProfile, listSessions } from "@/lib/db";
import { formatClock, formatDate } from "@/lib/format";
import type { Profile, Session } from "@/lib/types";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Home — Echo Mind" },
      { name: "description", content: "Start a real recording and review your recent Echo Mind sessions." },
      { property: "og:title", content: "Home — Echo Mind" },
      { property: "og:description", content: "Start a real recording and review recent sessions." },
    ],
  }),
  component: HomeScreen,
});

const quickActions = [
  { to: "/notes", label: "My Notes", icon: FileText },
  { to: "/record", label: "Live Recording", icon: Mic },
  { to: "/sessions", label: "Smart Summaries", icon: Sparkles },
  { to: "/points", label: "Important Points", icon: ListChecks },
  { to: "/concepts", label: "Concepts Explorer", icon: Brain },
  { to: "/sessions", label: "My Library", icon: BookMarked },
] as const;

function HomeScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    getProfile().then((p) => setProfile(p ?? null)).catch(() => {});
    listSessions().then(setSessions).catch(() => {});
  }, []);

  return (
    <AppShell>
      <header className="flex items-center gap-3 py-5">
        <Link to="/profile" className="size-11 overflow-hidden rounded-full border border-border bg-surface-2">
          {profile?.avatar ? (
            <img src={profile.avatar} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-sm">
              {(profile?.name ?? "E").charAt(0).toUpperCase()}
            </span>
          )}
        </Link>
        <div className="flex-1">
          <p className="text-[15px] font-semibold tracking-tight">
            Hello, {profile?.name ?? "there"}! 👋
          </p>
          <p className="text-[11px] text-muted-foreground">Ready to learn today?</p>
        </div>
        <Link
          to="/reminders"
          aria-label="Reminders"
          className="flex size-10 items-center justify-center rounded-full text-foreground"
        >
          <Bell className="size-[22px]" strokeWidth={1.6} />
        </Link>
      </header>

      <Link to="/record" className="card-echo flex items-center gap-4 p-5" aria-label="Start recording">
        <div className="flex-1">
          <p className="text-[15px] font-semibold tracking-tight">Start Recording</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Record your lecture, meeting
            <br />
            or conversation
          </p>
        </div>
        <span className="flex size-14 items-center justify-center rounded-full border border-border bg-surface-2">
          <Mic className="size-6 text-primary" strokeWidth={1.8} />
        </span>
      </Link>

      <section className="mt-7">
        <h2 className="text-[13px] font-semibold tracking-tight">Quick Actions</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {quickActions.map(({ to, label, icon: Icon }) => (
            <Link
              key={label}
              to={to}
              className="card-echo flex h-[86px] flex-col items-start justify-center gap-2 px-3 text-left"
            >
              <Icon className="size-[18px] text-primary" strokeWidth={1.8} />
              <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold tracking-tight">Recent Sessions</h2>
          <Link to="/sessions" className="text-[11px] text-muted-foreground">
            See all
          </Link>
        </div>
        {sessions.length === 0 ? (
          <p className="card-echo mt-3 p-5 text-xs leading-relaxed text-muted-foreground">
            No sessions yet. Your recorded lectures will appear here.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sessions.slice(0, 3).map((s) => (
              <li key={s.id}>
                <Link to="/sessions/$id" params={{ id: s.id }} className="card-echo flex items-center gap-3 p-4">
                  <Sparkles className="size-4 text-primary" strokeWidth={1.8} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(s.createdAt)} · {formatClock(s.durationMs)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
