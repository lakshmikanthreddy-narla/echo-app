import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, BackButton, EmptyState, ScreenHeader } from "@/components/echo/AppShell";
import { listSessions } from "@/lib/db";
import { formatClock } from "@/lib/format";
import type { Session } from "@/lib/types";

export const Route = createFileRoute("/points")({
  head: () => ({
    meta: [
      { title: "Important Points — Echo Mind" },
      { name: "description", content: "Every important point Echo Mind extracted from your real lectures, with timestamps." },
      { property: "og:title", content: "Important Points — Echo Mind" },
      { property: "og:description", content: "Timestamped highlights from your recorded lectures." },
    ],
  }),
  component: PointsScreen,
});

function PointsScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [onlyTimed, setOnlyTimed] = useState(false);

  useEffect(() => {
    listSessions().then(setSessions).catch(() => {});
  }, []);

  const points = sessions.flatMap((s) =>
    (s.analysis?.importantPoints ?? []).map((p) => ({ ...p, session: s })),
  );
  const shown = onlyTimed ? points.filter((p) => p.t !== undefined) : points;

  return (
    <AppShell>
      <ScreenHeader
        title="Important Points"
        left={<BackButton />}
        right={
          <button
            aria-label="Filter"
            onClick={() => setOnlyTimed((v) => !v)}
            className={onlyTimed ? "text-foreground" : "text-muted-foreground"}
          >
            <SlidersHorizontal className="size-[18px]" strokeWidth={1.7} />
          </button>
        }
      />

      {shown.length === 0 ? (
        <EmptyState
          title="No important points yet"
          hint="Points are extracted only from speech Echo actually transcribes."
        />
      ) : (
        <ul className="mt-1 space-y-3">
          {shown.map((p, i) => (
            <li key={i} className="card-echo flex items-start gap-3 p-4">
              <Link to="/sessions/$id" params={{ id: p.session.id }} className="min-w-0 flex-1">
                <p className="text-[13px] leading-relaxed">{p.text}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {p.t !== undefined ? formatClock(p.t) : p.session.title}
                </p>
              </Link>
              <Bookmark className="mt-0.5 size-[18px] text-muted-foreground" strokeWidth={1.6} />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
