#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The 16:9 (1920x1080) with presenters, in one of two layouts:
//
// - bubble (default): the real recording keeps the whole frame at its own pixels (on-screen text stays
//   readable); the presenter who is speaking sits in a round-cornered bubble at the bottom right, and only
//   that one, so no listener and no idle loop ever shows. A solo beat puts the speaker in a large tile on
//   the background colour. Captions run along the bottom, the storyboard's cards sit at the top left.
// - tutor: a presenter who gestures needs room. The recording sits on the left at 1152x648, the cards
//   above it and the captions below it, and the presenter fills a tall panel on the right for the whole
//   video, like a teacher beside a screen. Render the clips taller than wide for it (talk.ts --size
//   512x768, from a waist-up portrait with the hands in the picture). A solo beat keeps the recording.
//
// An end beat draws the end card where the recording was. Two more beats, for a demo that should own the
// frame at times: "screen" shows the recording full frame with no presenter at all (the clip for such a
// turn is never rendered), and in the tutor layout "solo" keeps the presenter in the panel and gives the
// left of the frame to the beat's card as a title (a chapter, the recording hidden). Disclosure as in
// compose.ts: every presenter label carries its ai_label from the first frame, and the recording says it is
// real; a storyboard's `labels` may set a face's label, and an empty one draws none.
//
//   bun tools/avatar/compose16.ts --talk <talk.json> --screen <recording.mp4> --mix <mix.wav>
//        --words <words.json[,more.json]> --storyboard <storyboard.json> --out <file.mp4>
//        [--layout bubble|tutor] [--work <dir>]
//
// --screen is the recording on the narration's timeline; any size, scaled to fit, and held on its last
// frame if it is shorter.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CAPTION_FONT, fontArg } from "../lib/platform.ts";
import { loadPresenters } from "./comfy.ts";
import { bestWordsPerTurn, karaokeAss, pages, wordTimes, type TimedWord } from "./lib.ts";
import { limitTruePeak } from "./media.ts";

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const need = (n: string) => { const v = opt(n); if (!v) { console.error(`compose16.ts: --${n} is required`); process.exit(2); } return resolve(v); };
const TALK = need("talk"), SCREEN = need("screen"), MIX = need("mix"), SB = need("storyboard"), OUT = need("out");
const WORDS = (opt("words") ?? "").split(",").filter(Boolean).map((f) => resolve(f));
if (!WORDS.length) { console.error("compose16.ts: --words is required"); process.exit(2); }
const LAYOUT = opt("layout", "bubble") as "bubble" | "tutor";
if (!["bubble", "tutor"].includes(LAYOUT)) throw new Error(`--layout ${LAYOUT}: bubble or tutor`);
const WORK = resolve(opt("work", join(OUT, "..", `compose-16x9-${LAYOUT}`))!);
mkdirSync(WORK, { recursive: true }); mkdirSync(join(OUT, ".."), { recursive: true });

const FPS = 30, W = 1920, H = 1080, BG = "0x0A201D", INK = "#1a1a2e";
const FONT = fontArg();
const RING = 8;

type Seg = { k: number; speaker: string; start: number; end: number; turn?: number; turns?: number[] };
// `chip` names what the recording area shows on that beat: "Real screen recording" unless the beat (or
// the storyboard) says otherwise, and "" draws none, for a beat whose picture is a diagram or a still.
type Beat = { turn: number; layout: "split" | "solo" | "end" | "screen"; chip?: string };
type Card = { start: number; end: number; text: string };
const talk = JSON.parse(readFileSync(TALK, "utf8"));
const sb = JSON.parse(readFileSync(SB, "utf8")) as { beats: Beat[]; cards: Card[]; labels?: Record<string, string>; chip?: string; end_card?: { title: string; subtitle: string } };
const reg = loadPresenters();
const segs: Seg[] = talk.segments;
const turns = JSON.parse(readFileSync(join(talk.narration, "turns.json"), "utf8"));
const speakers: string[] = [...new Set(segs.map((s) => s.speaker))];
// A clip can hold several turns (talk.ts --group-gap): its layout is its first turn's.
const layoutOf = (s: Seg) => sb.beats.find((b) => b.turn === (s.turn ?? s.k))?.layout ?? "split";
// The face a clip was rendered with (talk.ts --face) decides its label and ring.
const clipOf = (s: Seg) => talk.clips[`seg${String(s.k).padStart(2, "0")}-${s.speaker}`];
const faceOf = (s: Seg) => clipOf(s)?.face ?? s.speaker;
const total = segs[segs.length - 1].end;

// ---- geometry, in output pixels
const BUB = 380, BUB_X = W - 40 - BUB, BUB_Y = H - 40 - BUB, R_BUB = 26;   // bubble: the speaker, bottom right
const SOLO = 860, SOLO_X = (W - SOLO) / 2, SOLO_Y = 70, R_SOLO = 40;       // bubble: a solo beat, centred
// tutor: the panel keeps the clips' own aspect, 1000 px tall, on the right; the recording on the left.
const PAN_H = 1000, PAN_W = Math.round(PAN_H * (talk.params?.w ?? 512) / (talk.params?.h ?? 768)), PAN_X = W - 40 - PAN_W, PAN_Y = 40, R_PAN = 36;
const SCR_W = 1152, SCR_H = 648, SCR_X = 40, SCR_Y = 150;
if (LAYOUT === "tutor" && SCR_X + SCR_W > PAN_X - 16) throw new Error(`the clips are too wide for --layout tutor (${PAN_W} px panel): render them taller than wide (talk.ts --size 512x768)`);
const G = LAYOUT === "tutor"
  ? { capX: SCR_X + SCR_W / 2, capY: SCR_Y + SCR_H + 115, cardX: SCR_X, cardY: 44, endX: SCR_X + SCR_W / 2, endY: 330 }
  : { capX: 760, capY: 1000, cardX: 48, cardY: 40, endX: W / 2, endY: 330 };
// Where the recording shows: on split turns (beside the panel in tutor, full frame in bubble) and on
// screen turns (full frame, no presenter). A tutor solo gives the left of the frame to a title instead.
const showsScreen = (layout: string) => layout === "split" || layout === "screen";
const showsPresenter = (layout: string) => layout !== "screen";
// One clip, one layout. A clip that holds a block of turns takes its first turn's layout, so a plan in
// which the block's turns would show different things (a solo inside a block hides the recording for
// the whole block in the bubble layout) is refused, never silently half-followed.
for (const s of segs) {
  const ls = (s.turns ?? [s.turn ?? s.k]).map((t) => sb.beats.find((b) => b.turn === t)?.layout ?? "split");
  if (new Set(ls).size > 1) throw new Error(`clip ${s.k} holds turns ${s.turns!.join(",")}, planned as ${ls.join("/")}: one clip has one layout. Plan with storyboard.ts --group-gap (the same as talk.ts), or render the clips without it`);
}

function ff(a: string[], label: string) {
  const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", ...a], { cwd: WORK, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`${label}: ffmpeg failed:\n${r.stderr.toString().slice(-2500)}`);
}
const txt = (name: string, s: string) => { writeFileSync(join(WORK, name), s); return name; };
const draw = (file: string, size: number, color: string, x: string | number, y: string | number, box = "") =>
  `drawtext=${FONT}:textfile='${file}':fontsize=${size}:fontcolor=${color}${box}:x=${x}:y=${y}`;
const LABEL_BOX = ":box=1:boxcolor=0x1A1A2E@0.85:boxborderw=10";
const label = (face: string) => sb.labels?.[face] ?? `${reg[face].label} · ${reg[face].ai_label ?? "AI presenter"}`;

// ---- the recording at 1920x1080, 30 fps, held on its last frame to the end of the narration.
const screenDur = Number(Bun.spawnSync(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", SCREEN], { stdout: "pipe" }).stdout.toString());
ff(["-i", SCREEN, "-vf", `fps=${FPS},scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=${BG},setsar=1,tpad=stop_mode=clone:stop_duration=${Math.max(0, total - screenDur + 1).toFixed(2)}`,
  "-t", total.toFixed(3), "-an", "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "screen.mp4"], "screen");

// ---- masks (alpha) and each face's ring, drawn once per size.
const rounded = (r: number) =>
  `if(gt(abs(X-(W-1)/2),W/2-${r})*gt(abs(Y-(H-1)/2),H/2-${r}),if(lte(hypot(abs(X-(W-1)/2)-(W/2-${r}),abs(Y-(H-1)/2)-(H/2-${r})),${r}),255,0),255)`;
const shapes: Array<[string, number, number, number]> = LAYOUT === "tutor" ? [["pan", PAN_W, PAN_H, R_PAN]] : [["bub", BUB, BUB, R_BUB], ["solo", SOLO, SOLO, R_SOLO]];
for (const [name, w, h, r] of shapes) {
  if (!existsSync(join(WORK, `mask-${name}.png`))) ff(["-f", "lavfi", "-i", `color=c=black:s=${w}x${h}:d=1`, "-vf", `format=gray,geq=lum='${rounded(r)}'`, "-frames:v", "1", `mask-${name}.png`], `mask ${name}`);
  for (const face of new Set(segs.filter((s) => showsPresenter(layoutOf(s))).map(faceOf))) {
    const c = reg[face].ring.replace("#", "0x"), f = `ring-${name}-${face}.png`;
    if (!existsSync(join(WORK, f))) ff(["-f", "lavfi", "-i", `color=c=${c}:s=${w + 2 * RING}x${h + 2 * RING}:d=1`, "-vf", `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${rounded(r + RING)}'`, "-frames:v", "1", f], `ring ${name}`);
  }
}

// ---- one lossless part per segment, frame-exact: segment k covers frames [round(start*30), round(end*30)).
const parts: string[] = [];
for (const s of segs) {
  const layout = layoutOf(s), face = faceOf(s);
  const f0 = Math.round(s.start * FPS), f1 = Math.round(s.end * FPS), n = f1 - f0, d = n / FPS;
  const part = `part${String(s.k).padStart(2, "0")}.mp4`;
  parts.push(part);
  const showP = showsPresenter(layout);
  const clip = clipOf(s)?.clip;
  if (showP && (!clip || !existsSync(clip))) throw new Error(`segment ${s.k}: no clip (run talk.ts)`);
  // Where the speaker goes, at what size, in which shape.
  const [shape, w, h, x, y] = LAYOUT === "tutor" ? ["pan", PAN_W, PAN_H, PAN_X, PAN_Y] as const
    : layout === "solo" ? ["solo", SOLO, SOLO, SOLO_X, SOLO_Y] as const : ["bub", BUB, BUB, BUB_X, BUB_Y] as const;

  const inputs: string[] = [];
  const input = (...a: string[]) => { inputs.push(...a); return `[${inputs.filter((v) => v === "-i").length - 1}:v]`; };
  const st: string[] = [];
  let c = 0;
  // The recording full frame: a bubble split, and every screen beat.
  const fullFrame = layout === "screen" || (LAYOUT === "bubble" && layout === "split");
  let base = fullFrame
    ? input("-ss", s.start.toFixed(4), "-i", "screen.mp4")
    : input("-f", "lavfi", "-i", `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${d.toFixed(4)}`);
  const ov = (src: string, ox: number, oy: number) => { const o = `[c${c++}]`; st.push(`${base}${src}overlay=${ox}:${oy}${o}`); base = o; };
  const tx = (f: string) => { const o = `[c${c++}]`; st.push(`${base}${f}${o}`); base = o; };
  if (fullFrame) st.push(`${base}trim=end_frame=${n},setpts=PTS-STARTPTS,fps=${FPS}[scr]`), (base = "[scr]");
  if (LAYOUT === "tutor" && layout === "split") {
    st.push(`${input("-ss", s.start.toFixed(4), "-i", "screen.mp4")}trim=end_frame=${n},setpts=PTS-STARTPTS,fps=${FPS},scale=${SCR_W}:${SCR_H}:flags=lanczos[scr]`);
    ov("[scr]", SCR_X, SCR_Y);
  }
  if (layout === "end") {
    tx(draw(txt(`end1-${s.k}.txt`, sb.end_card?.title ?? ""), 130, "0xE6F5F2", `${G.endX}-text_w/2`, G.endY));
    if (sb.end_card?.subtitle) tx(draw(txt(`end2-${s.k}.txt`, sb.end_card.subtitle), 50, "0x80CBC4", `${G.endX}-text_w/2`, G.endY + 190));
  }
  if (showP) {
    // The talking clip is 25 fps and can end a frame or two short of its audio: hold its last frame.
    st.push(`${input("-i", clip!)}fps=${FPS},tpad=stop_mode=clone:stop_duration=2,trim=end_frame=${n},setpts=PTS-STARTPTS,scale=${w}:${h}:flags=lanczos,format=yuva420p[spk]`);
    st.push(`${input("-i", `mask-${shape}.png`)}format=gray[m]`, "[spk][m]alphamerge[spkr]");
    ov(input("-i", `ring-${shape}-${face}.png`), x - RING, y - RING);
    ov("[spkr]", x, y);
    const lab = label(face), big = shape !== "bub";
    if (lab) tx(draw(txt(`lab${s.k}.txt`, lab), big ? 34 : 24, "white", x + (big ? 24 : 14), y + (big ? 24 : 14), LABEL_BOX));
  }
  const chip = sb.beats.find((b) => b.turn === (s.turn ?? s.k))?.chip ?? sb.chip ?? "Real screen recording";
  if (showsScreen(layout) && chip) {
    const inPanel = LAYOUT === "tutor" && layout === "split";
    const chipX = inPanel ? `${SCR_X + SCR_W - 16}-text_w` : "w-text_w-48", chipY = inPanel ? SCR_Y + 16 : 44;
    tx(draw(txt(`real${s.k}.txt`, chip), 24, "white", chipX, chipY, LABEL_BOX));
  }
  const graph = `${st.join(";")};${base}format=yuv420p[v]`;
  ff([...inputs, "-filter_complex", graph, "-map", "[v]", "-frames:v", String(n), "-r", String(FPS), "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", part], `segment ${s.k}`);
  console.log(`part ${String(s.k).padStart(2)} ${layout.padEnd(6)} ${(showP ? face : "-").padEnd(24)} ${d.toFixed(2)} s`);
}
writeFileSync(join(WORK, "parts.txt"), parts.map((p) => `file '${p}'`).join("\n") + "\n");
ff(["-f", "concat", "-safe", "0", "-i", "parts.txt", "-c", "copy", "picture.mp4"], "concat");

// ---- captions: the script's words at Whisper's times, the said word in its speaker's colour.
const lists = WORDS.map((f) => JSON.parse(readFileSync(f, "utf8")).words);
const words: TimedWord[] = wordTimes(turns, lists.length > 1 ? bestWordsPerTurn(turns, lists) : lists[0]);
writeFileSync(join(WORK, "words.json"), JSON.stringify(words, null, 1));
// The said word takes the ring colour of the first face its speaker is shown with.
const ringOf = (sp: string) => { const s = segs.find((x) => x.speaker === sp && showsPresenter(layoutOf(x))); return s ? reg[faceOf(s)].ring : "#ffffff"; };
const ass = karaokeAss(pages(words, 3, 18), turns.map((t: any) => t.speaker), {
  width: W, height: H, font: CAPTION_FONT, size: 56, x: G.capX, y: G.capY, text: "#ffffff", box: INK, boxAlpha: 0.85,
  active: Object.fromEntries(speakers.map((sp) => [sp, ringOf(sp)])), hold: 0.5,
});
// In the tutor layout a caption over a full-frame recording (a screen turn) moves to the bottom centre.
const beatAt = (t: number) => layoutOf(segs.find((s) => t >= s.start && t < s.end) ?? segs[segs.length - 1]);
const assSec = (s: string) => { const [h, m, x] = s.split(":"); return Number(h) * 3600 + Number(m) * 60 + Number(x); };
writeFileSync(join(WORK, "karaoke.ass"), ass.split("\n").map((l) => {
  const m = /^Dialogue: 0,([^,]+),/.exec(l);
  return m && LAYOUT === "tutor" && beatAt(assSec(m[1])) === "screen" ? l.replace(/\\pos\([^)]*\)/, `\\pos(${W / 2},995)`) : l;
}).join("\n"));

// ---- the storyboard's cards: at the top left over the recording on split and screen turns, and in a
// tutor solo as the chapter's title where the recording would be; never over a bubble solo or an end card.
const span = (s: Seg) => `between(t,${(Math.round(s.start * FPS) / FPS).toFixed(4)},${(Math.round(s.end * FPS) / FPS - 0.001).toFixed(4)})`;
const during = (want: string) => { const iv = segs.filter((s) => layoutOf(s) === want).map(span); return iv.length ? `gt(${iv.join("+")},0)` : "0"; };
const inSplit = during("split"), inScreen = during("screen"), inSolo = LAYOUT === "tutor" ? during("solo") : "0";
const CARD_BOX = `:box=1:boxcolor=${BG}@0.88:boxborderw=18`;
const cards = sb.cards.flatMap((cd, i) => {
  const f = txt(`card${i}.txt`, cd.text), on = `between(t,${cd.start.toFixed(3)},${cd.end.toFixed(3)})`;
  return [
    `${draw(f, 46, "0xE6F5F2", G.cardX, G.cardY, CARD_BOX)}:enable='${on}*${inSplit}'`,
    `${draw(f, 46, "0xE6F5F2", 48, 40, CARD_BOX)}:enable='${on}*${inScreen}'`,
    ...(LAYOUT === "tutor" ? [`${draw(f, 88, "0xE6F5F2", `${SCR_X + SCR_W / 2}-text_w/2`, 400)}:enable='${on}*${inSolo}'`] : []),
  ];
});
ff(["-i", "picture.mp4", "-i", MIX, "-vf", [...cards, "subtitles=karaoke.ass", "format=yuv420p"].join(","), "-map", "0:v", "-map", "1:a",
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-r", String(FPS), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
  "-shortest", "-movflags", "+faststart", OUT], "final");
limitTruePeak(OUT, MIX);
console.log(`16:9 (${LAYOUT})  ${OUT}`);
