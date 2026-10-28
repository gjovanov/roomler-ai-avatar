// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// How a narration line is read back: the script's words against what Whisper heard in the take. qa-lines.ts flags a
// doubtful line with these rules, fix-lines.ts uses the coverage as its first gate. The rules are what a human read
// caught on the podcast pilot's first narration (2026-10-26), each tested on the takes that had it.

/** Number words: Whisper writes numbers as digits ("56, not 60"), so neither side counts them. */
const NUMBERS = new Set("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million".split(" "));

/** A text's words as the read-back compares them: lower case, apostrophes kept, a drawn-out letter folded ("noooo"
 *  and Whisper's "no" are one word), numbers and the `fuzzy` names left out (product names Whisper never spells
 *  right). With `laughs`, a run of "haha..." words counts as one "ha". */
export function tokens(s: string, fuzzy: Set<string>, laughs = false): string[] {
  const out: string[] = [];
  for (let w of s.toLowerCase().replace(/[’]/g, "'").split(/[^a-z0-9']+/).filter(Boolean)) {
    w = w.replace(/^'+|'+$/g, "").replace(/([a-z])\1{2,}/g, "$1");
    if (!w || NUMBERS.has(w) || /^\d+$/.test(w) || fuzzy.has(w)) continue;
    if (laughs && /^(ha)+h?$/.test(w)) { if (out[out.length - 1] !== "ha") out.push("ha"); continue; }
    out.push(w);
  }
  return out;
}

/** The longest common subsequence table of two word lists (L[i][j]: of a[i..] and b[j..]). */
function lcs(a: string[], b: string[]): number[][] {
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? 1 + L[i + 1][j + 1] : Math.max(L[i + 1][j], L[i][j + 1]);
  return L;
}

/** The share of the script's words found, in order, in what was heard. */
export function coverage(text: string, heard: string, fuzzy: Set<string>): number {
  const s = tokens(text, fuzzy), h = tokens(heard, fuzzy);
  return s.length ? lcs(s, h)[0][0] / s.length : 1;
}

export type HeardWord = { word: string; start: number; end: number };

/** qa-lines.ts's rules for one take: the words Whisper heard (with times) against the line's text.
 *  - coverage: the script's words found, in order, under 0.9 (0.75 for a line of four words or fewer)
 *  - a garbled opening: the line's first two words not heard ("Vaulting in doppler's" for "That one")
 *  - a sound before the line: two or more heard words before the first script word
 *  - a line said twice: speech longer than 1.75x what its words need (at 2.8 words a second)
 *  - a stall: more than 1.4 s between two heard words ("No, ... it forwards") */
export function scoreLine(text: string, ws: HeardWord[], fuzzy: Set<string>): { coverage: number; flags: string[]; heard: string } {
  const s = tokens(text, fuzzy, true);
  const h = ws.flatMap((w) => tokens(w.word, fuzzy, true));
  const L = lcs(s, h);
  const matched = new Array(s.length).fill(false); let firstHeard = -1;
  for (let i = 0, j = 0; i < s.length && j < h.length;) {
    if (s[i] === h[j]) { matched[i] = true; if (firstHeard < 0) firstHeard = j; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  const cov = s.length ? L[0][0] / s.length : 1;
  const raw = text.split(/\s+/).filter(Boolean).length;
  const dur = ws.length ? ws[ws.length - 1].end - ws[0].start : 0;
  let gap = 0; for (let i = 1; i < ws.length; i++) gap = Math.max(gap, ws[i].start - ws[i - 1].end);
  const laughOnly = s.length > 0 && s.every((t) => t === "ha");
  const flags: string[] = [];
  if (!laughOnly) {
    if (cov < (s.length <= 4 ? 0.75 : 0.9)) flags.push(`coverage ${cov.toFixed(2)}`);
    const need = Math.min(2, s.length);
    if (matched.slice(0, need).some((m) => !m)) flags.push("opening");
    if (firstHeard >= 2) flags.push(`${firstHeard} words before the line`);
  }
  if (dur > Math.max(1.75 * raw / 2.8, raw / 2.8 + 1.2) && !laughOnly) flags.push(`long ${dur.toFixed(1)} s for ${raw} words`);
  if (laughOnly && dur > 3) flags.push(`laugh ${dur.toFixed(1)} s`);
  if (gap > 1.4) flags.push(`stall ${gap.toFixed(1)} s`);
  return { coverage: +cov.toFixed(3), flags, heard: ws.map((w) => w.word).join(" ") };
}

/** --fuzzy a,b,c: the names left out of the comparison. */
export const fuzzyArg = (list: string) => new Set(list.toLowerCase().split(",").map((w) => w.trim()).filter(Boolean));
