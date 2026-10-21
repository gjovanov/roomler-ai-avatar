// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The narration's pure parts: the speaker script, the turn timings, a voice cross-check, the music
// bed's ducking envelope and the captions. tools/voice/lines.ts and mix.ts do the I/O around them.

export type Turn = { speaker: string; text: string };
export type TimedTurn = Turn & { start: number; end: number };
export type Word = { word: string; start: number; end: number };

/** A podcast script: one turn per line, `speaker: text`. Blank lines and `#` comments are skipped.
 *  Every speaker must be one of `speakers`, so a typo fails here instead of in the render. */
export function parseScript(src: string, speakers: readonly string[]): Turn[] {
  const turns: Turn[] = [];
  src.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.+)$/);
    if (!m) throw new Error(`line ${i + 1}: expected "speaker: text", got "${line.slice(0, 60)}"`);
    const speaker = m[1].toLowerCase();
    if (!speakers.includes(speaker)) throw new Error(`line ${i + 1}: unknown speaker "${m[1]}" (known: ${speakers.join(", ")})`);
    turns.push({ speaker, text: m[2].trim() });
  });
  if (turns.length === 0) throw new Error("the script has no turns");
  return turns;
}

// ---------------------------------------------------------------- turn timings, by words
// VibeVoice renders the whole dialogue in one pass and reports no turn boundaries, and none of the
// signal-only routes found them reliably on the first render (2026-10-11):
// - Pauses: hand-overs sat in 0.15–1.07 s gaps, pauses inside a turn ran to 0.80 s, and a 0.15 s
//   hand-over measures 0.12 s once the analysis window eats into it.
// - Pitch: a male question's rising end ("anything?", 190 Hz) and an upbeat male sign-off (150 Hz)
//   read as the high voice. A pitch-plus-pause search moved a hand-over by a second either way as
//   its candidate list changed.
// - Frame MFCCs clustered by phoneme, not by speaker.
// Whisper's word times, matched to the script we already have, put every hand-over on a word:
// "anything?" ends at 5.48 s and "That's" starts at 5.58 s, where a silence-span reading had put
// the change at 6.62 s. Pitch stays as a cross-check of who speaks (voiceFit).

const NUM: Record<string, string> = { "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten" };
/** A word as both sides compare it: lower case, letters and digits only ("roomler.ai" → "roomlerai"),
 *  small numbers spelled out. */
export const norm = (w: string) => {
  const s = w.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]/g, "");
  return NUM[s] ?? s;
};

/** A mishearing the alignment forgives: one edit when the script's word `a` has five or six
 *  letters, two from seven (the brand name is the likely victim: emma's British "Roomlə" can come
 *  back as "Roomla" or "Rumler"). */
function close(a: string, b: string): boolean {
  if (a === b) return true;
  const max = a.length >= 7 ? 2 : a.length >= 5 ? 1 : 0;
  if (!max || Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** Each turn's [start, end] from the times of its words that the ASR heard. The script's words and
 *  the ASR's are aligned as sequences (an exact word scores 2, a one-letter slip 1, a skip −1), so a
 *  misheard or extra word does not shift the rest. Throws for a turn with under `minHeard` of its
 *  words heard: then the render left something out, or the script and the audio disagree. */
export function alignByWords(turns: Turn[], words: Word[], minHeard = 0.6): TimedTurn[] & { heard?: number[] } {
  const S: Array<{ w: string; turn: number }> = [];
  turns.forEach((t, k) => t.text.split(/[\s-]+/).map(norm).filter(Boolean).forEach((w) => S.push({ w, turn: k })));
  // Whisper splits a domain and some contractions ("roomler" + ".ai", "it" + "'s"): a piece that
  // starts with "." or an apostrophe joins the word before it. A hyphen splits on both sides.
  const merged: Word[] = [];
  for (const w of words) {
    const t = w.word.trim();
    if (merged.length && /^[.'’]/.test(t)) { const p = merged[merged.length - 1]; merged[merged.length - 1] = { word: p.word + t, start: p.start, end: w.end }; }
    else for (const part of t.split(/-+/).filter(Boolean)) merged.push({ word: part, start: w.start, end: w.end });
  }
  const A = merged.map((w) => ({ ...w, n: norm(w.word) })).filter((w) => w.n);
  const n = S.length, m = A.length;
  const sc: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const bt: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 diagonal, 2 skip script, 3 skip asr
  for (let i = 1; i <= n; i++) { sc[i][0] = -i; bt[i][0] = 2; }
  for (let j = 1; j <= m; j++) { sc[0][j] = -j; bt[0][j] = 3; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const s = S[i - 1].w === A[j - 1].n ? 2 : close(S[i - 1].w, A[j - 1].n) ? 1 : -2;
    const d = sc[i - 1][j - 1] + s, u = sc[i - 1][j] - 1, l = sc[i][j - 1] - 1;
    if (d >= u && d >= l) { sc[i][j] = d; bt[i][j] = 1; } else if (u >= l) { sc[i][j] = u; bt[i][j] = 2; } else { sc[i][j] = l; bt[i][j] = 3; }
  }
  // `hit`: the word was heard (an exact match or a forgiven slip). `paired`: it sits opposite some
  // ASR word, heard or not, which still gives it a time. A cloned voice came back as
  // "Romelar.ai" for "roomler.ai" and "I" for "Ever" (2026-10-12): unheard, but they still mark
  // where the turn starts and ends, so a turn is timed by its paired words and judged by its heard
  // ones.
  const hit: Array<Word | null> = new Array(n).fill(null), paired: Array<Word | null> = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 || j > 0;) {
    if (bt[i][j] === 1) { paired[i - 1] = A[j - 1]; if (close(S[i - 1].w, A[j - 1].n)) hit[i - 1] = A[j - 1]; i--; j--; }
    else if (bt[i][j] === 2) i--; else j--;
  }
  const out: TimedTurn[] = [], heard: number[] = [];
  turns.forEach((t, k) => {
    const idx = S.map((s, i) => (s.turn === k ? i : -1)).filter((i) => i >= 0);
    const got = idx.filter((i) => hit[i]).length;
    const share = got / Math.max(1, idx.length);
    heard.push(+share.toFixed(2));
    if (!got || share < minHeard) throw new Error(`turn ${k + 1} (${t.speaker}): only ${got} of ${idx.length} words heard; is it in the render?`);
    const timed = idx.map((i) => paired[i]).filter((w): w is Word => w !== null);
    out.push({ ...t, start: timed[0].start, end: timed[timed.length - 1].end });
  });
  for (let k = 1; k < out.length; k++) if (out[k].start < out[k - 1].end) out[k].start = out[k - 1].end; // turns never overlap
  return Object.assign(out, { heard });
}

// ---------------------------------------------------------------- repairing and tightening the turns

/** Where speech is, as [start, end] spans: 10 ms frames 15 dB over the noise floor, joined across
 *  gaps shorter than `join` s. */
export function speechSpans(x: Float32Array, rate: number, join = 0.25): Array<[number, number]> {
  const hop = Math.round(rate / 100), win = Math.round(rate * 0.03);
  const db: number[] = [];
  for (let o = 0; o + win <= x.length; o += hop) {
    let e = 0;
    for (let i = o; i < o + win; i++) e += x[i] * x[i];
    db.push(10 * Math.log10(e / win + 1e-12));
  }
  const floor = [...db].sort((a, b) => a - b)[Math.floor(db.length * 0.1)] ?? -120;
  const spans: Array<[number, number]> = [];
  db.forEach((d, f) => {
    if (d <= floor + 15) return;
    const t = f / 100, last = spans[spans.length - 1];
    if (last && t - last[1] <= join) last[1] = t + 0.01; else spans.push([t, t + 0.01]);
  });
  return spans.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]);
}

/** A turn whose word times are implausible (under 0.25 s, or over 30 chars/s) is re-timed from the
 *  speech heard between its neighbours. Whisper collapsed the last line of the TeamViewer cut,
 *  "Try it at roomler.ai.", to one instant at 41.06 s, though it was spoken at 42.94–44.5 s after a
 *  3 s pause (2026-10-12). Returns the turns and the indexes it repaired. */
export function repairTurns(turns: TimedTurn[], spans: Array<[number, number]>, total: number): { turns: TimedTurn[]; repaired: number[] } {
  const out = turns.map((t) => ({ ...t })), repaired: number[] = [];
  out.forEach((t, k) => {
    const dur = t.end - t.start;
    if (dur >= 0.25 && t.text.length / dur <= 30) return;
    const lo = k > 0 ? out[k - 1].end : 0, hi = k < out.length - 1 ? out[k + 1].start : total;
    const inside = spans.filter(([a, b]) => b > lo + 0.05 && a < hi - 0.05);
    if (!inside.length) return;
    t.start = +Math.max(lo, inside[0][0]).toFixed(3);
    t.end = +Math.min(hi, inside[inside.length - 1][1]).toFixed(3);
    repaired.push(k);
  });
  return { turns: out, repaired };
}

/** Each turn's edges moved onto the speech itself. Whisper's last word in a turn often runs into
 *  the silence after it ("yourself." ended at 40.62 s; the speech, at 39.93 s), which would make
 *  every pause measure short and every cut leave too much. A start that falls in silence moves to
 *  the next speech, and an end that falls in silence moves back to the last speech. An edge that
 *  is already inside speech is left where Whisper put it. */
export function snapToSpeech(turns: TimedTurn[], spans: Array<[number, number]>): TimedTurn[] {
  const inSpeech = (t: number) => spans.some(([a, b]) => t >= a && t <= b);
  return turns.map((t) => {
    let { start, end } = t;
    if (!inSpeech(start)) { const next = spans.find(([a]) => a > start && a < end); if (next) start = next[0]; }
    if (!inSpeech(end)) { const prev = [...spans].reverse().find(([a, b]) => b < end && b > start); if (prev) end = prev[1]; }
    return { ...t, start: +start.toFixed(3), end: +end.toFixed(3) };
  });
}

/** The pauses between turns to shorten: any gap over `max` s is cut down to `keep` s, from its
 *  middle. A promo cut can't hold the 3 s pause VibeVoice once left before a sign-off. */
export function gapCuts(turns: TimedTurn[], max = 1.0, keep = 0.6): Array<[number, number]> {
  const cuts: Array<[number, number]> = [];
  for (let k = 1; k < turns.length; k++) {
    const a = turns[k - 1].end, b = turns[k].start;
    if (b - a > max) { const mid = (a + b) / 2; cuts.push([+(mid - (b - a - keep) / 2).toFixed(3), +(mid + (b - a - keep) / 2).toFixed(3)]); }
  }
  return cuts;
}

/** A time after the `cuts` are removed. */
export function afterCuts(t: number, cuts: Array<[number, number]>): number {
  let shift = 0;
  for (const [a, b] of cuts) { if (t >= b) shift += b - a; else if (t > a) shift += t - a; }
  return +(t - shift).toFixed(3);
}

// ---------------------------------------------------------------- who speaks: a pitch cross-check

/** Pitch per 10 ms frame of mono PCM by normalised autocorrelation, 0 where unvoiced or silent.
 *  Works at any rate; 8 kHz is plenty. */
export function pitchTrack(x: Float32Array, rate: number): { hop: number; f0: number[] } {
  const hop = Math.round(rate / 100), win = Math.round(rate * 0.04);
  const minLag = Math.floor(rate / 350), maxLag = Math.ceil(rate / 70);
  const n = Math.max(0, Math.floor((x.length - win - maxLag) / hop));
  const db: number[] = [];
  for (let f = 0; f < n; f++) {
    let e = 0;
    for (let i = f * hop; i < f * hop + win; i++) e += x[i] * x[i];
    db.push(10 * Math.log10(e / win + 1e-12));
  }
  const floor = [...db].sort((a, b) => a - b)[Math.floor(db.length * 0.1)] ?? -120;
  const f0 = db.map((d, f) => {
    if (d <= floor + 15) return 0;
    const o = f * hop;
    let best = 0, bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let xy = 0, xx = 0, yy = 0;
      for (let i = 0; i < win; i++) { const a = x[o + i], b = x[o + i + lag]; xy += a * b; xx += a * a; yy += b * b; }
      const r = xy / Math.sqrt(xx * yy + 1e-12);
      if (r > best) { best = r; bestLag = lag; }
    }
    return best > 0.45 ? rate / bestLag : 0;
  });
  return { hop: hop / rate, f0 };
}

/** Two clusters of the voiced pitches (on a log scale): the low voice and the high one. */
export function pitchSplit(f0: number[]): { low: number; high: number; cut: number } {
  const v = f0.filter((p) => p > 0).map(Math.log).sort((a, b) => a - b);
  if (v.length < 10) throw new Error("too little voiced audio to tell the voices apart");
  let lo = v[Math.floor(v.length * 0.25)], hi = v[Math.floor(v.length * 0.75)];
  for (let it = 0; it < 50; it++) {
    const cut = (lo + hi) / 2;
    const a = v.filter((p) => p < cut), b = v.filter((p) => p >= cut);
    const nlo = a.reduce((s, p) => s + p, 0) / (a.length || 1), nhi = b.reduce((s, p) => s + p, 0) / (b.length || 1);
    if (Math.abs(nlo - lo) < 1e-6 && Math.abs(nhi - hi) < 1e-6) break;
    lo = nlo; hi = nhi;
  }
  return { low: Math.exp(lo), high: Math.exp(hi), cut: Math.exp((lo + hi) / 2) };
}

/** How squarely each timed turn sounds like its own voice, from −1 (squarely the other one) to 1,
 *  judged by the turn's MEDIAN pitch, so a rising question or an upbeat close does not flip it.
 *  `high[k]` says whether turn k's speaker is the higher voice. A negative fit means the speaker
 *  map or the render is wrong. With one voice only, every fit is 1. */
export function voiceFit(turns: TimedTurn[], high: boolean[], track: { hop: number; f0: number[] }): number[] {
  if (high.every((h) => h === high[0])) return turns.map(() => 1);
  const s = pitchSplit(track.f0);
  const lc = Math.log(s.cut), lh = Math.log(s.high), ll = Math.log(s.low);
  return turns.map((t, k) => {
    const v = track.f0.slice(Math.round(t.start / track.hop), Math.round(t.end / track.hop)).filter((p) => p > 0).sort((a, b) => a - b);
    if (!v.length) return 0;
    const m = Math.log(v[Math.floor(v.length / 2)]);
    const fit = high[k] ? (m - lc) / (lh - lc) : (lc - m) / (lc - ll);
    return +Math.max(-1, Math.min(1, fit)).toFixed(2);
  });
}

// ---------------------------------------------------------------- the mix and the captions

/** The build-mix.ts timings shape, so the existing tooling can read a podcast too. */
export function timingsJson(turns: TimedTurn[], total: number, voice: string) {
  return {
    voice,
    at: turns.map((t) => t.start),
    seconds: turns.map((t) => +(t.end - t.start).toFixed(3)),
    voices: turns.map((t) => t.speaker),
    total: +total.toFixed(3),
  };
}

/** The bed's gain in dB as an ffmpeg `volume` expression: `gapDb` between turns, `speechDb` under
 *  one, ramping down over `down` s before a turn and back up over `up` s after it: the bed dips by
 *  the timings, not through a compressor. */
export function duckExpression(turns: TimedTurn[], gapDb: number, speechDb: number, down = 0.25, up = 0.6): string {
  const trap = turns.map((t) => `clip(min((t-${(t.start - down).toFixed(3)})/${down},(${(t.end + up).toFixed(3)}-t)/${up}),0,1)`);
  const d = trap.reduce((acc, x) => `max(${acc},${x})`);
  return `pow(10,(${gapDb}+(${(speechDb - gapDb).toFixed(1)})*${d})/20)`;
}

const ts = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** Words cut into `n` groups of near-equal length, each at most `max` characters, preferring a cut
 *  after punctuation. Returns null when no such cut exists. */
function balance(words: string[], n: number, max: number): string[][] | null {
  const len = (a: number, b: number) => words.slice(a, b).join(" ").length;
  const target = len(0, words.length) / n;
  // best[k][i]: the lowest cost of cutting words[0..i) into k groups
  const best = Array.from({ length: n + 1 }, () => new Array(words.length + 1).fill(Infinity));
  const from = Array.from({ length: n + 1 }, () => new Array(words.length + 1).fill(-1));
  best[0][0] = 0;
  for (let k = 1; k <= n; k++) for (let i = 1; i <= words.length; i++) for (let j = k - 1; j < i; j++) {
    const l = len(j, i);
    if (l > max || best[k - 1][j] === Infinity) continue;
    // Imbalance relative to the target, plus a fixed price for a cut that is not after punctuation:
    // a comma wins unless it leaves a lopsided pair (62/28 characters wins; 80/10 would not).
    const c = best[k - 1][j] + 10 * ((l - target) / target) ** 2 + (i < words.length && !/[,.;:?!]$/.test(words[i - 1]) ? 5 : 0);
    if (c < best[k][i]) { best[k][i] = c; from[k][i] = j; }
  }
  if (best[n][words.length] === Infinity) return null;
  const out: string[][] = [];
  for (let k = n, i = words.length; k > 0; k--) { const j = from[k][i]; out.unshift(words.slice(j, i)); i = j; }
  return out;
}

/** Captions from the script, exact to the turn: each turn becomes as few cues as fit (two lines of
 *  at most `width` characters), cut to near-equal length and after punctuation where it can, so no
 *  cue is a lone word ("anything?" alone for half a second, in the first render's greedy cut). The
 *  turn's time is shared by character count. */
export function srtFromTurns(turns: TimedTurn[], width = 42): string {
  const cues: Array<{ start: number; end: number; text: string }> = [];
  for (const t of turns) {
    const words = t.text.split(/\s+/);
    // The fewest cues whose every chunk fits one line or two balanced lines of `width`. A chunk of
    // 2·width that no word boundary splits into two such lines takes one more cue, never one long
    // line (2026-10-14: "platform, phones included. Roomler's viewer is a browser tab. There's no
    // mobile app." went out as a single 84-character line).
    const fits = (g: string[]) => g.join(" ").length <= width || balance(g, 2, width) !== null;
    let groups: string[][] | null = null;
    for (let n = Math.max(1, Math.ceil(t.text.length / (2 * width))); !groups; n++) {
      const g = n > words.length ? words.map((w) => [w]) : balance(words, n, 2 * width + 1);
      groups = g && (n > words.length || g.every(fits)) ? g : null;
    }
    const chunks = groups.map((g) => (g.join(" ").length <= width ? g.join(" ") : (balance(g, 2, width) ?? [g]).map((l) => l.join(" ")).join("\n")));
    const chars = chunks.reduce((n, c) => n + c.length, 0);
    let at = t.start;
    for (const c of chunks) {
      const len = ((t.end - t.start) * c.length) / chars;
      cues.push({ start: at, end: at + len, text: c });
      at += len;
    }
  }
  return cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n");
}
