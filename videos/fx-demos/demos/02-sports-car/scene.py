# 02 Sports Car: a mouse pointer built as a sports car races across the real 120 fps recording and parks under its
# real fps counter. Two sets: a dark garage (0-9.2 s) and the road (9.2-13.9 s), far apart; the camera cuts between them.
import bpy, math, os, sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../tools/blender")))
import rb
from mathutils import Vector

F = lambda s: int(round(s * 30)) + 1
s = rb.begin(frames=int(13.95 * 30) + 1, samples=56)
s.render.use_motion_blur = True
s.render.motion_blur_shutter = 0.45
R = rb.VIDEOS
DRAG = os.path.join(R, "macbook-120fps/out/visuals/vis-drag.mp4")

paint = rb.mat("paint", rb.CORAL, rough=0.18, metal=0.05, coat=1.0)
white = rb.mat("white", "#f4f7f6", rough=0.22, coat=1.0)
dark = rb.mat("dark", "#0a0d0d", rough=0.35)
glass = rb.mat("canopy", "#0a1414", rough=0.03, coat=1.0)
rimw = rb.mat("rimw", "#d4e8e4", rough=0.18, metal=1.0)
head = rb.emit_mat("head", "#ffffff", 7.0)
# The classic pointer's outline, tip at the origin, y down, 19 units tall.
ARROW = [(0, 0), (0, 16), (4, 12.5), (6.8, 19), (9.5, 18), (6.6, 11.5), (11.5, 11.5)]
AK = 3.3 / 19  # car length 3.3 units
# Centre it; the tip leans along the direction of travel (the line from the tail stem's middle to the tip).
ACX, ACY = 5.0, 9.0
LEAN = math.atan2(8.15, 18.5)


def apt(q):
    x, y = (q[0] - ACX) * AK, -(q[1] - ACY) * AK
    c, s_ = math.cos(-LEAN), math.sin(-LEAN)
    return (x * c - y * s_, x * s_ + y * c)


def arrow(name, material, z, thick, offset=0.0, parent=None):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions, cu.fill_mode = "2D", "BOTH"
    cu.extrude, cu.offset, cu.bevel_depth, cu.bevel_resolution = thick, offset, 0.035, 3
    sp = cu.splines.new("POLY")
    sp.points.add(len(ARROW) - 1)
    for i, q in enumerate(ARROW):
        p = apt(q)
        sp.points[i].co = (p[0], p[1], 0, 1)
    sp.use_cyclic_u = True
    o = bpy.data.objects.new(name, cu)
    s.collection.objects.link(o)
    cu.materials.append(material)
    o.parent = parent
    o.location = (0, 0, z)
    return o


def build_car(tag):
    # Nose along +Y, on the ground at z=0.
    root = rb.empty("car" + tag)
    body = rb.empty("body" + tag, parent=root)
    arrow("edge" + tag, white, 0.40, 0.10, offset=0.09, parent=body)
    arrow("top" + tag, paint, 0.47, 0.13, parent=body)
    rb.sphere("canopy" + tag, 0.32, glass, (0.02, 0.2, 0.66), parent=body, scale=(0.72, 1.35, 0.5))
    wheels = []
    for x, y, r in ((0.60, 0.65, 0.2), (-0.56, 0.42, 0.2), (0.95, -0.55, 0.27), (-0.80, -0.70, 0.27)):
        w = rb.empty("wheel" + tag, (x, y, r), parent=root)
        rb.cyl("tyre" + tag, r, 0.2, dark, (0, 0, 0), (0, math.radians(90), 0), parent=w, bevel=0.03)
        rb.cyl("hub" + tag, r * 0.6, 0.215, rimw, (0, 0, 0), (0, math.radians(90), 0), verts=6, parent=w)
        wheels.append(w)
    tip = apt(ARROW[0])
    hl = []
    for dx in (-0.10, 0.10):
        hl.append(rb.sphere("hl" + tag, 0.05, head, (tip[0] * 0.9 + dx, tip[1] * 0.9 - 0.08, 0.5), parent=body, scale=(1.3, 0.7, 0.8)))
    tail = rb.emit_mat("tail" + tag, "#ff2010", 1.0)
    a, b = apt(ARROW[3]), apt(ARROW[4])
    tl = rb.box("taillight" + tag, (math.dist(a, b) * 0.95, 0.03, 0.06), tail, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.03, 0.5), (0, 0, math.atan2(b[1] - a[1], b[0] - a[0])), parent=body)
    rb.text3d("num" + tag, "120", 0.3, 0.004, rb.emit_mat("numw" + tag, "#ffffff", 1.0), (0.42, -0.1, 0.61), (0, 0, math.radians(-90)), parent=body)
    return root, body, wheels, tail


# ---------- the road: the recording itself, upright, on wet black glass ----------
W, H = 128.0, 72.0
roadm = rb.footage_mat("road", DRAG, strength=0.86, start=F(9.2), offset=60, cyclic=True)
nt = roadm.node_tree
out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
em = next(n for n in nt.nodes if n.type == "EMISSION")
gl = nt.nodes.new("ShaderNodeBsdfGlossy")
gl.inputs["Roughness"].default_value = 0.1
gl.inputs["Color"].default_value = (0.09, 0.1, 0.1, 1)
add = nt.nodes.new("ShaderNodeAddShader")
nt.links.new(em.outputs[0], add.inputs[0])
nt.links.new(gl.outputs[0], add.inputs[1])
nt.links.new(add.outputs[0], out.inputs[0])
road = rb.plane("road", W, H, roadm, (0, 0, 0), (math.radians(-90), 0, 0))
rb.plane("void", W * 6, H * 6, rb.mat("vd", "#030606", rough=0.25), (0, 0, -0.05), (math.radians(90), 0, 0))
# Overhead strips that show in the paint (seen in glossy rays on purpose: the paint needs them).
rb.strip("top", 26000, 22, (6, 0, 16), (0, 0, 0), "#f2fffb", size_y=90, in_glossy=True)
rb.strip("side", 1500, 3, (-22, -22, 9), (math.radians(60), 0, math.radians(-60)), "#b8ece2", size_y=60, in_glossy=True)

# The run: bottom-left over the colour bars, up to right under the recording's own counter tile.
Sx, Sy, Px, Py = -52.0, -24.0, 38.0, 14.2
ang = math.atan2(Py - Sy, Px - Sx)
heading = ang - math.radians(90)  # car's +Y on the path
dirv = Vector((math.cos(ang), math.sin(ang), 0))
perp = Vector((-dirv.y, dirv.x, 0))
car, body, wheels, tail = build_car("R")
T_in, T_brake, T_stop = F(9.2), F(10.6), F(11.6)
B = Vector((Sx, Sy, 0)) + dirv * 84  # brake point
rb.key(car, "location", T_in, Vector((Sx, Sy, 0)), "LINEAR")
rb.key(car, "location", T_brake, B, "BEZIER", easing="EASE_OUT")
rb.key(car, "location", T_stop, Vector((Px, Py, 0)))
rb.key(car, "rotation_euler", T_in, (0, 0, heading))
rb.key(car, "rotation_euler", T_brake - 1, (0, 0, heading), "BEZIER")
rb.key(car, "rotation_euler", T_brake + 13, (0, 0, heading + math.radians(58)))
rb.key(car, "rotation_euler", T_stop + 3, (0, 0, heading + math.radians(40)))
rb.key(body, "rotation_euler", T_brake, (0, 0, 0))
rb.key(body, "rotation_euler", T_brake + 8, (math.radians(-5), math.radians(6), 0))
rb.key(body, "rotation_euler", T_stop + 6, (math.radians(1.5), 0, 0))
rb.key(body, "rotation_euler", T_stop + 14, (0, 0, 0))
for w in wheels:
    rb.key(w, "rotation_euler", T_in, (0, 0, 0), "LINEAR")
    rb.key(w, "rotation_euler", T_brake, (math.radians(-14000), 0, 0), "BEZIER", easing="EASE_OUT")
    rb.key(w, "rotation_euler", T_stop, (math.radians(-15800), 0, 0))
for f, v in [(T_brake - 1, 1.0), (T_brake + 1, 9.0), (T_stop + 50, 6.0)]:
    rb.key_strength(tail, f, v)
under = rb.point("underglow", 26, (0, 0, 0.22), rb.TEAL_L, 0.4)
under.parent = car
# Trails: ribbons stretched from the start towards the car, then they burn out.
trail_m = rb.emit_mat("trail", rb.TEAL_L, 3.2)
for off in (0.62, -0.62):
    mid0 = Vector((Sx, Sy, 0.03)) + perp * off
    tr = rb.box("trail", (0.09, 1.0, 0.01), trail_m, mid0, (0, 0, heading))
    rb.key(tr, "location", T_in, mid0, "LINEAR")
    rb.key(tr, "scale", T_in, (1, 0.1, 1), "LINEAR")
    rb.key(tr, "location", T_brake, mid0 + dirv * 42, "BEZIER")
    rb.key(tr, "scale", T_brake, (1, 84, 1), "BEZIER")
    rb.key(tr, "location", T_stop, mid0 + dirv * 62, "BEZIER")
    rb.key(tr, "scale", T_stop, (0.6, 40, 1), "BEZIER")
    rb.key(tr, "location", T_stop + 14, mid0 + dirv * 90, "BEZIER")
    rb.key(tr, "scale", T_stop + 14, (0.1, 0.1, 1))
for f, v in [(T_in, 3.2), (T_stop, 1.6), (T_stop + 14, 0)]:
    rb.key_strength(trail_m, f, v)

# ---------- the garage, far away: the real counter on the back wall, the same car in the dark ----------
G = Vector((0, 1400, 0))
rb.plane("gfloor", 70, 70, rb.mat("gfl", "#060b0b", rough=0.1), G, (math.radians(90), 0, 0))
counter = rb.footage_mat("counter", DRAG, strength=0.7, start=1, offset=0, cyclic=True)
rb.plane("gwall", 21.3, 12, counter, G + Vector((0, 9, 6.0)))
car2, _, _, tail2 = build_car("G")
car2.location = G + Vector((3.1, 0.2, 0))
car2.rotation_euler = (0, 0, math.radians(-132))
for i, (dx, dy, tf) in enumerate(((1.6, -1.6, 7.47), (-1.4, 0.9, 7.82), (0, 0, 8.14))):
    l = bpy.data.lights.new(f"spot{i}", "SPOT")
    l.spot_size, l.spot_blend, l.shadow_soft_size, l.color = math.radians(42 if i < 2 else 70), 0.35, 0.1, (1, 0.97, 0.9)
    o = bpy.data.objects.new(f"spot{i}", l)
    s.collection.objects.link(o)
    o.location = G + Vector((3.1 + dx, 0.2 + dy, 9.5))
    for f, v in [(1, 0), (F(tf) - 1, 0), (F(tf), 9000), (F(tf) + 2, 3600)]:
        l.energy = v
        l.keyframe_insert("energy", frame=f)
for f, v in [(1, 0.25), (F(7.46), 0.25), (F(7.47), 1.0)]:
    rb.key_strength(tail2, f, v)

# ---------- the camera, hard cuts between the sets ----------
cam, look = rb.camera(38, (0, 0, 2), (0, 0, 0), fstop=2.4)
def cam_key(f, c, l, kind="BEZIER"):
    rb.key(cam, "location", f, Vector(c), kind)
    rb.key(look, "location", f, Vector(l), kind)

g = lambda x, y, z: (G.x + x, G.y + y, G.z + z)
cam_key(1, g(0.2, -13.5, 4.8), g(0.2, 1.5, 3.2), "LINEAR")
cam_key(F(9.15), g(1.0, -9.5, 3.4), g(1.6, 0.5, 1.4), "CONSTANT")
# Chase: behind and above the car, at its speed, a little lag, so the road streams past.
def chase(pos, back=8.5, side=2.6, up=3.7, ahead=4.0):
    return pos - dirv * back + perp * side + Vector((0, 0, up)), pos + dirv * ahead + Vector((0, 0, 0.3))

c0, l0 = chase(Vector((Sx, Sy, 0)))
cam_key(T_in, c0, l0, "LINEAR")
c1, l1 = chase(B - dirv * 5)
cam_key(T_brake - 4, c1, l1, "BEZIER")
# Whip round to the front, ending upright to the recording, the counter tile behind the parked car.
P = Vector((Px, Py, 0))
cam_key(T_stop + 2, P + Vector((-0.6, -9.4, 5.4)), P + Vector((2.2, 3.0, 0.3)))
cam_key(F(13.95), P + Vector((4.4, -10.0, 4.8)), P + Vector((2.6, 3.4, 0.3)))
cam.data.dof.focus_object = None
cam.data.dof.use_dof = True
cam.data.dof.aperture_fstop = 4.0
def focus_at(f, d):
    cam.data.dof.focus_distance = d
    cam.data.dof.keyframe_insert("focus_distance", frame=f)
focus_at(1, 15)
focus_at(F(9.15), 11)
focus_at(T_in, 9.5)
focus_at(T_stop + 2, 11.0)
rb.finish()
