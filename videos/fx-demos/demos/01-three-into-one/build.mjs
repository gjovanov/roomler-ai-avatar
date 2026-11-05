import { Demo, C, OUT, POD } from "../../kit/hf.mjs";
import fs from "node:fs";
import path from "node:path";
import { CSS, frame } from "./call.mjs";

// Round 4, Goran: a one-second pause after "...that replaces three", so every beat after it is a second later; and the
// third slab is a real video call: him speaking, Helen, michael, emma and four invented colleagues listening.
// Round 5: the pause sat before "three" (25.29 s is the gap between "replaces" and its "th"). "three" runs straight into
// "remote" with no silence, so the cut is where its "ee" ends: the vowel's 2.2-4.5 kHz band falls 20 dB from 25.59 to
// 25.61 s (Whisper: 25.593). "three" fades out over 45 ms; "remote" keeps its whole r and fades in over 25 ms.
const CUT = 25.605, PAUSE = 1.0; // the cut, in the narration's seconds
const d = new Demo("01-three-into-one", { dur: 21 });
d.plate();
const g = d.span(3, { to: CUT, at: 0.6, fadeOut: 0.045, hold: 0.3 });
const g2 = d.span(3, { from: CUT, at: g.end + PAUSE, fadeIn: 0.025 });
// Goran says the first sentence on camera; through the pause the three dark slabs stand there with his line; then only his
// voice carries the three beats, until the call. His tile leaves as the pause begins, on its clip's held last frame.
d.tile(g.talk, { start: 0.6, dur: +(g.dur + 0.24).toFixed(3), x: 1508, y: 468, w: 360, ring: C.tealL, z: 22 });
d.text("One open-source app that replaces three", { start: 0.75, dur: 4.0, x: 90, y: 860, w: 1330, size: 66, align: "left", accent: { three: C.mint } });
const t = (w) => g2.words.find((x) => x.word.toLowerCase().startsWith(w)).start;
d.text("Remote desktop from any browser", { start: t("remote") - 0.05, dur: 3.2, x: 90, y: 900, w: 1600, size: 62, align: "left", accent: { Remote: C.mint, desktop: C.mint } });
d.text("A private network between your machines", { start: t("private") - 0.25, dur: 3.2, x: 90, y: 900, w: 1700, size: 62, align: "left", accent: { private: C.mint, network: C.mint } });
d.text("Chat and video calls for the team", { start: t("chat") - 0.2, dur: 3.0, x: 90, y: 900, w: 1600, size: 62, align: "left", accent: { Chat: C.mint, video: C.mint, calls: C.mint } });
d.scrim({ start: 0.6, dur: 15, h: 330 });

// The call on slab 3, on the screen's own corners frame by frame (scene.py --corners), lit with the slab's power-on flicker
// (on[2] in scene.py). It leaves as the slabs start their slam (merge - 16 frames), where Blender's still of the same
// gallery carries the screen into the flash. Faces only here, on top: moved and resampled, never rendered.
const A = 11.95, B = 16.25, OFF = 16.07;
const helen = JSON.parse(fs.readFileSync(path.join(POD, "talk-v5", "listen.json"), "utf8"))["7"].clip; // a calm 20 s of her listening
const people = path.join(OUT, "people");
const src = { goran: g2.talk, helen: d.asset(helen, "call-helen.mp4") };
for (const id of ["michael", "emma", "a", "b", "c", "d"]) src[id] = d.asset(path.join(people, `${id}-listen.mp4`), `call-${id}.mp4`);
// Each listener starts at another point of their clip: from one start, two of them blinked on the same frame.
const media = { goran: +(A - g2.at).toFixed(3), helen: 3.0, michael: 0.3, emma: 1.1, a: 0.7, b: 1.5, c: 0.2, d: 0.9 };
const tall = (id) => id === "goran" || id === "helen"; // 512x768 studio clips: keep the head with room above it, crop the desk
const vid = (p, i) => `<video id="cv${i}" class="clip" src="${src[p.id]}" muted playsinline data-start="${A}" data-duration="${(B - A).toFixed(2)}" data-media-start="${media[p.id]}" data-track-index="${d.track++}" data-layout-allow-occlusion style="object-position:50% ${tall(p.id) ? 9 : 50}%"></video>`;
const flicker = [[11.967, 0], [12.0, 0.8], [12.033, 0.1], [12.067, 0.15], [12.1, 1], [12.133, 0.55], [12.2, 1]];
d.raw({
  css: CSS,
  // Timed by its videos and its opacity only (as 07's tracked tiles): a timed wrapper around timed videos confuses the frame extractor.
  html: `<div id="callW" style="position:absolute;left:0;top:0;width:1920px;height:1080px;z-index:24;transform-origin:0 0;opacity:0"><div class="call">${frame(vid)}</div></div>`,
  js: flicker.map(([at, o]) => `tl.set("#callW",{opacity:${o}},${at});`).join("") + `tl.to("#callW",{opacity:0,duration:.13,ease:"power1.in"},${OFF});`,
});
d.warp("callW", path.join(OUT, "01-three-into-one", "corners.json"), 1920, 1080);

// The merge's flash, full frame, a few frames long: what the camera would do to that much light.
d.raw({
  html: `<div id="flashW" class="clip" data-start="16.55" data-duration="0.6" data-track-index="40" data-layout-ignore style="position:absolute;inset:0;z-index:45;background:radial-gradient(circle at 50% 54%,#ffffff 0%,#d9fff8 38%,#4db6ac 100%);opacity:0"></div>`,
  js: `tl.fromTo("#flashW",{opacity:0},{opacity:.96,duration:.05,ease:"none"},16.55);tl.to("#flashW",{opacity:0,duration:.5,ease:"power2.out"},16.62);`,
});
d.lockup({ start: 19 });

// Sound: every effect has its cause on screen. Quiet under the three beats, the music opens on the merge.
d.music({ start: 0.0, dur: 16.6, from: 0, vol: 0.09, fadeIn: 1.0, fadeOut: 0.3 });
d.music({ start: 16.55, dur: 4.45, from: 112, vol: 0.34, fadeIn: 0.05, fadeOut: 1.2 });
for (const a of [1.2, 2.0, 2.8]) d.sfx("impact_mid", a, 0.5);
d.sfx("glass_knock", 1.2, 0.22);
d.sfx("glass_knock", 2.0, 0.22);
d.sfx("glass_knock", 2.8, 0.22);
// The power-ups and the pushes into each slab land on the start of his next line: lower than round 3 (slab 2's sat at +0.7 dB
// over "A private"), so each line starts clear.
d.sfx("power_up", 5.0, 0.13);
d.sfx("power_up", 8.6, 0.13);
d.sfx("power_up", 12.0, 0.13);
d.sfx("whoosh_b", 4.75, 0.15);
d.sfx("whoosh_a", 8.3, 0.14);
d.sfx("whoosh_c", 11.75, 0.14);
d.sfx("riser", 14.05, 0.42);
d.sfx("whoosh_b", 15.9, 0.4);
d.sfx("impact_low", 16.6, 0.95);
d.sfx("sub_drop", 16.6, 0.7);
d.sfx("glass_knock", 17.58, 0.25);
d.sfx("stamp", 19.1, 0.25);
d.write();
