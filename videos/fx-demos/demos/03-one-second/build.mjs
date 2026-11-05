import { Demo, C } from "../../kit/hf.mjs";

// Round 4: Goran asked for a clearer picture of 6 ms of work in an 8 ms slot, and of 120 frames a second as boxes you can
// see. The plate runs to 20.3 s now (the frame slides out after Helen's line), then the end card.
const END = 20.3;
const d = new Demo("03-one-second", { dur: 22.9 });
d.plate({ dur: END });
d.chip("Real screen recording", { start: 0, dur: 1.5, x: 40, y: 990 });
const g = d.span(17, { at: 1.0 });
const h = d.span(18, { from: 154.887, to: 159.75, at: 12.95 });
const tg = (w) => g.words.find((x) => x.word.toLowerCase().startsWith(w)).start;
const th = (w) => h.words.find((x) => x.word.toLowerCase().startsWith(w)).start;

d.captions(g, { hot: { "6": C.mint, "120": C.mint, "8.": C.mint, milliseconds: C.mint }, fixes: { "6": "six", "8.": "eight." } });
d.tile(h.talk, { start: 12.95, dur: 4.9, x: 1470, y: 70, w: 380, ring: C.helen, enter: "right" });
d.captions(h, { hot: { six: C.mint, eight: C.amber } });

// Big numerals land on the words that say them.
const big = (t, start, dur, x, y, color) => d.text(t, { start, dur, x, y, w: 900, size: 190, weight: 800, align: "left", anim: "slam", color, stagger: 0.05, ls: "-0.03em" });
big("6 ms", tg("6") - 0.02, tg("120") - tg("6"), 110, 90, "#fff"); // gone as "120" lands in the same place
big("120", tg("120") - 0.02, 1.7, 110, 90, "#fff");
d.text("frames a second", { start: tg("120") + 0.32, dur: 1.38, x: 118, y: 300, w: 900, size: 54, align: "left", color: C.mint });
big("8 ms", tg("8") - 0.02, 1.2, 110, 90, C.amber);

// One second as 120 slots you can count, each 6.3 of its 8.3 ms full (the brief's measured numbers). They arrive at the
// speed they pass, 120 in one second. On "eight" one turns amber; on Helen's line it opens up into the one slot, empty,
// and the work fills it in true proportion while the 120 stay above it as a strip with that one marked.
const COLS = 20, BW = 72, BH = 56, GAP = 10, GX = 145, GY = 455, HL = 2 * COLS + 13, WORK = (6.3 / 8.3) * 100;
const box = (i) => ({ x: GX + (i % COLS) * (BW + GAP), y: GY + Math.floor(i / COLS) * (BH + GAP) });
const S = { x: 160, y: 600, w: 1200, h: 150 };
const MX = 160, MY = 452, MW = 9, MH = 34, MS = 10;
const tWave = tg("120") - 0.02, tHl = tg("8") - 0.05, tFly = 12.85, tFill = th("six") - 0.06, tSlot = th("eight") - 0.05, tOut = 17.85;
const hb = box(HL), Z = 1.35; // the amber box, scaled about its centre, is where the opened slot starts from
const from = { x: hb.x + BW / 2 - (BW * Z) / 2, y: hb.y + BH / 2 - (BH * Z) / 2, w: BW * Z, h: BH * Z };
// The opening slot is SVG: its attributes move without the whole-pixel snapping of CSS left/top, and its outline stays 4 px.
const box4 = (r, i = 0) => ({ x: +(r.x + i).toFixed(2), y: +(r.y + i).toFixed(2), width: +((r.width ?? r.w) - 2 * i).toFixed(2), height: +(r.h - 2 * i).toFixed(2) });
const rect = (r, i) => Object.entries(box4(r, i)).map(([k, v]) => `${k}="${v}"`).join(" ");
const attr = (r, i) => JSON.stringify(box4(r, i));
let grid = "", strip = "";
for (let i = 0; i < 120; i++) {
  const b = box(i);
  grid += `<div class="gb" id="gb${i}" style="left:${b.x}px;top:${b.y}px"><div class="gf"></div>${i === HL ? `<div id="hlRing"></div>` : ""}</div>`;
  strip += `<div class="sb${i === HL ? " hl" : ""}" style="left:${MX + i * MS}px;top:${MY}px"></div>`;
}
const tick = (x) => `<div class="tk" style="left:${Math.round(x) - 1}px;top:${S.y + S.h + 8}px"></div>`;
const ticks = [...Array(9).keys()].map((ms) => tick(S.x + (S.w * ms) / 8.3)).join("") + tick(S.x + S.w - 1);
const hx = MX + HL * MS, by = S.y + S.h + 34;
d.raw({
  css: `.gb{position:absolute;width:${BW}px;height:${BH}px;border-radius:7px;background:#0b2723;box-shadow:inset 0 0 0 1.5px rgba(77,182,172,.38);overflow:hidden}
.gb .gf{position:absolute;left:0;top:0;bottom:0;width:${WORK}%;background:${C.tealL}}
#hlRing{position:absolute;inset:0;border-radius:7px;box-shadow:inset 0 0 0 4px ${C.amber};opacity:0}
.sb{position:absolute;width:${MW}px;height:${MH}px;border-radius:2px;background:#2c6f66}.sb.hl{background:${C.amber}}
.tk{position:absolute;width:2px;height:14px;background:#5f8f88}`,
  html: `<div id="scrim" class="clip" data-start="9.2" data-duration="${(tOut + 0.4 - 9.2).toFixed(2)}" data-track-index="29" data-layout-ignore style="position:absolute;inset:0;z-index:15;opacity:0;background:rgba(3,10,9,.66);backdrop-filter:blur(6px)"></div>
  <div id="grid" class="clip" data-start="${(tWave - 0.05).toFixed(3)}" data-duration="${(tFly + 0.4 - tWave + 0.05).toFixed(3)}" data-track-index="31" data-layout-allow-overlap style="position:absolute;left:0;top:0;width:1920px;height:1080px;z-index:33">
    <svg id="secB" style="position:absolute;left:0;top:0;opacity:0" width="1920" height="460"><path d="M ${GX} 446 v -12 H ${GX + 1630} v 12" fill="none" stroke="${C.mint}" stroke-width="3"/></svg>
    <div id="secT" style="position:absolute;left:0;width:1920px;top:384px;text-align:center;font:700 38px 'Inter',sans-serif;color:${C.mint};opacity:0">1 second</div>
    ${grid}
  </div>
  <div id="beatB" class="clip" data-start="${tFly}" data-duration="${(tOut + 0.35 - tFly).toFixed(3)}" data-track-index="32" data-layout-allow-overlap style="position:absolute;left:0;top:0;width:1920px;height:1080px;z-index:33">
    <div id="strip" style="position:absolute;inset:0;opacity:0">${strip}</div>
    <svg id="links" style="position:absolute;left:0;top:0;opacity:0" width="1920" height="1080"><path d="M ${hx} ${MY + MH} L ${S.x} ${S.y} M ${hx + MW} ${MY + MH} L ${S.x + S.w} ${S.y}" stroke="${C.amber}" stroke-width="2" stroke-opacity=".75" fill="none"/></svg>
    <div id="ruler" style="position:absolute;inset:0;opacity:0">${ticks}</div>
    <svg id="fly" style="position:absolute;left:0;top:0;opacity:0;overflow:visible" width="1920" height="1080"><defs>
      <pattern id="hatch" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="20" fill="rgba(255,193,7,.13)"/></pattern>
      <clipPath id="flyClip"><rect id="flyC" ${rect(from)} rx="9"/></clipPath></defs>
      <g clip-path="url(#flyClip)"><rect id="flyB" ${rect(from)} fill="#0b2723"/><rect id="flyH" ${rect(from)} fill="url(#hatch)" opacity="0"/><rect id="flyF" ${rect({ ...from, width: (from.w * WORK) / 100 })} fill="${C.tealL}"/></g>
      <rect id="flyR" ${rect(from, 2)} rx="8" fill="none" stroke="${C.amber}" stroke-width="4" style="filter:drop-shadow(0 0 12px rgba(255,193,7,.35))"/></svg>
    <div id="workT" style="position:absolute;left:${S.x + 30}px;top:${S.y + (S.h - 56) / 2}px;font:800 48px 'Poppins',sans-serif;color:#04201c;white-space:nowrap;opacity:0">6.3 ms of work</div>
    <svg id="slotB" style="position:absolute;left:0;top:0;opacity:0" width="1920" height="1080"><path d="M ${S.x} ${by - 12} v 12 H ${S.x + S.w / 2 - 16} l 16 14 l 16 -14 H ${S.x + S.w} v -12" fill="none" stroke="${C.amber}" stroke-width="3"/></svg>
    <div id="slotT" style="position:absolute;left:${S.x}px;width:${S.w}px;top:${by + 18}px;text-align:center;font:800 48px 'Poppins',sans-serif;color:${C.amber};opacity:0">8.3 ms slot</div>
  </div>`,
  js: `tl.fromTo("#scrim",{opacity:0},{opacity:1,duration:.35,ease:"power2.out"},9.2);
tl.to("#scrim",{opacity:0,duration:.35,ease:"power2.in"},${tOut});
tl.fromTo(".gb",{opacity:0,scale:.4},{opacity:1,scale:1,duration:.16,ease:"back.out(2.2)",stagger:${1 / 120}},${tWave});
tl.fromTo("#secB,#secT",{opacity:0,y:8},{opacity:1,y:0,duration:.3,ease:"power3.out"},${(tWave + 1.05).toFixed(3)});
tl.to(".gb:not(#gb${HL})",{opacity:.28,duration:.3,ease:"power2.out"},${tHl});
tl.to("#gb${HL}",{scale:${Z},zIndex:5,duration:.3,ease:"back.out(2)"},${tHl});
tl.to("#hlRing",{opacity:1,duration:.2},${tHl});
tl.to("#secB,#secT",{opacity:0,duration:.25},${tFly});
tl.to(".gb",{opacity:0,scale:.7,duration:.18,ease:"power2.in",stagger:{each:.0008,from:${HL}}},${tFly}); // gone before the strip comes
tl.set("#fly",{opacity:1},${tFly});
tl.fromTo("#flyC,#flyB,#flyH",{attr:${attr(from)}},{attr:${attr(S)},duration:.7,ease:"expo.inOut"},${tFly});
tl.fromTo("#flyF",{attr:${attr({ ...from, width: (from.w * WORK) / 100 })}},{attr:${attr({ ...S, width: (S.w * WORK) / 100 })},duration:.7,ease:"expo.inOut"},${tFly});
tl.fromTo("#flyR",{attr:${attr(from, 2)}},{attr:${attr(S, 2)},duration:.7,ease:"expo.inOut"},${tFly});
tl.to("#flyH",{attr:{opacity:1},duration:.5},${tFly + 0.2});
tl.fromTo("#strip",{opacity:0},{opacity:1,duration:.35,ease:"power2.out"},${tFly + 0.3});
tl.fromTo("#links",{opacity:0},{opacity:1,duration:.3},${tFly + 0.6});
tl.to("#flyF",{attr:{width:0},duration:.25,ease:"power2.in"},${tFly + 0.75});
tl.fromTo("#ruler",{opacity:0},{opacity:1,duration:.3},${tFly + 0.8});
tl.to("#flyF",{attr:{width:${(S.w * WORK) / 100}},duration:.95,ease:"none"},${tFill});
tl.fromTo("#workT",{opacity:0,x:-10},{opacity:1,x:0,duration:.25,ease:"power3.out"},${(tFill + 0.85).toFixed(3)});
tl.fromTo("#slotB,#slotT",{opacity:0,y:-8},{opacity:1,y:0,duration:.3,ease:"power3.out"},${tSlot});
tl.to("#beatB",{opacity:0,filter:"blur(6px)",duration:.3,ease:"power2.in"},${tOut});`,
});
d.lockup({ start: END });

d.music({ start: 0, dur: END, from: 0, vol: 0.09, fadeIn: 1.0, fadeOut: 0.3 });
d.music({ start: END - 0.05, dur: 2.65, from: 112, vol: 0.3, fadeIn: 0.05, fadeOut: 1.0 });
d.sfx("whoosh_b", 0.8, 0.2); // ahead of "On the Mac" (at 1.0 it sat 11 dB over his first word)
d.sfx("whoosh_a", 3.5, 0.18);
d.sfx("riser_short", 5.05, 0.25);
for (let i = 0; i < 18; i++) d.sfx(["tick_a", "tick_b", "tick_c"][i % 3], 6.2 + (i * 2.8) / 18, 0.14);
d.sfx("stamp", tg("6"), 0.32);
d.sfx("stamp", tg("120"), 0.32);
for (let i = 0; i < 12; i++) d.sfx(["tick_a", "tick_b", "tick_c"][i % 3], tWave + i / 12, 0.09); // the 120 arriving
d.sfx("stamp", tg("8"), 0.36);
d.sfx("whoosh_c", tFly, 0.24);
d.sfx("power_up", tFill, 0.16);
d.sfx("glass_click", tSlot, 0.22);
d.sfx("whoosh_a", tOut, 0.3);
d.sfx("glass_knock", END - 0.3, 0.22);
d.write();
