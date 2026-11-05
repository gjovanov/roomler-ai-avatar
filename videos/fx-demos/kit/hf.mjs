// The HyperFrames side of the fx-demos: writes one plain, editable index.html per demo from a short description.
// Every timed thing is a tag with an id; every move is a GSAP tween at an absolute time; the Blender plate is a
// <video>. Footage of a person goes on top as a <video> of its own, so it never passes through the renderer, the
// denoiser or the bloom: only resampled, never retouched.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
export const ROOT = path.resolve(HERE, "..");
export const VIDEOS = path.resolve(ROOT, "..");
export const OUT = path.join(ROOT, "out");
export const POD = path.join(VIDEOS, "podcast-studio", "out");
export const FOOT = path.join(OUT, "footage");
export const C = { teal: "#009688", tealL: "#4db6ac", mint: "#80cbc4", coral: "#ef5350", amber: "#ffc107", helen: "#f5b84a", ink: "#061412", paper: "#e6f5f2" };
const talk = JSON.parse(fs.readFileSync(path.join(POD, "talk-v5", "talk.json"), "utf8"));
const listen = JSON.parse(fs.readFileSync(path.join(POD, "talk-v5", "listen.json"), "utf8"));
const allWords = JSON.parse(fs.readFileSync(path.join(POD, "narration-v5", "words.json"), "utf8")).words;
// Whisper's misreadings of what the script says.
const FIX = { Rumbler: "Roomler", Rumler: "Roomler", Rumor: "Roomler", body: "but it", "ask...": "ask?" };

const ff = (...a) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a], { stdio: ["ignore", "ignore", "pipe"] });
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n3 = (x) => +x.toFixed(3);

export class Demo {
  constructor(id, { dur, w = 1920, h = 1080, fps = 30 }) {
    Object.assign(this, { id, dur, w, h, fps });
    this.dir = path.join(OUT, id, "hf");
    fs.mkdirSync(path.join(this.dir, "assets"), { recursive: true });
    this.html = [];
    this.css = [];
    this.js = [];
    this.seek = [];
    this.n = 0;
    this.track = 1;
    this.sfxN = 0;
  }
  uid(p) {
    return `${p}${++this.n}`;
  }
  asset(src, name) {
    const dst = path.join(this.dir, "assets", name || path.basename(src));
    if (!fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(src).mtimeMs) fs.copyFileSync(src, dst);
    return `assets/${path.basename(dst)}`;
  }
  // The Blender plate, or any full-frame footage.
  plate({ file = path.join(OUT, this.id, "plate.mp4"), start = 0, dur = this.dur, mediaStart = 0, z = 1, name } = {}) {
    const a = this.asset(file, name);
    const id = this.uid("plate");
    this.html.push(`<video id="${id}" class="clip" src="${a}" muted playsinline data-start="${start}" data-duration="${dur}" data-media-start="${mediaStart}" data-track-index="${this.track++}" style="position:absolute;left:0;top:0;width:${this.w}px;height:${this.h}px;object-fit:cover;z-index:${z}"></video>`);
    return id;
  }
  // A cut of the podcast: the voice as its own <audio>, the speaker's lip-synced clip and the listener's, trimmed the
  // same way, the words on this demo's clock. k = the segment; from/to in the narration's seconds; at = this demo's time.
  span(k, { from, to, at, gain = 1 }) {
    const s = talk.segments[k];
    from ??= s.start;
    to ??= s.end;
    const dur = n3(to - from);
    const tag = `k${k}-${Math.round(from * 10)}`;
    const wav = path.join(this.dir, "assets", `voice-${tag}.wav`);
    if (!fs.existsSync(wav)) ff("-ss", String(from), "-to", String(to), "-i", path.join(POD, "narration-v5", "mix.wav"), "-af", `afade=t=in:d=0.012,areverse,afade=t=in:d=0.02,areverse`, wav);
    const cut = (clip, name) => {
      const f = path.join(this.dir, "assets", name);
      if (!fs.existsSync(f)) ff("-ss", String(n3(from - s.start)), "-t", String(dur), "-i", clip, "-an", "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-g", "25", "-pix_fmt", "yuv420p", f);
      return `assets/${name}`;
    };
    const key = `seg${String(k).padStart(2, "0")}-${s.speaker}`;
    // A segment the podcast showed full frame has no lip-synced clip: it can only be heard.
    const talkClip = talk.clips[key] ? cut(talk.clips[key].clip, `talk-${tag}.mp4`) : null;
    const listenClip = listen[String(k)] ? cut(listen[String(k)].clip, `listen-${tag}.mp4`) : null;
    this.html.push(`<audio id="${this.uid("voice")}" src="assets/voice-${tag}.wav" data-start="${at}" data-duration="${dur}" data-volume="${gain}"></audio>`);
    const words = [];
    for (const w of allWords) {
      if (w.start < from - 0.02 || w.start >= to) continue;
      const t = (FIX[w.word] ?? w.word).trim();
      if (t.startsWith("-") && words.length) {
        words[words.length - 1].word += t;
        words[words.length - 1].end = n3(w.end - from + at);
        continue;
      }
      words.push({ word: t, start: n3(w.start - from + at), end: n3(w.end - from + at) });
    }
    return { k, at, from, to, dur, end: n3(at + dur), speaker: s.speaker, talk: talkClip, listen: listenClip, words };
  }
  // A framed camera. Only moves and clips; the picture is the clip's own pixels, as in the podcast (no label).
  tile(clip, { start, dur, x, y, w, h = Math.round((w * 768) / 512), ring = C.tealL, mediaStart = 0, z = 20, enter = "up", exit = true, radius = 22, borderW = 4 }) {
    const id = this.uid("tile");
    this.html.push(`<div id="${id}w" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${z};border-radius:${radius}px;overflow:hidden;box-shadow:0 0 0 ${borderW}px ${ring},0 24px 70px rgba(0,0,0,.65);opacity:0"><video id="${id}" class="clip" src="${clip}" muted playsinline data-start="${start}" data-duration="${dur}" data-media-start="${mediaStart}" data-track-index="${this.track++}" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;object-fit:cover"></video></div>`);
    const from = enter === "up" ? "y:46,scale:.96" : enter === "left" ? "x:-90" : enter === "right" ? "x:90" : "scale:.86";
    if (enter === "none") this.js.push(`tl.set("#${id}w",{opacity:1},${start});`);
    else this.js.push(`tl.fromTo("#${id}w",{opacity:0,${from}},{opacity:1,x:0,y:0,scale:1,duration:.45,ease:"expo.out"},${start});`);
    if (exit) this.js.push(`tl.to("#${id}w",{opacity:0,y:30,duration:.24,ease:"power2.in"},${n3(start + dur - 0.24)});`);
    else this.js.push(`tl.set("#${id}w",{opacity:0},${n3(start + dur)});`);
    return id;
  }
  // Text. anim: words (per-word blur in), slam, line, type, none. Exit: blur-out. align left/center/right.
  text(txt, { start, dur, x = 0, y = 0, w = this.w, size = 64, weight = 800, color = "#fff", font = "Poppins", align = "center", anim = "words", z = 30, accent = {}, shadow = true, ls = "-0.01em", stagger = 0.07, keep = false, lh = 1.08 }) {
    const id = this.uid("t");
    const words = String(txt).split(" ").map((p, i) => `<span class="w" id="${id}w${i}" style="display:inline-block;${accent[p.replace(/[.,!?]/g, "")] ? `color:${accent[p.replace(/[.,!?]/g, "")]};` : ""}">${esc(p)}&nbsp;</span>`).join("");
    this.html.push(`<div id="${id}" class="clip" data-start="${start}" data-duration="${dur}" data-track-index="${this.track}" data-layout-allow-overflow style="position:absolute;left:${x}px;top:${y}px;width:${w}px;z-index:${z};text-align:${align};font:${weight} ${size}px/${lh} '${font}',sans-serif;letter-spacing:${ls};color:${color};${shadow ? "text-shadow:0 4px 34px rgba(0,0,0,.75);" : ""}">${words}</div>`);
    const sel = `#${id} .w`;
    if (anim === "words") this.js.push(`tl.fromTo("${sel}",{opacity:0,filter:"blur(8px)"},{opacity:1,filter:"blur(0px)",duration:.16,stagger:${stagger},ease:"power4.out"},${start});`);
    else if (anim === "slam") this.js.push(`tl.fromTo("${sel}",{opacity:0,scale:1.9,filter:"blur(10px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:.26,stagger:${stagger},ease:"expo.out"},${start});`);
    else if (anim === "line") this.js.push(`tl.fromTo("#${id}>span",{opacity:0,filter:"blur(8px)"},{opacity:1,filter:"blur(0px)",duration:.2,ease:"power4.out"},${start});`);
    if (!keep) this.js.push(`tl.to("${sel}",{opacity:0,filter:"blur(6px)",duration:.16,stagger:${Math.min(stagger, 0.03)},ease:"power2.in"},${n3(start + dur - 0.22)});`);
    return id;
  }
  // Captions from a span's words: one group at a time, 3-5 words, key words in the accent colour.
  captions(sp, { y = this.h === 1920 ? 1240 : 930, size = this.h === 1920 ? 66 : 50, max = this.h === 1920 ? 3 : 5, hot = {}, color = "#fff", z = 40, font = "Inter", fixes = {} } = {}) {
    const groups = [];
    let g = [];
    for (let i = 0; i < sp.words.length; i++) {
      const w = { ...sp.words[i], word: fixes[sp.words[i].word] ?? sp.words[i].word };
      g.push(w);
      const next = sp.words[i + 1];
      if (g.length >= max || !next || next.start - w.end > 0.18 || /[.,!?]$/.test(w.word)) {
        groups.push(g);
        g = [];
      }
    }
    groups.forEach((gr, gi) => {
      const start = n3(gr[0].start - 0.03);
      const nextStart = groups[gi + 1] ? groups[gi + 1][0].start : Infinity;
      const end = n3(Math.min(gr[gr.length - 1].end + 0.35, nextStart - 0.02, sp.end));
      const id = this.uid("c");
      const spans = gr.map((w, i) => {
        const key = w.word.replace(/[.,!?]/g, "").toLowerCase();
        return `<span id="${id}w${i}" style="display:inline-block;${hot[key] ? `color:${hot[key]};` : ""}">${esc(w.word)}&nbsp;</span>`;
      }).join("");
      this.html.push(`<div id="${id}" class="clip" data-start="${start}" data-duration="${n3(end - start)}" data-track-index="90" data-track-kind="captions" data-layout-allow-caption-zone style="position:absolute;left:0;top:${y}px;width:${this.w}px;text-align:center;z-index:${z};font:900 ${size}px/1.1 '${font}',sans-serif;letter-spacing:-.015em;color:${color};text-shadow:0 3px 24px rgba(0,0,0,.95),0 0 4px rgba(0,0,0,.8)">${spans}</div>`);
      gr.forEach((w, i) => this.js.push(`tl.fromTo("#${id}w${i}",{opacity:.0,y:10},{opacity:1,y:0,duration:.1,ease:"power3.out"},${n3(Math.max(start, w.start - 0.02))});`));
    });
    return groups.length;
  }
  // A dark gradient under type that sits on bright footage.
  scrim({ start, dur, h = 300, z = 25, a = 0.78 }) {
    const id = this.uid("scrim");
    this.html.push(`<div id="${id}" class="clip" data-start="${start}" data-duration="${dur}" data-track-index="${this.track}" data-layout-ignore style="position:absolute;left:0;top:${this.h - h}px;width:${this.w}px;height:${h}px;z-index:${z};background:linear-gradient(to bottom,rgba(2,8,7,0),rgba(2,8,7,${a}))"><div id="${id}i"></div></div>`);
    this.js.push(`tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:.3,ease:"power2.out"},${start});tl.to("#${id}",{opacity:0,duration:.25,ease:"power2.in"},${n3(start + dur - 0.25)});`);
  }
  cutoutFile(clip) {
    const src = path.join(this.dir, clip);
    const webm = src.replace(/\.mp4$/, "-cut.webm");
    if (!fs.existsSync(webm)) {
      execFileSync(process.execPath, [process.env.HF_WIN, "remove-background", path.basename(src), "-o", path.basename(webm), "--quality", "best"], { cwd: path.dirname(src), stdio: ["ignore", "ignore", "pipe"], env: process.env });
    }
    return `assets/${path.basename(webm)}`;
  }
  // A clip cut out from its background (hyperframes remove-background), at most resampled: head and shoulders over the world.
  cutout(clip, { start, dur, x, y, w, h = Math.round((w * 768) / 512), z = 20, mediaStart = 0, clipBottom = 1, fade = 0.3 }) {
    const a = this.cutoutFile(clip);
    const id = this.uid("cut");
    this.html.push(`<div id="${id}w" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${Math.round(h * clipBottom)}px;z-index:${z};overflow:hidden;opacity:0"><video id="${id}" class="clip" src="${a}" muted playsinline data-start="${start}" data-duration="${dur}" data-media-start="${mediaStart}" data-track-index="${this.track++}" data-layout-allow-occlusion style="position:absolute;left:0;top:0;width:${w}px;height:${h}px"></video></div>`);
    this.js.push(`tl.fromTo("#${id}w",{opacity:0},{opacity:1,duration:${fade},ease:"power2.out"},${start});`);
    this.js.push(`tl.to("#${id}w",{opacity:0,duration:${Math.min(fade, 0.25)},ease:"power2.in"},${n3(start + dur - Math.min(fade, 0.25))});`);
    return id;
  }
  // A HyperFrames registry shader transition between two still frames, on a WebGL canvas, drawn from timeline time alone.
  shaderSeam(block, { at, dur, from, to, z = 55 }) {
    const shaders = JSON.parse(fs.readFileSync(path.join(OUT, "shaders.json"), "utf8"));
    const a = this.asset(from), b = this.asset(to);
    const id = this.uid("sh");
    this.html.push(`<canvas id="${id}" class="clip" width="${this.w}" height="${this.h}" data-start="${at}" data-duration="${dur}" data-track-index="71" data-layout-ignore style="position:absolute;left:0;top:0;width:${this.w}px;height:${this.h}px;z-index:${z}"></canvas>`);
    this.js.push(`(function(){const cv=document.getElementById("${id}");const gl=cv.getContext("webgl",{preserveDrawingBuffer:true});
const V="attribute vec2 a_pos;varying vec2 v_uv;void main(){v_uv=a_pos*0.5+0.5;v_uv.y=1.0-v_uv.y;gl_Position=vec4(a_pos,0,1);}";
const F=${JSON.stringify(shaders[block])};
const sh=(s,k)=>{const o=gl.createShader(k);gl.shaderSource(o,s);gl.compileShader(o);return o};
const p=gl.createProgram();gl.attachShader(p,sh(V,gl.VERTEX_SHADER));gl.attachShader(p,sh(F,gl.FRAGMENT_SHADER));gl.linkProgram(p);gl.useProgram(p);
const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
const pos=gl.getAttribLocation(p,"a_pos");gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
const tex=(u,src,unit)=>new Promise((ok)=>{const i=new Image();i.onload=()=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);for(const [k,v] of [[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR]])gl.texParameteri(gl.TEXTURE_2D,k,v);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,i);gl.uniform1i(gl.getUniformLocation(p,u),unit);ok()};i.src=src});
gl.uniform2f(gl.getUniformLocation(p,"u_resolution"),${this.w},${this.h});
window.__hf=window.__hf||{};window.__hf.buildReady=window.__hf.buildReady||{};
window.__hf.buildReady["${id}"]=Promise.all([tex("u_from","${a}",0),tex("u_to","${b}",1)]);
window.__seams=window.__seams||[];window.__seams.push((t)=>{const k=Math.max(0,Math.min(1,(t-${at})/${dur}));const e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;gl.useProgram(p);gl.uniform1f(gl.getUniformLocation(p,"u_progress"),e);gl.drawArrays(gl.TRIANGLE_STRIP,0,4)});})();`);
    this.seek.push(`(window.__seams||[]).forEach((f)=>f(t));`.repeat(this.seek.some((x) => x.includes("__seams")) ? 0 : 1));
    return id;
  }
  chip(txt, { start, dur, x = 40, y = 40, z = 35 }) {
    const id = this.uid("chip");
    this.html.push(`<div id="${id}" class="clip" data-start="${start}" data-duration="${dur}" data-track-index="${this.track}" style="position:absolute;left:${x}px;top:${y}px;z-index:${z};padding:10px 20px;border-radius:999px;background:rgba(6,20,18,.82);border:1.5px solid ${C.tealL};color:${C.mint};font:700 26px 'Inter',sans-serif">${esc(txt)}</div>`);
    return id;
  }
  sfx(name, at, vol = 0.5) {
    const a = this.asset(path.join(OUT, "sfx", `${name}.wav`));
    this.html.push(`<audio id="sfx${++this.sfxN}" src="${a}" data-start="${n3(at)}" data-volume="${vol}"></audio>`);
  }
  music({ start = 0, dur = this.dur - start, from = 0, vol = 0.14, fadeIn = 0.6, fadeOut = 1.6 } = {}) {
    const src = process.env.FX_MUSIC;
    if (!src) throw new Error("FX_MUSIC is not set");
    const a = this.asset(src, "music.mp3");
    this.html.push(`<audio id="${this.uid("music")}" src="${a}" data-start="${start}" data-duration="${n3(dur)}" data-media-start="${from}" data-volume="${vol}" data-fade-in="${fadeIn}" data-fade-out="${fadeOut}"></audio>`);
  }
  // Music and effects dip under every voice and come back in the gaps, so no line is buried under the sound design.
  // write() mixes the bed into one file, ducked by the voices' own envelope (kit/voicebed.cjs measures the result).
  duck(opts = {}) {
    this.ducking = { depth: 14, attack: 0.08, release: 0.4, pre: 0.12, hold: 0.15, gap: 0.3, floor: -42, ...opts };
  }
  mixBed() {
    const o = this.ducking, SR = 48000, FR = 100; // the envelope in 10 ms frames
    const tags = this.html.map((h, i) => [i, /<audio ([^>]*)><\/audio>/.exec(h)]).filter(([, m]) => m)
      .map(([i, m]) => ({ i, a: Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]])) }));
    const voice = tags.filter((t) => /^voice/.test(t.a.id)), bed = tags.filter((t) => !/^voice/.test(t.a.id));
    if (!voice.length || !bed.length) return;
    // The same mix HyperFrames makes (checked against a render: every 250 ms window within 1 dB, one fixed offset).
    const stem = (list, ch, sr) => {
      const args = [], fl = [];
      list.forEach(({ a }, i) => {
        args.push("-i", path.join(this.dir, a.src));
        const d = a["data-duration"] ? +a["data-duration"] : 0, fi = +(a["data-fade-in"] || 0), fo = +(a["data-fade-out"] || 0);
        let f = `[${i}:a]aformat=sample_fmts=fltp:channel_layouts=${ch},aresample=${sr},atrim=start=${+(a["data-media-start"] || 0)}${d ? `:duration=${d}` : ""},asetpts=PTS-STARTPTS`;
        if (fi > 0) f += `,afade=t=in:d=${fi}`;
        if (fo > 0 && d) f += `,afade=t=out:st=${Math.max(0, d - fo)}:d=${fo}`;
        fl.push(`${f},volume=${+(a["data-volume"] || 1)},adelay=${Math.round(+a["data-start"] * 1000)}:all=1[s${i}]`);
      });
      fl.push(`${list.map((_, i) => `[s${i}]`).join("")}amix=inputs=${list.length}:normalize=0:duration=longest,apad=whole_dur=${this.dur},atrim=duration=${this.dur}[o]`);
      const b = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args, "-filter_complex", fl.join(";"), "-map", "[o]", "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
      return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    };
    const V = stem(voice, "mono", 16000), B = stem(bed, "stereo", SR);
    // Speaking frames, widened before (the dip is down when the word starts) and after, gaps between words bridged.
    const n = Math.ceil(this.dur * FR), hop = 16000 / FR, want = new Uint8Array(n);
    const pre = Math.round(o.pre * FR), hold = Math.round(o.hold * FR), gap = Math.round(o.gap * FR);
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (let j = k * hop; j < (k + 1) * hop && j < V.length; j++) s += V[j] * V[j];
      if (10 * Math.log10(s / hop + 1e-12) > o.floor) want.fill(1, Math.max(0, k - pre), Math.min(n, k + hold + 1));
    }
    for (let k = 0, last = -1e9; k < n; k++) if (want[k]) { if (k - last > 1 && k - last <= gap) want.fill(1, last + 1, k); last = k; }
    const g = new Float32Array(n);
    for (let k = 0, db = 0; k < n; k++) {
      const t = want[k] ? -o.depth : 0;
      db = t < db ? Math.max(t, db - o.depth / (o.attack * FR)) : Math.min(t, db + o.depth / (o.release * FR));
      g[k] = Math.pow(10, db / 20);
    }
    for (let i = 0; i < B.length / 2; i++) {
      const x = (i / SR) * FR, k = Math.min(n - 1, Math.floor(x)), gg = g[k] + (g[Math.min(n - 1, k + 1)] - g[k]) * (x - k);
      B[2 * i] *= gg;
      B[2 * i + 1] *= gg;
    }
    // A float WAV: the bed may sum past 1, and the final pass sets the level and limits.
    const data = Buffer.from(B.buffer, B.byteOffset, B.length * 4), h = Buffer.alloc(44);
    h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22);
    h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
    fs.writeFileSync(path.join(this.dir, "assets", "bed.wav"), Buffer.concat([h, data]));
    const drop = new Set(bed.map((t) => t.i));
    this.html = this.html.filter((_, i) => !drop.has(i));
    this.html.push(`<audio id="bed" src="assets/bed.wav" data-start="0" data-duration="${this.dur}" data-volume="1"></audio>`);
  }
  // The end card: the pack's flat logo, untouched, the domain, and the disclosure when anyone AI is on screen or heard.
  lockup({ start, dur = this.dur - start, sub = "Open source · self-hostable", disclosure = "AI-generated hosts · real screen recordings", bg = true, z = 60, overlap = 0.3, still = false }) {
    const logo = this.asset(path.join(OUT, "brand", "roomler-mark-dark.svg"), "logo.svg");
    const portrait = this.h > this.w;
    const id = this.uid("end");
    const scale = portrait ? 1.25 : 1;
    this.html.push(`<div id="${id}" class="clip" data-start="${n3(start - overlap)}" data-duration="${n3(dur + overlap)}" data-track-index="80" data-layout-allow-overlap style="position:absolute;inset:0;z-index:${z}">
      ${bg ? `<div id="${id}bg" style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 42%,#15403a 0%,#0a201d 72%)"></div>` : ""}
      <img id="${id}logo" src="${logo}" style="position:absolute;left:${this.w / 2 - 95 * scale}px;top:${this.h * 0.5 - 330 * scale}px;width:${190 * scale}px;height:${190 * scale}px">
      <div id="${id}t" style="position:absolute;left:0;width:100%;top:${this.h * 0.5 - 120 * scale}px;text-align:center;font:700 ${132 * scale}px 'Poppins',sans-serif;letter-spacing:-.02em;color:${C.paper}">roomler.ai</div>
      <div id="${id}s" style="position:absolute;left:0;width:100%;top:${this.h * 0.5 + 62 * scale}px;text-align:center;font:600 ${44 * scale}px 'Poppins',sans-serif;color:${C.mint}">${esc(sub)}</div>
      ${disclosure ? `<div id="${id}d" style="position:absolute;left:0;width:100%;top:${this.h * 0.5 + 170 * scale}px;text-align:center;font:400 ${26 * scale}px 'Inter',sans-serif;color:#8fa6b2">${esc(disclosure)}</div>` : ""}
    </div>`);
    // The card fades in over the end of what comes before it, so there is no dip to black.
    if (still) return; // a transition lands on the finished card
    if (bg) this.js.push(`tl.fromTo("#${id}bg",{opacity:0},{opacity:1,duration:${overlap},ease:"power1.inOut"},${n3(start - overlap)});`);
    this.js.push(`tl.fromTo("#${id}logo",{opacity:0,scale:.82},{opacity:1,scale:1,duration:.5,ease:"expo.out"},${n3(start + 0.05)});`);
    this.js.push(`tl.fromTo("#${id}t",{opacity:0,filter:"blur(10px)"},{opacity:1,filter:"blur(0px)",duration:.22,ease:"power4.out"},${n3(start + 0.15)});`);
    this.js.push(`tl.fromTo("#${id}s",{opacity:0},{opacity:1,duration:.3,ease:"power2.out"},${n3(start + 0.38)});`);
    if (disclosure) this.js.push(`tl.fromTo("#${id}d",{opacity:0},{opacity:1,duration:.3,ease:"power2.out"},${n3(start + 0.5)});`);
  }
  // A footage plane tracked from Blender: corners.json holds, per frame, the 4 pixel corners; the element keeps its pixels.
  warp(elId, cornersFile, srcW, srcH) {
    const c = JSON.parse(fs.readFileSync(cornersFile, "utf8"));
    this.seek.push(`warp(${JSON.stringify(elId)},${JSON.stringify(c)},${srcW},${srcH},t);`);
  }
  raw({ html = "", css = "", js = "", seek = "" }) {
    if (html) this.html.push(html);
    if (css) this.css.push(css);
    if (js) this.js.push(js);
    if (seek) this.seek.push(seek);
  }
  write() {
    if (this.ducking) this.mixBed();
    const warpFn = `function homog(w,h,p){const[x0,y0]=p[0],[x1,y1]=p[1],[x2,y2]=p[2],[x3,y3]=p[3];const dx1=x1-x2,dx2=x3-x2,sx=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,sy=y0-y1+y2-y3;const d=dx1*dy2-dx2*dy1;const g=(sx*dy2-dx2*sy)/d,hh=(dx1*sy-sx*dy1)/d;const a=x1-x0+g*x1,b=x3-x0+hh*x3,c=x0,e=y1-y0+g*y1,f=y3-y0+hh*y3,i=y0;return\`matrix3d(\${a/w},\${e/w},0,\${g/w},\${b/h},\${f/h},0,\${hh/h},0,0,1,0,\${c},\${i},0,1)\`}
function warp(id,c,w,h,t){const n=c.length-1;const f=Math.max(0,Math.min(n,Math.round(t*${this.fps})));const el=document.getElementById(id);if(el)el.style.transform=homog(w,h,c[f])}`;
    const doc = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=${this.w}, height=${this.h}">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{margin:0;width:${this.w}px;height:${this.h}px;overflow:hidden;background:#000}#root{position:relative;width:${this.w}px;height:${this.h}px;overflow:hidden}
${this.css.join("\n")}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${this.dur}" data-width="${this.w}" data-height="${this.h}" data-fps="${this.fps}">
${this.html.join("\n")}
</div>
<script>
window.__timelines=window.__timelines||{};
const tl=gsap.timeline({paused:true});
${this.js.join("\n")}
tl.set({}, {}, ${this.dur});
window.__timelines["main"]=tl;
${warpFn}
function renderAt(t){${this.seek.join("")}}
window.addEventListener("hf-seek",(e)=>renderAt(e.detail.time));
renderAt(0);
</script></body></html>`;
    fs.writeFileSync(path.join(this.dir, "index.html"), doc);
    fs.writeFileSync(path.join(this.dir, "hyperframes.json"), JSON.stringify({ registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true } }, null, 2));
    fs.writeFileSync(path.join(this.dir, "meta.json"), JSON.stringify({ id: this.id, name: this.id }, null, 2));
    console.log("wrote", path.join(this.dir, "index.html"));
  }
}
