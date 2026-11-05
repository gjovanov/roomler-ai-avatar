// Writes out/review/index.html: every demo with its video, what it is, what made it, its prompt and its fix rounds, and approval
// buttons whose answers can be copied back into the chat. Stays local: the demos carry a real person's cloned voice and avatar.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "out");
const D = require("./demos.json");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const master = fs.readFileSync(path.join(ROOT, "MASTER-PROMPT.md"), "utf8");
const cards = D.map((d, i) => {
  const mp4 = path.join(OUT, d.id, `${d.id}.mp4`);
  const ready = fs.existsSync(mp4);
  const prompt = fs.readFileSync(path.join(ROOT, "demos", d.id, "prompt.md"), "utf8");
  const rounds = fs.existsSync(path.join(ROOT, "demos", d.id, "rounds.md")) ? fs.readFileSync(path.join(ROOT, "demos", d.id, "rounds.md"), "utf8") : "";
  let size = "";
  if (ready) size = `${(fs.statSync(mp4).size / 1048576).toFixed(0)} MB`;
  const portrait = d.portrait ? " portrait" : "";
  const video = ready
    ? `<video controls preload="metadata" playsinline ${d.loop ? "loop" : ""} src="../${d.id}/${d.id}.mp4#t=${d.poster ?? 1}"></video>`
    : `<div class="pending">Still rendering. Reload this page when it is done.</div>`;
  const li = (a) => a.map((x) => `<li>${esc(x)}</li>`).join("");
  return `<article id="d${i + 1}" class="card${portrait}">
    <header><span class="num">${String(i + 1).padStart(2, "0")}</span><div><h2>${esc(d.title)}${d.pick ? `<span class="pick">${esc(d.pick)}</span>` : ""}</h2><p class="tag">${esc(d.kind)} · ${esc(d.len)}${size ? " · " + size : ""}</p></div></header>
    <div class="body">
      <div class="vid">${video}</div>
      <div class="txt">
        <p class="log">${esc(d.log)}</p>
        <p class="wow"><b>The WOW moment.</b> ${esc(d.wow)}</p>
        <p><b>Why it fits Roomler.</b> ${esc(d.fit)}</p>
        <div class="two"><div><h3>Blender did</h3><ul>${li(d.blender)}</ul></div><div><h3>HyperFrames did</h3><ul>${li(d.hf)}</ul></div></div>
        <h3>Existing footage it glues together</h3><ul>${li(d.footage)}</ul>
        ${d.flags && d.flags.length ? `<h3 class="flag">Your call before this could ever go out</h3><ul class="flagl">${li(d.flags)}</ul>` : ""}
        <div class="vote" data-id="${d.id}" data-title="${esc(d.title)}">
          <button data-v="approve">Approve</button><button data-v="change">Change it</button><button data-v="drop">Drop</button>
          <input type="text" placeholder="Your note (optional)">
        </div>
      </div>
    </div>
    <details><summary>The prompt I worked from</summary><pre>${esc(prompt)}</pre><button class="copy">Copy this prompt</button></details>
    ${rounds ? `<details><summary>The fix rounds (what I saw, the exact change)</summary><pre>${esc(rounds)}</pre></details>` : ""}
  </article>`;
}).join("\n");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Roomler FX Demos</title>
<style>
:root{--bg:#061412;--card:#0b1f1c;--ink:#e6f5f2;--mute:#8fa6b2;--teal:#4db6ac;--line:#16403a;--amber:#ffc107;--coral:#ef5350}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 'Segoe UI',system-ui,sans-serif}
main{max-width:1320px;margin:0 auto;padding:32px 16px 96px}h1{font-size:40px;margin:0 0 8px;letter-spacing:-.02em}
.lead{color:var(--mute);max-width:900px}.jump{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 26px}.jump a{color:var(--teal);text-decoration:none;border:1px solid var(--line);padding:4px 10px;border-radius:999px;font-size:14px}
.note{background:#0b1f1c;border:1px solid var(--line);border-left:3px solid var(--amber);border-radius:10px;padding:12px 16px;max-width:980px;margin:14px 0}.note p{margin:0 0 8px}.note p:last-child{margin:0}.pick{background:var(--amber);color:#1a1a2e;font:700 12px inherit;padding:2px 8px;border-radius:999px;margin-left:10px;vertical-align:middle}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin:22px 0}
.card header{display:flex;gap:14px;align-items:baseline;margin-bottom:12px}.num{color:var(--teal);font-weight:800;font-size:26px}h2{margin:0;font-size:26px;letter-spacing:-.01em}.tag{margin:2px 0 0;color:var(--mute);font-size:14px}
.body{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:22px}.portrait .body{grid-template-columns:minmax(0,.62fr) minmax(0,1fr)}
video{width:100%;border-radius:10px;background:#000;display:block}.pending{aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:#000;border-radius:10px;color:var(--mute)}
.txt p{margin:0 0 10px}.log{font-size:18px}.wow{border-left:3px solid var(--amber);padding-left:10px}h3{margin:12px 0 4px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--teal)}h3.flag{color:var(--amber)}
ul{margin:0;padding-left:18px}li{margin:2px 0}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.vote{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:center}.vote button{background:#10332e;color:var(--ink);border:1px solid var(--line);padding:7px 14px;border-radius:8px;cursor:pointer;font:600 14px inherit}
.vote button.on[data-v=approve]{background:#00796b;border-color:var(--teal)}.vote button.on[data-v=change]{background:#7a5a00;border-color:var(--amber)}.vote button.on[data-v=drop]{background:#7a2320;border-color:var(--coral)}
.vote input{flex:1;min-width:180px;background:#061412;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:7px 10px;font:inherit}
details{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}summary{cursor:pointer;color:var(--teal);font-weight:600}pre{white-space:pre-wrap;background:#061412;border:1px solid var(--line);border-radius:10px;padding:14px;font:13.5px/1.5 Consolas,monospace;overflow:auto}
.copy,#copyall{background:#10332e;color:var(--ink);border:1px solid var(--line);padding:7px 14px;border-radius:8px;cursor:pointer;font:600 14px inherit}
.bar{position:sticky;bottom:0;background:#0b1f1cf2;border-top:1px solid var(--line);padding:12px 16px;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap}.bar span{color:var(--mute);font-size:14px}
@media(max-width:860px){.body,.portrait .body,.two{grid-template-columns:1fr}h1{font-size:30px}}
</style></head><body><main>
<h1>Roomler FX Demos</h1>
<p class="lead">Ten short films, each glued from recordings that already exist, with Blender 3D and HyperFrames motion graphics on top. Nothing here is published and nothing left this machine. The big idea: <b>every joke and analogy in the podcast is already a storyboard, so the world builds what Goran says.</b> All the new picture is code: Blender and HyperFrames, no AI video model. Your face and voice are the existing podcast clips, only cut out, moved and resampled, and they never pass through the renderer.</p>
<div class="note"><p><b>Where I would start:</b> 05 Friday Night, 04 The Frustrated Postman and 09 Remote Inception. 05 is the most human story and is built for TikTok and Shorts. 04 explains the hardest security claim with a character you could keep. 09 needs no sound, so it works in a muted feed. 10 is not one film but a transition pack for all future videos, and 07 is a format for the next announcement.</p><p><b>The sound is measured, not heard.</b> Every file is at -14 LUFS with its peaks under -1.4 dBTP, and each effect is placed on its action, but I cannot listen. The effects were made in code as stand-ins, so please judge them with your ears. The music is the licensed trailer track.</p><p><b>Time:</b> about 1 second of GPU per frame with other work running, so a 20 s film renders in about 10 minutes. Stills come back in seconds, which is where the look gets fixed.</p></div>
<div class="jump">${D.map((d, i) => `<a href="#d${i + 1}">${i + 1} ${esc(d.title)}</a>`).join("")}<a href="#master">The series prompt</a></div>
${cards}
<article id="master" class="card"><header><div><h2>The series prompt</h2><p class="tag">Every demo starts from this, then adds its own six blocks: BRAND, FORMAT, BEATS, CAMERA, LOOK, CHECKS (the structure from your Claude + Blender guide)</p></div></header><pre>${esc(master)}</pre></article>
</main>
<div class="bar"><span id="count">0 of ${D.length} decided</span><button id="copyall">Copy my decisions</button><span>then paste them into the chat</span></div>
<script>
const KEY="roomler-fx-votes";let V={};try{V=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(V))}catch(e){}document.getElementById("count").textContent=Object.values(V).filter(x=>x.v).length+" of ${D.length} decided"}
document.querySelectorAll(".vote").forEach(el=>{const id=el.dataset.id;const inp=el.querySelector("input");const paint=()=>el.querySelectorAll("button").forEach(b=>b.classList.toggle("on",(V[id]||{}).v===b.dataset.v));
if(V[id]&&V[id].n)inp.value=V[id].n;paint();el.querySelectorAll("button").forEach(b=>b.onclick=()=>{V[id]=V[id]||{};V[id].v=V[id].v===b.dataset.v?null:b.dataset.v;paint();save()});inp.oninput=()=>{V[id]=V[id]||{};V[id].n=inp.value;save()}});
document.querySelectorAll(".copy").forEach(b=>b.onclick=()=>navigator.clipboard.writeText(b.previousElementSibling.textContent).then(()=>{b.textContent="Copied"}));
document.getElementById("copyall").onclick=()=>{const lines=[...document.querySelectorAll(".vote")].map((el,i)=>{const r=V[el.dataset.id]||{};return (i+1)+" "+el.dataset.title+": "+(r.v||"no decision")+(r.n?" ("+r.n+")":"")});navigator.clipboard.writeText(lines.join("\\n")).then(()=>{document.getElementById("copyall").textContent="Copied"})};
save();
</script></body></html>`;
fs.mkdirSync(path.join(OUT, "review"), { recursive: true });
fs.writeFileSync(path.join(OUT, "review", "index.html"), html);
console.log("review page:", path.join(OUT, "review", "index.html"), D.filter((d) => fs.existsSync(path.join(OUT, d.id, `${d.id}.mp4`))).length, "of", D.length, "ready");
