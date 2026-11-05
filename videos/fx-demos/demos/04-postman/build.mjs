import { Demo, C } from "../../kit/hf.mjs";

const d = new Demo("04-postman", { dur: 29 });
d.plate({ dur: 26.2 });
// One continuous stretch of the podcast: the two voice-only segments and Helen's two lines between them.
const g1 = d.span(30, { from: 251.95, to: 261.17, at: 0.5 });
const h1 = d.span(31, { at: 9.72 });
const g2 = d.span(32, { at: 14.89 });
const h2 = d.span(33, { at: 22.33 });
const w = (sp, s) => sp.words.find((x) => x.word.toLowerCase().startsWith(s)).start;

d.captions(g1, { hot: { "443,": C.mint, relay: C.mint }, fixes: { "443,": "443," } });
d.captions(h1, { hot: { relay: C.helen, read: C.helen } });
d.captions(g2, { hot: { encrypted: C.mint, wireguard: C.mint, postman: C.mint, "can't": C.coral }, fixes: { "No,": "No." } });
d.captions(h2, { hot: { frustrated: C.coral } });
d.tile(h1.talk, { start: 9.72, dur: 5.1, x: 70, y: 70, w: 300, ring: C.helen, enter: "left" });
d.tile(h2.talk, { start: 22.33, dur: 3.1, x: 70, y: 70, w: 300, ring: C.helen, enter: "pop" });

// What the letter holds, as far as the postman can tell. The characters roll and never resolve (the registry's
// caption-matrix-decode idea, without its landing on real text): a seeded roll per frame.
const scr = 15.9, scrEnd = 16.75;
d.raw({
  html: `<div id="scramble" class="clip" data-start="${scr}" data-duration="${(scrEnd - scr).toFixed(2)}" data-track-index="31" style="position:absolute;left:1110px;top:240px;width:640px;z-index:36;font:700 34px/1.3 'JetBrains Mono',monospace;color:${C.mint};text-shadow:0 0 16px rgba(77,182,172,.8);white-space:pre"></div>`,
  seek: `{const el=document.getElementById("scramble");if(el){const f=Math.floor(t*30);let s="";const A="x9#Kq!z%7@Lm0&^Yw2*Tb4=Pd6$";for(let r=0;r<3;r++){for(let c=0;c<20;c++){const h=Math.abs(Math.sin((f+1)*12.9898+r*78.233+c*37.719)*43758.5453)%1;s+=A[Math.floor(h*A.length)]}s+=r<2?"\\n":""}el.textContent=s}}`,
});
d.lockup({ start: 26.2, disclosure: "AI-generated hosts · animated with code" });

d.music({ start: 0, dur: 26.3, from: 0, vol: 0.08, fadeIn: 1, fadeOut: 0.3 });
d.music({ start: 26.2, dur: 2.8, from: 112, vol: 0.28, fadeIn: 0.05, fadeOut: 1 });
d.sfx("whoosh_c", 0.9, 0.15);
d.sfx("thud_b", 1.95, 0.6);
d.sfx("glass_click", 2.0, 0.2);
d.sfx("power_up", 2.75, 0.3);
for (let i = 0; i < 12; i++) d.sfx(["tick_a", "tick_b", "tick_c"][i % 3], 5.5 + i * 0.16, 0.14);
d.sfx("whoosh_a", 7.3, 0.2);
d.sfx("servo_a", 10.1, 0.32);
d.sfx("servo_b", 15.0, 0.3);
d.sfx("servo_a", 15.6, 0.3);
for (let i = 0; i < 7; i++) d.sfx(i % 2 ? "thud_a" : "thud_b", 16.8 + i * 0.1, 0.2);
for (let i = 0; i < 6; i++) d.sfx("tick_b", 17.9 + i * 0.25, 0.28);
d.sfx("servo_c", 19.45, 0.34);
d.sfx("servo_b", 20.3, 0.2);
d.sfx("servo_b", 21.0, 0.2);
d.sfx("servo_a", 22.32, 0.4);
d.sfx("whoosh_b", 22.5, 0.16);
for (let i = 0; i < 8; i++) d.sfx("servo_c", 22.9 + i * 0.32, 0.18);
d.write();
