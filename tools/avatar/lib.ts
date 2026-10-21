// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The pure parts (segments, word times, karaoke captions, layout maths). talk.ts and compose.ts do
// the I/O around them; lib.test.ts pins the behaviour.
import { norm, type TimedTurn, type Word } from "../voice/podcast-lib.ts";

// ---------------------------------------------------------------- segments
/** One presenter clip: a turn plus the silence around it, cut at the middle of each gap, so the clips
 *  tile the whole timeline with no gap and no overlap, and every cut lands in silence. */
export type Segment = { k: number; speaker: string; start: number; end: number; speechStart: number; speechEnd: number };

export function segments(turns: TimedTurn[], total: number): Segment[] {
  if (!turns.length) throw new Error("no turns");
  const cut = (k: number) => +((turns[k - 1].end + turns[k].start) / 2).toFixed(3);
  return turns.map((t, k) => ({
    k,
    speaker: t.speaker,
    start: k === 0 ? 0 : cut(k),
    end: k === turns.length - 1 ? +total.toFixed(3) : cut(k + 1),
    speechStart: t.start,
    speechEnd: t.end,
  }));
}

/** Clip units (talk.ts --group-gap): each run of one speaker's turns less than `gap` seconds apart is
 *  one unit, its text the turns' text joined and its speech from the first turn's start to the last
 *  one's end. A presenter alone then renders a block of lines as one continuous clip instead of
 *  resetting to the portrait's pose at every line. `gap` 0 keeps every turn on its own. */
export function groupTurns(turns: TimedTurn[], gap: number): { groups: number[][]; units: TimedTurn[] } {
  const groups: number[][] = [];
  turns.forEach((t, k) => {
    const g = groups[groups.length - 1], last = g ? turns[g[g.length - 1]] : null;
    if (gap > 0 && last && last.speaker === t.speaker && t.start - last.end < gap) g.push(k);
    else groups.push([k]);
  });
  const units = groups.map((g) => ({ speaker: turns[g[0]].speaker, text: g.map((k) => turns[k].text).join(" "), start: turns[g[0]].start, end: turns[g[g.length - 1]].end }));
  return { groups, units };
}

/** Segments where some turns keep the window an earlier render gave them: `lead` seconds before their
 *  speech and `tail` after it. A presenter's clip can then be reused when only the other presenter
 *  was re-voiced: the reused turn's audio window is the same speech at the same offsets, and the
 *  unpinned turns around it absorb the difference. Throws when a pinned window would reach into a
 *  neighbour's speech, or two pinned neighbours disagree on their shared edge. */
export function pinnedSegments(turns: TimedTurn[], total: number, pins: Record<number, { lead: number; tail: number }>): Segment[] {
  const base = segments(turns, total);
  const b = [...base.map((s) => s.start), base[base.length - 1].end];
  const set = new Map<number, number>();
  const put = (i: number, v: number, k: number) => {
    if (set.has(i) && Math.abs(set.get(i)! - v) > 0.002) throw new Error(`turn ${k}: pinned edge ${v} disagrees with ${set.get(i)}`);
    set.set(i, v); b[i] = v;
  };
  for (const [ks, p] of Object.entries(pins)) {
    const k = Number(ks), t = turns[k];
    const start = k === 0 ? 0 : +(t.start - p.lead).toFixed(3);
    const end = k === turns.length - 1 ? +total.toFixed(3) : +(t.end + p.tail).toFixed(3);
    if (k > 0 && start < turns[k - 1].end) throw new Error(`turn ${k}: a ${p.lead} s lead reaches into turn ${k - 1}`);
    if (k < turns.length - 1 && end > turns[k + 1].start) throw new Error(`turn ${k}: a ${p.tail} s tail reaches into turn ${k + 1}`);
    put(k, start, k); put(k + 1, end, k);
  }
  return turns.map((t, k) => ({ k, speaker: t.speaker, start: b[k], end: b[k + 1], speechStart: t.start, speechEnd: t.end }));
}

// ---------------------------------------------------------------- word times
export type TimedWord = { turn: number; text: string; start: number; end: number; heard: boolean };

/** One edit for a 4-6 letter word, two from 7: Whisper hears emma's "Roomlə" as "Ralar", "typos" as "tycos". */
function close(a: string, b: string): boolean {
  if (a === b) return true;
  const max = a.length >= 7 ? 2 : a.length >= 4 ? 1 : 0;
  if (!max || Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** Several ASR passes merged turn by turn: each turn takes its words from the first list that heard at
 *  least half of it (counted as words timed inside the turn), else from the list that heard the most.
 *  Whisper medium hears a cloned accent best but its long-form pass dropped five whole lines of the
 *  2026-10-20 narration; base heard every line and misheard words. Lists in order of preference. */
export function bestWordsPerTurn(turns: TimedTurn[], lists: Word[][]): Word[] {
  const out: Word[] = [];
  for (const t of turns) {
    const want = t.text.split(/\s+/).filter(Boolean).length;
    const inside = lists.map((l) => l.filter((w) => (w.start + w.end) / 2 >= t.start - 0.15 && (w.start + w.end) / 2 <= t.end + 0.15));
    const pick = inside.find((ws) => ws.length >= want / 2) ?? inside.reduce((a, b) => (b.length > a.length ? b : a), []);
    out.push(...pick);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Every word of the SCRIPT with a time: the script's spelling is what the captions show, Whisper's
 *  times are when it was said. The two are aligned as sequences (exact 2, close 1, skip -1); a word
 *  Whisper missed or misheard past `close` shares the time between its heard neighbours by length.
 *  Every word stays inside its turn's [start, end], which turns.json already snapped to the speech. */
export function wordTimes(turns: TimedTurn[], asr: Word[]): TimedWord[] {
  const S: Array<{ turn: number; text: string; n: string }> = [];
  turns.forEach((t, k) => t.text.split(/\s+/).filter(Boolean).forEach((text) => S.push({ turn: k, text, n: norm(text) })));
  const A = asr.map((w) => ({ ...w, n: norm(w.word) })).filter((w) => w.n);
  const n = S.length, m = A.length;
  const sc = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const bt = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 diag, 2 skip script, 3 skip asr
  for (let i = 1; i <= n; i++) { sc[i][0] = -i; bt[i][0] = 2; }
  for (let j = 1; j <= m; j++) { sc[0][j] = -j; bt[0][j] = 3; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = S[i - 1].n, a = A[j - 1].n;
      const pair = !s ? -Infinity : s === a ? 2 : close(s, a) ? 1 : -Infinity;
      let best = sc[i - 1][j - 1] + pair, how = 1;
      if (sc[i - 1][j] - 1 > best) { best = sc[i - 1][j] - 1; how = 2; }
      if (sc[i][j - 1] - 1 > best) { best = sc[i][j - 1] - 1; how = 3; }
      sc[i][j] = best; bt[i][j] = how;
    }
  }
  const hit: Array<Word | null> = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 || j > 0;) {
    const how = bt[i][j];
    if (how === 1) { hit[i - 1] = A[j - 1]; i--; j--; } else if (how === 2) i--; else j--;
  }
  const out: TimedWord[] = S.map((s, i) => {
    const t = turns[s.turn], h = hit[i];
    // A heard word outside its turn is a mismatch the alignment let through: treat it as unheard.
    const ok = !!h && h.end > t.start - 0.25 && h.start < t.end + 0.25;
    return { turn: s.turn, text: s.text, start: ok ? Math.max(t.start, h!.start) : NaN, end: ok ? Math.min(t.end, h!.end) : NaN, heard: ok };
  });
  // Fill each run of unheard words between the heard neighbours inside the same turn, by length.
  for (let i = 0; i < out.length;) {
    if (out[i].heard) { i++; continue; }
    let j = i; while (j < out.length && !out[j].heard && out[j].turn === out[i].turn) j++;
    const t = turns[out[i].turn];
    const a = i > 0 && out[i - 1].turn === out[i].turn ? out[i - 1].end : t.start;
    const b = j < out.length && out[j].turn === out[i].turn ? out[j].start : t.end;
    const lens = out.slice(i, j).map((w) => Math.max(1, norm(w.text).length));
    const total = lens.reduce((x, y) => x + y, 0), span = Math.max(0.05 * (j - i), b - a);
    let at = a;
    for (let q = i; q < j; q++) { const d = (span * lens[q - i]) / total; out[q].start = +at.toFixed(3); out[q].end = +(at + d).toFixed(3); at += d; }
    i = j;
  }
  // A turn's first word often collapses to nothing: Whisper stamps it a few hundredths early, and the
  // clamp to the turn's energy-snapped start leaves end <= start ("Enough", "Show", "Window" on the
  // Wayland narration). Give such a word a length that scales with its letters, inside its turn.
  for (const w of out) {
    const t = turns[w.turn], min = 0.08 + 0.035 * norm(w.text).length;
    if (w.end - w.start < 0.06) w.end = Math.min(t.end, w.start + min);
  }
  // Monotonic and non-overlapping, so the karaoke never runs backwards.
  for (let i = 1; i < out.length; i++) if (out[i].start < out[i - 1].end) out[i].start = out[i - 1].end;
  for (const w of out) if (w.end < w.start) w.end = w.start;
  return out.map((w) => ({ ...w, start: +w.start.toFixed(3), end: +w.end.toFixed(3) }));
}

// ---------------------------------------------------------------- karaoke captions (ASS)
export type Page = { turn: number; words: TimedWord[]; start: number; end: number };

/** Caption pages: at most `maxWords` words and `maxChars` characters, never across a turn, and a page
 *  ends after a word that ends a sentence or a clause. */
export function pages(words: TimedWord[], maxWords = 3, maxChars = 18): Page[] {
  const out: Page[] = [];
  let cur: TimedWord[] = [];
  const flush = () => { if (cur.length) out.push({ turn: cur[0].turn, words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; };
  for (const w of words) {
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
    if (cur.length && (cur[0].turn !== w.turn || cur.length >= maxWords || chars > maxChars)) flush();
    cur.push(w);
    if (/[.!?,:;]$/.test(w.text)) flush();
  }
  flush();
  return out;
}

const assTime = (t: number) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
/** #rrggbb -> ASS's &HBBGGRR& (an override tag's colour). */
export const assColor = (hex: string) => { const h = hex.replace("#", ""); return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase(); };
/** #rrggbb + opacity -> a style's &HAABBGGRR (ASS alpha counts transparency: 00 opaque, FF clear). */
export const assColorA = (hex: string, opacity: number) => {
  const h = hex.replace("#", ""), a = Math.round((1 - opacity) * 255).toString(16).padStart(2, "0");
  return `&H${a}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")");

export interface KaraokeStyle {
  width: number; height: number; font: string; size: number;
  /** Centre of the caption line, in pixels. */
  x: number; y: number;
  text: string; box: string; boxAlpha: number;
  /** The active word's colour per speaker. */
  active: Record<string, string>;
  /** A page stays up until the next one, but no more than this past its last word. */
  hold: number;
}

/** An ASS file showing each page while it is spoken, with the word being said in its speaker's colour.
 *  One event per word: the page's text with that word recoloured (no \k sweep: a sweep colours the
 *  words already said too, which reads as a progress bar, not as the word in the mouth). */
export function karaokeAss(ps: Page[], speakers: string[], st: KaraokeStyle): string {
  const head = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${st.width}`, `PlayResY: ${st.height}`, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // BorderStyle 3 = a box behind the text. VSFilter fills it with OutlineColour and libass with
    // BackColour, so both carry the brand's ink at `boxAlpha` (brand/README.md, Captions).
    `Style: K,${st.font},${st.size},${assColorA(st.text, 1)},${assColorA(st.text, 1)},${assColorA(st.box, st.boxAlpha)},${assColorA(st.box, st.boxAlpha)},0,0,0,0,100,100,0,0,3,14,0,5,0,0,0,1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const ev: string[] = [];
  ps.forEach((p, pi) => {
    const next = ps[pi + 1]?.start ?? Infinity;
    const pageEnd = Math.min(next, p.end + st.hold);
    const color = assColor(st.active[speakers[p.turn]] ?? st.text);
    p.words.forEach((w, wi) => {
      const a = wi === 0 ? p.start : w.start;
      const b = wi === p.words.length - 1 ? pageEnd : p.words[wi + 1].start;
      if (b - a < 0.01) return;
      const text = p.words.map((x, xi) => (xi === wi ? `{\\c${color}}${esc(x.text)}{\\c${assColor(st.text)}}` : esc(x.text))).join(" ");
      ev.push(`Dialogue: 0,${assTime(a)},${assTime(b)},K,,0,0,0,,{\\pos(${st.x},${st.y})}${text}`);
    });
  });
  return [...head, ...ev, ""].join("\n");
}
