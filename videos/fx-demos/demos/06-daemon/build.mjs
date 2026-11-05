import { Demo, C, OUT } from "../../kit/hf.mjs";
import fs from "node:fs";
import path from "node:path";

const d = new Demo("06-daemon", { dur: 17 });
d.plate({ dur: 15 });
const h = d.span(4, { at: 0.4 });
const g = d.span(5, { from: 40.223, to: 42.55, at: 4.82 });
// Two cameras with the puck turning between them; he listens while she asks, then she listens.
d.tile(h.talk, { start: 0.4, dur: 4.42, x: 80, y: 130, w: 460, ring: C.helen, enter: "left", exit: false });
d.tile(h.listen, { start: 0.4, dur: 4.42, x: 1380, y: 130, w: 460, ring: C.tealL, enter: "right", exit: false });
if (g.listen) d.tile(g.listen, { start: 4.82, dur: 2.33, x: 80, y: 130, w: 460, ring: C.helen, enter: "none" });
d.tile(g.talk, { start: 4.82, dur: 2.33, x: 1380, y: 130, w: 460, ring: C.tealL, enter: "none" });
d.captions(h, { hot: { three: C.mint, one: C.mint } });
d.captions(g, { hot: { no: C.coral } });

// Each name lands on its plate's click, above an upper hexagon and below a lower one, tracked through Blender's own projection.
const NAMES = ["SSH", "Tunnel client", "Tunnel exit", "Private network", "Remote desktop"];
const anchors = JSON.parse(fs.readFileSync(path.join(OUT, "06-daemon", "anchors.json"), "utf8"));
const OPEN = 7.5, end = 12.95;
const land = (i) => OPEN + ((4 - i) * 8 + 31) / 30;
const ids = NAMES.map((n, i) => d.text(n, { start: land(i) - 0.28, dur: end - land(i) + 0.28, x: 0, y: 0, w: 520, size: 44, weight: 700, anim: "words", z: 32, stagger: 0.05, accent: { Remote: C.mint, Private: C.mint } }));
const fr0 = Math.round(land(4) * 30) - 12, fr1 = Math.round(end * 30) + 2;
const A = Object.fromEntries(Object.entries(anchors).filter(([k]) => +k >= fr0 && +k <= fr1));
d.raw({
  seek: `{const A=${JSON.stringify(A)};const fr=Math.max(${fr0},Math.min(${fr1},Math.round(t*30)+1));const row=A[fr];const ids=${JSON.stringify(ids)};if(row)ids.forEach((id,i)=>{const e=document.getElementById(id);if(!e)return;const r=row[i];const up=i%2===0;e.style.transform="translate("+(r[0]-260)+"px,"+(up?r[1]-66:r[2]+14)+"px)"})}`,
});
d.text("One daemon on every machine", { start: 13.45, dur: 1.5, x: 0, y: 900, size: 76, weight: 800, accent: { One: C.mint, daemon: C.mint }, anim: "words" });
d.lockup({ start: 15 });

d.music({ start: 0, dur: 13.2, from: 0, vol: 0.08, fadeIn: 1, fadeOut: 0.2 });
d.music({ start: 13.18, dur: 3.82, from: 112, vol: 0.28, fadeIn: 0.03, fadeOut: 1.0 });
d.sfx("power_down", 7.15, 0.3);
d.sfx("whoosh_b", 8.1, 0.18);
NAMES.forEach((_, i) => {
  const t0 = OPEN + ((4 - i) * 8) / 30;
  d.sfx(["servo_a", "servo_b", "servo_c"][i % 3], t0, 0.26); // the drawer
  d.sfx("thud_b", t0 + 0.1, 0.2); // the lid settling
  d.sfx("glass_click", land(i) - 0.2, 0.34); // landing
  d.sfx("thud_a", land(i) - 0.2, 0.2);
});
d.sfx("riser_short", 11.9, 0.32);
d.sfx("whoosh_a", 12.75, 0.36);
d.sfx("impact_low", 13.2, 0.85);
d.sfx("stamp", 13.2, 0.6);
d.write();
