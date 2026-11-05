import { Demo, C, OUT } from "../../kit/hf.mjs";
import path from "node:path";
import fs from "node:fs";

const d = new Demo("05-swear-jar", { dur: 34, w: 1080, h: 1920 });
d.plate({ dur: 32 });
// A continuous stretch of the podcast, then the tag from its end.
const a = d.span(7, { from: 68.1, to: 76.78, at: 0.4 });
const h = d.span(8, { at: 9.08 });
const b = d.span(9, { at: 11.59 });
const tag = d.span(42, { at: 26.4 });

// Goran bottom-left, cut out, rising from the frame's bottom edge (the boom leaves through the frame's left edge):
// 58% of the clip's height shows, so the clip's own cut sides never do.
const W = 780, H = Math.round((W * 768) / 512);
const Y = 1920 - Math.round(H * 0.58);
const cut = (sp, clip, start, dur, z = 22) => d.cutout(clip, { start, dur, x: 0, y: Y, w: W, h: H, z, clipBottom: 0.58 });
cut(a, a.talk, 0.4, a.dur);
if (h.listen) cut(h, h.listen, h.at, h.dur);
cut(b, b.talk, b.at, 11.2, 22);
cut(tag, tag.talk, tag.at, tag.dur, 22);
d.tile(h.talk, { start: h.at, dur: h.dur, x: 690, y: 90, w: 330, ring: C.helen, enter: "pop" });

// The layer in front of him: glyphs that fall between him and the camera. Over his face they stay behind him.
const front = path.join(OUT, "05-swear-jar", "frames_front.webm");
if (fs.existsSync(front)) {
  const a_ = d.asset(front);
  d.html.push(`<video id="frontLayer" class="clip" src="${a_}" muted playsinline data-start="15" data-duration="8" data-track-index="50" data-layout-allow-occlusion style="position:absolute;left:0;top:0;width:1080px;height:1920px;z-index:24"></video>`);
}

const big = { y: 300, size: 74, max: 3 };
const words = (sp, list) => ({ ...sp, words: sp.words.filter((w) => !list || list.some((l) => w.word.toLowerCase().startsWith(l))) });
d.captions(a, { ...big, hot: { monday: C.coral, accident: C.coral } });
d.captions(h, { ...big, y: 520, fixes: { "no!": "no..." } });
// His line, until the freeze: then the calm sentence takes over from the captions.
const b1 = { ...b, words: b.words.filter((w) => w.start < 20.68) };
d.captions(b1, { y: 260, size: 86, max: 2, hot: { hot: C.coral, spicy: C.amber, juicy: C.coral, swearing: C.amber, yes: C.coral }, fixes: { "Oh": "Oh," } });

// One calm sentence: white, one word at a time, between the world and his head.
const calm = b.words.filter((w) => w.start >= 20.68);
const at = (s) => calm.find((w) => w.word.toLowerCase().startsWith(s)).start;
d.raw({
  html: `<div id="calmBand" class="clip" data-start="${at("there") - 0.3}" data-duration="${22.8 - at("there") + 0.3}" data-track-index="30" data-layout-ignore style="position:absolute;left:0;top:190px;width:1080px;height:560px;z-index:28;background:radial-gradient(ellipse 72% 50% at 50% 50%,rgba(3,10,9,.86) 0%,rgba(3,10,9,.72) 55%,rgba(3,10,9,0) 100%)"></div>`,
  js: `tl.fromTo("#calmBand",{opacity:0},{opacity:1,duration:.35,ease:"power2.out"},${at("there") - 0.3});tl.to("#calmBand",{opacity:0,duration:.2,ease:"power2.in"},22.58);`,
});
d.text("there must be", { start: at("there") - 0.02, dur: 22.75 - at("there"), x: 0, y: 340, size: 96, weight: 700, color: "#fff", stagger: 0.17, z: 30 });
d.text("a better way.", { start: at("a") - 0.02, dur: 22.75 - at("a"), x: 0, y: 470, size: 122, weight: 800, color: "#fff", stagger: 0.28, accent: { better: C.tealL, "way.": C.tealL, way: C.tealL }, z: 30 });

d.captions(tag, { y: 1130, size: 62, max: 4, hot: { swearing: C.amber, productive: C.tealL, meeting: C.tealL }, fixes: { "swearing,": "swearing." } });
d.lockup({ start: 32, disclosure: "AI-generated hosts · animated with code" });

// Sound: dark and small until the swearing. The music drops out with time itself, and comes back on the logo.
d.music({ start: 0, dur: 15.4, from: 0, vol: 0.06, fadeIn: 1, fadeOut: 0.4 });
d.music({ start: 15.4, dur: 3.05, from: 112, vol: 0.3, fadeIn: 0.05, fadeOut: 0.04 });
d.music({ start: 25.1, dur: 8.9, from: 118, vol: 0.2, fadeIn: 0.02, fadeOut: 1.2 });
d.sfx("glass_click", 1.2, 0.3);
d.sfx("glass_click", 1.4, 0.26);
for (const [t, n] of [[6.9, "thud_a"], [7.4, "thud_b"], [7.9, "thud_a"], [8.46, "stamp"]]) d.sfx(n, t + 0.2, 0.42);
d.sfx("pop", 9.05, 0.24);
// Impacts: the waves, then many small ones under the big one.
d.sfx("impact_mid", 15.45, 0.5);
d.sfx("impact_mid", 16.3, 0.55);
d.sfx("impact_low", 17.2, 0.7);
const seed = (i) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
for (let i = 0; i < 26; i++) d.sfx(i % 2 ? "thud_a" : "thud_b", 15.6 + seed(i) * 2.8, 0.14 + seed(i + 50) * 0.16);
d.sfx("shatter", 17.72, 0.6);
// 18.45: time stops. One breath of nothing, a low hum under the calm sentence.
d.sfx("whoosh_b", 18.32, 0.28);
d.sfx("hum", 18.5, 0.1);
d.sfx("riser", 22.75, 0.46);
d.sfx("impact_low", 25.1, 0.8);
d.sfx("sub_drop", 25.1, 0.55);
d.write();
