# 10 Hex-Flip: Roomler's own transition. The frame breaks into thin hexagonal tiles (the logo's shape); a wave flips them over and each
# carries the next picture on its back. Other seams: slabs falling away, a turn of a cube. Emission only, no denoiser, no noise: the
# pictures on the tiles are the cut's own last and first frames, so the transition starts and ends exactly on the flat cut.
#   blender -b -P scene.py -- --a a.png --b b.png --kind hex|domino|fold --out dir [--dur 28]
import bpy, bmesh, math, os, sys, random
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../tools/blender")))
import rb
from mathutils import Vector, Matrix

A, B, KIND = rb.ARGS.get("a"), rb.ARGS.get("b"), rb.ARGS.get("kind", "hex")
N = int(rb.ARGS.get("dur", 28))
s = rb.begin(frames=N, samples=int(rb.ARGS.get("samples", 16)), denoise=False, world=(0.0, 0.0, 0.0))
s.cycles.use_adaptive_sampling = False
rad = math.radians
W, H = 16.0, 9.0
LENS = 50.0
DIST = W * LENS / 36.0  # flat on the picture plane: the picture fills the frame exactly
cam, look = rb.camera(LENS, (0, -DIST, 0), (0, 0, 0))
ma = rb.still_mat("A", A, 1.0)
mb = rb.still_mat("B", B, 1.0)
edge = rb.emit_mat("edge", "#2BD4C0", 1.6)
rd = random.Random(5)


def tile_mesh(name, poly, thick, cx, cz, flip):
    # A prism centred on its own origin. Front (-Y) shows A where it stands; back (+Y) shows B where it lands after the flip.
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    fr = [bm.verts.new((x - cx, -thick / 2, z - cz)) for x, z in poly]
    ba = [bm.verts.new((x - cx, thick / 2, z - cz)) for x, z in poly]
    f1 = bm.faces.new(list(reversed(fr)))
    f2 = bm.faces.new(ba)
    f1.material_index, f2.material_index = 0, 1
    for lo in f1.loops:
        x, _, z = lo.vert.co
        lo[uvl].uv = ((cx + x) / W + 0.5, (cz + z) / H + 0.5)
    for lo in f2.loops:
        x, _, z = lo.vert.co
        # A half turn about the vertical axis sends local x to -x.
        lo[uvl].uv = ((cx + (-x if flip else x)) / W + 0.5, (cz + z) / H + 0.5)
    n = len(poly)
    for i in range(n):
        q = bm.faces.new((fr[i], fr[(i + 1) % n], ba[(i + 1) % n], ba[i]))
        q.material_index = 2
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(ma)
    me.materials.append(mb)
    me.materials.append(edge)
    return me


if KIND == "hex":
    R = 0.66
    dx, dz = math.sqrt(3) * R, 1.5 * R
    tiles, row, z = [], 0, -H / 2 - R
    while z < H / 2 + R * 2:
        x = -W / 2 - dx + (dx / 2 if row % 2 else 0)
        while x < W / 2 + dx * 2:
            tiles.append((x, z))
            x += dx
        z += dz
        row += 1
    SPAN = 11  # frames one tile takes to flip
    T0, T1 = 2, N - 2
    for i, (cx, cz) in enumerate(tiles):
        poly = [(cx + R * 1.004 * math.cos(rad(90 + 60 * k)), cz + R * 1.004 * math.sin(rad(90 + 60 * k))) for k in range(6)]
        me = tile_mesh(f"t{i}", poly, 0.05, cx, cz, True)
        o = rb._obj(f"t{i}", me, None, (cx, 0, cz))
        d = ((cx + W / 2) * 0.85 + (H / 2 - cz) * 0.5) / (W * 0.85 + H * 0.5)
        f0 = T0 + (T1 - SPAN - T0) * max(0.0, min(1.0, d)) + rd.uniform(-0.8, 0.8)
        f1 = f0 + SPAN
        rb.key(o, "rotation_euler", max(1, f0), (0, 0, 0), "BEZIER", easing="EASE_IN_OUT")
        rb.key(o, "rotation_euler", f1, (0, 0, rad(180)))
        rb.key(o, "location", max(1, f0), Vector((cx, 0, cz)))
        rb.key(o, "location", (f0 + f1) / 2, Vector((cx, -0.95, cz)))
        rb.key(o, "location", f1, Vector((cx, 0, cz)))
elif KIND == "domino":
    # Slabs swing away like a row of doors, from the left; B stands flat behind them.
    back = 1.3
    bgp = rb.plane("bg", W * (DIST + back) / DIST, H * (DIST + back) / DIST, mb, (0, back, 0))
    NS = 16
    w = W / NS
    for i in range(NS):
        x0 = -W / 2 + i * w
        poly = [(x0, -H / 2), (x0 + w, -H / 2), (x0 + w, H / 2), (x0, H / 2)]
        me = tile_mesh(f"s{i}", poly, 0.05, x0, 0, False)
        o = rb._obj(f"s{i}", me, None, (x0, 0, 0))
        f0 = 2 + i * (N - 13) / NS
        rb.key(o, "rotation_euler", f0, (0, 0, 0), "CUBIC", easing="EASE_IN")
        rb.key(o, "rotation_euler", f0 + 10, (0, 0, rad(88)))
        rb.show_between(o, 1, int(f0 + 10))
elif KIND == "fold":
    # A turn of a cube: the picture is one face, the next picture the next face.
    pa = rb.empty("cube", (0, W / 2, 0))
    rb.plane("fa", W, H, ma, (0, -W / 2, 0), parent=pa)
    rb.plane("fb", W, H, mb, (W / 2, 0, 0), (0, 0, rad(90)), parent=pa)
    rb.box("edge", (0.03, 0.03, H), edge, (W / 2, -W / 2, 0), parent=pa)
    rb.key(pa, "rotation_euler", 1, (0, 0, 0), "BEZIER", easing="EASE_IN_OUT")
    rb.key(pa, "rotation_euler", N, (0, 0, rad(-90)))
rb.finish()
