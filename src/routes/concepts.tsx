import { createFileRoute } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, BackButton, EmptyState, ScreenHeader } from "@/components/echo/AppShell";
import { listSessions } from "@/lib/db";
import type { Concept, Session } from "@/lib/types";

export const Route = createFileRoute("/concepts")({
  head: () => ({
    meta: [
      { title: "Concepts Explorer — Echo Mind" },
      { name: "description", content: "Explore concepts detected in your lectures with simple explanations and trusted links." },
      { property: "og:title", content: "Concepts Explorer — Echo Mind" },
      { property: "og:description", content: "Detected concepts with explanations and reference links." },
    ],
  }),
  component: ConceptsScreen,
});

function ConceptsScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Concept | null>(null);

  useEffect(() => {
    listSessions().then(setSessions).catch(() => {});
  }, []);

  const concepts = sessions.flatMap((s) => s.analysis?.concepts ?? []);
  const filtered = concepts.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <AppShell>
      <ScreenHeader title="Concepts Explorer" left={<BackButton />} />

      <label className="card-echo flex items-center gap-2 px-4 py-3">
        <Search className="size-4 text-muted-foreground" strokeWidth={1.7} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search concepts..."
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
      </label>

      {concepts.length === 0 ? (
        <EmptyState
          title="No concepts detected yet"
          hint="Concepts appear after Echo analyses a real recorded session."
        />
      ) : (
        <>
          <h2 className="mt-6 text-[13px] font-semibold tracking-tight">Detected Concepts</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {filtered.map((c) => (
              <button
                key={c.name}
                onClick={() => setOpen(c)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-[11px] text-foreground underline decoration-dotted underline-offset-4"
              >
                {c.name}
              </button>
            ))}
          </div>
        </>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-3"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(null)}
        >
          <div
            className="card-echo max-h-[80vh] w-full max-w-md overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold">{open.name}</p>
              <button aria-label="Close" onClick={() => setOpen(null)} className="text-muted-foreground">
                <X className="size-4" strokeWidth={1.8} />
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {open.simple || "No short explanation was generated for this keyword."}
            </p>
            {open.detailed ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{open.detailed}</p>
            ) : null}
            <button
              onClick={() => setOpen(null)}
              className="mt-5 w-full rounded-full bg-primary py-3 text-[13px] font-medium text-primary-foreground"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
