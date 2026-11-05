// Land points for the dot globe, from Natural Earth (public domain) through the world-atlas package.
// node land.cjs <land-110m.json> <out.json>
const fs = require("fs");
const [src, dst] = process.argv.slice(2);
const topo = JSON.parse(fs.readFileSync(src, "utf8"));
const { scale, translate } = topo.transform;
const arcs = topo.arcs.map((a) => {
  let x = 0, y = 0;
  return a.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});
const ring = (r) => {
  const out = [];
  for (const i of r) {
    const a = i < 0 ? [...arcs[~i]].reverse() : arcs[i];
    out.push(...(out.length ? a.slice(1) : a));
  }
  return out;
};
const polys = [];
const walk = (g) => {
  if (g.type === "GeometryCollection") g.geometries.forEach(walk);
  if (g.type === "Polygon") polys.push(g.arcs.map(ring));
  if (g.type === "MultiPolygon") g.arcs.forEach((p) => polys.push(p.map(ring)));
};
walk(topo.objects.land);
const boxes = polys.map((p) => {
  let a = 180, b = -180, c = 90, d = -90;
  for (const [x, y] of p[0]) {
    a = Math.min(a, x);
    b = Math.max(b, x);
    c = Math.min(c, y);
    d = Math.max(d, y);
  }
  return [a, b, c, d];
});
const inside = (r, x, y) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const pts = [];
const STEP = 1.05;
for (let lat = -58; lat <= 82; lat += STEP) {
  const n = Math.max(6, Math.round((360 * Math.cos((lat * Math.PI) / 180)) / STEP));
  for (let k = 0; k < n; k++) {
    const lon = -180 + (k + (Math.round(lat / STEP) % 2 ? 0.5 : 0)) * (360 / n);
    const hit = polys.some((p, i) => boxes[i][0] <= lon && lon <= boxes[i][1] && boxes[i][2] <= lat && lat <= boxes[i][3] && inside(p[0], lon, lat) && !p.slice(1).some((h) => inside(h, lon, lat)));
    if (hit) pts.push([+lat.toFixed(2), +lon.toFixed(2)]);
  }
}
fs.writeFileSync(dst, JSON.stringify(pts));
console.log(pts.length, "land points");
