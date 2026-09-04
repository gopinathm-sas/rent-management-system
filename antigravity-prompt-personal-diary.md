# Feature Request: Personal Diary Page (Sticky Notes, One Per Day)

## Context
This is my Rental Management App (React 18, TypeScript/JSX, Vite, Tailwind CSS, Firebase Auth + Firestore backend — same stack as the rest of the app). I'm the only person who uses this app — no other staff or tenant logins exist. I want a new, separate page inside the app — a personal diary — where I can jot down notes for myself, organized by date and shown as sticky notes.

**Before writing any code, first inspect the existing app structure**: how pages/routes are organized (e.g. alongside `src/pages/RentDetails.jsx`) and how navigation is added (sidebar/nav config), so the new page fits in consistently. Since there's only one user, access control is simple: anyone who can log into the app at all should see this page — no role-based restriction needed.

## Goal
Add a "Personal Diary" page to the app where each calendar day has exactly one note, displayed as a sticky note titled with its date. Notes are freely taggable and organized/browsable by date and by tag.

## Confirmed Requirements (from our discussion)
- **One note per day** — the day is the unit of entry, not individual timestamped entries. I can keep adding to or editing a given day's note throughout that day (and revisit/edit past days too).
- **Free-form tags** — I type my own tags per note (no fixed category list).
- **Single-user app** — I'm the only person who logs in at all, so this page just needs to sit behind the app's existing login like every other page. No separate Owner-vs-staff role check is needed.

## Functional Requirements

### 1. Data Model
- One Firestore document per calendar day, in a dedicated collection (e.g. `diaryNotes`), with the document ID as the date key (e.g. `"2026-09-04"`) so there's naturally exactly one note per day — no duplicate-day risk by construction.
- Each document holds: `content` (the note text), `tags` (array of free-form strings), `createdAt`, `updatedAt`, and an optional `color` (for the sticky-note visual variety described below).
- Standard Firestore security rules requiring authentication (same as the rest of the app's collections) are sufficient here — no additional role check needed, since there's only one user.

### 2. Sticky Note Grid (main view)
- Display notes as a grid of sticky notes (Google-Keep-style), most recent day first.
- Each sticky note is titled with its formatted date (e.g. "Sep 4, 2026") as the heading, shows a truncated preview of the content, and displays its tags as small chips at the bottom of the note.
- Give notes a bit of visual personality consistent with a real sticky-note/diary feel — e.g. a slight rotation, a soft shadow, and a small set of rotating pastel background colors — rather than uniform flat cards, since the whole point is that it should feel like sticky notes, not a plain data table.
- If today doesn't have a note yet, show an inviting empty/prompt sticky at the top ("+ Add today's note") so starting a new entry is always one click away.
- If there are no notes at all yet, show a friendly empty state rather than a blank page.

### 3. Creating & Editing a Note
- Clicking a sticky note (or the "+ Add today's note" prompt) opens it for editing — a modal or expanded in-place view with a text area for content and a tag input below it.
- Tag input: type a tag and press Enter (or similar) to add it as a chip; click an "x" on a chip to remove it. As the user types a new tag, show existing tags that are a close match (case-insensitive) as suggestions, to reduce accidental near-duplicate tags (e.g. "Ideas" vs "idea") — same principle as avoiding near-duplicate categories elsewhere in the app.
- Auto-save changes after a short pause in typing (debounced), with a small "Saved" / "Saving..." indicator, rather than requiring an explicit save button — this should feel like a frictionless diary, not a form.
- Show the note's last-updated time somewhere in the editing view (e.g. "Last edited 2:14 PM").
- Allow deleting a day's note entirely, behind a confirmation step (since this is personal data and accidental loss would be frustrating) — confirm before removing, don't make it a one-click destructive action.

### 4. Browsing & Finding Past Notes
- A search box that filters notes by matching text in the content.
- A tag filter (click a tag chip, or select from a list of all tags used so far) to show only notes containing that tag.
- A way to jump to a specific date directly (e.g. a small calendar picker) rather than only scrolling through the grid, since a diary can grow long over time.
- Combine search/tag-filter/date-jump sensibly — e.g. search and tag filter can apply together, while date-jump scrolls to that specific note.

### 5. Navigation & Access
- Add "Personal Diary" (or similar) to the app's existing navigation, visible the same way any other page is — no role-based visibility logic needed since there's only one user.
- Standard authenticated-only Firestore rules apply here, consistent with the rest of the app's collections.

### 6. Responsiveness
- The sticky-note grid should reflow sensibly on mobile widths (e.g. a single column) rather than only looking right on desktop.

## Edge Cases to Handle
- Opening today's note when it already exists (not empty) → open directly into edit mode with existing content, don't overwrite it.
- Typing a tag that's a near-duplicate of an existing one → suggest the existing tag rather than silently allowing both to coexist as separate near-identical tags (final choice is still the user's).
- Deleting a note that has tags used nowhere else → those tags simply stop appearing in the tag filter list; no orphaned-tag cleanup needed beyond that.
- Very long note content → the preview on the sticky note truncates gracefully (e.g. with an ellipsis and a "click to read more" affordance), full content is available in the edit view.
- Editing a note offline/with a flaky connection → auto-save should handle retry/failure gracefully (e.g. a visible "couldn't save, retrying..." state) rather than silently losing changes.
- No notes yet at all (brand-new feature, empty collection) → friendly empty state, not a broken-looking blank grid.

## Testing
- Unit test the date-key generation (one doc per calendar day, correct formatting/timezone handling).
- Test auto-save debouncing behavior (rapid typing shouldn't trigger a save per keystroke).
- Test tag suggestion matching (near-duplicate detection) with a small fixture set of existing tags.
- Test access restriction: confirm the `diaryNotes` collection requires authentication like the rest of the app's collections (no anonymous read/write).
- Test search and tag-filter combinations against fixture data.

## Deliverables
1. The new Personal Diary page, wired into the app's existing navigation and routing conventions.
2. Firestore security rules for the `diaryNotes` collection, consistent with how the rest of the app's collections are already protected (authenticated access only).
3. The sticky-note grid view, the note editor (create/edit/delete), tag input with suggestions, search, tag filtering, and date-jump navigation.
4. A summary of what existing files/patterns were reused (routing setup, Tailwind theme values) so the new page fits in visually and structurally rather than looking bolted on.

---
**Before starting implementation**, please first tell me:
1. Whether there's an existing rich-text/markdown editor component already used elsewhere in the app that should be reused for the diary content, or whether a plain textarea is the right call here.
2. What the existing navigation/sidebar structure looks like, so the new page is added consistently with how other pages (like Rent Status) are already linked in.

Then proceed with implementation once confirmed.
