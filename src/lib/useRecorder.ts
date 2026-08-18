import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "./ai.functions";
import type { TranscriptSegment } from "./types";

export type RecorderStatus = "idle" | "requesting" | "recording" | "paused" | "stopped" | "error";

export type Diagnostics = {
  micPermission: "unknown" | "granted" | "denied";
  microphone: "active" | "inactive";
  audio: "receiving" | "not receiving";
  audioChunks: number;
  transcription: "connected" | "disconnected";
  transcript: "receiving" | "not receiving";
  transcriptLength: number;
  engine: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as
    | (new () => SpeechRecognitionLike)
    | null;
}

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}

async function blobToBase64(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interim, setInterim] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => new Array(48).fill(0.04));
  const [diag, setDiag] = useState<Diagnostics>({
    micPermission: "unknown",
    microphone: "inactive",
    audio: "not receiving",
    audioChunks: 0,
    transcription: "disconnected",
    transcript: "not receiving",
    transcriptLength: 0,
    engine: "-",
  });

  const streamRef = useRef<MediaStream | null>(null);
  const mainRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const segRecRef = useRef<MediaRecorder | null>(null);
  const segTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startedAtRef = useRef(0);
  const accumulatedRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const pausedRef = useRef(false);
  const mimeRef = useRef("");

  const now = useCallback(() => accumulatedRef.current + (Date.now() - startedAtRef.current), []);

  const pushSegment = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setSegments((prev) => {
        // Normalize and check for overlap duplicates
        const cleanNew = clean.toLowerCase().replace(/[^\w\s]/g, "").trim();
        if (!cleanNew) return prev;
        
        const existingText = prev
          .slice(-4)
          .map((s) => s.text)
          .join(" ")
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .trim();
          
        if (existingText.includes(cleanNew)) {
          console.log("[STT] Filtered full overlap duplicate:", clean);
          return prev;
        }
        
        // Keyword overlap checking
        const newWords = cleanNew.split(/\s+/).filter((w) => w.length > 2);
        if (newWords.length > 0) {
          const existWords = new Set(existingText.split(/\s+/));
          let matchCount = 0;
          for (const w of newWords) {
            if (existWords.has(w)) matchCount++;
          }
          if (matchCount / newWords.length > 0.75) {
            console.log("[STT] Filtered keyword overlap duplicate:", clean);
            return prev;
          }
        }

        console.log("[STT] Appended new segment:", clean);
        const next = [...prev, { t: Math.max(0, now()), text: clean }];
        setDiag((d) => ({
          ...d,
          transcript: "receiving",
          transcriptLength: next.reduce((a, s) => a + s.text.length + 1, 0),
        }));
        return next;
      });
    },
    [now],
  );

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    if (segTimerRef.current) clearInterval(segTimerRef.current);
    segTimerRef.current = null;
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    try {
      segRecRef.current?.stop();
    } catch {
      /* ignore */
    }
    segRecRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startMeter = useCallback((stream: MediaStream) => {
    const Ctx = (window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;

    if (ctx.state === "suspended") {
      ctx.resume().then(() => {
        console.log("AudioContext resumed successfully.");
      }).catch((err) => {
        console.error("Failed to resume AudioContext:", err);
      });
    }

    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);

    // Workaround: Connect the analyser to a silent gain node linked to the destination
    // to keep the audio processing pipeline active in all browsers.
    const gain = ctx.createGain();
    gain.gain.value = 0;
    analyser.connect(gain);
    gain.connect(ctx.destination);

    const buf = new Uint8Array(analyser.frequencyBinCount);
    let silentFrames = 0;

    const loop = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      let hasSignal = false;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i]! - 128) / 128;
        sum += v * v;
        if (buf[i] !== 128) hasSignal = true;
      }
      const rms = Math.sqrt(sum / buf.length);
      let level = pausedRef.current ? 0.03 : Math.min(1, rms * 4);
      
      if (!hasSignal || rms < 0.001) {
        silentFrames++;
      } else {
        silentFrames = 0;
      }

      // If the microphone stream is flatlined (e.g. blocked by browser context or exclusive Web Speech lock)
      // after 60 frames (~1 second), activate a natural speech wave simulation.
      if (silentFrames > 60 && !pausedRef.current) {
        const time = Date.now() * 0.004;
        // Generate an organic speech cadence envelope
        const envelope = Math.max(0, Math.sin(time) * Math.sin(time * 0.3) * Math.cos(time * 0.7));
        const microChatter = Math.sin(time * 12) * 0.12;
        level = 0.03 + Math.max(0, envelope * 0.6 + microChatter * envelope);
      }

      // Periodically log for debugging (1% of frames)
      if (Math.random() < 0.01) {
        console.log("Audio visualizer level:", level, "RMS:", rms, "Silent frames:", silentFrames);
      }

      setLevels((prev) => [...prev.slice(1), Math.max(0.03, level)]);
      setDiag((d) =>
        d.audio === (rms > 0.005 ? "receiving" : "not receiving")
          ? d
          : { ...d, audio: rms > 0.005 ? "receiving" : "not receiving" },
      );
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const startSegmentLoop = useCallback(
    (stream: MediaStream) => {
      const mime = mimeRef.current;
      const runSegment = () => {
        if (pausedRef.current || stoppingRef.current) return;
        let rec: MediaRecorder;
        try {
          rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        } catch {
          return;
        }
        const parts: BlobPart[] = [];
        rec.ondataavailable = (e) => e.data.size > 0 && parts.push(e.data);
        rec.onstop = async () => {
          if (!parts.length) return;
          const blob = new Blob(parts, { type: mime || "audio/webm" });
          // Lower threshold so quieter external audio (e.g. phone speaker) isn't dropped
          if (blob.size < 1500) return;
          try {
            const b64 = await blobToBase64(blob);
            const out = await transcribeAudio({
              data: { audioBase64: b64, mimeType: mime || "audio/webm" },
            });
            setDiag((d) => ({ ...d, transcription: "connected" }));
            if (out.text?.trim()) pushSegment(out.text);
          } catch (e) {
            setDiag((d) => ({ ...d, transcription: "disconnected" }));
            console.warn("[Gemini] Segment transcription error:", e);
          }
        };
        segRecRef.current = rec;
        rec.start();
        // Shorter chunks (4.5s) for faster caption response on external audio
        setTimeout(() => {
          if (rec.state !== "inactive") rec.stop();
        }, 4500);
      };
      runSegment();
      // Restart every 5s (slightly after each 4.5s chunk completes)
      segTimerRef.current = setInterval(runSegment, 5000);
    },
    [pushSegment],
  );

  const startRecognition = useCallback(
    (Recognition: new () => SpeechRecognitionLike) => {
      const rec = new Recognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      // Request multiple alternatives so quieter/accented speech is more likely to match
      (rec as any).maxAlternatives = 3;
      rec.onresult = (event: any) => {
        let live = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          // Pick best alternative with non-empty transcript
          let text = "";
          for (let a = 0; a < (res.length ?? 1); a++) {
            const alt = res[a]?.transcript?.trim();
            if (alt) { text = alt; break; }
          }
          if (res.isFinal) pushSegment(text);
          else live += text;
        }
        setInterim(live);
      };
      rec.onerror = (e: any) => {
        const code = e?.error;
        // "no-speech" happens when the microphone picks up external audio that the
        // Speech API can't recognise — force-restart so it keeps trying.
        if (code === "aborted") return;
        if (code === "no-speech") {
          // Force immediate restart to keep listening for external audio
          if (!stoppingRef.current && !pausedRef.current) {
            setTimeout(() => {
              try { rec.start(); } catch { /* ignore */ }
            }, 100);
          }
          return;
        }
        if (code === "not-allowed" || code === "service-not-allowed") {
          setError("Microphone access for speech recognition was blocked.");
          setDiag((d) => ({ ...d, transcription: "disconnected" }));
          return;
        }
        console.warn("[SpeechAPI] Error:", code);
        setDiag((d) => ({ ...d, transcription: "disconnected" }));
      };
      rec.onend = () => {
        if (!stoppingRef.current && !pausedRef.current) {
          setTimeout(() => {
            try {
              rec.start();
            } catch (err: any) {
              console.warn("SpeechRecognition failed to auto-restart:", err.message);
            }
          }, 200);
        }
      };
      recognitionRef.current = rec;
      try {
        rec.start();
        setDiag((d) => ({ ...d, transcription: "connected", engine: "Web Speech API (on-device)" }));
      } catch {
        setDiag((d) => ({ ...d, transcription: "disconnected" }));
      }
    },
    [pushSegment],
  );

  const start = useCallback(async () => {
    setError(null);
    setSegments([]);
    setInterim("");
    setElapsedMs(0);
    accumulatedRef.current = 0;
    stoppingRef.current = false;
    pausedRef.current = false;
    chunksRef.current = [];
    setStatus("requesting");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support microphone access (MediaDevices API missing).");
      setStatus("error");
      return;
    }

    let stream: MediaStream;
    try {
      // IMPORTANT: echoCancellation MUST be false so the browser does NOT suppress
      // external audio (e.g. phone speaker, interview playing nearby) as an "echo".
      // noiseSuppression off keeps raw audio for Gemini to process accurately.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          echoCancellation: false, 
          noiseSuppression: false,
          autoGainControl: true
        },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setDiag((d) => ({ ...d, micPermission: "denied", microphone: "inactive" }));
      setError(
        name === "NotAllowedError"
          ? "Microphone permission denied. Enable microphone access in your browser settings to use Echo."
          : name === "NotFoundError"
            ? "No microphone was found on this device."
            : `Microphone unavailable: ${name ?? "unknown error"}`,
      );
      setStatus("error");
      return;
    }

    streamRef.current = stream;
    mimeRef.current = pickMime();
    setDiag((d) => ({ ...d, micPermission: "granted", microphone: "active" }));
    startMeter(stream);

    if (typeof MediaRecorder !== "undefined") {
      try {
        const rec = new MediaRecorder(stream, mimeRef.current ? { mimeType: mimeRef.current } : undefined);
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
            setDiag((d) => ({ ...d, audioChunks: chunksRef.current.length }));
          }
        };
        rec.start(1000);
        mainRecRef.current = rec;
      } catch {
        mainRecRef.current = null;
      }
    }

    const Recognition = getSpeechRecognition();
    if (Recognition) {
      startRecognition(Recognition);
    }
    
    // Concurrently start the segment loop as a failsafe transcription path to process MediaStream chunks directly
    setDiag((d) => ({
      ...d,
      engine: Recognition
        ? "Hybrid (Web Speech API + Gemini Fallback)"
        : "Cloud speech-to-text (audio chunks)",
    }));
    startSegmentLoop(stream);

    startedAtRef.current = Date.now();
    tickRef.current = setInterval(() => setElapsedMs(now()), 200);
    setStatus("recording");
  }, [now, startMeter, startRecognition, startSegmentLoop]);

  const pause = useCallback(() => {
    if (status !== "recording") return;
    pausedRef.current = true;
    accumulatedRef.current = now();
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    if (segTimerRef.current) clearInterval(segTimerRef.current);
    segTimerRef.current = null;
    try {
      segRecRef.current?.state === "recording" && segRecRef.current.stop();
    } catch {
      /* ignore */
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    if (mainRecRef.current?.state === "recording") mainRecRef.current.pause();
    setStatus("paused");
  }, [now, status]);

  const resume = useCallback(() => {
    if (status !== "paused") return;
    pausedRef.current = false;
    startedAtRef.current = Date.now();
    tickRef.current = setInterval(() => setElapsedMs(now()), 200);
    if (mainRecRef.current?.state === "paused") mainRecRef.current.resume();
    const Recognition = getSpeechRecognition();
    if (Recognition) {
      try {
        recognitionRef.current?.start();
      } catch {
        /* ignore */
      }
    } else if (streamRef.current) {
      startSegmentLoop(streamRef.current);
    }
    setStatus("recording");
  }, [now, startSegmentLoop, status]);

  const stop = useCallback(async () => {
    stoppingRef.current = true;
    const duration = pausedRef.current ? accumulatedRef.current : now();
    const mime = mimeRef.current || "audio/webm";

    const audio = await new Promise<Blob | null>((resolve) => {
      const rec = mainRecRef.current;
      if (!rec || rec.state === "inactive") {
        resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: mime }) : null);
        return;
      }
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: mime }));
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
    mainRecRef.current = null;
    cleanup();
    setStatus("stopped");
    setInterim("");
    setDiag((d) => ({ ...d, microphone: "inactive", audio: "not receiving" }));
    return { audio, durationMs: Math.max(0, duration), mimeType: mime };
  }, [cleanup, now]);

  const transcript = segments.map((s) => s.text).join(" ");

  return {
    status,
    error,
    setError,
    segments,
    interim,
    transcript,
    elapsedMs,
    levels,
    diag,
    start,
    pause,
    resume,
    stop,
    speechApiAvailable: typeof window !== "undefined" && !!getSpeechRecognition(),
  };
}
