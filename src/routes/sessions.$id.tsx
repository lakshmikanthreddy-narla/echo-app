import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Download, Loader2, Play, Pause, RotateCcw, RotateCw, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, BackButton, ScreenHeader } from "@/components/echo/AppShell";
import { ConceptProvider, KeywordText } from "@/components/echo/KeywordText";
import { analyzeTranscript } from "@/lib/ai.functions";
import { getSession, putReminder, putSession } from "@/lib/db";
import { formatClock, formatDate, formatDeadline } from "@/lib/format";
import { toast } from "sonner";
import type { Session } from "@/lib/types";

export const Route = createFileRoute("/sessions/$id")({
  head: () => ({
    meta: [
      { title: "Session — Echo" },
      { name: "description", content: "Summary, notes, important points, concepts and playback for a real recorded session." },
      { property: "og:title", content: "Session — Echo" },
      { property: "og:description", content: "Summary, notes, concepts and playback." },
    ],
  }),
  component: SessionDetail,
});

const tabs = ["summary", "concepts", "transcript", "playback"] as const;
type Tab = (typeof tabs)[number];
const tabLabels: Record<Tab, string> = {
  summary: "Summary",
  concepts: "Concepts",
  transcript: "Transcript",
  playback: "Playback",
};

function extFor(type?: string) {
  const base = (type ?? "audio/webm").split(";")[0];
  return (
    ({ "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" } as Record<
      string,
      string
    >)[base ?? ""] ?? "webm"
  );
}

function ShareRecording({ session }: { session: Session }) {
  const [busy, setBusy] = useState(false);

  const fileName = `${session.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "echo-recording"}.${extFor(
    session.audioType,
  )}`;

  const download = () => {
    if (!session.audio) return;
    const url = URL.createObjectURL(session.audio);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const share = async () => {
    if (!session.audio) return;
    setBusy(true);
    const type = session.audioType || session.audio.type || "audio/webm";
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    let shared = false;
    try {
      const file = new File([session.audio], fileName, { type });
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({ files: [file], title: session.title });
        shared = true;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setBusy(false);
        return;
      }
    }
    if (!shared) {
      // Try sharing a link/text (works in more browsers), otherwise download the file.
      try {
        if (nav.share) {
          await nav.share({
            title: session.title,
            text: `Recording from Echo — ${session.title}`,
          });
          shared = true;
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setBusy(false);
          return;
        }
      }
    }
    if (!shared) {
      download();
      toast("Recording downloaded", {
        description: "This browser can't share files directly — attach the downloaded file in WhatsApp or any app.",
      });
    }
    setBusy(false);
  };

  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <button
        onClick={() => void share()}
        disabled={busy}
        className="card-echo flex items-center justify-center gap-2 py-4 text-[13px] font-medium disabled:opacity-60"
      >
        <Share2 className="size-4" strokeWidth={1.7} /> Share
      </button>
      <button
        onClick={download}
        className="card-echo flex items-center justify-center gap-2 py-4 text-[13px] font-medium"
      >
        <Download className="size-4" strokeWidth={1.7} /> Download
      </button>
    </div>
  );
}

function Player({ session }: { session: Session }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!session.audio) return;
    const objectUrl = URL.createObjectURL(session.audio);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [session.audio]);

  if (!session.audio || !url) {
    return (
      <p className="card-echo p-5 text-xs text-muted-foreground">
        No audio recording is stored for this session. Your browser may not support MediaRecorder, or
        the recording was deleted from storage.
      </p>
    );
  }

  const seekable = Number.isFinite(dur) && dur > 0;

  return (
    <div className="card-echo p-5">
      <audio
        ref={audioRef}
        src={url}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      />
      <p className="text-sm font-medium">{session.title}</p>
      <p className="text-[11px] text-muted-foreground">{formatDate(session.createdAt)}</p>

      <input
        type="range"
        min={0}
        max={seekable ? dur : session.durationMs / 1000}
        step={0.1}
        value={pos}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (audioRef.current) audioRef.current.currentTime = v;
          setPos(v);
        }}
        className="mt-5 w-full accent-[var(--primary)]"
        aria-label="Seek"
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{formatClock(pos * 1000)}</span>
        <span>{formatClock((seekable ? dur : session.durationMs / 1000) * 1000)}</span>
      </div>

      <div className="mt-4 flex items-center justify-center gap-8">
        <button
          aria-label="Back 15 seconds"
          onClick={() => audioRef.current && (audioRef.current.currentTime = Math.max(0, pos - 15))}
        >
          <RotateCcw className="size-6 text-muted-foreground" />
        </button>
        <button
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (!audioRef.current) return;
            if (playing) {
              audioRef.current.pause();
              setPlaying(false);
            } else {
              audioRef.current.playbackRate = speed;
              void audioRef.current.play();
              setPlaying(true);
            }
          }}
          className="flex size-16 items-center justify-center rounded-full border border-border bg-surface"
        >
          {playing ? (
            <Pause className="size-7" strokeWidth={1.5} />
          ) : (
            <Play className="size-7" strokeWidth={1.5} />
          )}
        </button>
        <button
          aria-label="Forward 15 seconds"
          onClick={() => audioRef.current && (audioRef.current.currentTime = pos + 15)}
        >
          <RotateCw className="size-6 text-muted-foreground" />
        </button>
      </div>

      <p className="mt-6 text-xs font-medium">Playback Speed</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[0.75, 1, 1.25, 1.5].map((s) => (
          <button
            key={s}
            onClick={() => {
              setSpeed(s);
              if (audioRef.current) audioRef.current.playbackRate = s;
            }}
            className={`rounded-lg py-2 text-xs ${
              speed === s ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}

function SessionDetail() {
  const { id } = useParams({ from: "/sessions/$id" });
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSession(id)
      .then((s) => setSession(s ?? null))
      .catch(() => setError("Could not read local storage."));
  }, [id]);

  const analysis = session?.analysis;

  const retry = async () => {
    if (!session || !session.transcript) return;
    setRetrying(true);
    setError(null);
    try {
      const out = await analyzeTranscript({ data: { transcript: session.transcript, mode: "final" } });
      const updated: Session = {
        ...session,
        title: out.topic?.trim() || session.title,
        analysis: {
          summary: out.summary,
          keyPoints: out.keyPoints,
          notes: out.notes,
          importantPoints: out.importantPoints.map((p) => {
            const q = (p.quote ?? "").trim().toLowerCase().slice(0, 24);
            const hit = q ? session.segments.find((s) => s.text.toLowerCase().includes(q)) : undefined;
            return hit ? { text: p.text, t: hit.t } : { text: p.text };
          }),
          concepts: out.concepts,
          tasks: out.tasks,
          topic: out.topic,
        },
      };
      delete updated.analysisError;
      await putSession(updated);
      for (const task of out.tasks) {
        await putReminder({
          id: crypto.randomUUID(),
          sessionId: session.id,
          title: task.title,
          deadline: task.deadline,
          createdAt: Date.now(),
          done: false,
          notified: false,
        });
      }
      setSession(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI processing failed.");
    }
    setRetrying(false);
  };

  const transcriptText = useMemo(() => session?.transcript ?? "", [session]);

  if (!session) {
    return (
      <AppShell>
        <ScreenHeader title="Session" left={<BackButton to="/sessions" />} />
        <p className="text-sm text-muted-foreground">{error ?? "Loading session…"}</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
     <ConceptProvider concepts={analysis?.concepts ?? []}>
      <ScreenHeader
        title={session.title}
        subtitle={`${formatDate(session.createdAt)} · ${formatClock(session.durationMs)}`}
        left={<BackButton to="/sessions" />}
      />

      <div className="-mx-5 overflow-x-auto px-5 pb-1">
        <div className="flex w-max gap-1 rounded-full border border-border bg-surface p-1 text-xs">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-2 font-medium ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>
      </div>

      {session.analysisError ? (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
          {session.analysisError}
          {session.transcript ? (
            <button
              onClick={() => void retry()}
              disabled={retrying}
              className="mt-3 flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-foreground"
            >
              {retrying ? <Loader2 className="size-3 animate-spin" /> : null} Retry AI processing
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}

      <div className="mt-4 space-y-4 pb-4">
        {tab === "summary" ? (
          <>
            <div className="card-echo p-5">
              <p className="text-sm font-medium">AI Summary ✨</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                <KeywordText text={analysis?.summary || "No summary — nothing was transcribed for this session."} />
              </p>
              {analysis?.concepts.length ? (
                <p className="mt-3 text-[10px] text-muted-foreground">
                  Tap any underlined keyword to see what it means.
                </p>
              ) : null}
            </div>
            {analysis?.notes.length ? (
              <div className="card-echo p-5">
                <p className="text-sm font-medium">AI Notes</p>
                {analysis.notes.map((n, i) => (
                  <div key={i} className="mt-3">
                    <p className="text-xs font-semibold">{n.heading}</p>
                    <ul className="mt-1 space-y-1">
                      {n.bullets.map((b, j) => (
                        <li key={j} className="text-xs leading-relaxed text-muted-foreground">
                          • <KeywordText text={b} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
            <Link
              to="/notes"
              className="card-echo flex w-full items-center justify-center py-4 text-[13px] font-medium"
            >
              Save to My Notes
            </Link>
            {analysis?.tasks.length ? (
              <div className="card-echo p-5">
                <p className="text-sm font-medium">Detected tasks & deadlines</p>
                <ul className="mt-2 space-y-2">
                  {analysis.tasks.map((t, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      <span className="text-foreground">{t.title}</span> — {formatDeadline(t.deadline)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "concepts" ? (
          analysis?.concepts.length ? (
            analysis.concepts.map((c, i) => (
              <div key={i} className="card-echo p-5">
                <p className="text-sm font-semibold">{c.name}</p>
                {c.detailed ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Detailed explanation</summary>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.detailed}</p>
                  </details>
                ) : null}
              </div>
            ))
          ) : (
            <p className="card-echo p-5 text-xs text-muted-foreground">
              No concepts were detected in this transcript.
            </p>
          )
        ) : null}

        {tab === "transcript" ? (
          <div className="card-echo p-5">
            {session.segments.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No speech was captured during this session.
              </p>
            ) : (
              <div className="space-y-3">
                {session.segments.map((s, i) => (
                  <p key={i} className="text-sm leading-relaxed">
                    <span className="mr-2 text-[10px] text-muted-foreground">{formatClock(s.t)}</span>
                    <KeywordText text={s.text} />
                  </p>
                ))}
              </div>
            )}
            <p className="mt-4 text-[10px] text-muted-foreground">
              {transcriptText.length} characters · engine: {session.sttEngine}
            </p>
          </div>
        ) : null}

        {tab === "playback" ? (
          <>
            <Player session={session} />
            {session.audio ? <ShareRecording session={session} /> : null}
          </>
        ) : null}
      </div>
     </ConceptProvider>
    </AppShell>
  );
}
