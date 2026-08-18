import { createFileRoute, Link } from "@tanstack/react-router";
import { Play, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, EmptyState, ScreenHeader } from "@/components/echo/AppShell";
import { deleteSession, listSessions } from "@/lib/db";
import { formatClock, formatDate } from "@/lib/format";
import type { Session } from "@/lib/types";

export const Route = createFileRoute("/sessions/")({
  head: () => ({
    meta: [
      { title: "Sessions — Echo Mind" },
      { name: "description", content: "Every lecture you recorded with Echo, stored on your device." },
      { property: "og:title", content: "Sessions — Echo Mind" },
      { property: "og:description", content: "Your recorded lectures and transcripts." },
    ],
  }),
  component: SessionsScreen,
});

function SessionsScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [q, setQ] = useState("");

  const load = () => listSessions().then(setSessions).catch(() => {});
  useEffect(() => {
    void load();
  }, []);

  const filtered = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(q.toLowerCase()) ||
      s.transcript.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <AppShell>
      <ScreenHeader title="Sessions" />
      <label className="card-echo flex items-center gap-2 px-4 py-3">
        <Search className="size-4 text-muted-foreground" strokeWidth={1.7} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sessions..."
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
      </label>
      {filtered.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          hint="Record a lecture from the Home screen — your real transcript will be saved here."
        />
      ) : (
        <ul className="mt-4 space-y-3">
          {filtered.map((s) => (
            <li key={s.id} className="card-echo flex items-center gap-3 p-4">
              <Link to="/sessions/$id" params={{ id: s.id }} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(s.createdAt)} · {formatClock(s.durationMs)}
                  {s.audio ? " · audio saved" : ""}
                </p>
              </Link>
              <Link
                to="/playback/$id"
                params={{ id: s.id }}
                aria-label="Play session"
                className="text-muted-foreground hover:text-foreground"
              >
                <Play className="size-4" strokeWidth={1.7} />
              </Link>
              <button
                aria-label="Delete session"
                onClick={async () => {
                  await deleteSession(s.id);
                  void load();
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
