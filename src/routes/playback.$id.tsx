import { createFileRoute, useParams } from "@tanstack/react-router";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell, BackButton, ScreenHeader } from "@/components/echo/AppShell";
import { getSession } from "@/lib/db";
import { formatClock, formatDate } from "@/lib/format";
import type { Session } from "@/lib/types";

export const Route = createFileRoute("/playback/$id")({
  head: () => ({
    meta: [
      { title: "Playback — Echo Mind" },
      { name: "description", content: "Replay a recorded Echo Mind session with adjustable playback speed." },
      { property: "og:title", content: "Playback — Echo Mind" },
      { property: "og:description", content: "Replay your recorded session at your own pace." },
    ],
  }),
  component: PlaybackScreen,
});

function PlaybackScreen() {
  const { id } = useParams({ from: "/playback/$id" });
  const [session, setSession] = useState<Session | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    getSession(id).then((s) => setSession(s ?? null)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!session?.audio) return;
    const objectUrl = URL.createObjectURL(session.audio);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [session?.audio]);

  const total = dur > 0 && Number.isFinite(dur) ? dur : (session?.durationMs ?? 0) / 1000;

  return (
    <AppShell nav={false}>
      <ScreenHeader title="Playback" left={<BackButton to="/sessions" />} />

      {!session ? (
        <p className="text-sm text-muted-foreground">Loading session…</p>
      ) : (
        <div className="flex flex-1 flex-col">
          <p className="text-[17px] font-semibold tracking-tight">{session.title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(session.createdAt)}</p>

          {!url ? (
            <p className="card-echo mt-6 p-5 text-xs leading-relaxed text-muted-foreground">
              No audio is stored for this session, so there is nothing to play back.
            </p>
          ) : (
            <>
              <audio
                ref={audioRef}
                src={url}
                onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
                onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
                onEnded={() => setPlaying(false)}
              />

              <input
                type="range"
                min={0}
                max={total || 1}
                step={0.1}
                value={pos}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (audioRef.current) audioRef.current.currentTime = v;
                  setPos(v);
                }}
                aria-label="Seek"
                className="mt-8 w-full accent-[var(--primary)]"
              />
              <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                <span>{formatClock(pos * 1000)}</span>
                <span>{formatClock(total * 1000)}</span>
              </div>

              <div className="mt-10 flex items-center justify-center gap-10">
                <button
                  aria-label="Back 15 seconds"
                  onClick={() => audioRef.current && (audioRef.current.currentTime = Math.max(0, pos - 15))}
                  className="text-foreground"
                >
                  <RotateCcw className="size-7" strokeWidth={1.5} />
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
                  className="flex size-[74px] items-center justify-center rounded-full border border-border bg-surface"
                >
                  {playing ? <Pause className="size-8" strokeWidth={1.5} /> : <Play className="size-8" strokeWidth={1.5} />}
                </button>
                <button
                  aria-label="Forward 15 seconds"
                  onClick={() => audioRef.current && (audioRef.current.currentTime = pos + 15)}
                  className="text-foreground"
                >
                  <RotateCw className="size-7" strokeWidth={1.5} />
                </button>
              </div>

              <p className="mt-12 text-[13px] font-semibold tracking-tight">Playback Speed</p>
              <div className="mt-3 grid grid-cols-4 gap-3">
                {[0.75, 1, 1.25, 1.5].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSpeed(s);
                      if (audioRef.current) audioRef.current.playbackRate = s;
                    }}
                    className={`rounded-xl border border-border py-2.5 text-[12px] ${
                      speed === s ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
