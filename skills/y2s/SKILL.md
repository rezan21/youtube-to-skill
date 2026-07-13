---
name: y2s
description: Use when the user wants to turn a YouTube video (talk, tutorial, conference session, podcast, or interview) into a reusable Agent Skill — e.g. "make a skill from this video", "/y2s <url>", or "/y2s list". Fetches the best caption track, distills it into an installable SKILL.md with the full transcript as a reference, and installs it across every AI coding agent on the machine.
metadata:
  version: "1.0"
  homepage: https://skills.sh
---

# y2s — YouTube to Skill

Convert a YouTube video into an [Agent Skill](https://agentskills.io): a distilled
`SKILL.md` plus the full transcript as a reference. Runs entirely inside this agent
session — the bundled script does the caption fetch; you (the model in this session)
do the translation, distillation, and installation.

Two entry points: **`/y2s <url>`** generates a skill; **`/y2s list`** shows what's
already been generated.

> ⚠️ **Reading [references/authoring.md](references/authoring.md) before you distill
> is required, not optional.** 

> Paths below are relative to this skill's own directory. Resolve `scripts/…` and
> `references/…` against the folder this `SKILL.md` lives in.

---

## `/y2s <url>` — generate a skill

### Step 1 — Fetch captions

Create a scratch build directory, then run the fetcher into it:

```
node scripts/fetch_transcript.js "<url>" "<build-dir>"
```

This enumerates caption tracks, applies the tier priority (manual English → manual
any language → auto-generated English → auto-generated any language), downloads the
winner, and writes `<build-dir>/raw.md` (verbatim, timestamped, **original
language** — the only file that stays non-English) and `<build-dir>/meta.json`.

If it exits with an error (private/live video, or no usable captions), relay the
message to the user and stop — there is no STT fallback yet. To preview tracks
without downloading: `node scripts/fetch_transcript.js --list "<url>"`.

Read `<build-dir>/meta.json` and `<build-dir>/raw.md` before continuing.

### Step 2 — Build `transcript.md`, then distill

**Read [references/authoring.md](references/authoring.md) in full now** (if you
haven't already) and follow it to:

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
│   ├── fetch_transcript.js        # copy from this skill's scripts/
│   └── package.json               # copy from this skill's scripts/
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

### Step 6 — Report (concise)

On success, print a short confirmation in this shape and stop. Do **not** narrate the
fetch/classify/distill work, list the corrections, or explain when an agent will
reach for the skill:

    ✅ Skill generated: /y2s-<slug>
    Source: <English title>, <duration>
    Installed to ~/.agents/skills/y2s-<slug>, symlinked into the detected agents
    (<agent names from the skills-add output>).

    y2s-<slug>/
    ├── SKILL.md
    ├── scripts/          # bundled fetcher (regeneration)
    └── references/
        ├── raw.md        # verbatim captions — ground truth
        └── transcript.md # English working copy, 1:1 with raw.md

---

## `/y2s list` — list generated skills

```
node scripts/list_skills.js
```

Globs `~/.agents/skills/y2s-*`, reads each skill's frontmatter, and prints a table
(skill name, type, title, fetch date, source URL). The filesystem is the index —
there is no separate registry to keep in sync.

---

## Notes

- **No API keys, ever.** All model work (translation, distillation) uses this
  session's own LLM. The fetcher needs only Node ≥18 and makes no authenticated
  calls.
- **Anti-hallucination chain.** `SKILL.md` cites `[m:ss]` → `transcript.md` →
  `raw.md`. Keep it intact: every claim must trace to the transcript.
- **Regeneration.** Each generated skill ships its own `scripts/fetch_transcript.js`
  so its transcript can be re-fetched later without this meta-skill present.
- **Moderate thinking.** The flow is deterministic — plan briefly, then do the work.
  Get to writing `transcript.md` and `SKILL.md`; don't over-deliberate the steps.
