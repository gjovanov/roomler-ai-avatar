#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// shots.json: what the screen recording shows, and when, on the narration's timeline. storyboard.ts
// plans the cards against it (a card states a claim while the recording shows it), so describe each
// shot the way you would to an editor: "the browser tab opens the remote desktop; a window is dragged
// at full speed".
//
//   bun tools/avatar/shots.ts init <narration dir> <screen.mp4> --out <shots.json> [--what "..."] [--every 8]
//
// Writes one shot over the whole recording (or one every --every seconds), to edit by hand: split it
// where the picture changes subject and say what each part shows. screen_end is where the recording
// ends on the narration's timeline; a turn that starts after it gets the end card.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [cmd, narr, screen] = args;
const out = opt("out");
if (cmd !== "init" || !narr || !screen || !out) { console.error('usage: shots.ts init <narration dir> <screen.mp4> --out <shots.json> [--what "..."] [--every 8]'); process.exit(2); }
const dur = (f: string) => Number(Bun.spawnSync(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f], { stdout: "pipe" }).stdout.toString());
const turns = JSON.parse(readFileSync(join(narr, "turns.json"), "utf8")) as Array<{ start: number; end: number }>;
const total = +(dur(join(narr, "voice.wav")) + 1).toFixed(3);
const screenEnd = +Math.min(dur(resolve(screen)), total).toFixed(3);
const every = Number(opt("every", "0")), what = opt("what", "DESCRIBE what the recording shows here")!;
const edges = [0];
if (every > 0) for (let t = every; t < screenEnd - 1; t += every) edges.push(+t.toFixed(3));
edges.push(screenEnd);
const shots = edges.slice(0, -1).map((a, i) => ({ start: a, end: edges[i + 1], what }));
writeFileSync(resolve(out), JSON.stringify({ _note: "seconds on the narration's timeline; edit `what`, split shots where the picture changes subject", screen_end: screenEnd, total, shots }, null, 2) + "\n");
const late = turns.filter((t) => t.start >= screenEnd).length;
console.log(`${resolve(out)}: ${shots.length} shot(s) over 0-${screenEnd} s of ${total} s${late ? `; ${late} turn(s) start after the recording and get the end card` : ""}`);
