# 06 The Daemon, Exploded: a machined hex puck. Its plates slide out like drawers, one by one, and fly up into a honeycomb of five
# screens facing the camera, the five jobs one daemon does. Then they slam back into one object. Label anchors are exported per frame.
import bpy, math, os, sys, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../tools/blender")))
import rb
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view as w2c

F = lambda t: int(round(t * 30)) + 1
T = F(15.0)
s = rb.begin(frames=T, samples=56)
rad = math.radians
R = rb.VIDEOS
FOOT = os.path.join(R, "fx-demos/out/footage")
BRAND = os.path.join(R, "fx-demos/out/brand")
rb.floor(rough=0.2, z=-1.25, base="#040808")

metal = rb.mat("metal", "#1a2224", rough=0.34, metal=1.0)
metal2 = rb.mat("metal2", "#0e1516", rough=0.42, metal=1.0)
edge = rb.emit_mat("edge", rb.TEAL_L, 0.3)
Rad = 3.0
TH = 0.2
# Plates, bottom to top, with the part of the picture each hexagon shows: centre u, centre v, zoom (1 = the picture's full height).
OPEN0 = F(7.5)
PL = [
    ("SSH", rb.footage_mat("p0", os.path.join(FOOT, "ssh-boxed.mp4"), strength=0.0, start=OPEN0, offset=120), 0.42, 0.68, 0.62),
    ("tunnel-client", rb.still_mat("p1", os.path.join(BRAND, "tunnels.png"), 0.0), 0.5, 0.5, 0.9),
    ("tunnel-exit", rb.still_mat("p2", os.path.join(BRAND, "exit.png"), 0.0), 0.5, 0.52, 0.78),
    ("network", rb.footage_mat("p3", os.path.join(FOOT, "peers-boxed.mp4"), strength=0.0, start=OPEN0, offset=120), 0.62, 0.52, 0.62),
    ("desktop", rb.footage_mat("p4", os.path.join(R, "macbook-120fps/out/visuals/vis-drag.mp4"), strength=0.0, start=OPEN0, offset=30), 0.52, 0.55, 1.0),
]


def hex_screen(name, r, material, z, parent, cu, cv, zoom):
    # A hexagon cut from a 16:9 picture: the hexagon's height is `zoom` of the picture's height, centred on (cu, cv).
    pts = [(r * math.cos(rad(60 * i)), r * math.sin(rad(60 * i))) for i in range(6)]
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, y, 0) for x, y in pts], [], [tuple(range(6))])
    uv = me.uv_layers.new(name="UVMap")
    h = math.sqrt(3) * r
    for i, l in enumerate(me.loops):
        x, y = pts[l.vertex_index]
        uv.data[i].uv = (cu + (x / h) * zoom * (9 / 16), cv + (y / h) * zoom)
    me.update()
    return rb._obj(name, me, material, (0, 0, z), (0, 0, 0), parent)


root = rb.empty("puck", (0, 0, 0))
rb.hex_prism("base", Rad, 0.5, metal, (0, 0, -0.52), bevel=0.03, parent=root)
rb.hex_prism("baseedge", Rad + 0.012, 0.03, edge, (0, 0, -0.42), parent=root)
Y0 = [-0.02 + i * (TH + 0.01) for i in range(5)]  # closed, in the stack
XS, ZC, DZ_, YROW = 4.65, 4.7, 1.33, -3.0  # the honeycomb
CLOSE = F(13.2)
plates = []
for i, (name, m, cu, cv, zoom) in enumerate(PL):
    p = rb.empty(f"plate{i}", (0, 0, Y0[i]), parent=root)
    rb.hex_prism(f"pm{i}", Rad, TH, metal if i % 2 else metal2, (0, 0, 0), bevel=0.015, parent=p)
    rb.hex_prism(f"pe{i}", Rad + 0.012, 0.018, edge, (0, 0, -TH / 2 + 0.03), parent=p)
    hex_screen(f"scr{i}", Rad - 0.1, m, TH / 2 + 0.004, p, cu, cv, zoom)
    plates.append(p)
    # The top plate leaves first. Drawer: straight out towards the camera. Then up into its place, turning to face us.
    t0 = OPEN0 + (4 - i) * 8
    # Remote desktop on the left, SSH on the right; the honeycomb alternates up and down.
    x, z = (2 - i) * XS, ZC + (DZ_ if i % 2 == 0 else -DZ_)
    place = Vector((x, YROW, z))
    rb.key(p, "location", 1, (0, 0, Y0[i]))
    rb.key(p, "rotation_euler", 1, (0, 0, 0))
    rb.key(p, "location", t0, (0, 0, Y0[i]), "BEZIER", easing="EASE_OUT")
    rb.key(p, "location", t0 + 9, (0, -4.6, Y0[i]))
    rb.key(p, "rotation_euler", t0 + 9, (0, 0, 0), "BEZIER")
    rb.key(p, "location", t0 + 25, place + Vector((0, -0.22, 0.12)))
    rb.key(p, "rotation_euler", t0 + 25, (rad(94), 0, 0))
    rb.key(p, "location", t0 + 31, place)
    rb.key(p, "rotation_euler", t0 + 31, (rad(90), 0, 0))
    # The slam: all together, ease in, gone into the stack in 11 frames.
    rb.key(p, "location", CLOSE - 11, place, "CUBIC", easing="EASE_IN")
    rb.key(p, "rotation_euler", CLOSE - 11, (rad(90), 0, 0), "CUBIC", easing="EASE_IN")
    rb.key(p, "location", CLOSE, (0, 0, Y0[i]))
    rb.key(p, "rotation_euler", CLOSE, (0, 0, 0))
    pk = 0.9 if name in ("desktop", "SSH", "network") else 1.0
    for f, v in [(t0 + 8, 0), (t0 + 11, 1.0), (t0 + 12, 0.3), (t0 + 15, pk), (CLOSE - 2, pk), (CLOSE, 0)]:
        rb.key_strength(m, f, v)
lid = rb.hex_prism("lid", Rad, 0.3, metal, (0, 0, 1.15), bevel=0.04, parent=root)
TOP = Y0[4] + TH / 2 + 0.16
for n in range(6):
    # As each drawer leaves, the lid settles one plate lower, with a small drop.
    f = OPEN0 + n * 8 + 3
    rb.key(lid, "location", f, (0, 0, TOP - n * (TH + 0.01)), "CUBIC", easing="EASE_IN")
    if n == 0:
        rb.key(lid, "location", 1, (0, 0, TOP))
rb.key(lid, "location", CLOSE - 5, (0, 0, TOP - 5 * (TH + 0.01) + 0.02), "CUBIC", easing="EASE_OUT")
rb.key(lid, "location", CLOSE - 1, (0, 0, TOP + 0.55), "CUBIC", easing="EASE_IN")
rb.key(lid, "location", CLOSE, (0, 0, TOP))
lg = rb.logo3d(size=3.8, glow=1.1, name="lidlogo")
lg.parent = lid
lg.location = (0, 0, 0.17)
lg.rotation_euler = (rad(-90), 0, 0)
lg.scale = (1, 0.2, 1)
for f, v in [(1, 0.5), (F(7.3), 0.5), (F(7.5), 1.4), (CLOSE - 1, 1.1), (CLOSE, 5.0), (CLOSE + 12, 0.6), (T, 0.6)]:
    rb.key_strength(edge, f, v)

# The puck turns slowly, closed. Open, it stands still so the honeycomb is square to the camera; shut again, it turns on.
rb.key(root, "rotation_euler", 1, (0, 0, rad(-32)), "LINEAR")
rb.key(root, "rotation_euler", OPEN0 - 3, (0, 0, 0), "BEZIER", easing="EASE_OUT")
rb.key(root, "rotation_euler", CLOSE, (0, 0, 0), "LINEAR")
rb.key(root, "rotation_euler", T, (0, 0, rad(34)), "LINEAR")
# Studio strips sweeping across the metal: seen in glossy rays on purpose, and moving.
for i, (x, y, z, r1, r3, c, p_) in enumerate(((-9, -6, 7, 62, -56, "#e8fbf7", 900), (9, -4, 6, 60, 60, "#9fe3d6", 700), (0, 9, 8, -55, 0, "#7fd0ff", 500))):
    o = rb.strip(f"studio{i}", p_, 1.4, (x, y, z), (rad(r1), 0, rad(r3)), c, size_y=12, in_glossy=True)
    rb.key(o, "location", 1, (x - 4, y, z), "LINEAR")
    rb.key(o, "location", T, (x + 4, y, z), "LINEAR")

cam, look = rb.camera(44, (0, -15, 7.5), (0, 0, 0.3), fstop=11)
K = [
    (1, (0.0, -20.5, 8.2), (0, 0, 0.0)),
    (F(7.2), (0.0, -19.5, 8.0), (0, 0, 0.0)),
    (F(9.0), (0.0, -36.0, 6.0), (0, YROW, 4.3)),
    (CLOSE - 12, (0.9, -33.5, 5.6), (0, YROW, 4.4)),
    (CLOSE, (-1.8, -10.5, 5.0), (0, 0, 0.1)),
    (CLOSE + 2, (-1.7, -10.2, 4.85), (0, 0, 0.1)),
    (T, (-3.4, -10.6, 5.2), (0, 0, 0.0)),
]
for f, c, l in K:
    rb.key(cam, "location", f, Vector(c), "BEZIER", "AUTO_CLAMPED")
    rb.key(look, "location", f, Vector(l), "BEZIER", "AUTO_CLAMPED")
rb.shake(look, CLOSE, 0.16)

# Anchors for the labels: each plate's centre and its highest and lowest points on screen, per frame.
if rb.ARGS.get("anchors"):
    out = {}
    for f in range(1, T + 1):
        s.frame_set(f)
        rows = []
        for p in plates:
            pts = [w2c(s, s.camera, p.matrix_world @ Vector((Rad * math.cos(rad(60 * k)), Rad * math.sin(rad(60 * k)), 0))) for k in range(6)]
            c = w2c(s, s.camera, p.matrix_world @ Vector((0, 0, 0)))
            rows.append((round(c.x * 1920, 1), round((1 - max(q.y for q in pts)) * 1080, 1), round((1 - min(q.y for q in pts)) * 1080, 1)))
        out[f] = rows
    with open(rb.ARGS["anchors"], "w") as fh:
        json.dump(out, fh)
    print("ANCHORS_DONE", flush=True)
else:
    rb.finish()
