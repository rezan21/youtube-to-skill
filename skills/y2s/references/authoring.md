# Authoring guide — turning a fetched transcript into a skill

Loaded during `/y2s <url>` after `fetch_transcript.js` has produced `raw.md` +
`meta.json` in the scratch directory. Covers steps 2–3 of the flow: build
`transcript.md`, classify, and distill `SKILL.md`.

**Work efficiently — plan briefly, then write.** Read `raw.md` + `meta.json` once,
decide your approach, and produce the files directly. Don't deliberate paragraph by
paragraph or re-plan between steps. Spend judgment where it matters — corrections,
classification, speaker attribution, what to keep vs. cut — not on the mechanical
rewriting or on re-reasoning the flow.

## Language rule (applies to everything below)

**Everything the generated skill exposes is in English** — the `SKILL.md` `name`
(slug), `description`, `metadata.source_title`, and the body heading and text; and
`transcript.md`. All of it is derived from `transcript.md`, which is itself always
English (translated in Step 2 if the source wasn't).

**`references/raw.md` is the only file that may be in another language.** It holds
the verbatim caption track and the original-language video title, so the source of
truth is never lost. If the video isn't in English, you still translate into English
for every other file — including the title. Do not leave any non-English text in
`SKILL.md`, `transcript.md`, or the frontmatter.

- **English naming convention.** The `y2s-<slug>` name is English, kebab-case,
  ASCII `a–z`/`0–9`/`-` only — transliterate or translate a non-English topic into
  an English slug (e.g. a Persian food-review video → `y2s-street-food-review`, not
  a transliteration of the Persian title).
- **English title.** Use an English `source_title` (translate it if the original
  isn't English). The original-language title stays in `raw.md`.

## Step 2 — Build `transcript.md` (English working copy)

`transcript.md` is the citation target for everything the skill claims. It is
**always English** and maps 1:1 to `raw.md`.

Rules:

1. **Preserve the paragraph/timestamp structure of `raw.md` exactly.** Same number
   of paragraphs, same `[m:ss]` timestamps, same order. You are rewriting the text
   inside each paragraph, never regrouping or re-timing. This 1:1 mapping is what
   lets a reader check any cited passage against the verbatim source.
2. **Translate if needed.** If `meta.json` `sourceLanguage` is not English,
   translate every paragraph into natural English. If it is already English, keep
   the wording and only correct as below. A `caption_tier` of `auto_nonen`
   (auto-transcribed *and* now translated) is the lowest-confidence source — lean
   conservative, and make the disclosure header say so plainly.
3. **Correct conservatively.** Fix only *obvious* transcription errors — misheard
   words, garbled names, mangled technical terms (e.g. auto-caption "wiks" → "wikis",
   "Devon" → "Devin" when context makes the intended word unambiguous). Do **not**
   paraphrase, summarize, smooth filler, or "improve" phrasing. When a word is
   ambiguous, leave it as-is. Corrections must be verifiable against `raw.md`.
4. **Disclose what you did** in a header at the top of `transcript.md`, before the
   paragraphs:

```
# Transcript — <English title>

- **Source:** <url>
- **Caption tier:** <manual English | manual (non-English) | auto-generated English | auto-generated (non-English)>
- **Source language:** <e.g. English | German (de)>
- **Translated:** <no | yes, from German>
- **Corrections:** <none | N obvious transcription fixes (e.g. "wiks"→"wikis", "Devon"→"Devin")>

> English working copy. Paragraph timestamps map 1:1 to `raw.md`; verify any cited
> claim there before relying on it.

---
```

Then the paragraphs, each `[m:ss] text`, matching `raw.md` line-for-line.

### Long videos (2h+)

When `raw.md` is too large to translate/correct or distill in one pass, work in
sections — split by the `meta.json` chapters when present, otherwise by ~20-minute
time windows. Produce `transcript.md` section by section (keeping the 1:1 mapping),
then distill each section's key points and synthesize them into one coherent
`SKILL.md` body. The body still obeys the < 5 000-word limit; the length lives in
`transcript.md`.

## Step 3a — Classify the content type

Classify from `transcript.md` (the English working copy you just built), using
`meta.json` `category` only as a secondary signal. Pick the single best fit:

- **Procedural** — tutorials, setup guides, walkthroughs. The video's value is a
  sequence of actions the viewer reproduces.
- **Conceptual** — talks, explainers, lectures. The value is ideas, models, and
  judgment the viewer applies, not steps to copy.
- **Discussion** — podcasts, interviews, panels. Multiple people, exchanged views,
  no single procedure.

When a video blends types, choose by what a reader would *act on*, and you may fold
a short section from another template in.

## Step 3b — Distill `SKILL.md`

**Agent Skills compliance (check inline, no extra file to read):**

- `name` must be `y2s-<slug>` — 1–64 chars, lowercase `a-z`/`0-9`/`-` only, no
  leading/trailing hyphen, no `--`, and it must equal the skill's own directory
  name (`y2s-<slug>/`). Verify `<slug>` against this when you pick it in Step 3.
- `description` is 1–1024 chars and must state what the skill does *and* when to
  use it — see the trigger-phrasing rule right below. Only `name` + `description`
  load at agent startup, so this field alone decides whether the skill ever gets
  read; don't undersell it.
- Body stays well under ~500 lines / 5000 tokens — push bulk to `references/`.
- `scripts/fetch_transcript.js` must stay listed in the generated `SKILL.md`'s file
  tree (Step 6 already does this) and must not prompt interactively — it doesn't,
  keep it that way if it's ever touched.
- All `references/…` and `scripts/…` paths in the generated `SKILL.md` are relative
  to that skill's own root, never absolute.

Frontmatter (YAML):

```
---
name: y2s-<slug>
description: <trigger — WHEN an agent should reach for this skill, not a synopsis>
metadata:
  source_url: <url>
  source_title: <English title — translate if the original isn't English>
  channel: <channel>
  published: <publishDate or "unknown">
  fetched: <fetchedAt>
  duration: <duration>
  content_type: procedural | conceptual | discussion
  caption_tier: manual_en | manual_nonen | auto_en | auto_nonen
  source_language: <code>
  translated: <true|false>
  corrections: <count>
---
```

- `<slug>`: short, **English**, kebab-case (see the Language rule above), derived
  from the topic (not the raw title). Keep it recognizable and specific enough not
  to collide.
- `description`: written as a **trigger**. "Use when <situation an agent is in>…",
  naming the concrete problems/technologies the video actually covers. Never a
  restatement of the title.

Body: use the matching template below. Universal rules:

- Body stays **well under 5 000 words**; anything bulky lives in `references/`.
- **Every non-obvious claim cites a timestamp** `[m:ss]` resolving to
  `transcript.md`. This is the anti-hallucination chain — no claim the transcript
  doesn't support.
- **Never invent commands, flags, code, or numbers** that aren't in the transcript.
  If the video is vague, say so rather than filling the gap.
- End with a short "Full source" section pointing to `references/transcript.md` and
  `references/raw.md`.

### Template: Procedural

```
# <Task the skill helps accomplish>

<1–2 sentences: what this procedure achieves and when to use it.>

## Prerequisites
- <tools/versions/accounts stated in the video>

## Steps
1. <action> — <exact command / code as shown> [m:ss]
2. …

## Pitfalls
- <mistake the presenter called out> [m:ss]

## Full source
- `references/transcript.md`, `references/raw.md`
```

### Template: Conceptual

```
# <The idea, framed as something to apply>

<1–2 sentences on the core thesis.>

## Core principles
- <principle> — <why it holds> [m:ss]

## Mental models / frameworks
- <model and how to use it> [m:ss]

## When to apply / when not to
- <decision guidance> [m:ss]

## Full source
- `references/transcript.md`, `references/raw.md`
```

### Template: Discussion

```
# <Topic under debate>

<1–2 sentences: who is talking and what's at stake. Speaker attribution is inferred
— see below — and always marked as such.>

## Key claims & positions
- **<Speaker>:** <claim/position> [m:ss]

## Points of agreement / tension
- <where they converged or clashed> [m:ss]

## Actionable takeaways
- <what a listener should do differently> [m:ss]

## Notable quotes
- "<quote>" — <Speaker> [m:ss]

## Full source
- `references/transcript.md`, `references/raw.md`
```

**Speaker inference (Discussion only).** Captions carry no speaker labels. Infer
attribution in priority order and mark it inferred:

1. **Metadata first** — names/roles in the video title, description, and channel
   (`meta.json`).
2. **In-transcript cues** — self-introductions ("I'm X, I lead…"), hand-offs
   ("X, you're up"), and turn markers (`>>`).
3. **Fallback** — generic `Speaker 1`, `Speaker 2` when a real name can't be
   grounded.

If a speaker's name is revealed partway through, update **all** of that speaker's
earlier labels to match. State in the header that attribution is inferred and should
be spot-checked against `transcript.md`.
