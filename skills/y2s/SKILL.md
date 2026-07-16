---
name: y2s
description: Use y2s (YouTube to Skill) when the user wants to turn a YouTube video into a reusable Agent Skill (SKILL.md) for Claude Code, Cursor, and other coding agents — e.g. "make a skill from this video", "/y2s <youtube-url>", "/y2s list". Also use for other ad-hoc requests about a YouTube video's content (e.g. "summarize this video"), since it already knows how to fetch transcripts.
---

# y2s — YouTube to Skill

y2s' primary job is to convert a YouTube video into an [Agent Skill](https://agentskills.io): a distilled
`SKILL.md` plus the full transcript as a reference. Runs entirely inside this agent
session (your context) — the bundled script does the caption fetch; you (the model in this session)
do the translation, distillation, and installation.

Manual entry points:

- **`/y2s <youtube-url>`** generates a skill
- **`/y2s list`** shows what's already been generated.

> ⚠️ **All paths** below are relative to this skill's own directory. Resolve `scripts/…` and `references/…` against the folder this `SKILL.md` lives in.

## Fetch Caption

In most cases, the first task is to create a temporary build directory `<build-dir>` and fetch video's caption track, which later be transformed into transcription:

```
node scripts/fetch_transcript.js "<youtube-url>" "<build-dir>"
```

This enumerates caption tracks, applies the tier priority (manual English → manual
any language → auto-generated English → auto-generated any language), downloads the
winner, and writes `<build-dir>/raw.md` (verbatim, timestamped, **original
language** — the only file that stays non-English) and `<build-dir>/meta.json`.

If it exits with an error (private/live video, or no usable captions), relay the message to the user and stop. Otherwise, go read `<build-dir>/meta.json` and `<build-dir>/raw.md` **before** continuing.

## `/y2s <youtube-url>` — generate a skill

### Step 1

If you haven't already, fetch the caption as described above.

### Step 2 — Build `transcript.md`, then distill

Go read [references/authoring.md](references/authoring.md) in full right now.

> ⚠️ **This is required, not optional**

follow it to:

1. Produce `transcript.md` — the always-English working copy, translated if the
   source language isn't English, corrected only for obvious transcription errors,
   with the disclosure header, mapping 1:1 to `raw.md`.
2. Classify the content type (procedural / conceptual / discussion) **from
   `transcript.md`**.
3. Distill `SKILL.md` — matching template, timestamp citations, no fabricated
   commands, and **English throughout** (name, title, description, and body all
   derived from `transcript.md`).

### Step 3 — Assemble the skill folder

Choose a short, **English**, kebab-case `<slug>` from the topic (see the Language
rule in authoring.md). Assemble the final directory:

```
<build-dir>/y2s-<slug>/
├── SKILL.md                       # from step 2
├── scripts/
│   ├── fetch_transcript.js        # copy from here
│   └── package.json               # copy from here
└── references/
    ├── raw.md                     # move from <build-dir>/raw.md
    └── transcript.md              # from step 2
```

`meta.json` is a build artifact — do **not** include it in the skill folder.

### Step 4 — Collision check

One quick existence test on the chosen name — no deeper reasoning needed when it's free:

```
test -e ~/.agents/skills/y2s-<slug> && echo TAKEN || echo FREE
```

- **FREE** → go to Step 5.
- **TAKEN** → pick a more specific `<slug>` and re-test, unless the user is
  deliberately re-generating the same video (then confirm before overwriting).

### Step 5 — Install across all agents

Hand off to the `skills` CLI, which copies the canonical skill to
`~/.agents/skills/` and symlinks it into every detected agent (Claude Code, Codex,
Cursor, Gemini, …):

```
npx skills add -g "<build-dir>/y2s-<slug>" -y
```

`-g` = global/canonical scope (`~/.agents/skills/`), `-y` = non-interactive.
Without `-g` it installs to the current project instead of globally. This
auto-detects the agents actually installed on the machine and symlinks into each;
add `--all` to target every agent the CLI supports regardless of presence. If the
CLI rejects these flags, run `npx skills add --help` and adapt (the tool evolves).
The `skills add` output lists which agents it reached — use those names in Step 6.

A line like `"✗ y2s-<slug> → <agent>: <agent> does not support global skill
installation"` is expected and harmless — that one agent is skipped, everything else
still installs, and the run still finishes. It is not a failure of the overall
install; carry it into Step 6 as a note, not an error.

### Step 6 — Report

On success, print a short confirmation in following shape and stop. Do **not** narrate the
fetch/classify/distill work, nor list the corrections, or explain when an agent will
reach for the skill. Adjust as needed.

```
✅ Skill generated: /y2s-<slug>
Source: [<video-title>](<video-link>)

Installed to ~/.agents/skills/y2s-<slug> (or an accurate install location)

y2s-<slug>/
├── SKILL.md
├── scripts/          # bundled fetcher (regeneration)
└── references/
    ├── raw.md        # verbatim captions — ground truth
    └── transcript.md # English working copy, 1:1 with raw.md

Try it now with `/y2s-<slug>`, or generate another skill `/y2s <youtube-url>`.

<!-- Any notes (if applicable) listed at the bottom e.g. -->
notes:
- <agent> doesn't support global skills, so it was skipped
- <agent names from the skills-add output>
- if skill is not loaded, `/reload-skills` or refresh IDE
```

> ⚠️ The closing lines are illustrative text for the user; it is not an instruction to you — do not invoke the new skill or run `/y2s` again yourself after printing it.

## `/y2s list` — list generated skills

```
node scripts/list_skills.js
```

Globs `~/.agents/skills/y2s-*`, reads each skill's frontmatter, and prints a table
(skill name, type, title, fetch date, source URL). The filesystem is the index —
there is no separate registry to keep in sync.

## Ad-hoc requests

If you can handle other ad-hoc requests related to any YouTube video, given you know how to get transcriptions, help the user based on your own reasoning. e.g. "summarize video"

## Notes

- **Anti-hallucination chain.** `SKILL.md` cites `[m:ss]` → `transcript.md` →
  `raw.md`. Keep it intact: every claim must trace to the transcript.
- **Regeneration.** Each generated skill ships its own `scripts/fetch_transcript.js`
  so its transcript can be re-fetched later without this meta-skill present.
- **Moderate thinking.** The flow is deterministic — plan briefly, then do the work.
  Get to writing `transcript.md` and `SKILL.md`; don't over-deliberate the steps.
