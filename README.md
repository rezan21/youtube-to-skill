# y2s — YouTube to Skill

Convert any YouTube video into a reusable [Agent Skill](https://agentskills.io) — a
distilled `SKILL.md` your AI coding agent loads for context, backed by the video's
full transcript. Generate it once from whatever agent/harness you already use (Claude Code,
Codex, Cursor, Gemini, …) and it becomes available to **every** agent on your
machine.

**Why?** Valuable, actionable knowledge is locked inside YouTube videos — tutorials, conference talks, deep-dives, podcasts. Applying that knowledge in a coding session today means re-watching, hand-writing notes, or pasting transcript dumps into prompts.

y2s (YouTube to Skill) is a "meta-skill", automatically distilling a youtube video into an efficient skill the agent loads by default, keeping the
heavy transcript as a reference it opens only when needed. (meta because this skill creates other skills.)

```
YouTube URL ─▶ captions ─▶ English transcript ─▶ distilled SKILL.md ─▶ installed everywhere
```

## Contents

- [y2s — YouTube to Skill](#y2s--youtube-to-skill)
  - [Contents](#contents)
  - [Requirements](#requirements)
  - [Install](#install)
  - [Usage](#usage)
    - [Generate a skill based on the YouTube Video](#generate-a-skill-based-on-the-youtube-video)
    - [List generated skills](#list-generated-skills)
  - [What a generated skill looks like](#what-a-generated-skill-looks-like)
  - [Caption handling](#caption-handling)
  - [Where skills are installed](#where-skills-are-installed)
  - [Limitations](#limitations)
  - [License](#license)

## Requirements

- **Node.js ≥ 18** — for the caption fetcher (uses built-in `fetch`; no npm install).
- **An Agent-Skills-compatible agent client** to run `/y2s` in — Claude Code, Codex, Cursor, Gemini, etc.
- **`npx`** (ships with Node) to run the installer.

## Install

Install globally with the [`skills`](https://skills.sh) CLI (the installer for the
Agent Skills ecosystem) so `/y2s` works in **every** agent on your machine —
recommended:

```bash
npx skills add -g rezan21/y2s
```

This puts a canonical copy in `~/.agents/skills/` and symlinks it into every AI agent
the installer detects.

To install into the **current project only**, drop the `-g`:

```bash
npx skills add rezan21/y2s
```

> The CLI discovers the meta-skill under `skills/y2s/`. If your version doesn't
> auto-find it, point at the subpath: `npx skills add -g rezan21/y2s/skills/y2s`.

## Usage

Run these from inside any of your agents.

### Generate a skill based on the YouTube Video

Pass a YouTube URL to `/y2s`. e.g.:
```
/y2s https://www.youtube.com/watch?v=Lsut4TCfygw
```

The URL argument can be a full watch link `www.youtube.com/watch?v=...`, a `youtu.be` link, a `/shorts` link,
or a bare 11-character video ID.

The agent fetches the captions, builds the transcript, distills the skill, installs
it, and prints a confirmation:

```
✅ Skill generated: /y2s-llm-wikis-agent-memory
Source: "LLM Wikis and how to give your agents memory", 44:14
Installed to ~/.agents/skills/y2s-llm-wikis-agent-memory, symlinked into the detected
agents (Claude Code, Cursor, Gemini CLI, …).
```

The new skill is immediately invocable as `/y2s-llm-wikis-agent-memory` from every
agent on your machine. Generated skills are always named `y2s-<slug>`, where `<slug>`
comes from the video's topic.

> **Not showing up?** If your agent doesn't discover the new skill right away, reload
> skills — in Claude Code, run `/reload-skills`. If it still doesn't appear, restart
> your IDE (in VS Code: `Cmd+Shift+P` → **Developer: Reload Window**).

### List generated skills

```
/y2s list
```

In a terminal this prints a box table of everything y2s has made:

```
  y2s skills · 1 · /Users/you/.agents/skills

  ┌─────────────────────────────┬────────────┬──────────────────────────────────────────────┬────────────┬──────────────────────┐
  │ Skill                       │ Type       │ Title                                        │ Fetched    │ Source               │
  ├─────────────────────────────┼────────────┼──────────────────────────────────────────────┼────────────┼──────────────────────┤
  │ /y2s-llm-wikis-agent-memory │ discussion │ LLM Wikis and how to give your agents memory │ 2026-07-12 │ youtu.be/Lsut4TCfygw │
  └─────────────────────────────┴────────────┴──────────────────────────────────────────────┴────────────┴──────────────────────┘
```

## What a generated skill looks like

```
~/.agents/skills/y2s-<slug>/
├── SKILL.md            # the distilled skill: trigger-based description + body
├── scripts/
│   ├── fetch_transcript.js   # re-fetch the captions later, on its own
│   └── package.json
└── references/
    ├── raw.md          # selected caption track, verbatim, original language
    └── transcript.md   # English working copy — translated/corrected; the citation target
```

`SKILL.md`'s `description` is written as a **trigger** ("use when…") so agents reach
for the skill at the right moment. Its body cites `[m:ss]` timestamps that resolve to
`transcript.md`, which maps 1:1 to `raw.md` — an anti-hallucination chain from every
claim back to the verbatim source. Everything the skill exposes is English; `raw.md`
alone preserves the original language.

## Caption handling

y2s selects the single best caption track in strict priority order:

1. **Manual English** captions (uploaded by the channel).
2. **Manual captions in any other language** → translated to English.
3. **Auto-generated English** captions.
4. **Auto-generated captions in any other language** → translated to English (lowest
   confidence; flagged in the transcript header).

A video is only rejected when it has **no caption track at all**. Human-uploaded
tracks beat auto-generated ones, and an English track beats one that must be
translated — hence the ordering. Chapters are pulled from the description when present.

## Where skills are installed

The [`skills`](https://skills.sh) CLI keeps one canonical copy and links it into each
agent:

```
~/.agents/skills/y2s-<slug>/     # canonical copy — the source of truth
~/.claude/skills/y2s-<slug>      # symlink  (Claude Code)
~/.cursor/…, ~/.gemini/…, …       # symlink or native, per agent
```

Agents that read `~/.agents/skills` directly need no per-agent copy. y2s doesn't
reimplement any of this — it hands off to the same CLI you used to install the
meta-skill.

## Limitations

- **Needs captions.** Videos with no caption track can't be processed.
- **No speaker diarization.** Captions carry no speaker labels, so podcast/interview
  attribution is *inferred* from context and marked as such.
- **Auto-caption quality varies.** Accents and dense jargon degrade auto-generated
  tracks; the transcript header discloses the tier used.
- **Model-dependent quality.** Distillation is done by whatever model your agent runs.

## License

Released under the MIT License — see [LICENSE](LICENSE).
