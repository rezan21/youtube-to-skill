#!/usr/bin/env node
// `/y2s list` — the filesystem is the index. Globs the canonical skills
// directory for y2s-generated skills, reads each skill's frontmatter, and
// prints a summary table. Zero dependencies.
//
//   node list_skills.js            # box table in a terminal, markdown when piped
//   node list_skills.js --pretty   # force the box table
//   node list_skills.js --plain    # force the markdown table

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SKILLS_DIR = join(homedir(), '.agents', 'skills');

// Minimal frontmatter reader — pulls top-level keys and the nested `metadata:`
// block. Avoids a YAML dependency; y2s writes predictable, flat frontmatter.
function readFrontmatter(skillMd) {
  const m = skillMd.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { metadata: {} };
  const out = { metadata: {} };
  let inMetadata = false;
  for (const line of m[1].split('\n')) {
    if (/^metadata:\s*$/.test(line)) { inMetadata = true; continue; }
    const kv = line.match(/^(\s*)([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, indent, key, rawVal] = kv;
    const val = rawVal.replace(/^["']|["']$/g, '').trim();
    if (indent.length > 0 && inMetadata) out.metadata[key] = val;
    else if (indent.length === 0) { inMetadata = false; out[key] = val; }
  }
  return out;
}

function collect() {
  if (!existsSync(SKILLS_DIR)) return [];
  const rows = [];
  for (const entry of readdirSync(SKILLS_DIR)) {
    if (!entry.startsWith('y2s-')) continue;
    const skillMd = join(SKILLS_DIR, entry, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    const fm = readFrontmatter(readFileSync(skillMd, 'utf-8'));
    rows.push({
      name: fm.name || entry,
      title: fm.metadata.source_title || '—',
      type: fm.metadata.content_type || '—',
      source: fm.metadata.source_url || '—',
      fetched: fm.metadata.fetched || fm.metadata.published || '—',
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

const truncate = (s, max) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

// Long watch URLs → youtu.be/<id> so the table stays narrow.
const compactSource = (url) => {
  const m = String(url).match(/[?&]v=([\w-]{11})/) || String(url).match(/youtu\.be\/([\w-]{11})/);
  return m ? `youtu.be/${m[1]}` : url;
};

const COLUMNS = [
  { head: 'Skill', get: (r) => '/' + r.name, max: 34 },
  { head: 'Type', get: (r) => r.type, max: 11 },
  { head: 'Title', get: (r) => r.title, max: 46 },
  { head: 'Fetched', get: (r) => r.fetched, max: 10 },
  { head: 'Source', get: (r) => compactSource(r.source), max: 24 },
];

function renderBoxTable(rows) {
  const cells = rows.map((r) => COLUMNS.map((c) => truncate(String(c.get(r)), c.max)));
  const w = COLUMNS.map((c, i) => Math.min(c.max, Math.max(c.head.length, ...cells.map((row) => row[i].length))));
  const rule = (l, mid, r) => l + w.map((n) => '─'.repeat(n + 2)).join(mid) + r;
  const line = (arr) => '│' + arr.map((cell, i) => ' ' + cell.padEnd(w[i]) + ' ').join('│') + '│';
  return [
    rule('┌', '┬', '┐'),
    line(COLUMNS.map((c) => c.head)),
    rule('├', '┼', '┤'),
    ...cells.map(line),
    rule('└', '┴', '┘'),
  ].join('\n');
}

function renderMarkdown(rows) {
  const out = [`# y2s skills (${rows.length}) — ${SKILLS_DIR}`, '', '| Skill | Type | Title | Fetched | Source |', '|---|---|---|---|---|'];
  for (const r of rows) out.push(`| /${r.name} | ${r.type} | ${r.title} | ${r.fetched} | ${r.source} |`);
  return out.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const rows = collect();
  if (!rows.length) {
    console.log(`No y2s skills found in ${SKILLS_DIR}.`);
    console.log('Generate one with:  /y2s <youtube-url>');
    return;
  }
  const pretty = args.includes('--pretty') || (process.stdout.isTTY && !args.includes('--plain'));
  if (pretty) {
    console.log(`\n  y2s skills · ${rows.length} · ${SKILLS_DIR}\n`);
    console.log(renderBoxTable(rows).replace(/^/gm, '  '));
    console.log('');
  } else {
    console.log(renderMarkdown(rows));
  }
}

main();
