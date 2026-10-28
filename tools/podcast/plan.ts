// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The studio conversation format's plan (plan.json), read the same way by each of its tools: the composer
// (compose.ts), the clip chain (chain.ts), the cut measure (seams.ts), the listening clips
// (tools/avatar/listen.ts) and the stand-in clips (placeholder.ts). The format, the fields and the pilot it
// came from: .claude/skills/avatar-video/references/podcast.md.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Layout = "two" | "cards" | "screen";
/** A screen visual or a page of states. `states` is a folder of state-<k>.png; `at` the words that bring states
 *  1, 2, ... in. `file` is footage, from `in` seconds, or with `sync` putting its moment `at` under `word`. */
export type Visual = { file?: string; in?: number; sync?: { word: string; at: number }; states?: string; at?: string[] };
/** A privacy box over a screen visual (output pixels, 1920x1080): filled, with an optional generic label in place of
 *  what it hides, from the visual's own time `from` on (default: the whole beat). */
export type Box = { x: number; y: number; w: number; h: number; label?: string; from?: number };
/** A beat names its turn by number (0-based: turn n is the (n+1)-th spoken line) or, better, by the words its
 *  line starts with (`line`), so a line inserted before it never moves a demo onto the wrong turn. */
export type Beat = { turn?: number; line?: string; layout: Layout; visual?: Visual; chip?: string; boxes?: Box[] };
export type Plan = {
  /** The script's speaker names: the host's camera is on the left, the guest's on the right. */
  host: string;
  guest: string;
  /** The narration folder (lines.ts), the talk.json the clips go in, the word times and the mix. */
  narration?: string;
  talk: string;
  words: string;
  mix: string;
  /** Who shows each speaker (talk.ts --face): speaker -> presenter, or several presenters comma-separated. */
  faces?: Record<string, string>;
  /** The clips' settings, the same for every clip of the video (they are part of each clip's cache key). */
  clips?: { size?: string; audio_scale?: number; group_gap?: number; negative_extra?: string; dir?: string };
  /** Lines the listener hears as a joke (regular expressions, case-insensitive): its clip smiles a little more. */
  amused?: string[];
  studio: string;
  music: string;
  music_in: number;
  music_out?: number;
  out: string;
  work: string;
  pre: number;
  post: number;
  title_png: string;
  end_png: string;
  beats: Beat[];
};

export const FPS = 30, W = 1920, H = 1080;
/** The cameras: rounded tiles over the studio, the host left and the guest right, and the guest beside the cards. */
export const TILE = { w: 600, h: 900, y: 70, hostX: 330, guestX: 990, cardsX: 1240, cardsY: 70, ring: 7 } as const;

/** The plan, and a resolver for the paths in it (relative to the plan's folder). */
export function loadPlan(file: string): { plan: Plan; file: string; here: string; R: (p: string) => string } {
  const path = resolve(file);
  const plan = JSON.parse(readFileSync(path, "utf8")) as Plan;
  for (const k of ["host", "guest"] as const) if (!plan[k]) throw new Error(`${path}: "${k}" is missing (a speaker name from the script)`);
  if (plan.host === plan.guest) throw new Error(`${path}: the host and the guest are both "${plan.host}"`);
  const here = dirname(path);
  return { plan, file: path, here, R: (p: string) => resolve(here, p) };
}

const norm = (s: string) => s.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

/** Every beat at its turn: a `line` beat goes to the one turn whose text starts with those words. */
export function resolveBeats(plan: Plan, turns: Array<{ text: string }>): Map<number, Beat> {
  const at = new Map<number, Beat>();
  for (const b of plan.beats) {
    let turn = b.turn;
    if (b.line !== undefined) {
      const hits = turns.flatMap((t, k) => (norm(t.text).startsWith(norm(b.line!)) ? [k] : []));
      if (hits.length !== 1) throw new Error(`beat "${b.line}": ${hits.length ? `starts turns ${hits.join(", ")}; make it longer` : "starts no turn of the narration"}`);
      if (turn !== undefined && turn !== hits[0]) throw new Error(`beat "${b.line}": it is turn ${hits[0]}, not ${turn}`);
      turn = hits[0];
    }
    if (turn === undefined || !Number.isInteger(turn) || turn < 0 || turn >= turns.length) throw new Error(`a beat needs a "line" or a "turn" (0-${turns.length - 1}): ${JSON.stringify(b)}`);
    if (at.has(turn)) throw new Error(`two beats for turn ${turn}`);
    at.set(turn, { ...b, turn });
  }
  return at;
}

/** A turn's beat: the plan's, or both cameras. */
export function beatAt(beats: Map<number, Beat>, turn: number): Beat {
  return beats.get(turn) ?? { turn, layout: "two" };
}

/** Whether a presenter's camera is on screen in a segment: both in `two`; in `cards` only the guest, speaking. */
export function visible(plan: Plan, who: string, layout: Layout, speaker: string): boolean {
  return layout === "two" || (layout === "cards" && who === plan.guest && speaker === plan.guest);
}

/** talk.ts's --face value from plan.faces ("" when every speaker shows the presenter of its own name). */
export function faceArg(plan: Plan): string {
  return Object.entries(plan.faces ?? {}).map(([sp, p]) => `${sp}=${p}`).join(";");
}

/** The narration's captions.srt with every time moved by `seconds` (the title before the narration). */
export function shiftSrt(srt: string, seconds: number): string {
  const ts = (s: string) => { const [h, m, r] = s.split(":"); const [sec, ms] = r.split(","); return +h * 3600 + +m * 60 + +sec + +ms / 1000; };
  const fmt = (t: number) => {
    const ms = Math.round(t * 1000);
    return [Math.floor(ms / 3600000), Math.floor((ms % 3600000) / 60000), Math.floor((ms % 60000) / 1000)].map((x) => String(x).padStart(2, "0")).join(":") + "," + String(ms % 1000).padStart(3, "0");
  };
  return srt.replace(/\r/g, "").replace(/(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})/g, (_, a, b) => `${fmt(ts(a) + seconds)} --> ${fmt(ts(b) + seconds)}`);
}
