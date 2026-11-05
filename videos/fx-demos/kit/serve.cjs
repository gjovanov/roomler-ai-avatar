// The review page on this machine only (127.0.0.1), with byte ranges so the videos seek. node serve.cjs [port]
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../out");
const PORT = +(process.argv[2] || 5173);
const TYPES = { ".html": "text/html; charset=utf-8", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".png": "image/png" };
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
  let f = path.normalize(path.join(ROOT, u === "/" ? "review/index.html" : u));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  const size = fs.statSync(f).size, type = TYPES[path.extname(f)] || "application/octet-stream";
  const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (r) {
    const a = r[1] ? +r[1] : 0, b = r[2] ? +r[2] : size - 1;
    res.writeHead(206, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": b - a + 1, "Content-Range": `bytes ${a}-${b}/${size}`, "Cache-Control": "no-store" });
    return fs.createReadStream(f, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": size, "Cache-Control": "no-store" });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log("http://127.0.0.1:" + PORT + "/"));
