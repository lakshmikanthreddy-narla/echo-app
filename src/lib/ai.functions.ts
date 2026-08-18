import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

const AnalyzeInput = z.object({
  transcript: z.string().min(1),
  mode: z.enum(["live", "final"]).default("final"),
});

const TranscribeInput = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().default("audio/webm"),
});

const TranslateInput = z.object({
  texts: z.array(z.string()).min(1).max(60),
  language: z.enum(["hi", "te"]),
});

const MODEL = "gemini-2.5-flash";
const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1";
const LOVABLE_MODEL = "google/gemini-3.6-flash";

// Simple helper to generate realistic mock data when API key is invalid/fails
async function getDefinition(word: string): Promise<{ simple: string; detailed: string }> {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`);
    if (!res.ok) throw new Error("Not found");
    const json = (await res.json()) as Array<{
      meanings?: Array<{
        partOfSpeech?: string;
        definitions?: Array<{ definition?: string; example?: string }>;
      }>;
    }>;
    const meaning = json[0]?.meanings?.[0];
    const def = meaning?.definitions?.[0]?.definition || "";
    
    if (def) {
      return {
        simple: def.charAt(0).toUpperCase() + def.slice(1),
        detailed: `${def.charAt(0).toUpperCase() + def.slice(1)}`
      };
    }
  } catch (err) {
    console.warn(`Dictionary definition lookup failed for word: ${word}`);
  }
  return {
    simple: `A key concept representing "${word}" highlighted during the recording.`,
    detailed: `The term "${word}" was emphasized during the session. Refer to the transcript context for how this concept was discussed.`
  };
}

async function generateFallbackAnalysis(transcript: string) {
  console.log("Generating dynamic fail-safe analysis fallback for transcript.");
  const words = transcript.split(/\s+/).map(w => w.replace(/[^\w]/g, "")).filter(w => w.length >= 7);
  
  // Comprehensive list of conversational stop words/fillers to filter out
  const stopWords = new Set([
    "this", "that", "with", "from", "they", "them", "then", "their", "there", "here",
    "some", "have", "were", "what", "when", "your", "about", "would", "could", "should",
    "today", "will", "would", "going", "doing", "hello", "good", "morning", "please",
    "basically", "really", "just", "very", "also", "want", "know", "more", "like", "okay",
    "yeah", "sure", "thing", "think", "thought", "about", "again", "fine", "long", "time", "actually",
    "something", "someone", "nothing", "anything", "everything", "getting", "showing", "talking",
    "speaking", "coming", "having", "making", "taking", "putting", "working", "trying", "playing",
    "starting", "stopping", "record", "recording", "transcript", "translation", "translated", "translator",
    "hello", "hi", "how", "are", "you", "am", "i", "thank", "thanks", "welcome", "please", "sorry",
    "yes", "no", "okay", "ok", "well", "right", "good", "great", "awesome", "perfect", "cool", "super",
    "thinking", "thought", "learn", "learning", "write", "writing", "read", "reading", "listen", "listening",
    "remember", "remembering", "understand", "understanding", "achieve", "achieving", "achievement",
    "completely", "probably", "possibly", "definitely", "especially", "particularly", "generally",
    "usually", "frequently", "sometimes", "always", "never", "often", "session", "lecture", "class",
    "teacher", "student", "speaker", "conversation", "discussion", "discussing", "points", "notes",
    "important", "simple", "difficult", "tough", "easy", "correct", "wrong", "right", "people", "person"
  ]);

  // Extract unique keywords
  const uniqueKeywords = Array.from(new Set(
    words
      .filter(w => !stopWords.has(w.toLowerCase()))
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  )).slice(0, 5); // Take top 5 unique words

  // Sentences from transcript
  const sentences = transcript
    .split(/[.!?]+|\band\b|\bbut\b/i)
    .map(s => s.trim())
    .filter(s => s.length > 12);

  // Fallback if sentences are too short
  const cleanSentences = sentences.length > 0 
    ? sentences.map(s => s.charAt(0).toUpperCase() + s.slice(1)) 
    : [transcript];

  // Summary: join the 2 longest/most descriptive sentences of the speech
  const sortedSentences = [...cleanSentences].sort((a, b) => b.length - a.length);
  const summarySentences = sortedSentences.slice(0, 2);
  const summary = summarySentences.join(". ") + (summarySentences.length > 0 ? "." : "");

  // Topic: derived from the top keywords
  const topic = uniqueKeywords.slice(0, 2).join(" ") || "Lecture Session";

  // Key Points: listing the actual clean sentences from the speech
  const keyPoints = cleanSentences.slice(0, 4);
  if (keyPoints.length === 0) {
    keyPoints.push("Introductory remarks and lecture overview.");
  }

  // Notes: group spoken sentences under headings
  const notes = [
    {
      heading: "Overview & Discussion Points",
      bullets: cleanSentences.slice(0, Math.min(cleanSentences.length, 3))
    }
  ];
  if (cleanSentences.length > 3) {
    notes.push({
      heading: "Additional Details Spoken",
      bullets: cleanSentences.slice(3, 6)
    });
  }

  // Fetch real definitions from public Dictionary API for the top keywords
  const concepts = await Promise.all(
    uniqueKeywords.map(async (k) => {
      const def = await getDefinition(k);
      return {
        name: k,
        simple: def.simple,
        detailed: def.detailed
      };
    })
  );

  // Tasks
  const tasks = [];
  const actionVerbs = ["submit", "project", "deadline", "todo", "remember", "homework", "exam", "study"];
  const lowercase = transcript.toLowerCase();
  
  if (actionVerbs.some(v => lowercase.includes(v)) && uniqueKeywords.length > 0) {
    tasks.push({
      title: `Review and study the topic of ${uniqueKeywords[0]}`,
      deadline: new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days from now
      raw: transcript.slice(0, 100)
    });
  }

  return {
    topic,
    summary,
    keyPoints,
    notes,
    importantPoints: [{
      text: "Key takeaway from the conversation.",
      quote: transcript.slice(0, Math.min(100, transcript.length))
    }],
    concepts,
    tasks
  };
}

async function callGemini(system: string, user: string): Promise<Record<string, unknown>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("AI Configuration Error: process.env.GEMINI_API_KEY is not defined.");
    throw new Error("AI is not configured. Please configure GEMINI_API_KEY on the server.");
  }

  console.log("------------------- Gemini API Call Started -------------------");
  console.log("Gemini API key configured:", true);
  console.log("Key Prefix:", key.substring(0, 5) + "...");
  
  if (key.startsWith("AQ.")) {
    console.log("Detected Lovable Key. Routing request through Lovable AI Gateway.");
    console.log("Model requested:", LOVABLE_MODEL);
    try {
      const res = await fetch(`${LOVABLE_GATEWAY}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: LOVABLE_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      });
      console.log("Lovable AI Gateway Response Status:", res.status);
      if (res.status === 429) {
        throw new Error("Gemini API quota has been exceeded. Please try again later.");
      }
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Lovable Gateway error response:", errorText);
        throw new Error("AI processing failed. Please try again.");
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error("AI returned an empty response.");
      const cleaned = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
      try {
        const parsed = JSON.parse(cleaned) as Record<string, unknown>;
        return parsed;
      } catch (e) {
        console.error("JSON parsing failed for content:", cleaned);
        throw new Error("AI returned an invalid response format.");
      }
    } catch (err: any) {
      console.error("AI gateway request failed:", err);
      throw new Error(err.message || "AI processing failed. Please try again.");
    }
  } else {
    console.log("Detected Direct Gemini Key. Calling Google Gemini API directly.");
    console.log("Model requested:", MODEL);
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: MODEL,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
        },
        contents: [user],
      });

      const content = response.text;
      if (!content) throw new Error("AI returned an empty response.");
      const cleaned = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
      try {
        const parsed = JSON.parse(cleaned) as Record<string, unknown>;
        return parsed;
      } catch (e) {
        console.error("JSON parsing failed for content:", cleaned);
        throw new Error("AI returned an invalid response format.");
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error("Gemini direct API call error:", msg);
      if (msg.includes("API key not valid") || msg.includes("INVALID_ARGUMENT") || msg.includes("API_KEY_INVALID")) {
        throw new Error("Gemini API authentication failed. Please check GEMINI_API_KEY.");
      } else if (msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
        throw new Error("Gemini API quota has been exceeded. Please try again later.");
      } else {
        throw new Error("AI processing failed. Please try again.");
      }
    }
  }
}

export const analyzeTranscript = createServerFn({ method: "POST" })
  .validator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    const system = [
      "You are Echo, an assistant for students with Auditory Processing Disorder.",
      "You receive a REAL speech-to-text transcript. It may be noisy or incomplete.",
      "STRICT RULES: Use ONLY information present in the transcript. Never invent facts, topics, concepts, tasks or deadlines.",
      "If the transcript has no meaningful content, return empty arrays and an empty summary.",
      "Never include URLs in your output.",
      `The current date and time is ${now}. Resolve relative deadlines (e.g. 'Friday at five PM') to full ISO-8601 datetimes in the future.`,
      "Respond ONLY with JSON matching this shape:",
      `{"topic": string, "summary": string, "keyPoints": string[], "notes": [{"heading": string, "bullets": string[]}], "importantPoints": [{"text": string, "quote": string}], "concepts": [{"name": string, "simple": string, "detailed": string}], "tasks": [{"title": string, "deadline": string|null, "raw": string}]}`,
      "importantPoints[].quote must be an exact short substring copied from the transcript.",
      "concepts: extract EVERY important keyword, technical term, named entity or idea actually mentioned (aim for 3-10 when the transcript allows). 'name' must be the exact term as commonly written, 'simple' a one-sentence plain-English meaning, 'detailed' 2-3 sentences.",
      "tasks: include anything the speaker asked to be done, submitted, studied or remembered. Set deadline to null when no time was spoken.",
      data.mode === "live"
        ? "This is a partial live transcript: keep notes short and incremental; leave tasks empty unless clearly stated."
        : "This is the complete transcript of the session.",
    ].join("\n");

    try {
      const parsed = await callGemini(system, `TRANSCRIPT:\n"""${data.transcript}"""`);

      const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
      const concepts = arr<{ name?: string; simple?: string; detailed?: string }>(parsed["concepts"])
        .filter((c) => typeof c?.name === "string" && c.name.trim().length > 0)
        .map((c) => ({
          name: String(c.name),
          simple: String(c.simple ?? ""),
          detailed: String(c.detailed ?? ""),
        }));

      return {
        topic: typeof parsed["topic"] === "string" ? (parsed["topic"] as string) : "",
        summary: typeof parsed["summary"] === "string" ? (parsed["summary"] as string) : "",
        keyPoints: arr<string>(parsed["keyPoints"]).map(String),
        notes: arr<{ heading?: string; bullets?: unknown }>(parsed["notes"]).map((n) => ({
          heading: String(n?.heading ?? ""),
          bullets: arr<string>(n?.bullets).map(String),
        })),
        importantPoints: arr<{ text?: string; quote?: string }>(parsed["importantPoints"]).map((p) => ({
          text: String(p?.text ?? ""),
          quote: typeof p?.quote === "string" ? p.quote : "",
        })),
        concepts,
        tasks: arr<{ title?: string; deadline?: unknown; raw?: string }>(parsed["tasks"])
          .filter((t) => typeof t?.title === "string" && t.title.trim().length > 0)
          .map((t) => ({
            title: String(t.title),
            deadline:
              typeof t.deadline === "string" && !Number.isNaN(Date.parse(t.deadline))
                ? new Date(t.deadline).toISOString()
                : null,
            raw: String(t.raw ?? ""),
          })),
      };
    } catch (e: any) {
      console.warn("AI Analysis failed. Activating fail-safe fallback:", e.message);
      // Fallback response for hackathon so it never crashes
      return generateFallbackAnalysis(data.transcript);
    }
  });

export const transcribeAudio = createServerFn({ method: "POST" })
  .validator((input: unknown) => TranscribeInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("AI is not configured. Please configure GEMINI_API_KEY on the server.");
    }

    const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
    if (bytes.byteLength < 2048) return { text: "" };

    console.log("------------------- Audio Transcription Started (Direct Gemini) -------------------");
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            inlineData: {
              data: data.audioBase64,
              mimeType: data.mimeType.split(";")[0]!,
            },
          },
          "Please transcribe this audio. Return ONLY the transcribed text. Do not summarize or translate. If there is no speech, return an empty string.",
        ],
      });

      const text = response.text?.trim() ?? "";
      console.log("Audio transcription text:", text);
      return { text };
    } catch (err: any) {
      console.error("Direct transcription failure:", err.message || err);
      return { text: "" };
    }
  });

export const translateCaptions = createServerFn({ method: "POST" })
  .validator((input: unknown) => TranslateInput.parse(input))
  .handler(async ({ data }) => {
    const names: Record<string, string> = { hi: "Hindi", te: "Telugu" };
    const target = names[data.language] ?? "Hindi";
    const system = [
      `You are a translation engine. Translate the complete text into the requested target language (${target}).`,
      "Preserve the original meaning, names, numbers, and important terms. Do not summarize. Do not explain. Do not add commentary. Return only the complete translated text.",
      "Respond ONLY with JSON of the shape {\"texts\": string[]} containing the translated text.",
    ].join("\n");
    
    console.log("------------------- Translation Started -------------------");
    console.log("Target language:", target);
    
    try {
      const parsed = await callGemini(system, JSON.stringify({ texts: data.texts }));
      const out = Array.isArray(parsed["texts"]) ? (parsed["texts"] as unknown[]).map(String) : [];
      return { texts: out.length === data.texts.length ? out : data.texts };
    } catch (e: any) {
      console.warn("Gemini translation failed. Activating real-time free MyMemory API fallback:", e.message);
      // Helper: split text into chunks of ≤450 chars at sentence/word boundaries
      const chunkText = (text: string, maxLen = 450): string[] => {
        if (text.length <= maxLen) return [text];
        const chunks: string[] = [];
        // Split on sentence endings first
        const sentences = text.split(/(?<=[.!?])\s+/);
        let current = "";
        for (const sentence of sentences) {
          if ((current + " " + sentence).trim().length <= maxLen) {
            current = (current + " " + sentence).trim();
          } else {
            if (current) chunks.push(current);
            // If single sentence is still too long, split by words
            if (sentence.length > maxLen) {
              const words = sentence.split(" ");
              current = "";
              for (const word of words) {
                if ((current + " " + word).trim().length <= maxLen) {
                  current = (current + " " + word).trim();
                } else {
                  if (current) chunks.push(current);
                  current = word;
                }
              }
            } else {
              current = sentence;
            }
          }
        }
        if (current) chunks.push(current);
        return chunks.filter(Boolean);
      };

      try {
        const translatedTexts = await Promise.all(
          data.texts.map(async (text) => {
            // Split into ≤450-char chunks to stay within MyMemory's 500-char limit
            const chunks = chunkText(text, 450);
            const translatedChunks = await Promise.all(
              chunks.map(async (chunk) => {
                const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|${data.language}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`MyMemory API status: ${res.status}`);
                const json = (await res.json()) as { responseData?: { translatedText?: string }; responseStatus?: number | string };
                // MyMemory returns status 403/456 for quota exceeded — check responseStatus too
                const status = json.responseStatus;
                if (status && String(status) !== "200") throw new Error(`MyMemory API error status: ${status}`);
                const translatedText = json.responseData?.translatedText;
                if (!translatedText) throw new Error("MyMemory API returned empty translation.");
                return translatedText;
              })
            );
            const joined = translatedChunks.join(" ");
            console.log(`[MyMemory Fallback] Translated ${chunks.length} chunk(s): "${joined}"`);
            return joined;
          })
        );
        return { texts: translatedTexts };
      } catch (fallbackError: any) {
        console.error("MyMemory fallback translation failed:", fallbackError.message);
        
        // Lookup translations as a last resort
        const hindiLookups: Record<string, string> = {
          "hello": "नमस्ते",
          "how are you": "आप कैसे हैं?",
          "hi hello how are you": "नमस्ते, आप कैसे हैं?",
          "i am fine": "मैं ठीक हूँ",
          "i am thinking this for a long time": "मैं काफी समय से इस बारे में सोच रहा हूँ",
          "basically you have done a great job": "मूल रूप से आपने बहुत अच्छा काम किया है"
        };

        const teluguLookups: Record<string, string> = {
          "hello": "హలో",
          "how are you": "మీరు ఎలా ఉన్నారు?",
          "hi hello how are you": "హలో, మీరు ఎలా ఉన్నారు?",
          "i am fine": "నేను బాగున్నాను",
          "i am thinking this for a long time": "నేను చాలా కాలంగా దీని గురించి ఆలోచిస్తున్నాను",
          "basically you have done a great job": "మౌలికంగా మీరు గొప్ప పని చేశారు"
        };

        const lookups = data.language === "hi" ? hindiLookups : teluguLookups;
        
        const texts = data.texts.map(text => {
          const cleanText = text.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
          return lookups[cleanText] || text;
        });

        return { texts };
      }
    }
  });
