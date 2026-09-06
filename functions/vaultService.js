const admin = require('firebase-admin');

const GEMINI_EMBED_MODEL = 'text-embedding-004';
const GEMINI_GEN_MODEL = 'gemini-2.5-flash';

/**
 * Calls Gemini Developer API with fetch
 */
async function callGeminiApi(url, payload) {
  const fetch = globalThis.fetch || require('node-fetch');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error (HTTP ${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Generates vector embedding for text using text-embedding-004
 */
async function generateEmbedding(text, apiKey) {
  if (!text || typeof text !== 'string' || !text.trim()) return null;
  const clean = text.trim();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent?key=${apiKey}`;
  const payload = {
    model: `models/${GEMINI_EMBED_MODEL}`,
    content: {
      parts: [{ text: clean }]
    }
  };

  const data = await callGeminiApi(url, payload);
  return data.embedding?.values || null;
}

/**
 * Computes cosine similarity between two numeric vectors
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
 * Extracts text from document buffer using native parsing or Gemini Vision OCR fallback
 */
async function extractTextFromBuffer(buffer, contentType, { apiKey, filename = '' }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { text: '', ocrUsed: false, unsupported: true };
  }

  const mime = (contentType || '').toLowerCase();
  const lowerName = (filename || '').toLowerCase();
  const isPdf = mime.includes('pdf') || lowerName.endsWith('.pdf');
  const isImage = mime.startsWith('image/') || /\.(png|jpe?g|webp|heic|bmp|tiff)$/i.test(lowerName);
  const isPlainText = mime.includes('text/') || /\.(txt|md|csv|json)$/i.test(lowerName);

  // 1. Plain Text files
  if (isPlainText && !isPdf && !isImage) {
    return { text: buffer.toString('utf8').trim(), ocrUsed: false, unsupported: false };
  }

  // 2. PDFs (Native extraction first, Vision OCR fallback)
  if (isPdf) {
    let nativeText = '';
    try {
      const pdfParse = require('pdf-parse');
      const parsed = await pdfParse(buffer);
      nativeText = (parsed.text || '').trim();
    } catch (pdfErr) {
      console.warn('[VaultService] Native PDF parsing failed or incomplete:', pdfErr.message);
    }

    // If native extraction yielded good readable text (> 60 chars)
    if (nativeText.replace(/\s+/g, ' ').length > 60) {
      return { text: nativeText, ocrUsed: false, unsupported: false };
    }

    // If native text is empty/minimal, fallback to Gemini Vision OCR
    if (apiKey) {
      console.log('[VaultService] PDF has minimal native text. Falling back to Gemini Vision OCR...');
      const ocrText = await performGeminiVisionOcr(buffer, 'application/pdf', apiKey);
      if (ocrText && ocrText.trim()) {
        return { text: ocrText.trim(), ocrUsed: true, unsupported: false };
      }
    }

    return { text: nativeText, ocrUsed: false, unsupported: !nativeText };
  }

  // 3. Images (Gemini Multimodal Vision OCR)
  if (isImage) {
    if (!apiKey) {
      return { text: '', ocrUsed: false, unsupported: true, error: 'Gemini API key missing for image OCR' };
    }

    const imageMime = mime.startsWith('image/') ? mime : 'image/jpeg';
    const ocrText = await performGeminiVisionOcr(buffer, imageMime, apiKey);
    return { text: (ocrText || '').trim(), ocrUsed: true, unsupported: !ocrText };
  }

  // 4. Other formats (Word / Binary fallback attempt)
  try {
    const rawString = buffer.toString('utf8');
    const printableOnly = rawString.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    if (printableOnly.length > 80) {
      return { text: printableOnly, ocrUsed: false, unsupported: false };
    }
  } catch (_) {}

  return { text: '', ocrUsed: false, unsupported: true };
}

/**
 * Extracts text and details from image / PDF buffer using Gemini Multimodal Vision API
 */
async function performGeminiVisionOcr(buffer, mimeType, apiKey) {
  const base64Data = buffer.toString('base64');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_GEN_MODEL}:generateContent?key=${apiKey}`;

  const prompt = `You are a high-accuracy document digitizer and OCR specialist.
Analyze this attached document/image thoroughly.
Extract ALL visible text, titles, headings, account/policy numbers, tables, names, dates, amounts, terms, and key details completely and accurately.
Preserve paragraph layout and structure. Do not summarize or omit clauses. Output the verbatim extracted text.`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 3000
    }
  };

  const res = await callGeminiApi(url, payload);
  return res.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

/**
 * Splits extracted text into ~400-600 token (1500-2000 char) chunks with overlapping context
 */
function chunkText(text, maxChars = 1800, overlapChars = 200) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (clean.length <= maxChars) return [clean];

  const chunks = [];
  let startIndex = 0;

  while (startIndex < clean.length) {
    let endIndex = startIndex + maxChars;

    if (endIndex >= clean.length) {
      chunks.push(clean.slice(startIndex).trim());
      break;
    }

    // Look for paragraph or sentence boundary near endIndex
    let splitPos = -1;
    const searchWindow = clean.slice(startIndex + maxChars - 300, endIndex);

    const paraIdx = searchWindow.lastIndexOf('\n\n');
    if (paraIdx !== -1) {
      splitPos = startIndex + maxChars - 300 + paraIdx + 2;
    } else {
      const sentIdx = searchWindow.lastIndexOf('. ');
      if (sentIdx !== -1) {
        splitPos = startIndex + maxChars - 300 + sentIdx + 2;
      } else {
        const lineIdx = searchWindow.lastIndexOf('\n');
        if (lineIdx !== -1) {
          splitPos = startIndex + maxChars - 300 + lineIdx + 1;
        } else {
          const spaceIdx = searchWindow.lastIndexOf(' ');
          if (spaceIdx !== -1) {
            splitPos = startIndex + maxChars - 300 + spaceIdx + 1;
          }
        }
      }
    }

    if (splitPos === -1 || splitPos <= startIndex) {
      splitPos = endIndex;
    }

    const chunk = clean.slice(startIndex, splitPos).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    startIndex = splitPos - overlapChars;
    if (startIndex < 0) startIndex = 0;
  }

  return chunks;
}

/**
 * Processes a single vault document: extracts text, chunks, embeds, and updates Firestore
 */
async function processVaultDocument(docId, { firestore, storage, apiKey }) {
  if (!docId) throw new Error('docId is required');
  const db = firestore || admin.firestore();
  const docRef = db.collection('vaultDocuments').doc(docId);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    throw new Error(`Vault document ${docId} not found`);
  }

  const data = docSnap.data();
  const storagePath = data.storagePath;

  if (!storagePath) {
    throw new Error(`Vault document ${docId} has no storagePath`);
  }

  // Mark as pending
  await docRef.update({
    extractionStatus: 'pending',
    updatedAt: new Date().toISOString()
  });

  try {
    // 1. Download buffer from Firebase Storage
    const bucket = storage ? storage.bucket() : admin.storage().bucket();
    const file = bucket.file(storagePath);
    const [fileBuffer] = await file.download();

    // 2. Extract Text
    const { text, ocrUsed, unsupported, error } = await extractTextFromBuffer(fileBuffer, data.contentType, {
      apiKey,
      filename: data.originalFilename || data.title || ''
    });

    if (unsupported || !text || text.trim().length === 0) {
      await docRef.update({
        extractionStatus: 'unsupported',
        embeddingStatus: 'failed',
        chunkCount: 0,
        ocrUsed: Boolean(ocrUsed),
        error: error || 'No extractable text found in document',
        updatedAt: new Date().toISOString()
      });
      return { success: true, status: 'unsupported', chunkCount: 0 };
    }

    // 3. Chunk text
    const chunks = chunkText(text);

    // 4. Delete existing chunks for this document
    const existingChunksSnap = await db.collection('vaultChunks')
      .where('documentId', '==', docId)
      .get()
      .catch(() => ({ docs: [] }));

    const batch = db.batch();
    existingChunksSnap.docs?.forEach(d => batch.delete(d.ref));

    // 5. Embed each chunk and save
    let embeddedCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const cText = chunks[i];
      let embedding = null;
      if (apiKey) {
        try {
          embedding = await generateEmbedding(`${data.title || 'Document'}\n${cText}`, apiKey);
        } catch (embErr) {
          console.warn(`[VaultService] Chunk ${i} embedding failed:`, embErr.message);
        }
      }

      const chunkDocRef = db.collection('vaultChunks').doc();
      batch.set(chunkDocRef, {
        id: chunkDocRef.id,
        documentId: docId,
        documentTitle: data.title || data.originalFilename || 'Document',
        chunkIndex: i,
        text: cText,
        embedding: embedding || null,
        createdAt: new Date().toISOString()
      });
      if (embedding) embeddedCount++;
    }

    await batch.commit();

    // 6. Update document metadata
    await docRef.update({
      extractionStatus: 'success',
      embeddingStatus: embeddedCount === chunks.length ? 'success' : (embeddedCount > 0 ? 'partial' : 'failed'),
      chunkCount: chunks.length,
      extractedTextSample: text.slice(0, 350),
      ocrUsed: Boolean(ocrUsed),
      error: null,
      updatedAt: new Date().toISOString()
    });

    return {
      success: true,
      status: 'success',
      chunkCount: chunks.length,
      ocrUsed
    };
  } catch (err) {
    console.error(`[VaultService] Error processing vault doc ${docId}:`, err);
    await docRef.update({
      extractionStatus: 'failed',
      embeddingStatus: 'failed',
      error: err.message,
      updatedAt: new Date().toISOString()
    });
    throw err;
  }
}

/**
 * Answers a user's question grounded in Personal Vault documents via vector similarity
 */
async function answerVaultQuestion(question, {
  firestore,
  apiKey,
  topK = 4,
  minSimilarity = 0.35
}) {
  if (!question || !question.trim()) {
    return {
      answer: "Please provide a question to search your Personal Vault documents.",
      sources: []
    };
  }

  const cleanQuestion = question.trim();
  const db = firestore || admin.firestore();

  // 1. Fetch all vault chunks
  const chunksSnap = await db.collection('vaultChunks').get().catch(() => ({ docs: [], empty: true }));

  if (chunksSnap.empty || !chunksSnap.docs || chunksSnap.docs.length === 0) {
    return {
      answer: "Your Personal Vault is currently empty or has no indexed documents. Upload documents in the Vault tab to start searching!",
      sources: []
    };
  }

  // 2. Generate Question Embedding
  const questionEmbedding = await generateEmbedding(cleanQuestion, apiKey);
  if (!questionEmbedding) {
    throw new Error("Failed to generate embedding for the vault query.");
  }

  // 3. Compute cosine similarity against all chunks
  const scoredChunks = [];
  for (const doc of chunksSnap.docs) {
    const data = doc.data();
    const content = data.text || '';
    if (!content) continue;

    let embedding = data.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      // Auto-generate missing embedding on the fly
      try {
        embedding = await generateEmbedding(`${data.documentTitle || ''}\n${content}`, apiKey);
        if (embedding) {
          await doc.ref.set({ embedding }, { merge: true }).catch(() => {});
        }
      } catch (_) {}
    }

    if (embedding) {
      const sim = cosineSimilarity(questionEmbedding, embedding);
      scoredChunks.push({
        id: doc.id,
        documentId: data.documentId,
        documentTitle: data.documentTitle || 'Document',
        chunkIndex: data.chunkIndex ?? 0,
        text: content,
        similarity: sim
      });
    }
  }

  if (scoredChunks.length === 0) {
    return {
      answer: "No readable document chunks found in your vault to search.",
      sources: []
    };
  }

  // Sort descending by similarity
  scoredChunks.sort((a, b) => b.similarity - a.similarity);
  const topMatch = scoredChunks[0];

  if (!topMatch || topMatch.similarity < minSimilarity) {
    return {
      answer: "I couldn't find any information about that in your Personal Vault documents.",
      sources: []
    };
  }

  const topChunks = scoredChunks
    .filter(c => c.similarity >= (minSimilarity - 0.05))
    .slice(0, topK);

  const sourceTitles = Array.from(new Set(topChunks.map(c => c.documentTitle)));
  const sourceDocs = Array.from(
    new Map(topChunks.map(c => [c.documentId, { id: c.documentId, title: c.documentTitle }])).values()
  );

  // 4. Grounded answer generation via Gemini
  const excerpts = topChunks.map((c, i) => `[DOCUMENT: ${c.documentTitle} (Excerpt ${i + 1})]\n${c.text}`).join('\n\n---\n\n');

  const groundingPrompt = `You are a trusted personal assistant helping the property owner recall and verify details from their Personal Vault documents (contracts, insurance, IDs, agreements, bills).

CRITICAL INSTRUCTIONS:
1. Answer the question ONLY using the provided document excerpts below.
2. If the excerpts do not contain the answer, say "I couldn't find that information in your vault documents."
3. Do NOT assume, fabricate, or extrapolate facts not present in the excerpts.
4. Always cite the document title(s) where each fact was found.
5. Keep the response crisp, accurate, and easy to read.

DOCUMENT EXCERPTS:
${excerpts}

USER QUESTION:
${cleanQuestion}`;

  const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_GEN_MODEL}:generateContent?key=${apiKey}`;
  const genRes = await callGeminiApi(genUrl, {
    contents: [{ parts: [{ text: groundingPrompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 600
    }
  });

  const answer = genRes.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "I couldn't find that information in your vault documents.";

  return {
    answer,
    sources: sourceTitles,
    sourceDocs,
    topChunks
  };
}

/**
 * Resolves a matching vault document by title (fuzzy/substring) or semantic search fallback
 */
async function findMatchingVaultDocument(query, { firestore, apiKey }) {
  if (!query || !query.trim()) return { matches: [], confidence: 'none' };
  const cleanQ = query.trim().toLowerCase();
  const db = firestore || admin.firestore();

  const snap = await db.collection('vaultDocuments').get().catch(() => ({ docs: [], empty: true }));
  if (snap.empty || !snap.docs || snap.docs.length === 0) {
    return { matches: [], confidence: 'none' };
  }

  const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 1. Direct title matching (exact or substring)
  const exactMatches = allDocs.filter(d => {
    const title = (d.title || '').toLowerCase();
    const orig = (d.originalFilename || '').toLowerCase();
    return title === cleanQ || orig === cleanQ;
  });
  if (exactMatches.length > 0) {
    return { matches: exactMatches, confidence: 'high' };
  }

  const substringMatches = allDocs.filter(d => {
    const title = (d.title || '').toLowerCase();
    const orig = (d.originalFilename || '').toLowerCase();
    return (title && (title.includes(cleanQ) || cleanQ.includes(title))) ||
           (orig && (orig.includes(cleanQ) || cleanQ.includes(orig)));
  });
  if (substringMatches.length > 0) {
    return { matches: substringMatches, confidence: substringMatches.length === 1 ? 'high' : 'medium' };
  }

  // 2. Keyword token overlap matching
  const queryTokens = cleanQ.split(/\s+/).filter(t => t.length > 2);
  if (queryTokens.length > 0) {
    const tokenMatches = allDocs.filter(d => {
      const title = (d.title || '').toLowerCase();
      return queryTokens.some(tok => title.includes(tok));
    });
    if (tokenMatches.length > 0) {
      return { matches: tokenMatches, confidence: 'medium' };
    }
  }

  // 3. Semantic search fallback across chunks
  if (apiKey) {
    try {
      const qRes = await answerVaultQuestion(query, { firestore: db, apiKey, topK: 3 });
      if (qRes.sourceDocs && qRes.sourceDocs.length > 0) {
        const matchedDocIds = qRes.sourceDocs.map(s => s.id);
        const semanticDocs = allDocs.filter(d => matchedDocIds.includes(d.id));
        if (semanticDocs.length > 0) {
          return { matches: semanticDocs, confidence: 'medium' };
        }
      }
    } catch (_) {}
  }

  return { matches: [], confidence: 'none' };
}

/**
 * Classifies a /vault user query into FILE_RETRIEVAL vs CONTENT_QA
 */
async function classifyVaultIntent(query, { apiKey } = {}) {
  if (!query || !query.trim()) return { intent: 'CONTENT_QA', searchTarget: '' };
  const cleanQ = query.trim();

  // Fast pattern matching for file delivery intent
  const fileRetrievalRegex = /\b(send|give|download|share|get|attach|dispatch|fetch|forward|pull)\s+(me\s+|us\s+)?(the\s+|my\s+|this\s+)?(document|file|pdf|copy|doc|photo|scan|image|slip|certificate|passbook|statement)?\b/i;
  const isDirectFileRequest = fileRetrievalRegex.test(cleanQ) ||
    /^(send|give|download|share|get|file)\b/i.test(cleanQ);

  if (!apiKey) {
    return {
      intent: isDirectFileRequest ? 'FILE_RETRIEVAL' : 'CONTENT_QA',
      searchTarget: cleanQ.replace(fileRetrievalRegex, '').trim() || cleanQ
    };
  }

  const prompt = `Analyze this user query for a Personal Document Vault assistant.
Determine whether the user wants to:
1. "FILE_RETRIEVAL": Download/receive the physical file/document sent to them in Telegram (e.g. "Send me my passport", "Give me rental agreement", "Share electricity bill copy").
2. "CONTENT_QA": Ask a question about what is written inside a document (e.g. "What is the policy number?", "When does the lease expire?", "Who signed the document?").

USER QUERY: "${cleanQ}"

Return valid JSON ONLY with schema:
{
  "intent": "FILE_RETRIEVAL" | "CONTENT_QA",
  "documentNameOrQuestion": "Extracted document name if file retrieval, or clean question if Q&A"
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_GEN_MODEL}:generateContent?key=${apiKey}`;
    const res = await callGeminiApi(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 200 }
    });
    const raw = res.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
    const cleanJson = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    return {
      intent: parsed.intent || (isDirectFileRequest ? 'FILE_RETRIEVAL' : 'CONTENT_QA'),
      searchTarget: parsed.documentNameOrQuestion || cleanQ
    };
  } catch (_) {
    return {
      intent: isDirectFileRequest ? 'FILE_RETRIEVAL' : 'CONTENT_QA',
      searchTarget: cleanQ
    };
  }
}

module.exports = {
  extractTextFromBuffer,
  performGeminiVisionOcr,
  chunkText,
  generateEmbedding,
  cosineSimilarity,
  processVaultDocument,
  answerVaultQuestion,
  findMatchingVaultDocument,
  classifyVaultIntent
};
