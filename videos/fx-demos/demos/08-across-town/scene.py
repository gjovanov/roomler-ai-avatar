# 08 Across Town: a toy town at dusk really sits on a planet of teal dots; one camera move lifts from a driveway to the whole Earth.
# Land dots come from real map data (kit/land.json, built from the world-map data the HyperFrames registry ships). Arcs are decoration.
import bpy, bmesh, math, os, sys, json, random
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../tools/blender")))
import rb
from mathutils import Vector, Matrix

F = lambda t: int(round(t * 30)) + 1
T = F(28.0)
s = rb.begin(frames=T, samples=44, world=(0.012, 0.034, 0.038))
wbg = s.world.node_tree.nodes["Background"].inputs[1]
for t_, v_ in ((12.0, 1.0), (15.0, 0.06)):
    wbg.default_value = v_
    wbg.keyframe_insert("default_value", frame=int(t_ * 30) + 1)
rad = math.radians
rd = random.Random(21)
RE = 2600.0  # the planet's radius; a house is about 1 unit, so the town is really on it
LAND = json.load(open(os.path.join(os.path.dirname(__file__), "../../kit/land.json")))

# ---------- the planet: a dark sphere, dots on land, centred so the town (lat 48, lon 16) sits exactly at the top ----------
LAT0, LON0 = rad(48), rad(16)
M = (Matrix.Rotation(rad(90) - LAT0, 4, "X") @ Matrix.Rotation(-LON0 - rad(90) + rad(180), 4, "Z"))
def ll(lat, lon):
    la, lo = rad(lat), rad(lon)
    return M @ Vector((math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)))
globe = rb.sphere("globe", RE, rb.emit_mat("sea", "#062322", 1.0), (0, 0, -RE), seg=128)
# The limb: a thin shell, bright only at its edge.
atm = bpy.data.materials.new("atm")
atm.use_nodes = True
nt = atm.node_tree
nt.nodes.clear()
o_, e_, tr_, mx_, lw_, pw_ = (nt.nodes.new(n) for n in ("ShaderNodeOutputMaterial", "ShaderNodeEmission", "ShaderNodeBsdfTransparent", "ShaderNodeMixShader", "ShaderNodeLayerWeight", "ShaderNodeMath"))
e_.inputs[0].default_value = rb.rgba("#2BD4C0")
e_.inputs[1].default_value = 1.6
lw_.inputs[0].default_value = 0.5
pw_.operation = "POWER"
pw_.inputs[1].default_value = 5.0
nt.links.new(lw_.outputs["Facing"], pw_.inputs[0])
nt.links.new(pw_.outputs[0], mx_.inputs[0])
nt.links.new(tr_.outputs[0], mx_.inputs[1])
nt.links.new(e_.outputs[0], mx_.inputs[2])
nt.links.new(mx_.outputs[0], o_.inputs[0])
shell = rb.sphere("atm", RE * 1.035, atm, (0, 0, -RE), seg=128)
rb.show_between(shell, F(13.2), T)
dots_m = rb.emit_mat("dots", "#2BD4C0", 0.75)
bm = bmesh.new()
DOT = RE * 0.0052
for lat, lon in LAND:
    n = ll(lat, lon)
    # Leave a hole where the town stands.
    if n.z > math.cos(rad(1.2)):
        continue
    c = n * (RE * 1.0008) - Vector((0, 0, RE))
    t = n.orthogonal().normalized()
    b = n.cross(t)
    vs = [bm.verts.new(c + (t * math.cos(a) + b * math.sin(a)) * DOT) for a in (0, 1.047, 2.094, 3.142, 4.189, 5.236)]
    bm.faces.new(vs)
me = bpy.data.meshes.new("dots")
bm.to_mesh(me)
bm.free()
rb._obj("dots", me, dots_m)

# ---------- the town: on a little patch of ground on the planet's top (the curve over this size is under a unit) ----------
rb.cyl("ground", 90, 2.0, rb.mat("gr", "#3a5a48", rough=0.8), (0, 0, -1.0), verts=64)
road_m = rb.mat("road", "#3f4449", rough=0.7)
line_m = rb.mat("rline", "#8d8f7a", rough=0.6)
wall_cols = ["#cdbfa7", "#b9a78f", "#a9b2a6", "#c6a88d", "#9fb0b5", "#d7cdbb"]
roof_cols = ["#6b3b32", "#54322c", "#3d4a4e", "#6e4a33", "#4a3b35"]
glass_warm = [rb.emit_mat(f"win{i}", c, 3.0) for i, c in enumerate(("#ffd38a", "#ffc36b", "#ffe1ad"))]
glass_off = rb.mat("winoff", "#141a20", rough=0.2)
tree_m = [rb.mat(f"tree{i}", c, rough=0.8) for i, c in enumerate(("#2f5a3a", "#27503c", "#3b6a3f"))]
trunk_m = rb.mat("trunk", "#3a2a1f", rough=0.8)
walls = [rb.mat(f"wl{i}", c, rough=0.75) for i, c in enumerate(wall_cols)]
roofs = [rb.mat(f"rf{i}", c, rough=0.7) for i, c in enumerate(roof_cols)]
GRID, STEP = 5, 10.0  # blocks in a grid; streets on the block lines
for i in range(-GRID, GRID + 1):
    rb.box("rx", (GRID * STEP * 2 + 10, 1.6, 0.05), road_m, (0, i * STEP, 0.02))
    rb.box("ry", (1.6, GRID * STEP * 2 + 10, 0.05), road_m, (i * STEP, 0, 0.022))
def house(x, y, rz, wi=None):
    w_, d_, h_ = rd.uniform(1.5, 2.1), rd.uniform(1.5, 2.2), rd.uniform(1.1, 1.8)
    root = rb.empty("house", (x, y, 0), (0, 0, rz))
    rb.box("wall", (w_, d_, h_), rd.choice(walls), (0, 0, h_ / 2), parent=root)
    me = bpy.data.meshes.new("roof")
    r_h = rd.uniform(0.55, 0.95)
    me.from_pydata([(-w_ / 2 - 0.1, -d_ / 2 - 0.1, h_), (w_ / 2 + 0.1, -d_ / 2 - 0.1, h_), (w_ / 2 + 0.1, d_ / 2 + 0.1, h_), (-w_ / 2 - 0.1, d_ / 2 + 0.1, h_), (-w_ / 2 - 0.1, 0, h_ + r_h), (w_ / 2 + 0.1, 0, h_ + r_h)], [], [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5)])
    rb._obj("roof", me, rd.choice(roofs), (0, 0, 0), (0, 0, 0), root)
    win = wi or rd.choice(glass_warm + [glass_off])
    for dx in (-w_ / 4, w_ / 4):
        rb.box("win", (0.34, 0.03, 0.42), win, (dx, -d_ / 2 - 0.005, h_ * 0.58), parent=root)
    rb.box("door", (0.3, 0.03, 0.55), rb.mat("dr", "#2d1f19", rough=0.5), (0, d_ / 2 + 0.005, 0.28), parent=root)
    return root
def tree(x, y):
    h_ = rd.uniform(0.8, 1.2)
    rb.cyl("tr", 0.07, h_, trunk_m, (x, y, h_ / 2), verts=8)
    rb.sphere("cr", rd.uniform(0.45, 0.75), rd.choice(tree_m), (x, y, h_ + 0.25), seg=12)
FROM = (-30.0, -10.0)  # the house the car leaves
TO = (30.0, 20.0)      # the house across town
tgt_win = rb.emit_mat("tgtwin", "#ffd38a", 3.0)
for ix in range(-GRID, GRID):
    for iy in range(-GRID, GRID):
        cx, cy = (ix + 0.5) * STEP, (iy + 0.5) * STEP
        for ax in (-2.5, 2.5):
            for ay in (-2.5, 2.5):
                x, y = cx + ax, cy + ay
                if abs(x - (FROM[0] - 2.5)) < 0.1 and abs(y - (FROM[1] + 2.5)) < 0.1:
                    continue
                if rd.random() < 0.82:
                    house(x, y, rd.choice((0, rad(90), rad(180), rad(-90))), None)
                else:
                    tree(x, y)
hF = house(FROM[0] - 2.5, FROM[1] + 2.5, 0)
hT = house(TO[0] - 2.5, TO[1] + 2.5, 0, tgt_win)
for f, c in [(F(8.2), 3.0), (F(8.4), 4.5)]:
    rb.key_strength(tgt_win, f, c)
for n in tgt_win.node_tree.nodes:
    if n.type == "EMISSION":
        n.inputs[0].default_value = rb.rgba("#ffd38a")
        n.inputs[0].keyframe_insert("default_value", frame=F(8.2))
        n.inputs[0].default_value = rb.rgba(rb.TEAL_L)
        n.inputs[0].keyframe_insert("default_value", frame=F(8.4))
# Beyond the grid a darker patch of town that the camera only sees from high up.
for i in range(420):
    a, r_ = rd.uniform(0, 6.28), rd.uniform(66, 88)
    rb.box("far", (1.4, 1.4, rd.uniform(1, 2.2)), rd.choice(walls), (r_ * math.cos(a), r_ * math.sin(a), 0.7))

# ---------- the car ----------
car = rb.empty("car", (FROM[0], FROM[1], 0))
car.scale = (1.9, 1.9, 1.9)
rb.box("cbody", (0.62, 1.15, 0.26), rb.mat("cpaint", rb.CORAL, rough=0.25, coat=1.0), (0, 0, 0.24), parent=car, bevel=0.05)
rb.box("ccab", (0.54, 0.6, 0.22), rb.mat("cglass", "#10191d", rough=0.1, coat=1.0), (0, -0.05, 0.46), parent=car, bevel=0.05)
for x in (-0.33, 0.33):
    for y in (-0.36, 0.36):
        rb.cyl("cw", 0.12, 0.1, rb.mat("tyr", "#0c0c0c", rough=0.6), (x, y, 0.12), (0, rad(90), 0), parent=car)
    rb.sphere("hl", 0.04, rb.emit_mat("hlw", "#fff4d6", 10), (x * 0.7, 0.58, 0.26), parent=car)
    rb.sphere("tl", 0.035, rb.emit_mat("tlw", "#ff3020", 3), (x * 0.7, -0.58, 0.28), parent=car)
for x in (-0.15, 0.15):
    l = bpy.data.lights.new("headl", "SPOT")
    l.energy, l.spot_size, l.spot_blend, l.color = 7, rad(46), 0.6, (1, 0.93, 0.76)
    o = bpy.data.objects.new("headl", l)
    s.collection.objects.link(o)
    o.parent = car
    o.location = (x, 0.6, 0.3)
    o.rotation_euler = (rad(82), 0, 0)
# The route along the streets, with one stop and a U-turn home.
R = [(1.0, FROM[0], FROM[1], 0), (2.2, FROM[0], FROM[1] + 0.0, 0), (3.4, -10, -10, -90), (4.6, -10, 0, 0), (5.8, 0, 0, -90), (7.6, 8, 0, -90), (8.7, 11.0, 0, -90), (9.4, 11.0, 0, -90), (10.1, 10.0, 0, 90), (11.0, 2.0, 0, 90), (12.5, -9.8, 0, 90), (14.0, -10, -10, 180)]
for t, x, y, h_ in R:
    rb.key(car, "location", F(t), Vector((x, y, 0)))
    rb.key(car, "rotation_euler", F(t), (0, 0, rad(h_)))

# ---------- the arc: from the first house to the house across town, a glowing tube growing along its length ----------
def arc_curve(name, a, b, height, material, t0, t1, bevel):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions, cu.bevel_depth, cu.bevel_resolution = "3D", bevel, 2
    sp = cu.splines.new("POLY")
    sp.points.add(39)
    for i in range(40):
        q = i / 39
        p = a.lerp(b, q) + (a + b).normalized() * 0 + Vector((0, 0, height * 4 * q * (1 - q)))
        sp.points[i].co = (*p, 1)
    cu.bevel_factor_start, cu.bevel_factor_end = 0, 0
    cu.keyframe_insert("bevel_factor_end", frame=F(t0))
    cu.bevel_factor_end = 1
    cu.keyframe_insert("bevel_factor_end", frame=F(t1))
    o = bpy.data.objects.new(name, cu)
    s.collection.objects.link(o)
    cu.materials.append(material)
    return o
arc_m = rb.emit_mat("arc", "#2BD4C0", 3.2)
arc_curve("arc", Vector((FROM[0] - 2.5, FROM[1] + 2.5, 2.5)), Vector((TO[0] - 2.5, TO[1] + 2.5, 2.5)), 9, arc_m, 5.8, 7.9, 0.13)

# Global arcs: the planet's own, on the way out. Decoration: picked from land, no real place of any machine.
glow_m = rb.emit_mat("arcg", "#2BD4C0", 2.0)
ends = [(40, -74), (51, 0), (35, 139), (-33, 151), (19, 72), (-23, -46), (1, 103), (60, 18), (37, -122), (6, 3), (55, 37), (-34, 18)]
top = Vector((0, 0, 0))
for i, (la, lo) in enumerate(ends):
    b = ll(la, lo) * RE - Vector((0, 0, RE))
    ang = math.acos(max(-1, min(1, ll(la, lo).z)))
    t0 = 15.1 + i * 0.13
    cu_pts = []
    cu = bpy.data.curves.new(f"ga{i}", "CURVE")
    cu.dimensions, cu.bevel_depth, cu.bevel_resolution = "3D", RE * 0.0016, 1
    sp = cu.splines.new("POLY")
    sp.points.add(49)
    nb = ll(la, lo)
    n0 = Vector((0, 0, 1))
    om = max(ang, 1e-3)
    for j in range(50):
        q = j / 49
        u = (math.sin((1 - q) * om) * n0 + math.sin(q * om) * nb) / math.sin(om)
        r_ = RE * (1.002 + 0.22 * ang / math.pi * 4 * q * (1 - q))
        p = u.normalized() * r_ - Vector((0, 0, RE))
        sp.points[j].co = (*p, 1)
    cu.bevel_factor_end = 0
    cu.keyframe_insert("bevel_factor_end", frame=F(t0))
    cu.bevel_factor_end = 1
    cu.keyframe_insert("bevel_factor_end", frame=F(t0 + 1.2))
    o = bpy.data.objects.new(f"ga{i}", cu)
    s.collection.objects.link(o)
    cu.materials.append(glow_m)

# ---------- light: a low warm sun for the toy town, a long shadow, a teal dusk ----------
sun = bpy.data.lights.new("sun", "SUN")
sun.energy, sun.angle, sun.color = 2.6, rad(4), (1.0, 0.74, 0.52)
so = bpy.data.objects.new("sun", sun)
s.collection.objects.link(so)
so.rotation_euler = (rad(74), 0, rad(-48))
fill = bpy.data.lights.new("fill", "SUN")
fill.energy, fill.color = 0.55, (0.5, 0.75, 0.85)
fo = bpy.data.objects.new("fill", fill)
s.collection.objects.link(fo)
fo.rotation_euler = (rad(30), 0, rad(140))

# ---------- the camera: over the rooftops with miniature focus, then exponential altitude ----------
cam, look = rb.camera(55, (-34, -38, 22), (-18, -6, 0), fstop=0.9)
def lift(t):
    # 12 s to 16.5 s: from 40 units up to 11,000.
    q = rb.ease((t - 12.0) / 4.5, "smooth")
    return 40 * (11000 / 40) ** q
keys = [(0.0, (-34, -38, 22), (-20, -7, 0)), (2.5, (-30, -34, 20), (-14, -5, 0)), (4.6, (-20, -32, 22), (-6, -2, 0)), (5.8, (-8, -46, 36), (0, 6, 0)), (8.0, (-2, -48, 38), (2, 7, 0)), (10.5, (-4, -38, 28), (5, 0, 0)), (12.0, (-14, -36, 28), (0, 0, 0))]
for t, c, l in keys:
    rb.key(cam, "location", F(t), Vector(c))
    rb.key(look, "location", F(t), Vector(l))
for f in range(F(12.0), T + 1, 3):
    t = (f - 1) / 30.0
    z = lift(t)
    # While rising, the aim moves from the town to the planet's middle; the planet keeps turning slowly under the camera.
    q = rb.ease((t - 13.5) / 3.0, "smooth")
    rb.key(cam, "location", f, Vector((-14 * (1 - q), -32 - z * 0.75 * (1 - q * 0.4), 26 + z * (0.62 + 0.3 * q) )), "LINEAR")
    rb.key(look, "location", f, Vector((-1500 * q, 0, -RE * q)), "LINEAR")
# The focus opens as we leave.
cam.data.dof.focus_object = None
def fo_(f, d_, st):
    cam.data.dof.focus_distance = d_
    cam.data.dof.aperture_fstop = st
    cam.data.dof.keyframe_insert("focus_distance", frame=f)
    cam.data.dof.keyframe_insert("aperture_fstop", frame=f)
fo_(1, 44, 0.9)
fo_(F(4.6), 44, 0.9)
fo_(F(5.8), 62, 1.4)
fo_(F(8.0), 62, 1.4)
fo_(F(10.5), 46, 1.2)
fo_(F(12.0), 46, 1.4)
fo_(F(14.0), 800, 16)
fo_(T, 12000, 64)
cam.data.clip_end = 200000
rb.finish()
