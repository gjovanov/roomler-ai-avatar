import { Demo, C, OUT } from "../../kit/hf.mjs";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const d = new Demo("07-keynote", { dur: 34 });
d.plate({ dur: 32 });
// One continuous stretch of the podcast: segments 25 to 29.
const k25 = d.span(25, { at: 0.4 });
const k26 = d.span(26, { at: 10.681 });
const k27 = d.span(27, { at: 22.339 });
const k28 = d.span(28, { at: 26.462 });
const k29 = d.span(29, { from: 232.288, to: 235.75, at: 28.202 });

// His cut-out and Helen's tile sit on top of the plate, moved by the camera's own perspective, frame by frame.
const corners = JSON.parse(fs.readFileSync(path.join(OUT, "07-keynote", "corners.json"), "utf8"));
d.raw({ js: `window.__C=${JSON.stringify(corners)};` });
const warped = (src, start, dur, key, w, h, z, cut, instant) => {
  const a = cut ? d.cutoutFile(src) : src;
  const id = d.uid("w");
  d.html.push(`<div id="${id}w" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;z-index:${z};transform-origin:0 0;opacity:0"><video id="${id}" class="clip" src="${a}" muted playsinline data-start="${start}" data-duration="${dur}" data-track-index="${d.track++}" data-layout-allow-occlusion style="position:absolute;left:0;top:0;width:${w}px;height:${h}px"></video></div>`);
  d.js.push(instant ? `tl.set("#${id}w",{opacity:1},${start});` : `tl.fromTo("#${id}w",{opacity:0},{opacity:1,duration:.22,ease:"power2.out"},${start});`);
  d.js.push(`tl.to("#${id}w",{opacity:0,duration:.05},${(start + dur - 0.02).toFixed(3)});`);
  d.seek.push(`warp("${id}w",window.__C.${key},${w},${h},t);`);
};
warped(k25.talk, k25.at, k25.dur, "goran", 512, 768, 20, true);
// The next line has no clip of him, so the camera leaves him: the last 0.75 s of his clip run backwards, which starts exactly on the
// frame he ended on, and he is out of frame before it runs out.
const rev = "assets/talk-k25-rev.mp4";
if (!fs.existsSync(path.join(d.dir, rev))) execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(k25.dur - 0.75), "-i", path.join(d.dir, k25.talk), "-vf", "reverse", "-an", "-c:v", "libx264", "-crf", "12", "-g", "25", "-pix_fmt", "yuv420p", path.join(d.dir, rev)]);
warped(rev, k25.end, 0.75, "goran", 512, 768, 20, true, true);
warped(k27.listen, k27.at, k27.dur, "goran", 512, 768, 20, true);
warped(k28.talk, k28.at, k28.dur, "goran", 512, 768, 20, true);
warped(k29.listen, k29.at, k29.dur, "goran", 512, 768, 20, true);
warped(k27.talk, k27.at, k27.dur, "helen", 512, 768, 21, false);
warped(k28.listen, k28.at, k28.dur, "helen", 512, 768, 21, false);
warped(k29.talk, k29.at, k29.dur, "helen", 512, 768, 21, false);

// The desk, in front of him, is its own Blender layer with alpha.
const a_ = d.asset(path.join(OUT, "07-keynote", "frames_front.webm"));
d.html.push(`<video id="deskLayer" class="clip" src="${a_}" muted playsinline data-start="0" data-duration="32" data-track-index="50" data-layout-allow-occlusion style="position:absolute;left:0;top:0;width:1920px;height:1080px;z-index:26"></video>`);

const hot = { hardest: C.mint, cpu: C.mint, "fast": C.mint, core: C.mint, "56": C.mint, management: C.tealL, credit: C.helen, "reframed.": C.helen };
for (const sp of [k25, k26, k27, k28, k29]) d.captions(sp, { hot, y: 950, size: 48, fixes: { "core.": "core." } });
d.lockup({ start: 32 });

d.music({ start: 0, dur: 27.5, from: 0, vol: 0.08, fadeIn: 1, fadeOut: 0.2 });
d.music({ start: 27.5, dur: 6.5, from: 112, vol: 0.2, fadeIn: 0.03, fadeOut: 1.2 });
d.sfx("power_down", 3.2, 0.22);
d.sfx("power_up", 4.6, 0.16);
d.sfx("whoosh_b", 10.7, 0.36);
d.sfx("whoosh_a", 18.0, 0.28);
d.sfx("impact_mid", 18.6, 0.6);
d.sfx("glass_knock", 19.0, 0.2);
d.sfx("whoosh_c", 21.9, 0.2);
d.sfx("pop", 22.34, 0.22);
d.sfx("impact_low", 27.58, 0.85);
d.sfx("stamp", 27.58, 0.5);
d.write();
