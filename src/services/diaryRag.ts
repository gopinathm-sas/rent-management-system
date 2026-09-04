import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { DiaryNote, ImportantNote } from "../types";

export interface DiaryRagSource {
  date?: string;
  title?: string;
  category?: string;
  content: string;
  similarity: number;
}

export interface DiaryRagResponse {
  answer: string;
  sourceDates: string[];
  sourceTitles?: string[];
  sources: DiaryRagSource[];
  directDate?: string;
}

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_EMBED_MODEL = "gemini-embedding-001";
const GEMINI_GEN_MODEL = "gemini-3.5-flash-lite";


/**
 * Client-side cosine similarity helper
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate embedding on the client if fallback is triggered
 */
async function generateClientEmbedding(text: string): Promise<number[] | null> {
  if (!text || !GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${GEMINI_EMBED_MODEL}`,
      content: { parts: [{ text: text.slice(0, 8000) }] }
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.embedding?.values || null;
}

/**
 * Direct client-side Gemini fallback search
 */
async function fallbackClientSearch(
  question: string,
  localNotes: DiaryNote[] = [],
  localImportantNotes: ImportantNote[] = []
): Promise<DiaryRagResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }

  if ((!localNotes || localNotes.length === 0) && (!localImportantNotes || localImportantNotes.length === 0)) {
    return {
      answer: "Your diary and important notes are currently empty. Start writing some notes first!",
      sourceDates: [],
      sources: []
    };
  }

  const qEmbed = await generateClientEmbedding(question);
  if (!qEmbed) {
    throw new Error("Failed to generate query embedding.");
  }

  const scored: Array<DiaryRagSource> = [];

  // 1. Score daily notes
  for (const note of localNotes) {
    if (!note.content?.trim()) continue;
    let emb = (note as any).embedding as number[] | undefined;
    if (!emb) {
      emb = (await generateClientEmbedding(note.content)) || undefined;
    }
    if (emb) {
      const sim = cosineSimilarity(qEmbed, emb);
      scored.push({ date: note.date, content: note.content, similarity: sim });
    }
  }

  // 2. Score important notes
  for (const imp of localImportantNotes) {
    if (!imp.content?.trim()) continue;
    const textToEmbed = `Title: ${imp.title || 'Important Note'}\nCategory: ${imp.category || 'General'}\nTags: ${(imp.tags || []).join(', ')}\nContent: ${imp.content}`;
    let emb = (imp as any).embedding as number[] | undefined;
    if (!emb) {
      emb = (await generateClientEmbedding(textToEmbed)) || undefined;
    }
    if (emb) {
      const sim = cosineSimilarity(qEmbed, emb);
      scored.push({ title: imp.title, category: imp.category, content: imp.content, similarity: sim });
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity);

  const topMatch = scored[0];
  if (!topMatch || topMatch.similarity < 0.45) {
    return {
      answer: "I couldn't find anything about that in your personal diary or important notes.",
      sourceDates: [],
      sources: []
    };
  }

  const topK = scored.slice(0, 6);
  const sourceDates = Array.from(new Set(topK.filter(s => s.date).map(s => s.date!)));
  const sourceTitles = Array.from(new Set(topK.filter(s => s.title).map(s => s.title!)));
  
  const excerpts = topK.map(s => {
    if (s.title) {
      return `[IMPORTANT NOTE: ${s.title}${s.category ? ` | Category: ${s.category}` : ''}]\n${s.content}`;
    }
    return `[DATE: ${s.date}]\n${s.content}`;
  }).join('\n\n---\n\n');

  const prompt = `You are a personal AI assistant helping a user recall memories, daily logs, and important reference details (like bank accounts, wifi passwords, insurance, property notes) from their personal diary and important notes.
CRITICAL INSTRUCTIONS:
1. Answer the question accurately and concisely using ONLY the provided excerpts below.
2. If the user asks for specific credentials or details (e.g. Bank Account, IFSC, passwords), provide them clearly.
3. If the answer is not in the excerpts, say "I couldn't find anything about that in your notes."
4. Do not make up facts. Mention specific dates or document titles when referencing information.

EXCERPTS:
${excerpts}

QUESTION:
${question}`;

  const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_GEN_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const genRes = await fetch(genUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
    })
  });

  if (!genRes.ok) {
    throw new Error(`Gemini generation failed: ${genRes.statusText}`);
  }

  const genData = await genRes.json();
  const answer = genData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "I couldn't find anything about that in your notes.";

  return {
    answer,
    sourceDates,
    sourceTitles,
    sources: topK
  };
}

/**
 * Ask a question against the user's personal diary & important notes
 */
export async function queryDiaryAI(
  question: string,
  localNotes: DiaryNote[] = [],
  localImportantNotes: ImportantNote[] = []
): Promise<DiaryRagResponse> {
  const cleanQ = question.trim();
  if (!cleanQ) {
    return {
      answer: "Please enter a question to ask your diary & important notes.",
      sourceDates: [],
      sources: []
    };
  }

  // 1. Primary: Callable Cloud Function
  try {
    const askFn = httpsCallable<{ question: string }, DiaryRagResponse>(functions, 'askDiaryAI');
    const res = await askFn({ question: cleanQ });
    if (res.data) {
      return res.data;
    }
  } catch (err: any) {
    console.warn("Cloud function askDiaryAI failed, attempting client-side fallback:", err.message);
  }

  // 2. Fallback: Direct Client API
  return await fallbackClientSearch(cleanQ, localNotes, localImportantNotes);
}
