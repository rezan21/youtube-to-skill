#!/usr/bin/env node
// y2s caption fetcher — the pipeline's mechanical step.
// Enumerates a YouTube video's caption tracks, applies the y2s tier priority
// (manual-EN -> manual-any -> auto-EN), downloads the winner, segments it into
// sentence-anchored timestamped paragraphs, and writes raw.md + meta.json.
//
// Zero runtime dependencies (Node >= 18 built-in fetch). All YouTube interaction
// is isolated in this file.
//
//   node fetch_transcript.js <url-or-id> <out-dir>   write raw.md + meta.json
//   node fetch_transcript.js <url-or-id>             print raw.md to stdout
//   node fetch_transcript.js --list <url-or-id>      list caption tracks only

import { mkdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const INNERTUBE = 'https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false';

// Playable clients (rotated). These see caption tracks + videoDetails.
const CLIENTS = [
  { name: 'ios', clientName: 'IOS', clientVersion: '20.10.4', header: '5',
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    context: { deviceMake: 'Apple', deviceModel: 'iPhone16,2', platform: 'MOBILE', osName: 'iOS', osVersion: '18.3.2.22D82' } },
  { name: 'android_vr', clientName: 'ANDROID_VR', clientVersion: '1.62.20', header: '28',
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.62.20 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    context: { deviceMake: 'Oculus', deviceModel: 'Quest 3', platform: 'MOBILE', osName: 'Android', osVersion: '12L', androidSdkVersion: 32 } },
  { name: 'mweb', clientName: 'MWEB', clientVersion: '2.20251209.01.00', header: '2',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    context: { platform: 'MOBILE', osName: 'iOS', osVersion: '17.5.1' } },
];
// Web client is often bot-blocked for playback but still returns microformat
// (publishDate, category) — fetched best-effort for provenance only.
const META_CLIENT = { name: 'web', clientName: 'WEB', clientVersion: '2.20251209.01.00', header: '1',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', context: { platform: 'DESKTOP' } };

const HTML_ENTITIES = { '&amp;': '&', '&#39;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#160;': ' ' };
const decodeEntities = (t) => t.replace(/&(amp|#39|quot|lt|gt|nbsp|#160);/g, (m) => HTML_ENTITIES[m]);

// ---------------------------------------------------------------- URL / IDs

function extractVideoId(input) {
  // Tolerate shell-escaped URLs (literal backslashes before ? = & …) and stray whitespace.
  const cleaned = String(input).trim().replace(/\\/g, '');
  if (/^[\w-]{11}$/.test(cleaned)) return cleaned;
  try {
    const url = new URL(cleaned);
    if (url.hostname.replace(/^www\./, '') === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      if (/^[\w-]{11}$/.test(id)) return id;
    }
    const v = url.searchParams.get('v');
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const path = url.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
    if (path) return path[1];
  } catch { /* fall through to a permissive scan */ }
  for (const re of [/[?&]v=([\w-]{11})/, /youtu\.be\/([\w-]{11})/, /\/(?:embed|shorts|live|v)\/([\w-]{11})/]) {
    const m = cleaned.match(re);
    if (m) return m[1];
  }
  const err = new Error(`Could not extract a YouTube video ID from "${input}". Pass a watch URL, youtu.be link, or 11-character video ID.`);
  err.userFacing = true;
  throw err;
}

// ---------------------------------------------------------------- network

async function callPlayer(videoId, client) {
  const body = {
    context: { client: { clientName: client.clientName, clientVersion: client.clientVersion, hl: 'en', gl: 'US', ...client.context },
      user: { lockedSafetyMode: false }, request: { useSsl: true } },
    videoId, contentCheckOk: true, racyCheckOk: true,
  };
  const res = await fetch(INNERTUBE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: '*/*', 'User-Agent': client.userAgent,
      'X-YouTube-Client-Name': client.header, 'X-YouTube-Client-Version': client.clientVersion, Origin: 'https://www.youtube.com' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`InnerTube ${client.name} HTTP ${res.status}`);
  return res.json();
}

// Rotate clients; return the first playable response (prefer one with tracks).
async function fetchPlayer(videoId) {
  let firstPlayable = null;
  const failures = [];
  for (const client of CLIENTS) {
    try {
      const data = await callPlayer(videoId, client);
      const status = data.playabilityStatus?.status;
      if (status && status !== 'OK') {
        failures.push(`${client.name}: ${status}${data.playabilityStatus?.reason ? ` — ${data.playabilityStatus.reason}` : ''}`);
        continue;
      }
      firstPlayable ||= data;
      if (data.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) return data;
    } catch (err) {
      failures.push(`${client.name}: ${err.message}`);
    }
  }
  if (firstPlayable) return firstPlayable;
  const err = new Error(`Video is not accessible.\n  ${failures.join('\n  ')}`);
  err.userFacing = true;
  throw err;
}

async function fetchMicroformat(videoId) {
  try {
    const data = await callPlayer(videoId, META_CLIENT);
    const mf = data.microformat?.playerMicroformatRenderer;
    if (!mf) return {};
    return { publishDate: (mf.publishDate || mf.uploadDate || '').slice(0, 10) || null, category: mf.category || null };
  } catch { return {}; }
}

async function fetchJson3(baseUrl) {
  const url = baseUrl.replace(/&fmt=[^&]+/, '') + '&fmt=json3';
  const res = await fetch(url, { headers: { 'User-Agent': CLIENTS[0].userAgent } });
  if (!res.ok) throw new Error(`Caption download failed: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) return [];
  return JSON.parse(text).events ?? [];
}

// ---------------------------------------------------------------- tracks

function trackName(track) {
  return track.name?.simpleText ?? track.name?.runs?.map((r) => r.text).join('') ?? track.languageCode;
}

function enumerateTracks(playerData) {
  const tracks = playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return tracks.map((t) => ({
    languageCode: t.languageCode,
    name: trackName(t),
    kind: t.kind === 'asr' ? 'asr' : 'manual',
    isEnglish: /^en\b/.test(t.languageCode) || t.languageCode.startsWith('en-'),
    baseUrl: t.baseUrl,
  }));
}

// y2s tier priority (spec §2): manual-EN -> manual-any -> auto-EN -> auto-any.
// The session LLM translates non-English winners into transcript.md. Reject only
// when the video carries no caption track at all.
function selectTrack(tracks) {
  const manualEn = tracks.find((t) => t.kind === 'manual' && t.isEnglish);
  if (manualEn) return { track: manualEn, tier: 'manual_en' };
  const manualAny = tracks.find((t) => t.kind === 'manual');
  if (manualAny) return { track: manualAny, tier: 'manual_nonen' };
  const autoEn = tracks.find((t) => t.kind === 'asr' && t.isEnglish);
  if (autoEn) return { track: autoEn, tier: 'auto_en' };
  const autoAny = tracks.find((t) => t.kind === 'asr');
  if (autoAny) return { track: autoAny, tier: 'auto_nonen' };
  return null;
}

// ---------------------------------------------------------------- captions -> snippets

function parseSnippets(events) {
  const snippets = [];
  for (const ev of events) {
    if (!ev.segs || ev.aAppend === 1) continue;
    const raw = ev.segs.map((s) => s.utf8 ?? '').join('');
    const text = decodeEntities(raw.replace(/\s+/g, ' ')).trim();
    if (!text) continue;
    snippets.push({ start: (ev.tStartMs ?? 0) / 1000, dur: (ev.dDurationMs ?? 0) / 1000, text });
  }
  return snippets;
}

// ---------------------------------------------------------------- segmentation

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;
const isCJKChar = (c) => c != null && CJK.test(c);
const SENTENCE_END = '.!?…。！？';
const PARAGRAPH_GAP = 2;      // seconds of silence that ends a paragraph
const SENTENCES_PER_PARAGRAPH = 5;
const MAX_LINE_SECONDS = 15;  // hard cap when a track lacks punctuation/pauses

// Concatenate snippets into one string, remembering each snippet's char span and
// timing. CJK snippets are joined without an inserting space.
function buildTimeline(snippets) {
  let text = '';
  const segs = [];
  for (const s of snippets) {
    if (text.length) {
      const joinWithSpace = !(isCJKChar(text[text.length - 1]) && isCJKChar(s.text[0]));
      if (joinWithSpace) text += ' ';
    }
    const charStart = text.length;
    text += s.text;
    segs.push({ charStart, charEnd: text.length, start: s.start, end: s.start + s.dur });
  }
  return { text, segs };
}

// Timestamp at a character offset: interpolated proportionally inside its snippet.
function timeAt(offset, segs) {
  let lo = 0, hi = segs.length - 1, idx = -1;
  while (lo <= hi) {                       // last segment whose charStart <= offset
    const mid = (lo + hi) >> 1;
    if (segs[mid].charStart <= offset) { idx = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (idx === -1) return segs[0].start;    // before the first snippet
  const seg = segs[idx];
  if (offset >= seg.charEnd) return seg.end; // in the inter-snippet gap
  const span = Math.max(1, seg.charEnd - seg.charStart);
  const frac = (offset - seg.charStart) / span;
  return seg.start + (seg.end - seg.start) * frac;
}

// Split into sentences with start/end times. Falls back to pause-delimited lines
// when the track carries little or no sentence punctuation.
function toSentences(snippets) {
  const { text, segs } = buildTimeline(snippets);
  const firstNonSpace = (from) => { let i = from; while (i < text.length && /\s/.test(text[i])) i++; return i; };
  const sentences = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!SENTENCE_END.includes(text[i])) continue;
    let j = i;
    while (j + 1 < text.length && SENTENCE_END.includes(text[j + 1])) j++;
    const next = text[j + 1];
    if (next === undefined || /\s/.test(next) || isCJKChar(next) || isCJKChar(text[j])) {
      const off = firstNonSpace(start);
      const body = text.slice(off, j + 1).trim();
      if (body) sentences.push({ text: body, start: timeAt(off, segs), end: timeAt(j, segs) });
      start = j + 1;
    }
    i = j;
  }
  const off = firstNonSpace(start);
  const tail = text.slice(off).trim();
  if (tail) sentences.push({ text: tail, start: timeAt(off, segs), end: timeAt(text.length - 1, segs) });

  // Degenerate (no/low punctuation): rebuild from snippet pauses so citations still land somewhere.
  if (sentences.length < Math.max(2, snippets.length / 20)) return sentencesFromPauses(snippets);
  return sentences;
}

function sentencesFromPauses(snippets) {
  const out = [];
  let buf = [];
  let start = null, last = null;
  const flush = () => { if (buf.length) out.push({ text: buf.join(' '), start, end: last }); buf = []; };
  for (const s of snippets) {
    const end = s.start + s.dur;
    if (start === null) start = s.start;
    if ((last !== null && s.start - last > PARAGRAPH_GAP) || (last !== null && end - start > MAX_LINE_SECONDS)) {
      flush();
      start = s.start;
    }
    buf.push(s.text);
    last = end;
  }
  flush();
  return out;
}

// Group sentences into paragraphs at >2s gaps or every ~5 sentences.
function groupParagraphs(sentences) {
  const paragraphs = [];
  let current = [];
  let startTime = null, prevEnd = null;
  for (const sent of sentences) {
    const gap = prevEnd === null ? 0 : sent.start - prevEnd;
    if (current.length && (gap > PARAGRAPH_GAP || current.length >= SENTENCES_PER_PARAGRAPH)) {
      paragraphs.push({ start: startTime, text: current.join(' ') });
      current = [];
      startTime = null;
    }
    if (startTime === null) startTime = sent.start;
    current.push(sent.text);
    prevEnd = sent.end;
  }
  if (current.length) paragraphs.push({ start: startTime, text: current.join(' ') });
  return paragraphs;
}

// ---------------------------------------------------------------- chapters / time

function formatTime(totalSeconds) {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function parseTimestamp(str) {
  const parts = str.split(':').map(Number);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// YouTube activates chapters only when the description lists timestamps starting at 0:00.
function parseChapters(description) {
  const chapters = [];
  for (const line of (description || '').split('\n')) {
    const m = line.match(/^\s*(?:\()?((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\))?\s*[-–—.:)]?\s+(.+?)\s*$/);
    if (!m) continue;
    const title = m[2].replace(/^[-–—:)\s]+/, '').trim();
    if (title) chapters.push({ startSeconds: parseTimestamp(m[1]), start: formatTime(parseTimestamp(m[1])), title });
  }
  if (chapters.length >= 2 && chapters[0].startSeconds === 0) return chapters;
  return [];
}

// ---------------------------------------------------------------- output

const TIER_LABEL = {
  manual_en: 'manual English captions',
  manual_nonen: 'manual captions (non-English)',
  auto_en: 'auto-generated English captions',
  auto_nonen: 'auto-generated captions (non-English)',
};

// Wrap possibly-RTL text (e.g. Arabic/Persian titles) in bidi isolates so it
// doesn't reorder the surrounding LTR labels in a terminal. Display-only; the
// text written to files stays unwrapped.
const isolate = (s) => '⁨' + s + '⁩'; // FSI … PDI

function renderRawMd(meta, paragraphs) {
  const lines = [
    `# Raw transcript — ${meta.title}`,
    '',
    `- **Source:** ${meta.url}`,
    `- **Channel:** ${meta.channel}`,
    `- **Published:** ${meta.publishDate ?? 'unknown'}`,
    `- **Duration:** ${meta.duration}`,
    `- **Caption track:** ${meta.sourceLanguageName} — ${TIER_LABEL[meta.captionTier]}`,
    `- **Fetched:** ${meta.fetchedAt}`,
    '',
    '> Verbatim caption track in its original language, segmented into timestamped',
    '> paragraphs. Not translated or corrected — the ground-truth source that',
    "> `transcript.md` is checked against.",
    '',
  ];
  if (meta.chapters.length) {
    lines.push('## Chapters', '');
    for (const c of meta.chapters) lines.push(`- [${c.start}] ${c.title}`);
    lines.push('');
  }
  lines.push('---', '');
  for (const p of paragraphs) lines.push(`[${formatTime(p.start)}] ${p.text}`, '');
  return lines.join('\n');
}

// ---------------------------------------------------------------- driver

async function resolve(videoId) {
  const player = await fetchPlayer(videoId);
  const vd = player.videoDetails ?? {};
  if (vd.isLive === true) {
    const err = new Error('Video is currently live streaming — captions are not final. Try again after the stream ends.');
    err.userFacing = true;
    throw err;
  }
  const tracks = enumerateTracks(player);
  return { player, vd, tracks };
}

async function runList(videoId) {
  const { vd, tracks } = await resolve(videoId);
  const selected = selectTrack(tracks);
  console.log(`Video: ${isolate(vd.title)}`);
  console.log(`Caption tracks (${tracks.length}):`);
  if (!tracks.length) console.log('  (none)');
  for (const t of tracks) {
    const mark = selected && t.baseUrl === selected.track.baseUrl ? '  <- selected' : '';
    console.log(`  - ${t.languageCode.padEnd(8)} ${t.kind === 'asr' ? 'auto ' : 'manual'}  ${isolate(t.name)}${mark}`);
  }
  console.log(selected ? `Would use: ${TIER_LABEL[selected.tier]} (${selected.track.languageCode})` : 'No caption tracks on this video — nothing to use.');
}

async function runFetch(videoId, url, outDir) {
  const [{ vd, player, tracks }, micro] = await Promise.all([resolve(videoId), fetchMicroformat(videoId)]);

  const selected = selectTrack(tracks);
  if (!selected) {
    const err = new Error('This video has no caption tracks (manual or auto-generated). Nothing to transcribe until speech-to-text (Phase 3) exists.');
    err.userFacing = true;
    throw err;
  }

  const snippets = parseSnippets(await fetchJson3(selected.track.baseUrl));
  if (!snippets.length) {
    const err = new Error('Selected caption track downloaded but contained no text.');
    err.userFacing = true;
    throw err;
  }
  const paragraphs = groupParagraphs(toSentences(snippets));

  const durationSeconds = Number(vd.lengthSeconds) || Math.round(snippets.at(-1).start + snippets.at(-1).dur);
  const meta = {
    videoId, url,
    title: vd.title ?? 'Untitled',
    channel: vd.author ?? 'Unknown channel',
    channelId: vd.channelId ?? null,
    durationSeconds,
    duration: formatTime(durationSeconds),
    publishDate: micro.publishDate ?? null,
    category: micro.category ?? null,
    captionTier: selected.tier,
    captionKind: selected.track.kind,
    sourceLanguage: selected.track.languageCode,
    sourceLanguageName: selected.track.name.replace(/\s*\(auto-generated\)\s*/i, '').trim() || selected.track.languageCode,
    availableTracks: tracks.map((t) => ({ languageCode: t.languageCode, name: t.name, kind: t.kind })),
    chapters: parseChapters(vd.shortDescription),
    description: vd.shortDescription ?? '',
    paragraphCount: paragraphs.length,
    fetchedAt: new Date().toISOString().slice(0, 10),
  };

  const rawMd = renderRawMd(meta, paragraphs);
  if (!outDir) { process.stdout.write(rawMd); return; }

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'raw.md'), rawMd, 'utf-8');
  await writeFile(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
  console.error(`Wrote raw.md (${paragraphs.length} paragraphs) and meta.json to ${outDir}`);
  console.error(`Caption tier: ${meta.captionTier} · source language: ${meta.sourceLanguage} · duration: ${meta.duration}`);
}

async function main() {
  const args = process.argv.slice(2);
  const listMode = args.includes('--list');
  const positional = args.filter((a) => !a.startsWith('--'));
  const input = positional[0];
  if (!input) {
    console.error('Usage: node fetch_transcript.js <url-or-id> [out-dir]');
    console.error('       node fetch_transcript.js --list <url-or-id>');
    process.exit(1);
  }
  try {
    const videoId = extractVideoId(input);
    if (listMode) await runList(videoId);
    else await runFetch(videoId, `https://www.youtube.com/watch?v=${videoId}`, positional[1]);
  } catch (err) {
    console.error(err.userFacing ? `Error: ${err.message}` : `Unexpected error: ${err.stack || err.message}`);
    process.exit(1);
  }
}

// Detect "run directly as a CLI" in a way that survives symlinked installs.
// `skills add` symlinks skills into Claude Code (and copies them for other
// agents), so this script is usually launched *through* a symlink. Node's ESM
// loader realpath-resolves import.meta.url to the file's true location, while
// process.argv[1] keeps the path exactly as typed (the symlink). Comparing them
// raw makes a symlinked launch look like an `import`, so main() never runs and
// the command exits 0 having silently done nothing. Realpath-resolve both sides
// before comparing; only fall back to "not main" if the entry can't be resolved
// (e.g. the module is genuinely being imported, such as by a test).
function invokedAsScript() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedAsScript()) main();

export { extractVideoId, selectTrack, enumerateTracks, parseChapters, parseSnippets, toSentences, groupParagraphs, formatTime };
