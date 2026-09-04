# Feature Request: Ask Questions About Your Personal Diary (RAG Search)

## Context
This builds on two existing pieces of this Rental Management App:
1. The **Personal Diary** page (React 18/TS/Vite/Tailwind, Firestore `diaryNotes` collection, one note per day, free-form tags) — see its own spec if this hasn't been built yet.
2. The **Telegram bot** (Node.js 22, Firebase Cloud Functions, `grammy`, already running 24/7) — see its own spec for the existing features (meter readings, rent status, WhatsApp notifications, reporting queries, expense entry).

I want to be able to **ask a natural-language question about something I wrote in the diary on some other day**, and get back an answer grounded in what I actually wrote — from both the Telegram bot and a search/ask box on the Diary page itself — rather than having to remember which date I wrote it on and scroll to find it.

**Before writing any code**, confirm the exact `diaryNotes` schema (from the Personal Diary spec/implementation) and the exact Telegram bot routing setup (from the bot spec/implementation), since this feature plugs into both.

## Confirmed Approach (from our discussion)
- **AI provider: Google Gemini** — specifically the **Gemini Developer API** (an API key from Google AI Studio), not standard Vertex AI enterprise billing. This matters for cost: the Gemini Developer API has a genuine, ongoing free tier with rate limits, whereas Vertex AI's pay-as-you-go pricing has no permanent free tier. For a single person's daily journal plus occasional questions, usage should stay comfortably within the free tier's rate limits — realistically **$0/month**, and even outside the free tier the paid rates are a fraction of a cent per year at this volume (embeddings ~$0.15 per 1M tokens, lightweight generation ~$0.10/$0.40 per 1M input/output tokens). Use Vertex AI only as a fallback if the free tier's rate limits ever become a real constraint, which is unlikely for personal use.
- **Both interfaces**: a Telegram command, and a search/ask box on the Diary page in the WebApp — both call the same underlying logic.

## Architecture Overview
This is a small retrieval-augmented generation (RAG) pipeline:
1. **Embed** each diary note's content into a vector when it's saved (Gemini's embedding model, via the free-tier Gemini Developer API).
2. **Store** that vector alongside the note in Firestore, using Firestore's native vector field support.
3. On a question, **embed the question** the same way, then run a **Firestore vector similarity search** (`findNearest`) against `diaryNotes` to retrieve the most relevant past entries.
4. **Generate an answer** with a lightweight Gemini text model (e.g. a Flash-tier model — no need for a large/expensive model for this), explicitly instructed to answer only from the retrieved diary excerpts (not from general knowledge), and to say so plainly if nothing relevant is found.
5. Return the answer **with the source date(s)** it was based on, so you can always verify or jump to the original entry.

Given a personal diary's realistic scale (hundreds to low thousands of entries, not millions), Firestore's native vector search is sufficient — no separate vector database needed, keeping this entirely within the existing Firebase project.

## Functional Requirements

### 1. Embedding Generation & Storage
- Whenever a diary note is saved (tying into the Diary page's existing debounced auto-save — don't generate an embedding per keystroke, only when a save actually commits), call Gemini's embedding model (via the Gemini Developer API) on the note's `content` and store the resulting vector in a Firestore vector field (e.g. `embedding`) on that same day's document.
- Configure a Firestore vector index on `diaryNotes.embedding` to support `findNearest` queries.
- If embedding generation fails (API error, quota, transient network issue), the note's `content` should still save successfully — don't block a diary save on the AI call. Retry the embedding generation on the next save of that note, or via a small periodic reconciliation check for notes missing an embedding.
- Truncate exceptionally long note content before embedding if it risks exceeding the embedding model's input limit (unlikely for typical diary entries, but a safe guard).

### 2. Retrieval
- On a question, generate its embedding the same way, then query `diaryNotes` with `findNearest` for the top-K most similar notes (e.g. K=5, tunable).
- **Direct-date shortcut**: if the question clearly references a specific date or relative date ("what did I write yesterday", "on August 15th", "last Monday"), resolve that to an actual date and fetch that day's note directly instead of going through vector search — this is more precise than semantic retrieval when the date is already explicit in the question.
- If no retrieved note clears a reasonable similarity threshold, treat this as "nothing relevant found" rather than passing weak matches to the generation step.

### 3. Answer Generation (grounding, not hallucination)
- Call a Gemini generative model with a prompt that includes the retrieved notes (date + content) as context and the user's question, with explicit instructions to answer **only** using the provided excerpts and to clearly say "I couldn't find anything about that in your diary" if the excerpts don't actually address the question — don't let the model fill gaps from general knowledge or invent plausible-sounding details.
- For questions that span multiple entries (e.g. "how did my mood change over August"), rely on the top-K retrieval to supply enough context for the model to synthesize across entries, not just the single closest match.

### 4. Source Citation
- Every answer should be accompanied by the date(s) of the diary entries it drew from — in the WebApp, make these clickable to jump straight to that day's note; in Telegram, list them as a simple footer (e.g. "Based on your entries from Aug 3 and Aug 17").
- This matters for trust — you should always be able to verify the answer against what you actually wrote, not just take the AI's word for it.

### 5. Telegram Interface
- Add a `/ask <question>` command (dedicated command, not free-text-matched, to avoid any routing collision with the bot's other features — e.g. `/ask what did I decide about the water tank repair`).
- Reply with the generated answer plus the source-date footer described above.
- If the diary has no notes at all yet, say so rather than attempting retrieval against an empty collection.

### 6. WebApp Search/Ask Box (Diary page)
- Add a search/ask input at the top of the Diary page, separate from the existing plain-text content search and tag filter already on that page — this one is for natural-language questions, not keyword matching.
- Display the generated answer prominently, with the source date(s) shown as clickable chips/links beneath it that scroll to or open that day's sticky note.
- Show a loading state while the question is being processed (embedding + retrieval + generation take a moment, unlike the instant local search/filter).

### 7. Privacy Note (surface this, don't bury it)
- Diary content will be sent to Google's Gemini API for embedding and answer generation when you use this feature. This is worth being explicit about even though it's your own private data — flag it plainly in the README/setup notes rather than leaving it implicit.

## Edge Cases to Handle
- Question with no well-matching diary entries → respond that nothing relevant was found, don't force an answer from weak matches.
- Empty diary (no notes yet) → tell the user there's nothing to search, in both Telegram and the WebApp.
- Embedding generation fails on save → note content still saves; embedding retried later, doesn't block the user's writing flow.
- Gemini API rate limit hit during a question (unlikely at personal-use volume, but possible if the free tier's per-minute limit is briefly exceeded) → clear, human-friendly error in both interfaces, not a raw API error, with a suggestion to try again shortly.
- A note is edited after being embedded → the embedding must be regenerated on that save, or answers could be grounded in stale content.
- Direct-date question ("what did I write on Sep 1") where that date has no note → say plainly that there's no entry for that date, don't fall back to a semantically similar but wrong-date entry.

## Testing
- Test the debounced embedding trigger fires on save commit, not per keystroke.
- Test vector retrieval against fixture data (mocked Gemini API responses) for both a clear single-entry match and a multi-entry synthesis scenario.
- Test the "nothing relevant found" path explicitly — this is the most important test, since silently hallucinating an answer would be the worst failure mode here.
- Test the direct-date shortcut resolves relative dates ("yesterday", "last Monday") correctly and bypasses vector search.
- Test source-citation accuracy: the dates returned in the answer must match the actual documents retrieved.

## Deliverables
1. Embedding generation wired into the Diary page's existing save flow, with retry-on-failure handling.
2. Firestore vector index configuration for `diaryNotes.embedding`.
3. A shared backend function (callable from both the Telegram bot and the WebApp) that takes a question and returns an answer plus source dates — built once, used by both interfaces, not duplicated.
4. The `/ask` Telegram command, added to the bot's command menu.
5. The search/ask box on the Diary page, with source-date citations and a loading state.
6. README notes on obtaining a Gemini API key from Google AI Studio, the free tier's rate limits (so you know what "comfortably within" means in concrete numbers), confirmation this is expected to cost $0/month at your usage level, and the privacy note above.

---
**Before starting implementation**, please first tell me:
1. Whether the Personal Diary feature and its `diaryNotes` schema already exist in the codebase in the form described in its spec, or need adjusting.
2. Whether a Gemini API key (Google AI Studio) already exists for this project, or needs first-time setup — and confirm you're on the Gemini Developer API path (free tier) rather than Vertex AI billing, per the cost discussion above.
3. A reasonable default for K (how many past entries to retrieve per question) and the similarity threshold below which the app should say "nothing found" — propose sensible defaults and I'll adjust after seeing it in practice.

Then proceed with implementation once confirmed.
