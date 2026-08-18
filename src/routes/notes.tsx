import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, EmptyState, ScreenHeader } from "@/components/echo/AppShell";
import { deleteSession, listSessions } from "@/lib/db";
import { formatDate } from "@/lib/format";
import type { Session } from "@/lib/types";

export const Route = createFileRoute("/notes")({
  head: () => ({
    meta: [
      { title: "My Notes — Echo Mind" },
      { name: "description", content: "AI notes generated from your real recorded lectures." },
      { property: "og:title", content: "My Notes — Echo Mind" },
      { property: "og:description", content: "AI notes from your real lectures." },
    ],
  }),
  component: NotesScreen,
});

function NotesScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [q, setQ] = useState("");
  const [onlyAnalysed, setOnlyAnalysed] = useState(false);

  const load = () => listSessions().then(setSessions).catch(() => {});
  useEffect(() => {
    void load();
  }, []);

  const base = onlyAnalysed ? sessions.filter((s) => (s.analysis?.notes?.length ?? 0) > 0) : sessions;
  const filtered = base.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <AppShell>
      <ScreenHeader
        title="My Notes"
        right={
          <button
            aria-label="Filter"
            onClick={() => setOnlyAnalysed((v) => !v)}
            className={onlyAnalysed ? "text-foreground" : "text-muted-foreground"}
          >
            <SlidersHorizontal className="size-[18px]" strokeWidth={1.7} />
          </button>
        }
      />

      <label className="card-echo flex items-center gap-2 px-4 py-3">
        <Search className="size-4 text-muted-foreground" strokeWidth={1.7} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes..."
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
      </label>

      {filtered.length === 0 ? (
        <EmptyState
          title="No notes yet"
          hint="Notes are created only from speech Echo actually transcribes."
        />
      ) : (
        <ul className="mt-4 space-y-3">
          {filtered.map((s) => (
            <li key={s.id} className="card-echo flex items-center gap-3 p-4">
              <Link to="/sessions/$id" params={{ id: s.id }} className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{s.title}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {formatDate(s.createdAt)} · {s.analysis?.notes.length ?? 0} sections ·{" "}
                  {s.analysis?.concepts.length ?? 0} concepts
                </p>
              </Link>
              {s.analysis ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                  AI
                </span>
              ) : null}
              <button
                aria-label="Delete"
                onClick={async () => {
                  await deleteSession(s.id);
                  void load();
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" strokeWidth={1.7} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Link
        to="/record"
        aria-label="New recording"
        className="fixed bottom-28 left-1/2 z-30 ml-[130px] flex size-12 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <Mic className="size-5" strokeWidth={2} />
      </Link>
    </AppShell>
  );
}
