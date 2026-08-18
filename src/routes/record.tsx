import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Mic, MoreVertical, Pause, Play, Save, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell, BackButton, ScreenHeader, Segmented } from "@/components/echo/AppShell";
import { Waveform } from "@/components/echo/Waveform";
import { analyzeTranscript } from "@/lib/ai.functions";
import { translateCaptions } from "@/lib/ai.functions";
import { getSettings, putReminder, putSession } from "@/lib/db";
import { formatClock } from "@/lib/format";
import { ensureNotificationPermission } from "@/lib/notifications";
import { toast } from "sonner";
import type { Analysis, NoteBlock, Session, TranscriptSegment } from "@/lib/types";
import { useRecorder } from "@/lib/useRecorder";

export const Route = createFileRoute("/record")({
  head: () => ({
    meta: [
      { title: "Live Recording — Echo" },
      {
        name: "description",
        content: "Record real speech and see real live captions and AI notes generated as you listen.",
      },
      { property: "og:title", content: "Live Recording — Echo" },
      { property: "og:description", content: "Real microphone, real captions, real notes." },
    ],
  }),
  component: RecordScreen,
});

const captionSizes = { sm: "text-sm", md: "text-base", lg: "text-lg", xl: "text-xl" } as const;

function mapImportantPoints(
  points: { text: string; quote?: string }[],
  segments: TranscriptSegment[],
) {
  return points.map((p) => {
    const q = (p.quote ?? "").trim().toLowerCase().slice(0, 24);
    const hit = q ? segments.find((s) => s.text.toLowerCase().includes(q)) : undefined;
    return hit ? { text: p.text, t: hit.t } : { text: p.text };
  });
}

function RecordScreen() {
  const navigate = useNavigate();
  const rec = useRecorder();
  const [tab, setTab] = useState<"captions" | "notes">("captions");
  const [lang, setLang] = useState<"en" | "hi" | "te">("en");
  const [translatedTranscript, setTranslatedTranscript] = useState("");
  const translationVersionRef = useRef(0);
  const [translating, setTranslating] = useState(false);
  const [liveNotes, setLiveNotes] = useState<NoteBlock[]>([]);
  const [liveNotesState, setLiveNotesState] = useState<"idle" | "processing" | "complete" | "error">("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [captionSize, setCaptionSize] = useState<keyof typeof captionSizes>("md");
  const [, setShowDiagnostics] = useState(true);
  const [, setGemini] = useState<"idle" | "connected" | "failed">("idle");
  const [, setTaskState] = useState<"detected" | "not detected">("not detected");
  const [, setReminderState] = useState<"created" | "not created">("not created");
  const lastLiveRef = useRef({ at: 0, len: 0 });
  const captionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setCaptionSize(s.captionSize);
        setShowDiagnostics(s.showDiagnostics);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    captionsRef.current?.scrollTo({ top: captionsRef.current.scrollHeight, behavior: "smooth" });
  }, [rec.segments.length, rec.interim]);

  // Translate only the RECENT captions (last 10 segments) — avoids hitting the 500-char API limit.
  useEffect(() => {
    if (lang === "en") {
      setTranslatedTranscript("");
      return;
    }
    // Take last 10 segments to keep translation fast and within API limits
    const recentSegments = rec.segments.slice(-10);
    const originalTranscript = recentSegments.map((s) => s.text).join(" ").trim();
    if (!originalTranscript) {
      setTranslatedTranscript("");
      return;
    }

    // Extra safety: cap at 450 chars (MyMemory limit is 500)
    const safeTranscript = originalTranscript.length > 450
      ? originalTranscript.slice(-450).replace(/^\S+\s/, "") // trim partial word from start
      : originalTranscript;

    setTranslating(true);
    const version = ++translationVersionRef.current;
    
    console.log(`[Translation] Queuing. Version: ${version}, Language: ${lang}, Length: ${safeTranscript.length}`);

    const timer = setTimeout(() => {
      translateCaptions({ data: { texts: [safeTranscript], language: lang } })
        .then((out) => {
          if (version !== translationVersionRef.current) return;
          const translatedText = out.texts[0] || "";
          setTranslatedTranscript(translatedText);
        })
        .catch((err: unknown) => {
          console.error(`[Translation] Failed for version ${version}:`, err);
          toast.error("Caption translation failed. Please try again.");
        })
        .finally(() => {
          if (version === translationVersionRef.current) {
            setTranslating(false);
          }
        });
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timer);
  }, [lang, rec.segments]);

  // Live notes from REAL transcript chunks only.
  useEffect(() => {
    if (rec.status !== "recording") return;
    const text = rec.transcript;
    const now = Date.now();
    if (text.length < 220) return;
    if (text.length - lastLiveRef.current.len < 200) return;
    if (now - lastLiveRef.current.at < 25000) return;
    lastLiveRef.current = { at: now, len: text.length };
    setLiveNotesState("processing");
    analyzeTranscript({ data: { transcript: text, mode: "live" } })
      .then((out) => {
        setGemini("connected");
        setLiveNotes(out.notes.filter((n) => n.bullets.length > 0));
        setLiveNotesState("complete");
        setAiError(null);
      })
      .catch((e: unknown) => {
        setGemini("failed");
        setLiveNotesState("error");
        setAiError(e instanceof Error ? e.message : "AI processing failed.");
      });
  }, [rec.transcript, rec.status]);

  const finish = useCallback(async () => {
    setSaving(true);
    // Ask while the Stop tap is still a fresh user gesture; browsers block this after long awaits.
    void ensureNotificationPermission();
    
    // Capture interim text BEFORE calling rec.stop() which clears it
    const interimText = rec.interim;
    console.log("Recording stopped. Remaining interim transcript text:", interimText);

    const { audio, durationMs, mimeType } = await rec.stop();
    let segments = [...rec.segments];
    if (interimText.trim().length > 0) {
      segments.push({ t: rec.elapsedMs, text: interimText.trim() });
    }

    const transcript = segments.map((s) => s.text).join(" ").trim();
    console.log("Final transcript length:", transcript.length);
    console.log("Final transcript preview:", transcript.slice(0, 100));

    const id = crypto.randomUUID();

    let analysis: Analysis | undefined;
    let analysisError: string | undefined;

    if (transcript.length > 0) {
      setLiveNotesState("processing");
      try {
        console.log("AI processing started with transcript length:", transcript.length);
        const out = await analyzeTranscript({ data: { transcript, mode: "final" } });
        analysis = {
          summary: out.summary,
          keyPoints: out.keyPoints,
          notes: out.notes,
          importantPoints: mapImportantPoints(out.importantPoints, segments),
          concepts: out.concepts,
          tasks: out.tasks,
          topic: out.topic,
        };
        setGemini("connected");
        setTaskState(out.tasks.length > 0 ? "detected" : "not detected");
      } catch (e) {
        setGemini("failed");
        analysisError = e instanceof Error ? e.message : "AI processing failed.";
        console.error("Gemini final analysis error:", analysisError);
        setAiError(analysisError);
      }
      setLiveNotesState("complete");
    } else {
      analysisError = "No speech was captured, so no AI analysis was generated.";
      console.log("No transcript available for Gemini analysis.");
    }

    const session: Session = {
      id,
      title: analysis?.topic?.trim() || `Session ${new Date().toLocaleDateString()}`,
      createdAt: Date.now(),
      durationMs,
      segments,
      transcript,
      sttEngine: rec.diag.engine,
      ...(audio ? { audio, audioType: mimeType } : {}),
      ...(analysis ? { analysis } : {}),
      ...(analysisError ? { analysisError } : {}),
    };

    try {
      await putSession(session);
      const tasks = analysis?.tasks ?? [];
      for (const task of tasks) {
        await putReminder({
          id: crypto.randomUUID(),
          sessionId: id,
          title: task.title,
          deadline: task.deadline,
          createdAt: Date.now(),
          done: false,
          notified: false,
        });
        setReminderState("created");
      }
      if (tasks.length > 0) {
        toast(`${tasks.length} reminder${tasks.length > 1 ? "s" : ""} created`, {
          description: tasks.map((t) => t.title).join(", "),
        });
      }
    } catch {
      setAiError("Could not save this session to local storage.");
      setSaving(false);
      return;
    }

    setSaving(false);
    navigate({ to: "/sessions/$id", params: { id } });
  }, [navigate, rec]);

  const idle = rec.status === "idle" || rec.status === "error";
  const active = rec.status === "recording";

  return (
    <AppShell nav={false}>
      <ScreenHeader
        title="Live Recording"
        {...(idle
          ? {}
          : {
              subtitle: (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-destructive" />
                  {formatClock(rec.elapsedMs)}
                </span>
              ),
            })}
        left={<BackButton />}
        right={
          <Link to="/settings" aria-label="Recording settings" className="text-foreground">
            <MoreVertical className="size-[18px]" strokeWidth={1.7} />
          </Link>
        }
      />

      {rec.error ? (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          {rec.error}
        </div>
      ) : null}

      {idle ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <button
            onClick={() => void rec.start()}
            className="relative flex size-32 items-center justify-center rounded-full border border-border bg-surface"
            aria-label="Start recording"
          >
            <span className="absolute inset-0 animate-pulse-ring rounded-full border border-white/25" />
            <Mic className="size-12" strokeWidth={1.4} />
          </button>
          <p className="mt-8 text-sm font-medium">Tap to start recording</p>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
            Echo will ask for microphone permission and transcribe your real speech. Nothing is
            generated unless you actually speak.
          </p>
          <p className="mt-4 text-[11px] text-muted-foreground">
            Speech engine:{" "}
            {rec.speechApiAvailable ? "on-device Web Speech API" : "cloud speech-to-text"}
          </p>
        </div>
      ) : (
        <>
          <Waveform levels={rec.levels} active={active} />

          <div className="mt-3">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "captions", label: "Live Captions" },
                { value: "notes", label: "Notes" },
              ]}
            />
          </div>

          {tab === "captions" ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Captions</span>
              <div className="flex gap-2">
                {([
                  { v: "en", label: "English" },
                  { v: "hi", label: "हिंदी" },
                  { v: "te", label: "తెలుగు" },
                ] as const).map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setLang(o.v)}
                    className={`rounded-full border border-border px-3 py-1 text-[11px] ${
                      lang === o.v ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {lang !== "en" && translating ? (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Translating…
                </span>
              ) : null}
            </div>
          ) : null}

          <div
            ref={captionsRef}
            className="card-echo mt-3 min-h-[220px] flex-1 overflow-y-auto p-4"
            aria-live="polite"
          >
            {tab === "captions" ? (
              rec.segments.length === 0 && !rec.interim ? (
                <p className="text-sm text-muted-foreground">Listening…</p>
              ) : (
                <div className={`space-y-3 ${captionSizes[captionSize]} leading-relaxed`}>
                  {lang === "en" ? (
                    <>
                      {rec.segments.map((s, i) => (
                        <p key={i}>
                          <span className="mr-2 text-[10px] text-muted-foreground">{formatClock(s.t)}</span>
                          {s.text}
                        </p>
                      ))}
                      {rec.interim ? <p className="text-muted-foreground">{rec.interim}</p> : null}
                    </>
                  ) : (
                    <>
                      <p>{translatedTranscript || (translating ? "Translating..." : "Waiting for speech...")}</p>
                      {rec.interim ? (
                        <p className="text-muted-foreground italic text-xs mt-2">
                          [New speech: {rec.interim}]
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              )
            ) : (
              <div className="space-y-4">
                {liveNotesState === "processing" ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Generating notes…
                  </p>
                ) : null}
                {aiError ? <p className="text-xs text-destructive">{aiError}</p> : null}
                {liveNotes.length === 0 && liveNotesState !== "processing" ? (
                  <p className="text-xs text-muted-foreground">
                    Notes appear once enough real speech has been transcribed.
                  </p>
                ) : null}
                {liveNotes.map((n, i) => (
                  <div key={i}>
                    <p className="text-sm font-medium">{n.heading}</p>
                    <ul className="mt-1 space-y-1">
                      {n.bullets.map((b, j) => (
                        <li key={j} className="text-xs leading-relaxed text-muted-foreground">
                          • {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-start justify-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => (active ? rec.pause() : rec.resume())}
                className="flex size-14 items-center justify-center rounded-full border border-border bg-surface"
                aria-label={active ? "Pause" : "Resume"}
              >
                {active ? <Pause className="size-5" strokeWidth={1.6} /> : <Play className="size-5" strokeWidth={1.6} />}
              </button>
              <span className="text-[10px] text-muted-foreground">{active ? "Pause" : "Resume"}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => void finish()}
                disabled={saving}
                className="flex size-[68px] items-center justify-center rounded-full border border-border bg-surface disabled:opacity-60"
                aria-label="Stop and save"
              >
                {saving ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : (
                  <Square className="size-6 fill-foreground text-foreground" strokeWidth={1} />
                )}
              </button>
              <span className="text-[10px] text-muted-foreground">Stop</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex size-14 items-center justify-center rounded-full border border-border bg-surface">
                <Save className="size-5" strokeWidth={1.6} />
              </div>
              <span className="text-[10px] text-muted-foreground">Auto save</span>
            </div>
          </div>
        </>
      )}

    </AppShell>
  );
}
