import { X } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Concept } from "@/lib/types";

type Ctx = { concepts: Concept[]; open: (c: Concept) => void };
const ConceptCtx = createContext<Ctx>({ concepts: [], open: () => {} });

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wraps a screen so any <KeywordText> inside can open the concept meaning sheet. */
export function ConceptProvider({
  concepts,
  children,
}: {
  concepts: Concept[];
  children: ReactNode;
}) {
  const [active, setActive] = useState<Concept | null>(null);
  const value = useMemo<Ctx>(() => ({ concepts, open: setActive }), [concepts]);

  return (
    <ConceptCtx.Provider value={value}>
      {children}
      {active ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-3"
          role="dialog"
          aria-modal="true"
          onClick={() => setActive(null)}
        >
          <div
            className="card-echo max-h-[80vh] w-full max-w-md overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold">{active.name}</p>
              <button aria-label="Close" onClick={() => setActive(null)} className="text-muted-foreground">
                <X className="size-4" strokeWidth={1.8} />
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {active.simple || "No short explanation was generated for this keyword."}
            </p>
            {active.detailed ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{active.detailed}</p>
            ) : null}
            <button
              onClick={() => setActive(null)}
              className="mt-5 w-full rounded-full bg-primary py-3 text-[13px] font-medium text-primary-foreground"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </ConceptCtx.Provider>
  );
}

/** Renders text with any detected concept/keyword turned into a tappable link. */
export function KeywordText({ text, className }: { text: string; className?: string }) {
  const { concepts, open } = useContext(ConceptCtx);

  const parts = useMemo(() => {
    if (!text) return [] as Array<{ text: string; concept?: Concept }>;
    const named = concepts.filter((c) => c.name.trim().length > 2);
    if (named.length === 0) return [{ text }];
    const sorted = [...named].sort((a, b) => b.name.length - a.name.length);
    const re = new RegExp(`\\b(${sorted.map((c) => escapeRe(c.name)).join("|")})\\b`, "gi");
    const out: Array<{ text: string; concept?: Concept }> = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      const i = m.index ?? 0;
      if (i > last) out.push({ text: text.slice(last, i) });
      const hit = sorted.find((c) => c.name.toLowerCase() === m[0].toLowerCase());
      out.push(hit ? { text: m[0], concept: hit } : { text: m[0] });
      last = i + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  }, [text, concepts]);

  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.concept ? (
          <button
            key={i}
            type="button"
            onClick={() => open(p.concept!)}
            className="text-foreground underline decoration-dotted underline-offset-4"
          >
            {p.text}
          </button>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}
