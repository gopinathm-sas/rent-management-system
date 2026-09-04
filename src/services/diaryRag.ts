import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { DiaryNote } from "../types";

export interface DiaryRagSource {
  date: string;
  content: string;
  similarity: number;
}

export interface DiaryRagResponse {
  answer: string;
  sourceDates: string[];
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
async function fallbackClientSearch(question: string, localNotes: DiaryNote[]): Promise<DiaryRagResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }

  if (!localNotes || localNotes.length === 0) {
    return {
      answer: "Your diary is currently empty. Start writing some notes first!",
      sourceDates: [],
      sources: []
    };
  }

  const qEmbed = await generateClientEmbedding(question);
  if (!qEmbed) {
    throw new Error("Failed to generate query embedding.");
  }

  const scored: Array<{ date: string; content: string; similarity: number }> = [];

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

  scored.sort((a, b) => b.similarity - a.similarity);

  const topMatch = scored[0];
  if (!topMatch || topMatch.similarity < 0.50) {
    return {
      answer: "I couldn't find anything about that in your diary.",
      sourceDates: [],
      sources: []
    };
  }

  const topK = scored.slice(0, 5);
  const sourceDates = Array.from(new Set(topK.map(s => s.date)));
  const excerpts = topK.map(s => `[DATE: ${s.date}]\n${s.content}`).join('\n\n---\n\n');

  const prompt = `You are an AI assistant helping a user recall memories and notes from their personal diary.
CRITICAL INSTRUCTIONS:
1. Answer the question ONLY using the provided diary excerpts below.
2. If the answer is not in the excerpts, say "I couldn't find anything about that in your diary."
3. Do not make up facts. Mention specific dates when referring to events.

DIARY EXCERPTS:
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
  const answer = genData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "I couldn't find anything about that in your diary.";

  return {
    answer,
    sourceDates,
    sources: topK
  };
}

/**
 * Ask a question against the user's personal diary
 */
export async function queryDiaryAI(question: string, localNotes: DiaryNote[] = []): Promise<DiaryRagResponse> {
  const cleanQ = question.trim();
  if (!cleanQ) {
    return {
      answer: "Please enter a question to ask your diary.",
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
  return await fallbackClientSearch(cleanQ, localNotes);
}
