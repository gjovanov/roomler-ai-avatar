// Two passes. TRANS unset: the flat base cut, with a gap at each seam. After the seams are rendered (seams.sh): TRANS=1 lays each
// transition over its gap. The sound runs through everything, so the transitions never stop anyone's sentence.
import { Demo, C, POD, OUT, VIDEOS } from "../../kit/hf.mjs";
import fs from "node:fs";
import path from "node:path";

const d = new Demo("10-hexflip", { dur: 40 });
const TR = 0.933; // 28 frames
let t = 0;
const seams = [];
const seam = (kind) => {
  seams.push({ kind, at: +t.toFixed(3) });
  t = +(t + TR).toFixed(3);
};
const bg = d.asset(path.join(POD, "compose-v5", "bg.png"), "studio.png");
d.html.push(`<img id="studio" src="${bg}" class="clip" data-start="0" data-duration="40" data-track-index="0" style="position:absolute;left:0;top:0;width:1920px;height:1080px;z-index:1">`);

// Title
const title = d.asset(path.join(POD, "visuals", "title", "state-0.png"), "title.png");
d.html.push(`<img id="titleCard" src="${title}" class="clip" data-start="0" data-duration="1.4" data-track-index="1" style="position:absolute;left:0;top:0;width:1920px;height:1080px;z-index:5">`);
t = 1.4;
seam("hex");
// Two cameras, as in the podcast: host left, guest right.
const two = (sp, helenSpeaks) => {
  const L = { x: 350, y: 46, w: 580, ring: C.helen, enter: "none", exit: false, z: 10 };
  const Rr = { x: 990, y: 46, w: 580, ring: C.tealL, enter: "none", exit: false, z: 10 };
  d.tile(helenSpeaks ? sp.talk : sp.listen, { ...L, start: sp.at, dur: sp.dur });
  d.tile(helenSpeaks ? sp.listen : sp.talk, { ...Rr, start: sp.at, dur: sp.dur });
};
const hot = { teamviewer: C.mint, sports: C.amber, car: C.amber, mouse: C.amber, "pointer.": C.amber, waiter: C.mint, menu: C.mint, "wave.": C.mint, waves: C.mint, "waves.": C.mint, brilliant: C.helen, postman: C.mint, frustrated: C.coral, swearing: C.amber, "swearing,": C.amber };
const say = (sp) => d.captions(sp, { hot, y: 960, size: 52 });

const s1 = d.span(0, { from: 2.36, to: 7.0, at: t });
two(s1, true);
say(s1);
t = +(t + s1.dur).toFixed(3);
seam("fold");

const s2 = d.span(15, { at: t });
two({ ...s2, dur: 4.2 }, false);
const dragStart = +(s2.at + 4.2).toFixed(3);
// "It's a sports car for your mouse pointer": the car from demo 02, on the words.
d.plate({ file: path.join(OUT, "02-sports-car", "plate.mp4"), start: dragStart, dur: +(s2.dur - 4.2).toFixed(3), mediaStart: 9.25, z: 12, name: "car.mp4" });
say(s2);
t = +(t + s2.dur).toFixed(3);
seam("domino");

const s3 = d.span(21, { from: 178.0, to: 183.39, at: t });
two(s3, false);
say(s3);
t = +(t + s3.dur).toFixed(3);
const s3b = d.span(22, { from: 183.392, to: 185.5, at: t });
two(s3b, true);
say(s3b);
t = +(t + s3b.dur).toFixed(3);
seam("chromatic-radial-split");

// The postman, from demo 04.
const s4 = d.span(32, { from: 271.55, to: 273.781, at: t });
const s4b = d.span(33, { from: 273.781, to: 276.995, at: s4.end });
const post = path.join(OUT, "04-postman", "plate.mp4");
if (fs.existsSync(post)) d.plate({ file: post, start: t, dur: +(s4.dur + s4b.dur).toFixed(3), mediaStart: 20.2, z: 12, name: "postman.mp4" });
d.tile(s4b.talk, { start: s4b.at, dur: s4b.dur, x: 70, y: 70, w: 300, ring: C.helen, enter: "pop", exit: false, z: 14 });
say(s4);
say(s4b);
t = +(s4b.end).toFixed(3);
seam("hex");

const s5 = d.span(42, { from: 359.864, to: 365.351, at: t });
two(s5, false);
say(s5);
t = +(t + s5.dur).toFixed(3);

// The end card comes through a registry shader too.
seam("light-leak");
const endAt = t;
d.lockup({ start: endAt, dur: +(40 - endAt).toFixed(3), z: 60, overlap: 0, still: true });

if (process.env.TRANS) {
  seams.forEach((m, i) => {
    if (["hex", "fold", "domino"].includes(m.kind)) {
      const a = d.asset(path.join(OUT, "10-hexflip", `seam${i}.mp4`));
      d.html.push(`<video id="seam${i}" class="clip" src="${a}" muted playsinline data-start="${m.at}" data-duration="${TR}" data-track-index="70" style="position:absolute;left:0;top:0;width:1920px;height:1080px;z-index:65"></video>`);
    } else d.shaderSeam(m.kind, { at: m.at, dur: TR, from: path.join(OUT, "10-hexflip", `tr${i}-a.png`), to: path.join(OUT, "10-hexflip", `tr${i}-b.png`), z: 65 });
  });
  d.music({ start: 0, dur: 40, from: 112, vol: 0.09, fadeIn: 0.1, fadeOut: 1.4 });
  seams.forEach((m, i) => d.sfx(["whoosh_a", "whoosh_b", "whoosh_c"][i % 3], m.at + 0.05, 0.42));
  seams.forEach((m, i) => d.sfx("glass_click", m.at + TR - 0.1, 0.2));
  d.sfx("pop", endAt, 0.3);
}
fs.writeFileSync(path.join(OUT, "10-hexflip", "seams.json"), JSON.stringify({ seams, TR, endAt }, null, 1));
console.log("timeline ends at", t, "seams", seams.map((m) => `${m.kind}@${m.at}`).join(" "));
d.write();
