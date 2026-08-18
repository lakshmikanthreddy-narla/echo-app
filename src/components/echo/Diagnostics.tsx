import { useState } from "react";
import type { Diagnostics } from "@/lib/useRecorder";

type Extra = {
  gemini: "connected" | "failed" | "idle";
  aiProcessing: "idle" | "processing" | "complete";
  task: "detected" | "not detected";
  reminder: "created" | "not created";
};

function Row({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[11px]">
      <span className="text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={good ? "text-primary" : "text-foreground"}>{value.toUpperCase()}</span>
    </div>
  );
}

export function DiagnosticsPanel({ diag, extra }: { diag: Diagnostics; extra: Extra }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card-echo mt-4 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium"
      >
        Developer diagnostics
        <span className="text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="border-t border-border px-4 py-2">
          <Row label="Mic permission" value={diag.micPermission} good={diag.micPermission === "granted"} />
          <Row label="Microphone" value={diag.microphone} good={diag.microphone === "active"} />
          <Row label="Audio" value={diag.audio} good={diag.audio === "receiving"} />
          <Row label="Audio chunks" value={String(diag.audioChunks)} />
          <Row label="Engine" value={diag.engine} />
          <Row label="Transcription" value={diag.transcription} good={diag.transcription === "connected"} />
          <Row label="Transcript" value={diag.transcript} good={diag.transcript === "receiving"} />
          <Row label="Transcript length" value={String(diag.transcriptLength)} />
          <Row label="Gemini" value={extra.gemini} good={extra.gemini === "connected"} />
          <Row label="AI processing" value={extra.aiProcessing} />
          <Row label="Task" value={extra.task} good={extra.task === "detected"} />
          <Row label="Reminder" value={extra.reminder} good={extra.reminder === "created"} />
        </div>
      ) : null}
    </div>
  );
}
