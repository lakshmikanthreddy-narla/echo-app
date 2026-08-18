export type TranscriptSegment = { t: number; text: string };

export type ConceptResource = { label: string; url: string };
export type Concept = {
  name: string;
  simple: string;
  detailed: string;
  resources?: ConceptResource[];
};
export type ImportantPoint = { text: string; t?: number };
export type NoteBlock = { heading: string; bullets: string[] };
export type TaskItem = { title: string; deadline: string | null; raw?: string };

export type Analysis = {
  summary: string;
  keyPoints: string[];
  notes: NoteBlock[];
  importantPoints: ImportantPoint[];
  concepts: Concept[];
  tasks: TaskItem[];
  topic?: string;
};

export type Session = {
  id: string;
  title: string;
  createdAt: number;
  durationMs: number;
  segments: TranscriptSegment[];
  transcript: string;
  audio?: Blob;
  audioType?: string;
  analysis?: Analysis;
  analysisError?: string;
  sttEngine: string;
};

export type Reminder = {
  id: string;
  sessionId: string;
  title: string;
  deadline: string | null;
  createdAt: number;
  done: boolean;
  notified: boolean;
};

export type Profile = { name: string; avatar?: string; createdAt: number };

export type AppSettings = {
  captionSize: "sm" | "md" | "lg" | "xl";
  playbackSpeed: number;
  notificationsEnabled: boolean;
  showDiagnostics: boolean;
};
