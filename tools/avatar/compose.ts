#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The vertical (1080x1920) with presenters. The real screen recording sits at the top of the safe
// zone; below it, word-by-word captions; below those, the presenters as video-call tiles (the speaker
// lit in their colour, the listener dimmed), labelled as AI. A storyboard beat can give a turn to one
// presenter full size ("solo") or to the end card ("end").
//
//   bun tools/avatar/compose.ts --talk <talk.json> --screen <recording.mp4> --mix <mix.wav>
//        --words <words.json[,more.json]> --storyboard <storyboard.json> --out <file.mp4>
//        [--listener still|idle|none] [--work <dir>]
//
// --screen is the recording on the narration's timeline (it starts when the narration starts); any
// size, scaled to fit 1080x608, and held on its last frame if it is shorter. For text to read on a
// phone, give it a recording zoomed on what matters: at 0.56x a full desktop is too small to read.
// --listener: "still" (default) shows the listener's portrait, dimmed; "idle" plays their idle loop
// (talk.ts --idle 3.24); "none" shows the speaker alone. A silence-driven idle loop looks wrong on a
// real person's face: the model keeps the mouth busy.
// Every intermediate is lossless; the final is the one lossy encode. Text stays inside the platforms'
// 9:16 safe zone: y 269-1248, x 65-1015.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CAPTION_FONT, fontArg } from "../lib/platform.ts";
import { loadPresenters, portraitFile } from "./comfy.ts";
import { bestWordsPerTurn, karaokeAss, pages, wordTimes, type TimedWord } from "./lib.ts";
import { limitTruePeak } from "./media.ts";

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const need = (n: string) => { const v = opt(n); if (!v) { console.error(`compose.ts: --${n} is required`); process.exit(2); } return resolve(v); };
const TALK = need("talk"), SCREEN = need("screen"), MIX = need("mix"), SB = need("storyboard"), OUT = need("out");
const WORDS = (opt("words") ?? "").split(",").filter(Boolean).map((f) => resolve(f));
if (!WORDS.length) { console.error("compose.ts: --words is required"); process.exit(2); }
const LISTENER = opt("listener", "still") as "still" | "idle" | "none";
if (!["still", "idle", "none"].includes(LISTENER)) throw new Error(`--listener ${LISTENER}: still, idle or none`);
const WORK = resolve(opt("work", join(OUT, "..", "compose-9x16"))!);
mkdirSync(WORK, { recursive: true }); mkdirSync(join(OUT, ".."), { recursive: true });

const FPS = 30, W = 1080, H = 1920, BG = "0x0A201D", INK = "#1a1a2e";
const FONT = fontArg();
// Geometry, in output pixels.
const SCREEN_Y = 370;                                 // the 1080x608 recording: y 370-978
const CARD_Y = 292;                                   // a card's text box top (inside the safe zone)
const CAPTION_Y = 1040;                               // caption line centre, between recording and tiles
const TILE = 440, TILE_Y = 1100, TILE_X = [80, 560];  // two tiles, y 1100-1540
const RING = 8;
const SOLO = 960, SOLO_X = 60, SOLO_Y = 300;          // one presenter, y 300-1260
const END_Y = 470;                                    // end card text

type Seg = { k: number; speaker: string; start: number; end: number };
type Beat = { turn: number; layout: "split" | "solo" | "end" };
type Card = { start: number; end: number; text: string };
const talk = JSON.parse(readFileSync(TALK, "utf8"));
const sb = JSON.parse(readFileSync(SB, "utf8")) as { beats: Beat[]; cards: Card[]; labels?: Record<string, string>; end_card?: { title: string; subtitle: string } };
const reg = loadPresenters();
const segs: Seg[] = talk.segments;
const turns = JSON.parse(readFileSync(join(talk.narration, "turns.json"), "utf8"));
const speakers: string[] = [...new Set(segs.map((s) => s.speaker))];
if (speakers.length > 2) throw new Error("two presenters at most");
const slot = (sp: string) => speakers.indexOf(sp);
const layoutOf = (k: number) => sb.beats.find((b) => b.turn === k)?.layout ?? "split";
// The face a turn was rendered with (talk.ts --face) decides its label and ring.
const faceOf = (s: Seg) => talk.clips[`seg${String(s.k).padStart(2, "0")}-${s.speaker}`]?.face ?? s.speaker;
// The listener shows the face of their most recent turn (their first, before they have spoken).
const listenerFace = (k: number, sp: string) => { const prev = segs.filter((x) => x.speaker === sp && x.k < k).pop() ?? segs.find((x) => x.speaker === sp); return prev ? faceOf(prev) : sp; };
const dur = (f: string) => Number(Bun.spawnSync(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f], { stdout: "pipe" }).stdout.toString());
const total = segs[segs.length - 1].end;

function ff(a: string[], label: string) {
  const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", ...a], { cwd: WORK, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`${label}: ffmpeg failed:\n${r.stderr.toString().slice(-2500)}`);
}
const txt = (name: string, s: string) => { writeFileSync(join(WORK, name), s); return name; };
const draw = (file: string, size: number, color: string, x: string | number, y: number, box = "") =>
  `drawtext=${FONT}:textfile='${file}':fontsize=${size}:fontcolor=${color}${box}:x=${x}:y=${y}`;
const LABEL_BOX = ":box=1:boxcolor=0x1A1A2E@0.85:boxborderw=10";

// ---- the recording at 1080x608, 30 fps, held on its last frame to the end of the narration.
const screenDur = dur(SCREEN);
ff(["-i", SCREEN, "-vf", `fps=${FPS},scale=1080:608:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:608:(ow-iw)/2:(oh-ih)/2:color=${BG},setsar=1,tpad=stop_mode=clone:stop_duration=${Math.max(0, total - screenDur + 1).toFixed(2)}`,
  "-t", total.toFixed(3), "-an", "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "screen.mp4"], "screen");

// ---- masks: a rounded tile (alpha) and each face's ring, drawn once.
const rounded = (r: number) =>
  `if(gt(abs(X-(W-1)/2),W/2-${r})*gt(abs(Y-(H-1)/2),H/2-${r}),if(lte(hypot(abs(X-(W-1)/2)-(W/2-${r}),abs(Y-(H-1)/2)-(H/2-${r})),${r}),255,0),255)`;
for (const [name, size, r] of [["mask-tile.png", TILE, 28], ["mask-solo.png", SOLO, 44]] as const)
  if (!existsSync(join(WORK, name))) ff(["-f", "lavfi", "-i", `color=c=black:s=${size}x${size}:d=1`, "-vf", `format=gray,geq=lum='${rounded(r)}'`, "-frames:v", "1", name], name);
const allFaces = new Set([...segs.map(faceOf), ...segs.map((s) => speakers.filter((x) => x !== s.speaker).map((o) => listenerFace(s.k, o))).flat()]);
for (const f of allFaces) {
  const c = reg[f].ring.replace("#", "0x");
  for (const [name, size, r] of [[`ring-${f}.png`, TILE + 2 * RING, 28 + RING], [`ring-solo-${f}.png`, SOLO + 2 * RING, 44 + RING]] as const)
    if (!existsSync(join(WORK, name))) ff(["-f", "lavfi", "-i", `color=c=${c}:s=${size}x${size}:d=1`, "-vf", `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${rounded(r)}'`, "-frames:v", "1", name], name);
}
// ---- --listener idle: each presenter's idle loop, played forwards then backwards so it never jumps.
if (LISTENER === "idle") for (const sp of speakers) {
  const idle = talk.clips[`idle-${sp}`]?.clip;
  if (!idle || !existsSync(idle)) throw new Error(`no idle clip for ${sp}: run talk.ts with --idle 3.24, or use --listener still`);
  if (!existsSync(join(WORK, `idle-${sp}.mp4`)))
    ff(["-i", idle, "-filter_complex", `[0:v]fps=${FPS},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,format=yuv420p[v]`, "-map", "[v]", "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", `idle-${sp}.mp4`], `idle loop ${sp}`);
}

// ---- one lossless part per segment, frame-exact: segment k covers frames [round(start*30), round(end*30)).
// Disclosure is part of the picture from the first frame: every presenter label says it is AI (the EU
// AI Act's Art. 50(4) asks for a visible label at first exposure), and the recording says it is real.
const label = (f: string) => sb.labels?.[f] ?? `${reg[f].label} · ${reg[f].ai_label ?? "AI presenter"}`;
const REAL = "Real screen recording";
const tileX = (sp: string) => (LISTENER === "none" ? (W - TILE) / 2 : TILE_X[slot(sp)]);
const parts: string[] = [];
for (const s of segs) {
  const layout = layoutOf(s.k), face = faceOf(s);
  const f0 = Math.round(s.start * FPS), f1 = Math.round(s.end * FPS), n = f1 - f0, d = n / FPS;
  const part = `part${String(s.k).padStart(2, "0")}.mp4`;
  parts.push(part);
  const clip = talk.clips[`seg${String(s.k).padStart(2, "0")}-${s.speaker}`]?.clip;
  if (!clip || !existsSync(clip)) throw new Error(`segment ${s.k}: no clip (run talk.ts)`);
  const other = LISTENER === "none" ? undefined : speakers.find((x) => x !== s.speaker);

  const inputs: string[] = [];
  const input = (...a: string[]) => { inputs.push(...a); return `[${inputs.filter((x) => x === "-i").length - 1}:v]`; };
  const st: string[] = [];
  let base = input("-f", "lavfi", "-i", `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${d.toFixed(4)}`), c = 0;
  const ov = (src: string, x: number, y: number) => { const o = `[c${c++}]`; st.push(`${base}${src}overlay=${x}:${y}${o}`); base = o; };
  const tx = (f: string) => { const o = `[c${c++}]`; st.push(`${base}${f}${o}`); base = o; };
  // The talking clip is 25 fps and can end a frame or two short of its audio: hold its last frame.
  const size = layout === "solo" ? SOLO : TILE;
  st.push(`${input("-i", clip)}fps=${FPS},tpad=stop_mode=clone:stop_duration=2,trim=end_frame=${n},setpts=PTS-STARTPTS,scale=${size}:${size}:flags=lanczos,format=yuva420p[spk]`);

  if (layout === "solo") {
    st.push(`${input("-i", "mask-solo.png")}format=gray[m]`, "[spk][m]alphamerge[spkr]");
    ov(input("-i", `ring-solo-${face}.png`), SOLO_X - RING, SOLO_Y - RING);
    ov("[spkr]", SOLO_X, SOLO_Y);
    tx(draw(txt(`lab${s.k}.txt`, label(face)), 38, "white", SOLO_X + 26, SOLO_Y + 26, ":box=1:boxcolor=0x1A1A2E@0.85:boxborderw=12"));
  } else {
    if (layout === "split") {
      st.push(`${input("-ss", s.start.toFixed(4), "-i", "screen.mp4")}trim=end_frame=${n},setpts=PTS-STARTPTS[scr]`);
      ov("[scr]", 0, SCREEN_Y);
      tx(draw(txt(`real${s.k}.txt`, REAL), 26, "white", `w-text_w-34`, SCREEN_Y + 608 - 52, LABEL_BOX));
    } else {
      tx(draw(txt(`end1-${s.k}.txt`, sb.end_card?.title ?? ""), 150, "0xE6F5F2", "(w-text_w)/2", END_Y));
      if (sb.end_card?.subtitle) tx(draw(txt(`end2-${s.k}.txt`, sb.end_card.subtitle), 58, "0x80CBC4", "(w-text_w)/2", END_Y + 220));
    }
    const m = input("-i", "mask-tile.png");
    st.push(`${m}format=gray,split[m1][m2]`, "[spk][m1]alphamerge[spkr]");
    const xs = tileX(s.speaker);
    ov(input("-i", `ring-${face}.png`), xs - RING, TILE_Y - RING);
    ov("[spkr]", xs, TILE_Y);
    if (other) {
      const lf = listenerFace(s.k, other);
      const dim = `lutyuv=y='val*0.62':u='128+(val-128)*0.7':v='128+(val-128)*0.7'`;
      const lis = LISTENER === "idle"
        ? input("-stream_loop", "-1", "-ss", (s.start % dur(join(WORK, `idle-${other}.mp4`))).toFixed(3), "-i", join(WORK, `idle-${other}.mp4`))
        : input("-loop", "1", "-framerate", String(FPS), "-t", d.toFixed(4), "-i", portraitFile(reg[lf].portrait));
      st.push(`${lis}fps=${FPS},trim=end_frame=${n},setpts=PTS-STARTPTS,scale=${TILE}:${TILE}:force_original_aspect_ratio=increase:flags=lanczos,crop=${TILE}:${TILE},${dim},format=yuva420p[lis]`, "[lis][m2]alphamerge[lisr]");
      ov("[lisr]", TILE_X[slot(other)], TILE_Y);
      tx(draw(txt(`lab${s.k}-l.txt`, label(lf)), 28, "white", TILE_X[slot(other)] + 18, TILE_Y + 18, LABEL_BOX));
    } else st.push("[m2]nullsink");
    tx(draw(txt(`lab${s.k}-s.txt`, label(face)), 28, "white", xs + 18, TILE_Y + 18, LABEL_BOX));
  }
  const graph = `${st.join(";")};${base}format=yuv420p[v]`;
  ff([...inputs, "-filter_complex", graph, "-map", "[v]", "-frames:v", String(n), "-r", String(FPS), "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", part], `segment ${s.k}`);
  console.log(`part ${String(s.k).padStart(2)} ${layout.padEnd(5)} ${face.padEnd(14)} ${d.toFixed(2)} s`);
}
writeFileSync(join(WORK, "parts.txt"), parts.map((p) => `file '${p}'`).join("\n") + "\n");
ff(["-f", "concat", "-safe", "0", "-i", "parts.txt", "-c", "copy", "picture.mp4"], "concat");

// ---- captions: the script's words at Whisper's times, a page at a time, the said word in the speaker's colour.
const lists = WORDS.map((f) => JSON.parse(readFileSync(f, "utf8")).words);
const words: TimedWord[] = wordTimes(turns, lists.length > 1 ? bestWordsPerTurn(turns, lists) : lists[0]);
writeFileSync(join(WORK, "words.json"), JSON.stringify(words, null, 1));
writeFileSync(join(WORK, "karaoke.ass"), karaokeAss(pages(words, 3, 18), turns.map((t: any) => t.speaker), {
  width: W, height: H, font: CAPTION_FONT, size: 64, x: W / 2, y: CAPTION_Y, text: "#ffffff", box: INK, boxAlpha: 0.85,
  active: Object.fromEntries(speakers.map((sp) => [sp, reg[faceOf(segs.find((s) => s.speaker === sp)!)].ring])), hold: 0.5,
}));

// ---- the storyboard's cards over the recording's top edge, the captions, then the one lossy encode.
// A card never shows over a solo or end segment: those have no recording for it to sit on.
const bare = segs.filter((s) => layoutOf(s.k) !== "split")
  .map((s) => `between(t,${(Math.round(s.start * FPS) / FPS).toFixed(4)},${(Math.round(s.end * FPS) / FPS - 0.001).toFixed(4)})`);
const cards = sb.cards.map((cd, i) =>
  `${draw(txt(`card${i}.txt`, cd.text), 54, "0xE6F5F2", "(w-text_w)/2", CARD_Y, `:box=1:boxcolor=${BG}@0.9:boxborderw=16`)}:enable='between(t,${cd.start.toFixed(3)},${cd.end.toFixed(3)})${bare.map((b) => `*not(${b})`).join("")}'`);
const vf = [...cards, "subtitles=karaoke.ass", "format=yuv420p"].join(",");
ff(["-i", "picture.mp4", "-i", MIX, "-vf", vf, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-r", String(FPS), "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", OUT], "final");
limitTruePeak(OUT, MIX);
console.log(`9:16  ${OUT}`);
