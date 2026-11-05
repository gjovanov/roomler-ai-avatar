# 07 Keynote Stage: a stage he never stood on. A curved LED wall plays the real Asahi Linux recording. Nobody's clip is in this scene:
# his cut-out and Helen's tile sit on top in HyperFrames, tracked to two planes with this camera's own perspective, between this plate
# (LAYER=back) and the desk layer (LAYER=front, alpha). Their pixels are only ever resampled.
import bpy, math, os, sys, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../tools/blender")))
import rb
from mathutils import Vector

F = lambda t: int(round(t * 30)) + 1
T = F(32.0)
LAYER = rb.ARGS.get("layer", "back")
front = LAYER == "front"
if front:
    rb.ARGS["alpha"] = "1"
s = rb.begin(frames=T, samples=48, world=(0.002, 0.005, 0.006))
rad = math.radians
HOOK = os.path.join(rb.VIDEOS, "macbook-120fps/out/visuals/vis-hook.mp4")

# ---------- the curved wall: 21 wide, 8 high, its middle 12 behind him ----------
WR, WH, ARC, WZ = 14.0, 8.0, rad(86), 0.45
wallm = rb.footage_mat("wall", HOOK, strength=0.74, start=F(5.0), offset=0, cyclic=True)
me = bpy.data.meshes.new("wall")
V, Fc, seg = [], [], 64
for i in range(seg + 1):
    a = -ARC / 2 + ARC * i / seg
    x, y = WR * math.sin(a), -WR * (1 - math.cos(a))
    V += [(x, y, WZ), (x, y, WZ + WH)]
for i in range(seg):
    Fc.append((i * 2, (i + 1) * 2, (i + 1) * 2 + 1, i * 2 + 1))
me.from_pydata(V, [], Fc)
uv = me.uv_layers.new(name="UVMap")
for p in me.polygons:
    for li in p.loop_indices:
        vi = me.loops[li].vertex_index
        uv.data[li].uv = ((vi // 2) / seg, vi % 2)
me.update()
wall = rb._obj("wall", me, wallm, (0, 12, 0), (0, 0, 0))
frame_m = rb.emit_mat("frame", rb.TEAL_L, 1.1)
for z_, n in ((WZ - 0.04, "lo"), (WZ + WH + 0.04, "hi")):
    cu = bpy.data.curves.new("edge" + n, "CURVE")
    cu.dimensions, cu.bevel_depth = "3D", 0.022
    sp = cu.splines.new("POLY")
    sp.points.add(seg)
    for i in range(seg + 1):
        a = -ARC / 2 + ARC * i / seg
        sp.points[i].co = (WR * math.sin(a), 12 - WR * (1 - math.cos(a)), z_, 1)
    o = bpy.data.objects.new("edge" + n, cu)
    s.collection.objects.link(o)
    cu.materials.append(frame_m)
rb.floor(rough=0.1, z=0, base="#050909")

# ---------- the numeral and the word that come up in front of the wall, behind him ----------
big_m = rb.mat("bigm", "#f5fbfa", rough=0.25, coat=1.0, emit="#ffffff", strength=0.3)
n56 = rb.text3d("n56", "56", 5.4, 0.42, big_m, (3.4, 6.5, -6), (rad(90), 0, 0), bevel=0.05)
FX56 = F(18.6)  # his voice says fifty-six
rb.show_between(n56, FX56 - 1, F(22.3))
rb.key(n56, "location", FX56 - 1, Vector((3.4, 6.5, -5)), "CUBIC", easing="EASE_OUT")
rb.key(n56, "location", FX56 + 13, Vector((3.4, 6.5, 2.9)))
rb.key(n56, "location", F(22.3) - 8, Vector((3.4, 6.5, 2.9)), "CUBIC", easing="EASE_IN")
rb.key(n56, "location", F(22.3), Vector((3.4, 6.5, -5)))
mg_m = rb.mat("mgm", "#26a69a", rough=0.25, coat=1.0, emit=rb.TEAL_L, strength=0.6)
mgmt = rb.text3d("mgmt", "MANAGEMENT", 1.6, 0.3, mg_m, (-0.75, 5.5, -5), (rad(90), 0, 0), bevel=0.04)
FXM = F(27.58)
rb.show_between(mgmt, FXM - 1, T)
rb.key(mgmt, "location", FXM - 1, Vector((-0.75, 5.5, -3)), "CUBIC", easing="EASE_OUT")
rb.key(mgmt, "location", FXM + 7, Vector((-0.75, 5.5, 5.15)))
rb.key(mgmt, "location", FXM + 12, Vector((-0.75, 5.5, 4.9)))
hit = rb.strip("hit", 0, 14, (-1, -3, 12), (rad(20), 0, 0), "#d6fff6", size_y=8)
for f, v in [(FXM - 1, 0), (FXM, 2600), (FXM + 22, 0)]:
    hit.data.energy = v
    hit.data.keyframe_insert("energy", frame=f)

# ---------- Helen's tall side screen: the plane her tile is tracked to, an amber edge, nothing inside ----------
HW, HH = 2.5, 3.75
HP = Vector((4.7, 1.6, 3.2))
HROT = (0, 0, rad(-20))
helen = rb.plane("helen", HW, HH, rb.emit_mat("hblack", "#050808", 1.0), HP, HROT)
ring = rb.emit_mat("helenring", "#f5b84a", 0.0)
hframe = rb.box("helenframe", (HW + 0.14, 0.05, HH + 0.14), ring, HP + Vector((0.01, 0.05, 0)), HROT)
rb.box("hpole", (0.06, 0.06, 1.3), rb.mat("hpm", "#111819", rough=0.3, metal=1.0), HP + Vector((0, 0.1, -2.45)))
for f, v in [(F(22.3), 0), (F(22.42), 2.2), (T, 1.5)]:
    rb.key_strength(ring, f, v)
for o in (helen, hframe):
    rb.show_between(o, F(22.3), T)

# ---------- the desk ----------
DZ = 2.05
desk_t = rb.mat("deskt", "#0a1212", rough=0.07, coat=1.0)
desk_f = rb.mat("deskf", "#070c0c", rough=0.3)
desk_e = rb.emit_mat("deske", rb.TEAL_L, 1.4)
GX, GY = -2.2, 0.0
desk = [
    rb.box("desktop", (7.2, 2.0, 0.12), desk_t, (GX, GY - 1.0, DZ), bevel=0.02),
    rb.box("deskfront", (7.0, 0.12, 2.05), desk_f, (GX, GY - 1.95, DZ / 2)),
    rb.box("deskedge", (7.22, 0.02, 0.022), desk_e, (GX, GY - 2.01, DZ - 0.04)),
    rb.box("deskedge2", (7.02, 0.02, 0.02), desk_e, (GX, GY - 2.01, 0.05)),
]
if front:
    # Only the desk: every other mesh is gone, so the layer's alpha is the desk's own shape.
    keep = set(desk)
    for o in list(s.objects):
        if o.type in ("MESH", "FONT", "CURVE") and o not in keep:
            o.hide_render = True
            if o.animation_data:
                o.animation_data_clear()
                o.hide_render = True

# ---------- light ----------
for i, (x, c, p) in enumerate(((-7, "#cfeff0", 700), (5, "#9fe6db", 500))):
    rb.strip(f"top{i}", p, 3, (x, -3, 9), (rad(14), 0, 0), c, size_y=5)
if not front:
    beam_m = rb.glow_mat("beam", "#bff2e8", 0.1, power=2.5)
    for x, r in ((-10.5, 15), (10.5, -15)):
        rb.cyl("beam", 2.2, 15, beam_m, (x, 4, 7.4), (0, rad(r), 0), r2=0.25, verts=32)
house = rb.strip("house", 900, 14, (0, -12, 9), (rad(50), 0, 0), "#eaf8ff", size_y=6)
for f, v in [(1, 900), (F(3.2), 900), (F(3.4), 160), (F(4.6), 160), (F(4.9), 900)]:  # "the hardest" dims the house once
    house.data.energy = v
    house.data.keyframe_insert("energy", frame=f)

# ---------- the camera: a slow arc on him, then a flight over him to the wall's real counter ----------
cam, look = rb.camera(40, (GX, -12, 3.4), (GX + 2, GY, 3.5), fstop=4.5)
K = [
    (1, (GX + 0.2, -12.4, 3.35), (GX + 2.3, GY, 3.45)),
    (F(10.6), (GX + 1.5, -12.0, 3.35), (GX + 2.3, GY, 3.45)),
    (F(12.3), (3.9, 0.8, 6.6), (6.1, 10.6, 6.95)),
    (F(17.9), (4.7, 2.3, 6.9), (6.1, 10.6, 7.15)),
    (F(19.8), (2.2, -5.5, 4.7), (3.2, 8, 4.9)),
    (F(22.3), (GX + 1.0, -12.0, 3.35), (GX + 2.3, GY, 3.45)),
    (F(26.6), (GX + 0.3, -12.2, 3.35), (GX + 2.3, GY, 3.5)),
    (F(27.6), (GX + 0.2, -11.5, 3.45), (GX + 2.0, GY, 3.6)),
    (T, (GX - 0.6, -11.8, 3.45), (GX + 2.0, GY, 3.6)),
]
for f, c, l in K:
    rb.key(cam, "location", f, Vector(c), "BEZIER", "AUTO_CLAMPED")
    rb.key(look, "location", f, Vector(l), "BEZIER", "AUTO_CLAMPED")
cam.data.dof.focus_object = None
cam.data.dof.focus_distance = 12
cam.data.dof.keyframe_insert("focus_distance", frame=F(10.6))
cam.data.dof.focus_distance = 9
cam.data.dof.keyframe_insert("focus_distance", frame=F(12.3))
cam.data.dof.keyframe_insert("focus_distance", frame=F(17.9))
cam.data.dof.focus_distance = 12
cam.data.dof.keyframe_insert("focus_distance", frame=F(19.8))

PW, PH = 3.46, 5.19  # his plane (512x768 proportions), the desk's top at 56% of its height
spot = rb.plane("goranspot", PW, PH, None, (GX, GY, DZ + PH * (0.56 - 0.5)))
spot.hide_render = True
if rb.ARGS.get("corners"):
    out = {"goran": [], "helen": []}
    for f in range(1, T + 1):
        s.frame_set(f)
        out["goran"].append([[round(a, 1), round(b, 1)] for a, b in rb.screen_corners(spot, PW, PH)])
        out["helen"].append([[round(a, 1), round(b, 1)] for a, b in rb.screen_corners(helen, HW, HH)])
    with open(rb.ARGS["corners"], "w") as fh:
        json.dump(out, fh)
    print("CORNERS_DONE", flush=True)
else:
    rb.finish()
