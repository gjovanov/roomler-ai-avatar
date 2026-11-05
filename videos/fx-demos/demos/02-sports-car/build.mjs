import { Demo, C, VIDEOS } from "../../kit/hf.mjs";
import path from "node:path";

const d = new Demo("02-sports-car", { dur: 19 });
d.plate({ dur: 13.95 });
// The proof: the same recording, flat, full frame, with its own counter.
d.plate({ file: path.join(VIDEOS, "macbook-120fps/out/visuals/vis-drag.mp4"), start: 13.9, dur: 2.2, mediaStart: 5, z: 2, name: "drag.mp4" });
d.chip("Real screen recording", { start: 13.9, dur: 2.2, x: 40, y: 990 });

const h = d.span(14, { from: 128.9, to: 133.33, at: 0.4 });
const g = d.span(15, { at: 4.9 });
const h2 = d.span(16, { from: 140.644, to: 142.9, at: 12.15 });
// Two cameras over the garage while she asks; then he is alone with it.
d.tile(h.talk, { start: 0.4, dur: 4.4, x: 300, y: 110, w: 460, ring: C.helen, enter: "left" });
d.tile(h.listen, { start: 0.4, dur: 4.4, x: 1160, y: 110, w: 460, ring: C.tealL, enter: "right" });
d.tile(g.talk, { start: 4.9, dur: 4.25, mediaStart: 0, x: 90, y: 150, w: 440, ring: C.tealL, enter: "left", exit: true });
d.tile(h2.talk, { start: 12.15, dur: 1.75, x: 1450, y: 90, w: 400, ring: C.helen, enter: "pop" });

d.captions(h, { hot: { "120": C.mint } });
const gw = (w, i = 0) => g.words.filter((x) => x.word.toLowerCase().startsWith(w))[i].start;
d.text("Nobody needs it.", { start: gw("nobody"), dur: 2.2, x: 590, y: 880, w: 1240, size: 76, align: "left", anim: "words" });
d.text("Everybody wants it.", { start: gw("everybody"), dur: 1.65, x: 590, y: 880, w: 1240, size: 76, align: "left", anim: "words", accent: { wants: C.mint } });
d.text("It's a sports car", { start: gw("it's"), dur: 1.4, x: 0, y: 100, size: 92, anim: "slam", stagger: 0.09, accent: { sports: C.amber, car: C.amber } });
d.text("for your mouse pointer.", { start: gw("for"), dur: 1.5, x: 300, y: 100, w: 1320, size: 92, anim: "slam", stagger: 0.08, accent: { mouse: C.amber, "pointer.": C.amber, pointer: C.amber } });
d.captions(h2, { y: 940 });

// The gauge: 120, the script's number. The real counter behind it moves around that value (114, 120, 133), so a fixed 119 read as wrong.
const a0 = 10.55, a1 = 11.7, hold = 13.9;
d.raw({
  html: `<svg id="gauge" class="clip" data-start="${a0}" data-duration="${hold - a0}" data-track-index="30" viewBox="0 0 300 300" style="position:absolute;left:70px;top:60px;width:330px;height:330px;z-index:35;overflow:visible">
    <circle cx="150" cy="150" r="118" fill="rgba(6,20,18,.72)" stroke="#16403a" stroke-width="3"/>
    <path id="gArcBg" d="M 62 238 A 124 124 0 1 1 238 238" fill="none" stroke="#123a34" stroke-width="16" stroke-linecap="round"/>
    <path id="gArc" d="M 62 238 A 124 124 0 1 1 238 238" fill="none" stroke="${C.coral}" stroke-width="16" stroke-linecap="round" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100"/>
    <text id="gNum" x="150" y="170" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="86" fill="#fff">0</text>
    <text x="150" y="212" text-anchor="middle" font-family="Inter" font-weight="700" font-size="28" fill="${C.mint}">fps</text>
  </svg>`,
  js: `const gs={v:0};tl.fromTo("#gauge",{opacity:0,scale:.8,transformOrigin:"50% 50%"},{opacity:1,scale:1,duration:.3,ease:"expo.out"},${a0});
tl.to(gs,{v:120,duration:${a1 - a0},ease:"power3.out",onUpdate(){}},${a0});
tl.fromTo("#gArc",{attr:{"stroke-dashoffset":100}},{attr:{"stroke-dashoffset":100-(120/133)*100},duration:${a1 - a0},ease:"power3.out"},${a0});`,
  seek: `{const s=${a0},e=${a1};const k=Math.max(0,Math.min(1,(t-s)/(e-s)));const v=Math.round(120*(1-Math.pow(1-k,3)));const el=document.getElementById("gNum");if(el)el.textContent=v;}`,
});
d.lockup({ start: 16.1 });

d.music({ start: 0, dur: 9.1, from: 0, vol: 0.07, fadeIn: 0.8, fadeOut: 0.2 });
d.music({ start: 9.15, dur: 9.85, from: 112, vol: 0.3, fadeIn: 0.05, fadeOut: 1.4 });
for (const [a, n] of [[7.47, "stamp"], [7.82, "stamp"], [8.14, "stamp"]]) d.sfx(n, a, 0.4);
d.sfx("engine_rev", 8.85, 0.6);
d.sfx("whoosh_a", 9.95, 0.35);
d.sfx("skid", 10.55, 0.38);
d.sfx("engine_down", 10.55, 0.35);
d.sfx("thud_a", 11.55, 0.4);
d.sfx("engine_idle", 11.6, 0.26);
d.sfx("pop", 12.15, 0.3);
d.sfx("whoosh_c", 13.82, 0.3);
// Round 7: the engine and the music's entry buried "It's a sports car for your mouse pointer" (the bed 14.8 dB over his voice
// at 9.15 s). Everything under the voices dips and comes back in the gaps; the car under his words is a little lower too.
// "It's" starts softly, so the dip starts 0.25 s ahead and listens down to -48 dB.
d.duck({ depth: 15, pre: 0.25, floor: -48 });
d.write();
