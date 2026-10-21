#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The vertical cover (1080x1920) from the storyboard's cover proposal: the chosen presenter's portrait
// (the cleanest frame of them there is) in the video's rounded, ringed tile, the cover text, the AI label
// and the end card's title. A profile grid crops a cover to its centre 1080x1440, so everything sits in
// y 240-1680.
//
//   bun tools/avatar/cover.ts --storyboard <storyboard.json> --out <cover.png> [--text "..."] [--presenter emma] [--site example.com]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fontArg } from "../lib/platform.ts";
import { loadPresenters, portraitFile } from "./comfy.ts";

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const SB = opt("storyboard"), OUT = opt("out");
if (!SB || !OUT) { console.error("usage: cover.ts --storyboard <storyboard.json> --out <cover.png> [--text ...] [--presenter id] [--site ...]"); process.exit(2); }
const sb = JSON.parse(await Bun.file(resolve(SB)).text());
const reg = loadPresenters();
const who = opt("presenter", sb.cover?.presenter)!, text = opt("text", sb.cover?.text)!;
const site = opt("site", sb.end_card?.title ?? "")!;
const p = reg[who];
if (!p || !text) throw new Error(`no presenter "${who}" or no cover text`);
if (text.length > 28) throw new Error(`cover text "${text}" is over 28 characters: it must read at thumbnail size`);

const FONT = fontArg();
const work = join(tmpdir(), `avatar-cover-${process.pid}`);
mkdirSync(work, { recursive: true });
writeFileSync(join(work, "t.txt"), text);
writeFileSync(join(work, "l.txt"), `${p.label} · ${p.ai_label ?? "AI presenter"}`);
writeFileSync(join(work, "s.txt"), site);
// A bold sans averages about 0.56 em a character: keep the line inside 1000 px.
const size = Math.min(96, Math.floor(1000 / (0.56 * text.length)));
const S = 1000, R = 56, RING = 8;
const rounded = (r: number) =>
  `if(gt(abs(X-(W-1)/2),W/2-${r})*gt(abs(Y-(H-1)/2),H/2-${r}),if(lte(hypot(abs(X-(W-1)/2)-(W/2-${r}),abs(Y-(H-1)/2)-(H/2-${r})),${r}),255,0),255)`;
const graph = [
  `[1:v]scale=${S}:${S}:force_original_aspect_ratio=increase:flags=lanczos,crop=${S}:${S},format=yuva444p[face0]`,
  `color=c=black:s=${S}x${S}:d=1,format=gray,geq=lum='${rounded(R)}'[m]`,
  `[face0][m]alphamerge[face]`,
  `color=c=${p.ring.replace("#", "0x")}:s=${S + 2 * RING}x${S + 2 * RING}:d=1,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${rounded(R + RING)}'[ring]`,
  `[0:v][ring]overlay=${40 - RING}:${460 - RING}[a]`,
  `[a][face]overlay=40:460,` +
    `drawtext=${FONT}:textfile=t.txt:fontsize=${size}:fontcolor=white:x=(w-text_w)/2:y=${400 - size}` +
    `,drawtext=${FONT}:textfile=l.txt:fontsize=34:fontcolor=white:box=1:boxcolor=0x1A1A2E@0.85:boxborderw=12:x=74:y=494` +
    (site ? `,drawtext=${FONT}:textfile=s.txt:fontsize=72:fontcolor=0x80CBC4:x=(w-text_w)/2:y=1520` : "") + `,format=rgb24[v]`,
].join(";");
const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x0A201D:s=1080x1920:d=1", "-i", portraitFile(p.portrait),
  "-filter_complex", graph, "-map", "[v]", "-frames:v", "1", resolve(OUT)], { cwd: work, stdout: "pipe", stderr: "pipe" });
if (r.exitCode !== 0) throw new Error(r.stderr.toString().slice(-1500));
console.log(`cover ${resolve(OUT)}: "${text}" (${size} px), ${who}`);
