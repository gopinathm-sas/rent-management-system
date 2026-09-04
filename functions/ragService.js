const https = require('https');

const GEMINI_EMBED_MODEL = 'text-embedding-004';
const GEMINI_GEN_MODEL = 'gemini-2.0-flash-lite-001';

/**
 * Makes an HTTPS POST request to Google Gemini API
 */
function callGeminiApi(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.error?.message || `HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Gemini response: ${body}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Gemini API timeout after 30 seconds'));
    });

    req.write(data);
    req.end();
  });
}

/**
 * Generate 768-dimensional vector embedding for text using text-embedding-004
 */
async function generateEmbedding(text, apiKey) {
  if (!text || !text.trim()) return null;
  if (!apiKey) throw new Error('Gemini API Key is missing for embedding generation');

  const truncated = text.slice(0, 8000); // Safe token guard
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent?key=${apiKey}`;

  const payload = {
    model: `models/${GEMINI_EMBED_MODEL}`,
    content: {
      parts: [{ text: truncated }]
    }
  };

  const response = await callGeminiApi(url, payload);
  return response.embedding?.values || null;
}

/**
 * Computes Cosine Similarity between two numerical vectors
 */
function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Formats a Date object to YYYY-MM-DD
 */
function formatDateKey(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Detects explicit or relative date references in a query
 * (e.g. "yesterday", "today", "August 15", "15 Aug", "last Monday", "2026-09-04")
 */
function resolveExplicitDate(query, refDate = new Date()) {
  if (!query || typeof query !== 'string') return null;
  const q = query.toLowerCase().trim();

  // 1. Direct YYYY-MM-DD
  const ymdMatch = q.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (ymdMatch) {
    return ymdMatch[0];
  }

  // 2. Relative keywords: today, yesterday, tomorrow
  if (/\b(today|today's)\b/i.test(q)) {
    return formatDateKey(refDate);
  }
  if (/\b(yesterday|yesterday's)\b/i.test(q)) {
    const d = new Date(refDate);
    d.setDate(d.getDate() - 1);
    return formatDateKey(d);
  }
  if (/\b(tomorrow)\b/i.test(q)) {
    const d = new Date(refDate);
    d.setDate(d.getDate() + 1);
    return formatDateKey(d);
  }

  // 3. Weekdays e.g. "last monday", "on tuesday", "this friday"
  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayMatch = q.match(/\b(last|past|this|on)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (dayMatch) {
    const targetDayName = dayMatch[2].toLowerCase();
    const targetDayIdx = weekdayNames.indexOf(targetDayName);
    if (targetDayIdx !== -1) {
      const currentDayIdx = refDate.getDay();
      let diff = currentDayIdx - targetDayIdx;
      if (diff <= 0) diff += 7; // look to previous week if same/future day of week
      const targetDate = new Date(refDate);
      targetDate.setDate(targetDate.getDate() - diff);
      return formatDateKey(targetDate);
    }
  }

  // 4. Month names: "Aug 15", "August 15", "15th Aug", "15 August 2026", "Sep 4"
  const monthMap = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11
  };

  const monthRegex = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i;
  const m1 = q.match(monthRegex);
  if (m1) {
    const month = monthMap[m1[1].toLowerCase()];
    const day = parseInt(m1[2], 10);
    const year = m1[3] ? parseInt(m1[3], 10) : refDate.getFullYear();
    if (month !== undefined && day >= 1 && day <= 31) {
      const d = new Date(year, month, day);
      return formatDateKey(d);
    }
  }

  const dayMonthRegex = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i;
  const m2 = q.match(dayMonthRegex);
  if (m2) {
    const day = parseInt(m2[1], 10);
    const month = monthMap[m2[2].toLowerCase()];
    const year = m2[3] ? parseInt(m2[3], 10) : refDate.getFullYear();
    if (month !== undefined && day >= 1 && day <= 31) {
      const d = new Date(year, month, day);
      return formatDateKey(d);
    }
  }

  return null;
}

/**
 * Main RAG function: Answers questions grounded strictly in diary excerpts
 */
async function answerDiaryQuestion(question, {
  apiKey,
  firestore,
  k = 5,
  minSimilarity = 0.52,
  refDate = new Date()
}) {
  if (!question || !question.trim()) {
    return {
      answer: "Please ask a question about your diary.",
      sourceDates: [],
      sources: []
    };
  }

  const cleanQuestion = question.trim();

  // 1. Direct-Date Shortcut: If an explicit date is found, look it up directly
  const explicitDateKey = resolveExplicitDate(cleanQuestion, refDate);
  if (explicitDateKey && firestore) {
    const docSnap = await firestore.collection('diaryNotes').doc(explicitDateKey).get();
    if (!docSnap.exists) {
      return {
        answer: `I checked your diary for ${explicitDateKey}, but there was no entry recorded for that day.`,
        sourceDates: [],
        sources: [],
        directDate: explicitDateKey
      };
    }

    const note = docSnap.data();
    const noteText = note.content || 'Empty note';

    // Generate grounded summary for that specific day
    const prompt = `You are a personal diary assistant. The user is asking about their entry for ${explicitDateKey}.
Answer the user's question strictly and only using the diary entry below.
If the answer is not mentioned, say "I couldn't find anything about that in your entry for this date."
Do NOT invent or extrapolate facts.

DIARY ENTRY FOR ${explicitDateKey}:
${noteText}

QUESTION:
${cleanQuestion}`;

    const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_GEN_MODEL}:generateContent?key=${apiKey}`;
    const genRes = await callGeminiApi(genUrl, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
    });

    const answer = genRes.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "No response generated.";
    return {
      answer,
      sourceDates: [explicitDateKey],
      sources: [{ date: explicitDateKey, content: noteText, similarity: 1.0 }],
      directDate: explicitDateKey
    };
  }

  // 2. Fetch all diary notes from Firestore
  if (!firestore) {
    throw new Error("Firestore instance is required for RAG search");
  }

  const snap = await firestore.collection('diaryNotes').get();
  if (snap.empty) {
    return {
      answer: "Your diary is currently empty. Start by writing some daily notes, and then you can ask questions about them!",
      sourceDates: [],
      sources: []
    };
  }

  const allNotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 3. Generate Question Embedding
  const questionEmbedding = await generateEmbedding(cleanQuestion, apiKey);
  if (!questionEmbedding) {
    throw new Error("Failed to generate embedding for the question.");
  }

  // 4. Calculate Similarity against all notes (embed missing ones on-the-fly and save)
  const scoredNotes = [];

  for (const note of allNotes) {
    const content = (note.content || '').trim();
    if (!content) continue;

    let embedding = note.embedding;

    // Auto-generate missing embedding and save to Firestore
    if (!embedding || !Array.isArray(embedding)) {
      try {
        embedding = await generateEmbedding(content, apiKey);
        if (embedding) {
          await firestore.collection('diaryNotes').doc(note.id).set({ embedding }, { merge: true });
        }
      } catch (err) {
        console.warn(`Failed to generate missing embedding for note ${note.id}:`, err.message);
      }
    }

    if (embedding) {
      const sim = cosineSimilarity(questionEmbedding, embedding);
      scoredNotes.push({
        date: note.date || note.id,
        content,
        tags: note.tags || [],
        similarity: sim
      });
    }
  }

  if (scoredNotes.length === 0) {
    return {
      answer: "No readable diary notes found to search.",
      sourceDates: [],
      sources: []
    };
  }

  // Sort notes by similarity descending
  scoredNotes.sort((a, b) => b.similarity - a.similarity);

  const topMatch = scoredNotes[0];

  // 5. Similarity threshold check: If top match is below threshold, say nothing found
  if (!topMatch || topMatch.similarity < minSimilarity) {
    return {
      answer: "I couldn't find anything about that in your diary.",
      sourceDates: [],
      sources: []
    };
  }

  // Select top K relevant notes
  const topKNotes = scoredNotes
    .filter(n => n.similarity >= (minSimilarity - 0.05))
    .slice(0, k);

  const sourceDates = Array.from(new Set(topKNotes.map(n => n.date)));

  // 6. Generate Grounded Answer using Gemini
  const excerptsText = topKNotes.map(n => `[DATE: ${n.date}]\n${n.content}`).join('\n\n---\n\n');

  const groundingPrompt = `You are an AI assistant helping a user search and recall memories, thoughts, and events from their personal diary.

CRITICAL INSTRUCTIONS:
1. Answer the question ONLY using the provided diary excerpts below.
2. If the excerpts do not contain the answer, say "I couldn't find anything about that in your diary."
3. Do NOT make up, assume, or hallucinate facts not stated in the excerpts.
4. If synthesizing across multiple dates, mention which date each event happened on clearly.
5. Keep your answer natural, concise, and helpful.

DIARY EXCERPTS:
${excerptsText}

USER QUESTION:
${cleanQuestion}`;

  const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_GEN_MODEL}:generateContent?key=${apiKey}`;
  const genResponse = await callGeminiApi(genUrl, {
    contents: [{ parts: [{ text: groundingPrompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 600
    }
  });

  const answer = genResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "I couldn't find anything about that in your diary.";

  return {
    answer,
    sourceDates,
    sources: topKNotes
  };
}

module.exports = {
  generateEmbedding,
  cosineSimilarity,
  resolveExplicitDate,
  answerDiaryQuestion,
  GEMINI_EMBED_MODEL,
  GEMINI_GEN_MODEL
};
