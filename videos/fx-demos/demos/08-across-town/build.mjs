import { Demo, C, FOOT } from "../../kit/hf.mjs";
import path from "node:path";

const d = new Demo("08-across-town", { dur: 28 });
d.plate({ dur: 28 });
const g = d.span(36, { from: 296.067, to: 301.0, at: 1.0 });
const n = d.span(30, { from: 242.58, to: 251.92, at: 15.4 });

d.tile(g.talk, { start: 1.0, dur: g.dur, x: 1560, y: 80, w: 280, ring: C.tealL, enter: "right" });
d.captions(g, { hot: { town: C.mint, families: C.amber }, y: 940 });
// The podcast's own card line, on the U-turn.
d.text("No more driving across town to fix a PC", { start: 8.9, dur: 3.2, x: 0, y: 930, size: 64, weight: 800, accent: { No: C.mint, more: C.mint, driving: C.mint } });

// "Every machine I own, in one list": the real table, boxed, on a glass card that floats in over the turning globe.
const file = d.asset(path.join(FOOT, "peers-boxed.mp4"));
d.html.push(`<div id="listW" style="position:absolute;left:70px;top:200px;width:830px;height:467px;z-index:24;border-radius:16px;overflow:hidden;box-shadow:0 0 0 2px ${C.tealL},0 30px 90px rgba(0,0,0,.75);opacity:0"><video id="list" class="clip" src="${file}" muted playsinline data-start="15.6" data-duration="9.0" data-media-start="1" data-track-index="23" style="position:absolute;left:0;top:0;width:830px;height:467px"></video></div>`);
d.js.push(`tl.fromTo("#listW",{opacity:0,y:50,scale:.94},{opacity:1,y:0,scale:1,duration:.6,ease:"expo.out"},15.6);tl.to("#listW",{opacity:0,y:-20,duration:.3,ease:"power2.in"},24.3);`);
d.chip("Real command output", { start: 15.9, dur: 8.6, x: 70, y: 690 });
d.captions(n, { hot: { direct: C.mint, "direct,": C.mint, list: C.mint, "list.": C.mint, internet: C.mint }, y: 940 });
d.lockup({ start: 25, bg: true });

d.music({ start: 0, dur: 12, from: 0, vol: 0.1, fadeIn: 1.2, fadeOut: 0.5 });
d.music({ start: 12, dur: 16, from: 112, vol: 0.2, fadeIn: 1.5, fadeOut: 1.4 });
d.sfx("engine_idle", 1.6, 0.12);
d.sfx("whoosh_b", 5.8, 0.14);
d.sfx("pop", 7.95, 0.3);
d.sfx("skid", 8.8, 0.08);
d.sfx("riser", 11.9, 0.3);
for (let i = 0; i < 12; i++) d.sfx(["tick_a", "tick_b", "tick_c"][i % 3], 15.1 + i * 0.13, 0.16);
d.write();
