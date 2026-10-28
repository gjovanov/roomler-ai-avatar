#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The studio conversation format's picture and sound: a layout of its own beside compose16.ts, from the podcast
// pilot (videos/podcast-studio, 2026-10-26 to 10-28).
//
// - two: two framed cameras over the blurred studio, the host on the left and the guest on the right. The one
//   speaking is their talking clip in a ring of their colour; the listener is their own listening clip
//   (tools/avatar/listen.ts: the model's trained silence, so no mouthing), a touch dimmer, else a dimmed still of
//   their portrait. Where the turn passes between two two-camera segments the dimming and the ring ease over 0.3 s,
//   and the clips continue each other's pose (chain.ts), so the cut does not read as two scenes glued together.
// - cards: the guest's camera on the right, a stack of cards on the left (an HTML page's states, each shown from
//   its trigger word on).
// - screen: a demo full frame, no camera: footage (an earlier video's screen track), a diagram, or a page of
//   states (a real page with its highlights). The voice runs on over it.
// - a title before the narration and an end card after it, both over music; the music dips under the first
//   lines and comes back under the last, and is silent in between.
//
//   bun tools/podcast/compose.ts <plan.json> [--parts a-b] [--audio-only]
//
// Writes the plan's `out` and, beside it, <out>.srt: the narration's captions moved by the title's length, for an
// upload. Frame-exact like compose16.ts: segment k (talk.ts tiles the narration into one segment per clip) is one
// lossless part covering frames [round(start*30), round(end*30)) of the narration, after the title.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAPTION_FONT, fontArg } from "../lib/platform.ts";
import { loadPresenters, portraitFile } from "../avatar/comfy.ts";
import { karaokeAss, pages, wordTimes, type TimedWord } from "../avatar/lib.ts";
import { limitTruePeak } from "../avatar/media.ts";
import { beatAt, FPS, H, loadPlan, resolveBeats, shiftSrt, TILE, W } from "./plan.ts";

if (!process.argv[2] || process.argv[2].startsWith("--")) { console.error("usage: compose.ts <plan.json> [--parts a-b] [--audio-only]"); process.exit(2); }
const { plan: P, R } = loadPlan(process.argv[2]);
const WORK = R(P.work); mkdirSync(WORK, { recursive: true });
const OUT = R(P.out);
// --audio-only: rebuild the sound and put it under the existing OUT's picture (stream copy): no part, no re-encode.
const AUDIO_ONLY = process.argv.includes("--audio-only");
// --parts a-b: only segments a..b, as <work>/preview-a-b.mp4 with their sound (no title, captions or music): to look
// at the cuts between a few clips without composing the whole video.
const PARTS = process.argv.includes("--parts") ? process.argv[process.argv.indexOf("--parts") + 1].split("-").map(Number) : null;

const INK = "#1a1a2e", RING = TILE.ring;
const talk = JSON.parse(readFileSync(R(P.talk), "utf8"));
const turns = JSON.parse(readFileSync(join(talk.narration, "turns.json"), "utf8"));
const segs: Array<{ k: number; speaker: string; start: number; end: number; turn: number; turns: number[] }> = talk.segments;
const reg = loadPresenters();
const clipOf = (s: { k: number; speaker: string }) => talk.clips[`seg${String(s.k).padStart(2, "0")}-${s.speaker}`];
// The listener's own clip for a two-camera segment (listen.ts), else the dimmed still.
const listenFile = join(R(P.talk), "..", "listen.json");
const listen: Record<string, { clip: string; speaker: string }> = existsSync(listenFile) ? JSON.parse(readFileSync(listenFile, "utf8")) : {};
const faceFor = (speaker: string) => Object.values<any>(talk.clips).find((c) => c.speaker === speaker)?.face ?? P.faces?.[speaker]?.split(",")[0] ?? speaker;
const HOST = P.host, GUEST = P.guest;
for (const sp of new Set(segs.map((s) => s.speaker))) if (sp !== HOST && sp !== GUEST) throw new Error(`the narration's speaker "${sp}" is neither the plan's host (${HOST}) nor its guest (${GUEST})`);
const beats = resolveBeats(P, turns);
const beatOf = (turn: number) => beatAt(beats, turn);
for (const s of segs) {
  const ls = new Set(s.turns.map((t) => beatOf(t).layout));
  if (ls.size > 1) throw new Error(`segment ${s.k} holds turns ${s.turns.join(",")} planned as ${[...ls].join("/")}: one segment, one layout (a longer pause between them splits it)`);
}
const PRE = P.pre, POST = P.post, total = segs[segs.length - 1].end;

function ff(a: string[], label: string) {
  const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", ...a], { cwd: WORK, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`${label}: ffmpeg failed:\n${r.stderr.toString().slice(-2500)}`);
}
const probe = (f: string) => Number(Bun.spawnSync(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f], { stdout: "pipe" }).stdout.toString());

// ---- words at their times (the captions, and the trigger words of states and syncs)
const asr = JSON.parse(readFileSync(R(P.words), "utf8")).words;
const words: TimedWord[] = wordTimes(turns, asr);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
/** The start of the first word at or after `from` in `turnList` that begins with `w`. */
function wordAt(turnList: number[], w: string, from = -1): number {
  const hit = words.find((x) => turnList.includes(x.turn) && x.start > from && norm(x.text).startsWith(norm(w)));
  if (!hit) throw new Error(`no word "${w}" in turns ${turnList.join(",")} after ${from.toFixed(2)} s`);
  return hit.start;
}

// ---- geometry
const TW = TILE.w, TH = TILE.h, TY = TILE.y, HX = TILE.hostX, GX = TILE.guestX;   // two: host left, guest right
const CX = TILE.cardsX, CY = TILE.cardsY;                                          // cards: the guest on the right
const CAP_Y = 1022;

if (!AUDIO_ONLY) {
// ---- shared stills: the blurred studio, the tile mask, each face's ring, each face's dimmed still
const rounded = (r: number) =>
  `if(gt(abs(X-(W-1)/2),W/2-${r})*gt(abs(Y-(H-1)/2),H/2-${r}),if(lte(hypot(abs(X-(W-1)/2)-(W/2-${r}),abs(Y-(H-1)/2)-(H/2-${r})),${r}),255,0),255)`;
if (!existsSync(join(WORK, "bg.png")))
  ff(["-i", R(P.studio), "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=16,eq=brightness=-0.10:saturation=0.85", "-frames:v", "1", "bg.png"], "bg");
if (!existsSync(join(WORK, "mask.png")))
  ff(["-f", "lavfi", "-i", `color=c=black:s=${TW}x${TH}:d=1`, "-vf", `format=gray,geq=lum='${rounded(30)}'`, "-frames:v", "1", "mask.png"], "mask");
for (const sp of [HOST, GUEST]) {
  const face = faceFor(sp), ring = reg[face].ring.replace("#", "0x");
  if (!existsSync(join(WORK, `ring-${sp}.png`)))
    ff(["-f", "lavfi", "-i", `color=c=${ring}:s=${TW + 2 * RING}x${TH + 2 * RING}:d=1`, "-vf", `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${rounded(30 + RING)}'`, "-frames:v", "1", `ring-${sp}.png`], "ring");
  // The listener: the portrait (the clips' first frame), dimmed, rounded, with a thin dark edge.
  if (!existsSync(join(WORK, `still-${sp}.png`)))
    ff(["-i", portraitFile(reg[face].portrait), "-i", "mask.png", "-filter_complex",
      `[0]scale=${TW}:${TH}:flags=lanczos,eq=brightness=-0.16:saturation=0.75,format=rgba[p];[1]format=gray[m];[p][m]alphamerge`, "-frames:v", "1", `still-${sp}.png`], "still");
}

// ---- one lossless part per segment
const parts: string[] = [];
const tileClip = (clip: string, n: number) => `fps=${FPS},tpad=stop_mode=clone:stop_duration=2,trim=end_frame=${n},setpts=PTS-STARTPTS,scale=${TW}:${TH}:flags=lanczos,format=yuva420p`;
for (const s of segs) {
  if (PARTS && (s.k < PARTS[0] || s.k > PARTS[1])) continue;
  const beat = beatOf(s.turn), layout = beat.layout;
  const f0 = Math.round(s.start * FPS), f1 = Math.round(s.end * FPS), n = f1 - f0, d = n / FPS, t0 = f0 / FPS;
  const part = `part${String(s.k).padStart(2, "0")}.mp4`;
  parts.push(part);
  const inputs: string[] = [];
  const input = (...a: string[]) => { inputs.push(...a); return `[${inputs.filter((v) => v === "-i").length - 1}:v]`; };
  const st: string[] = [];
  let c = 0, base = "";
  const ov = (src: string, x: number | string, y: number | string, en = "") => { const o = `[c${c++}]`; st.push(`${base}${src}overlay=${x}:${y}${en ? `:enable='${en}'` : ""}${o}`); base = o; };
  // The states of an HTML page (cards, a real page): state 0 from the start, state k from its k-th word.
  const stateOverlays = (dir: string, at: string[]) => {
    let from = s.start - 0.001;
    const times = at.map((w) => (from = wordAt(s.turns, w, from)));
    [0, ...times].forEach((tAbs, k) => {
      const a = Math.max(0, tAbs - t0), b = k < times.length ? times[k] - t0 : d + 1;
      ov(input("-loop", "1", "-framerate", String(FPS), "-t", d.toFixed(4), "-i", R(`${dir}/state-${k}.png`)), 0, 0, `between(t,${a.toFixed(3)},${(b - 0.001).toFixed(3)})`);
    });
  };
  if (layout === "screen") {
    const v = beat.visual;
    if (!v) throw new Error(`segment ${s.k} (turns ${s.turns.join(",")}) is a screen beat without a visual`);
    if (v.states) {
      base = input("-loop", "1", "-framerate", String(FPS), "-t", d.toFixed(4), "-i", R(`${v.states}/state-0.png`));
      st.push(`${base}scale=${W}:${H},setsar=1,format=yuv420p[b0]`); base = "[b0]";
      stateOverlays(v.states, v.at ?? []);
    } else {
      const file = R(v.file!);
      // sync: put the visual's moment `at` (s) under the word's start; else start at `in`.
      let inPt = v.in ?? 0;
      if (v.sync) inPt = Math.max(0, v.sync.at - (wordAt(s.turns, v.sync.word) - t0));
      const vd = probe(file);
      st.push(`${input("-ss", inPt.toFixed(3), "-i", file)}fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0A201D,setsar=1,tpad=stop_mode=clone:stop_duration=${Math.max(0, d - (vd - inPt) + 1).toFixed(2)},trim=end_frame=${n},setpts=PTS-STARTPTS,format=yuv420p[b0]`);
      base = "[b0]";
      console.log(`  visual ${v.file} from ${inPt.toFixed(2)} s (${vd.toFixed(1)} s long, ${d.toFixed(2)} s used)`);
      // Privacy boxes: a machine's name or address on screen gets a box, with a generic label in its place.
      (beat.boxes ?? []).forEach((b, i) => {
        const en = b.from !== undefined ? `:enable='gte(t,${Math.max(0, b.from - inPt).toFixed(3)})'` : "";
        const o = `[c${c++}]`;
        st.push(`${base}drawbox=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}:color=0x26363C@1:t=fill${en}${o}`);
        base = o;
        if (b.label) {
          writeFileSync(join(WORK, `box${s.k}-${i}.txt`), b.label);
          const o2 = `[c${c++}]`;
          st.push(`${base}drawtext=${fontArg()}:textfile='box${s.k}-${i}.txt':fontsize=${Math.round(b.h * 0.8)}:fontcolor=0xBFDCD7:x=${b.x + 10}:y=${b.y}+(${b.h}-text_h)/2${en}${o2}`);
          base = o2;
        }
      });
    }
    if (beat.chip) {
      writeFileSync(join(WORK, `chip${s.k}.txt`), beat.chip);
      const o = `[c${c++}]`;
      st.push(`${base}drawtext=${fontArg()}:textfile='chip${s.k}.txt':fontsize=26:fontcolor=white:box=1:boxcolor=0x1A1A2E@0.85:boxborderw=12:x=w-text_w-48:y=40${o}`);
      base = o;
    }
  } else {
    base = input("-loop", "1", "-framerate", String(FPS), "-t", d.toFixed(4), "-i", "bg.png");
    st.push(`${base}format=yuv420p[b0]`); base = "[b0]";
    const clip = clipOf(s)?.clip;
    if (!clip || !existsSync(clip)) throw new Error(`segment ${s.k} (${s.speaker}, turns ${s.turns.join(",")}): no clip; render it (chain.ts, or talk.ts --only ${s.k})`);
    if (layout === "two") {
      const other = s.speaker === HOST ? GUEST : HOST;
      const [sx, ox] = s.speaker === HOST ? [HX, GX] : [GX, HX];
      const lc = listen[String(s.k)];
      // Where the turn passes between two two-camera segments, the listener's dimming and the speaker's ring EASE
      // over SWAP s instead of snapping on the cut frame.
      const prev = segs[segs.indexOf(s) - 1];
      const swap = !!prev && beatOf(prev.turn).layout === "two" && prev.speaker !== s.speaker;
      const SWAP = 0.3, e = `min(1,t/${SWAP})`;
      const ringIn = (who: string, x: number, how: "in" | "out") => {
        st.push(`${input("-loop", "1", "-framerate", String(FPS), "-t", d.toFixed(4), "-i", `ring-${who}.png`)}format=rgba,fade=t=${how}:st=0:d=${SWAP}:alpha=1[ring_${how}]`);
        ov(`[ring_${how}]`, x - RING, TY - RING);
      };
      if (swap) ringIn(other, ox, "out");
      if (lc && lc.speaker === other && existsSync(lc.clip)) {
        // alive, a touch dimmer than the one speaking
        const dim = swap ? `eq=brightness='-0.05*${e}':saturation='1-0.08*${e}':eval=frame` : "eq=brightness=-0.05:saturation=0.92";
        st.push(`${input("-i", lc.clip)}${tileClip(lc.clip, n)},${dim}[lis]`, `${input("-i", "mask.png")}format=gray[lm]`, "[lis][lm]alphamerge[lisr]");
        ov("[lisr]", ox, TY);
      } else ov(input("-i", `still-${other}.png`), ox, TY);
      if (swap) ringIn(s.speaker, sx, "in");
      else ov(input("-i", `ring-${s.speaker}.png`), sx - RING, TY - RING);
      const undim = swap ? `,eq=brightness='-0.05*(1-${e})':saturation='0.92+0.08*${e}':eval=frame` : "";
      st.push(`${input("-i", clip)}${tileClip(clip, n)}${undim}[spk]`, `${input("-i", "mask.png")}format=gray[m]`, "[spk][m]alphamerge[spkr]");
      ov("[spkr]", sx, TY);
    } else {
      if (s.speaker !== GUEST) throw new Error(`segment ${s.k}: a cards beat is the guest's`);
      if (!beat.visual?.states) throw new Error(`segment ${s.k}: a cards beat needs visual.states`);
      ov(input("-i", `ring-${GUEST}.png`), CX - RING, CY - RING);
      st.push(`${input("-i", clip)}${tileClip(clip, n)}[spk]`, `${input("-i", "mask.png")}format=gray[m]`, "[spk][m]alphamerge[spkr]");
      ov("[spkr]", CX, CY);
      stateOverlays(beat.visual.states, beat.visual.at ?? []);
    }
  }
  ff([...inputs, "-filter_complex", `${st.join(";")};${base}format=yuv420p[v]`, "-map", "[v]", "-frames:v", String(n), "-r", String(FPS), "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", part], `segment ${s.k}`);
  console.log(`part ${String(s.k).padStart(2)} ${layout.padEnd(6)} ${s.speaker.padEnd(8)} turns ${s.turns.join(",").padEnd(8)} ${d.toFixed(2)} s`);
}
if (PARTS) {
  const sel = segs.filter((s) => s.k >= PARTS[0] && s.k <= PARTS[1]);
  const f0 = Math.round(sel[0].start * FPS), f1 = Math.round(sel[sel.length - 1].end * FPS);
  const out = `preview-${PARTS[0]}-${PARTS[1]}.mp4`;
  writeFileSync(join(WORK, "preview.txt"), parts.map((p) => `file '${p}'`).join("\n") + "\n");
  ff(["-f", "concat", "-safe", "0", "-i", "preview.txt", "-ss", (f0 / FPS).toFixed(4), "-t", ((f1 - f0) / FPS).toFixed(4), "-i", R(P.mix),
    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", out], "preview");
  console.log(`preview ${join(WORK, out)}`);
  process.exit(0);
}

// ---- the title (a slow push into the studio) and the end card, as parts of their own
const nPre = Math.round(PRE * FPS), nPost = Math.round(POST * FPS);
ff(["-loop", "1", "-framerate", String(FPS), "-t", (PRE + 1).toFixed(2), "-i", R(P.title_png), "-vf",
  `scale=3840:2160,zoompan=z='1+0.05*on/${nPre}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},fade=t=in:st=0:d=0.5,format=yuv420p`,
  "-frames:v", String(nPre), "-r", String(FPS), "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "title.mp4"], "title");
ff(["-loop", "1", "-framerate", String(FPS), "-t", (POST + 1).toFixed(2), "-i", R(P.end_png), "-vf",
  `scale=${W}:${H},fade=t=in:st=0:d=0.4,fade=t=out:st=${(POST - 0.8).toFixed(2)}:d=0.8,format=yuv420p`,
  "-frames:v", String(nPost), "-r", String(FPS), "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "end.mp4"], "end");
writeFileSync(join(WORK, "parts.txt"), ["title.mp4", ...parts, "end.mp4"].map((p) => `file '${p}'`).join("\n") + "\n");
ff(["-f", "concat", "-safe", "0", "-i", "parts.txt", "-c", "copy", "picture.mp4"], "concat");

// ---- captions: the script's words at Whisper's times, after the title; the said word in its speaker's colour
const shifted = words.map((w) => ({ ...w, start: w.start + PRE, end: w.end + PRE }));
const ass = karaokeAss(pages(shifted, 3, 18), turns.map((t: any) => t.speaker), {
  width: W, height: H, font: CAPTION_FONT, size: 54, x: W / 2, y: CAP_Y, text: "#ffffff", box: INK, boxAlpha: 0.85,
  active: { [HOST]: reg[faceFor(HOST)].ring, [GUEST]: reg[faceFor(GUEST)].ring }, hold: 0.5,
});
writeFileSync(join(WORK, "karaoke.ass"), ass);
}

// ---- sound: the mix (lines.ts + mix.ts, -14 LUFS) after the title. Music: the track's OPENING over the title,
// dipping under the first lines and gone by the tenth second; a strong passage of the track under the last line,
// rising over the end card. (The pilot's track runs 135 s and the video 389: one continuous bed ran out two minutes
// in and left the end card silent, 2026-10-26.) The track's own last ten seconds fade to silence (-18, then -35
// LUFS), so the outro is a passage of it (plan.music_out, the track time where the outro starts) faded out by
// this envelope instead.
const T = PRE + total + POST, nEnd = PRE + total, MUS = probe(R(P.music)), TAIL = POST + 4, BED = 0.07;
const FULL = 0.8, OUT_FULL = 0.5, OUT_AT = P.music_out ?? MUS - TAIL;
const envIn = [
  `if(lt(t,${PRE - 0.6}),${FULL}`,
  `if(lt(t,${PRE + 0.9}),${FULL}-${(FULL - BED).toFixed(2)}*(t-${PRE - 0.6})/1.5`,
  `if(lt(t,${PRE + 7}),${BED}`,
  `if(lt(t,${PRE + 10}),${BED}*(${PRE + 10}-t)/3,0))))`,
].join(",");
// The ending is delayed to start at T-TAIL (= nEnd-4), so its t is the video's own time.
const envOut = [
  `if(lt(t,${nEnd - 1}),max(0,${BED}*(t-${nEnd - 4})/3)`,
  `if(lt(t,${nEnd + 0.8}),${BED}+${(OUT_FULL - BED).toFixed(2)}*(t-${nEnd - 1})/1.8`,
  `if(lt(t,${T - 1.6}),${OUT_FULL},${OUT_FULL}*(${T}-t)/1.6)))`,
].join(",");
ff(["-i", R(P.mix),
  "-ss", String(P.music_in), "-t", String(PRE + 10.5), "-i", R(P.music),
  "-ss", OUT_AT.toFixed(3), "-t", String(TAIL + 0.5), "-i", R(P.music), "-filter_complex",
  `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(PRE * 1000)}:all=1,apad[v];` +
  `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS,volume='${envIn}':eval=frame,apad[mi];` +
  `[2:a]aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS,adelay=${Math.round((T - TAIL) * 1000)}:all=1,volume='${envOut}':eval=frame,apad[mo];` +
  `[v][mi][mo]amix=inputs=3:normalize=0:duration=first,atrim=0:${T.toFixed(3)}[a]`,
  "-map", "[a]", "-c:a", "pcm_s16le", "-ar", "48000", "sound.wav"], "sound");

if (AUDIO_ONLY) {
  // The picture as it is (stream copy), the new sound under it.
  const tmp = OUT.replace(/\.mp4$/, ".remux.mp4");
  ff(["-i", OUT, "-i", "sound.wav", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-shortest", "-movflags", "+faststart", tmp], "remux");
  renameSync(tmp, OUT);
} else {
// ---- the final encode: picture + captions + sound, tagged limited range BT.709 like every other part
ff(["-i", "picture.mp4", "-i", "sound.wav", "-vf", "subtitles=karaoke.ass,format=yuv420p", "-map", "0:v", "-map", "1:a",
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-r", String(FPS), "-pix_fmt", "yuv420p",
  "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", OUT], "final");
}
limitTruePeak(OUT, join(WORK, "sound.wav"));
// ---- the captions for an upload (the burned-in ones are in the picture): the narration's, after the title
const srt = join(talk.narration, "captions.srt");
if (existsSync(srt)) writeFileSync(OUT.replace(/\.mp4$/, "") + ".srt", shiftSrt(readFileSync(srt, "utf8"), PRE));
console.log(`podcast ${OUT} (${T.toFixed(2)} s: title ${PRE} s + narration ${total.toFixed(2)} s + end ${POST} s)`);
