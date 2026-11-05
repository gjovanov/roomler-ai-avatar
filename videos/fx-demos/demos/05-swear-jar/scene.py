# 05 Friday Night: a dialog dies under a storm of 3D swear glyphs, time stops, the storm becomes the logo. Vertical.
# The physics runs once (rigid bodies) and is saved as an array; every rendered frame is a lookup, so frames stay independent.
# Two layers: LAYER=back renders the world behind him; LAYER=front renders only what falls in front of him, with alpha.
import bpy, math, os, sys, random
import numpy as np
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../tools/blender")))
import rb
from mathutils import Vector, Quaternion, Matrix

F = lambda t: int(round(t * 30)) + 1
T = F(32.0)
LAYER = rb.ARGS.get("layer", "back")
if LAYER == "front":
    rb.ARGS["alpha"] = "1"
s = rb.begin(frames=T, res=(1080, 1920), samples=44, world=(0.003, 0.009, 0.009))
OUT = os.path.join(rb.VIDEOS, "fx-demos/out/05-swear-jar")
os.makedirs(OUT, exist_ok=True)
SIM = os.path.join(OUT, "sim.npz")
rad = math.radians
rd = random.Random(11)

# ---------- glyph meshes ----------
coral_m = rb.mat("coral", rb.CORAL, rough=0.2, coat=1.0)
amber_m = rb.mat("amber", rb.AMBER, rough=0.2, coat=1.0)
white_m = rb.mat("wm", "#f2f7f6", rough=0.25, coat=1.0)
GL = "#@$%&!*"
glyph_mesh = {}
for ch in GL:
    o = rb.text3d("g" + ch, ch, 1.0, 0.13, None, (0, 0, 0), (0, 0, 0), bevel=0.018)
    o.data.resolution_u = 4
    o.data.align_x, o.data.align_y = "CENTER", "CENTER"
    me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    me.name = "gm" + ch
    me.materials.append(coral_m)
    glyph_mesh[ch] = me
    bpy.data.objects.remove(o)

# Waves: (sound time, count, material, scale). "hot", "spicy", "juicy". Falling time from height h: sqrt(2h/g).
WAVES = [(15.43, 30, coral_m, (0.8, 1.25)), (16.29, 54, amber_m, (0.9, 1.55)), (17.21, 240, None, (0.7, 1.9))]
G = 9.0
glyphs = []
for hit, n, m_, (a, b) in WAVES:
    for i in range(n):
        ch = rd.choice(GL)
        sc = rd.uniform(a, b)
        x, y = rd.uniform(-3.4, 3.4), rd.uniform(-2.6, 2.6)
        arrive = hit + (rd.uniform(-0.08, 0.45) if m_ else rd.uniform(0.0, 2.1))
        glyphs.append(dict(ch=ch, sc=sc, x=x, y=y, arrive=arrive, m=m_ or rd.choice((coral_m, amber_m, white_m)), rot=(rd.uniform(0, 6.3), rd.uniform(0, 6.3), rd.uniform(0, 6.3))))
glyphs.sort(key=lambda g: g["arrive"])

# The dialog as a wall of shards: a grid of small slabs, each carrying its part of the dialog's face.
DW, DH, GX, GZ, DZ = 5.6, 3.6, 8, 6, 3.2
dlg_img = os.path.join(rb.VIDEOS, "fx-demos/out/brand/session-closed.png")
dialog_m = rb.still_mat("dialog", dlg_img, 1.0)
shards = []
for ix in range(GX):
    for iz in range(GZ):
        w, h = DW / GX, DH / GZ
        cx, cz = -DW / 2 + (ix + 0.5) * w, DZ - DH / 2 + (iz + 0.5) * h
        me = bpy.data.meshes.new("sh")
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=(w * 0.992, 0.14, h * 0.992), verts=bm.verts)
        uvl = bm.loops.layers.uv.new("UVMap")
        for fa in bm.faces:
            for lo in fa.loops:
                vx, _, vz = lo.vert.co
                lo[uvl].uv = ((cx + vx + DW / 2) / DW, (cz + vz - (DZ - DH / 2)) / DH)
        bm.to_mesh(me)
        bm.free()
        shards.append(dict(me=me, loc=(cx, 0.0, cz)))

# ---------- the simulation, once ----------
def simulate():
    sc = bpy.context.scene
    bpy.ops.rigidbody.world_add()
    w = sc.rigidbody_world
    w.substeps_per_frame = 6
    w.solver_iterations = 14
    w.point_cache.frame_start, w.point_cache.frame_end = 1, T
    sc.gravity = (0, 0, -G)
    bodies = []
    fl = rb.plane("simfloor", 80, 80, None, (0, 0, 0), (rad(-90), 0, 0))
    bpy.context.view_layer.objects.active = fl
    bpy.ops.rigidbody.object_add(type="PASSIVE")
    for sh in shards:
        o = rb._obj("sh", sh["me"], None, sh["loc"])
        bpy.context.view_layer.objects.active = o
        bpy.ops.rigidbody.object_add(type="ACTIVE")
        o.rigid_body.collision_shape, o.rigid_body.mass = "BOX", 0.4
        o.rigid_body.kinematic = True
        o.rigid_body.keyframe_insert("kinematic", frame=1)
        o.rigid_body.kinematic = False
        o.rigid_body.keyframe_insert("kinematic", frame=F(17.72) + 1)
        bodies.append(o)
    for g in glyphs:
        # Drop height so each glyph reaches the dialog's top at its time; hidden far above until then.
        o = rb._obj("gl", glyph_mesh[g["ch"]], None)
        o.scale = (g["sc"],) * 3
        o.rotation_euler = g["rot"]
        h0 = 0.5 * G * 1.25 ** 2
        t_spawn = g["arrive"] - 1.25
        o.location = (g["x"], g["y"] * 0.55, DZ + DH / 2 + h0)
        bpy.context.view_layer.objects.active = o
        bpy.ops.rigidbody.object_add(type="ACTIVE")
        o.rigid_body.collision_shape, o.rigid_body.mass, o.rigid_body.restitution, o.rigid_body.friction = "CONVEX_HULL", 0.3, 0.25, 0.6
        o.rigid_body.kinematic = True
        o.rigid_body.keyframe_insert("kinematic", frame=1)
        o.rigid_body.kinematic = False
        o.rigid_body.keyframe_insert("kinematic", frame=F(t_spawn) + 1)
        bodies.append(o)
    FREEZE = F(18.45)
    data = np.zeros((FREEZE + 1, len(bodies), 7), dtype=np.float32)
    for f in range(1, FREEZE + 1):
        sc.frame_set(f)
        for j, o in enumerate(bodies):
            m = o.matrix_world
            lo, q, _ = m.decompose()
            data[f, j, :3], data[f, j, 3:] = lo, q
        if f % 60 == 0:
            print("sim frame", f, flush=True)
    np.savez_compressed(SIM, data=data)
    sc.rigidbody_world.enabled = False
    for o in bodies + [fl]:
        bpy.data.objects.remove(o)
    bpy.ops.rigidbody.world_remove()


if not os.path.exists(SIM):
    simulate()
data = np.load(SIM)["data"]
FREEZE = data.shape[0] - 1
NSH = len(shards)

# ---------- the world ----------
is_front = LAYER == "front"
if not is_front:
    rb.floor(rough=0.14, z=0)
    # A dark office: two desks and a window at night, just shapes.
    deskm = rb.mat("deskm", "#0c1716", rough=0.4)
    rb.box("desk", (10, 3, 0.2), deskm, (0, 3.2, 1.6))
    for x in (-4.6, 4.6):
        rb.box("dleg", (0.2, 2.6, 1.6), deskm, (x, 3.2, 0.8))
    rb.strip("rim", 700, 2, (8, 5, 10), (rad(-40), 0, rad(55)), "#a8e6da", size_y=14)
    rb.strip("rim2", 500, 2, (-8, 4, 8), (rad(-40), 0, rad(-55)), "#6fc9ff", size_y=14)
    rb.strip("key", 1100, 12, (0, -8, 12), (rad(40), 0, 0), "#e8f4ff", size_y=8)
    # FRI SAT SUN MON flip cards on the word "waits until Monday" (6.9-9.0).
    for i, (txt, tf) in enumerate((("FRI", 6.9), ("SAT", 7.4), ("SUN", 7.9), ("MON", 8.46))):
        c = rb.empty("card", (-2.7 + i * 1.8, 0.2, 0.0))
        rb.box("cardb", (1.55, 0.1, 1.55), rb.mat("cardm", "#17302c" if txt != "MON" else "#7a2320", rough=0.3), (0, 0, 0), parent=c, bevel=0.05)
        rb.text3d("cardt", txt, 0.56, 0.015, rb.emit_mat("cardtm", "#ffffff", 1.0), (0, -0.07, 0), parent=c)
        rb.show_between(c, F(tf), F(9.05))
        rb.key(c, "location", F(tf), Vector((-2.7 + i * 1.8, 0.2, 7.0)), "CUBIC", easing="EASE_OUT")
        rb.key(c, "location", F(tf) + 8, Vector((-2.7 + i * 1.8, -0.4, 5.7)))
        rb.key(c, "rotation_euler", F(tf), (rad(-110), 0, 0), "CUBIC", easing="EASE_OUT")
        rb.key(c, "rotation_euler", F(tf) + 8, (0, 0, 0))

objs = []
for sh in shards:
    o = rb._obj("shard", sh["me"], dialog_m)
    objs.append(o)
for g in glyphs:
    o = rb._obj("glyph", glyph_mesh[g["ch"]], None)
    o.material_slots[0].link = "OBJECT"
    o.scale = (g["sc"],) * 3
    if True:
        o.material_slots[0].material = g["m"]
    objs.append(o)

# The dialog blinks on "closes" (a tiny lift), then waits.
# Target layout for the assembly: the logo's strokes, sampled, in the frozen plane in front of the camera.
targets = []
LK = 5.4 / 120.0
LZ, LY = 8.2, -5.2
def lp(p):
    return Vector(((p[0] - 60) * LK, LY, LZ + (60 - p[1]) * LK))
stroke = []
for i in range(48):
    a = 2 * math.pi * i / 48
    stroke.append((60 + 50 * math.cos(a), 60 + 50 * math.sin(a)))
for a, c, b in rb.LOGO_Q:
    for i in range(10):
        t = i / 10
        stroke.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]))
for a, b in rb.LOGO_L:
    for i in range(10):
        t = i / 10
        stroke.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
rd2 = random.Random(3)
rd2.shuffle(stroke)
NG = len(glyphs)
for i in range(NG):
    targets.append(lp(stroke[i % len(stroke)]))
ASSEMBLE0, ASSEMBLE1 = F(22.8), F(25.2)
finale = rb.logo3d(size=5.4, glow=1.05)
finale.location = (0, LY, LZ)
rb.show_between(finale, F(25.0), T)
for n in finale.children:
    pass


def on_frame(f):
    # Up to the freeze, the saved simulation; through the freeze, a slow drift; then each glyph flies to its target.
    fi = min(f, FREEZE)
    d = data[fi]
    drift = max(0, f - FREEZE) * 0.0009
    for j, o in enumerate(objs):
        lo = Vector(d[j, :3])
        q = Quaternion(d[j, 3:])
        scale = o.scale.copy()
        hidden = False
        if j >= NSH:
            g = glyphs[j - NSH]
            # A glyph waits above the frame until it falls: unseen, so the storm comes out of nothing.
            hidden = f < F(g["arrive"] - 1.25)
            # Not born yet: still at its kinematic start, far above the frame.
            k = (f - (ASSEMBLE0 + (j - NSH) * 0.25)) / (ASSEMBLE1 - ASSEMBLE0 - NG * 0.25 + 12)
            if f >= ASSEMBLE0:
                e = rb.ease(k, "inout")
                lo = lo.lerp(targets[j - NSH], e)
                q = q.slerp(Quaternion((1, 0, 0), rad(90)), e)
                sc0 = g["sc"] * (1 - e) + 0.34 * e
                # Once on its stroke a glyph melts into the line: the logo itself stays untouched.
                sc0 *= 1 - rb.ease((f - ASSEMBLE1 - 4 - (j - NSH) % 9) / 14.0, "smooth")
                scale = Vector((sc0, sc0, sc0))
                hidden = sc0 < 0.002
            elif f > FREEZE:
                # Drifting apart a hair, so the frozen storm is alive to the camera only.
                q = q @ Quaternion((0, 0, 1), drift * (1 if j % 2 else -1))
            if is_front:
                hidden = hidden or lo.y > -0.6 or f >= ASSEMBLE0
                if not hidden:
                    # Over his face it stays in the back layer, so nothing ever covers him mid-word.
                    from bpy_extras.object_utils import world_to_camera_view as w2c
                    p = w2c(s, s.camera, lo)
                    px, py = p.x * 1080, (1 - p.y) * 1920
                    if 60 < px < 640 and 1180 < py < 1720:
                        hidden = True
        else:
            if f >= ASSEMBLE0:
                k = (f - ASSEMBLE0) / 30.0
                lo = lo + Vector((0, 0, -3 * rb.ease(k, "in")))
            if is_front:
                hidden = True
        o.matrix_world = Matrix.LocRotScale(lo, q, scale)
        o.hide_render = hidden
    bpy.context.view_layer.update()


# The dialog card's own blink, in its emission
for f_, v in [(F(1.2) - 1, 1.0), (F(1.2), 0.25), (F(1.2) + 3, 1.0), (F(1.4), 0.3), (F(1.4) + 3, 1.0)]:
    rb.key_strength(dialog_m, f_, v)

cam, look = rb.camera(34, (0, -13.5, 3.4), (0, 0, 3.6), fstop=3.2)
K = [
    (1, (0.0, -14.5, 3.2), (0, 0, 3.7)),
    (F(9.0), (0.0, -13.2, 3.4), (0, 0, 3.7)),
    (F(15.2), (0.4, -12.6, 3.6), (0, 0, 3.9)),
    (F(17.6), (-0.8, -14.0, 4.6), (0, 0, 4.4)),
    (F(18.4), (-1.0, -14.2, 5.0), (0, 0, 4.6)),   # time stops
    (F(22.7), (1.6, -12.2, 6.0), (0.2, 0, 4.9)),  # a slow drift through the frozen storm
    (F(25.0), (0, -15.5, 7.2), (0, LY, LZ - 1.9)),
    (T, (0.6, -14.6, 7.0), (0, LY, LZ - 1.9)),
]
for f, c, l in K:
    rb.key(cam, "location", f, Vector(c), "BEZIER", "AUTO_CLAMPED")
    rb.key(look, "location", f, Vector(l), "BEZIER", "AUTO_CLAMPED")
if is_front:
    # Only the glyphs in front of him: everything else holds out.
    for o in s.objects:
        if o.type in ("LIGHT",):
            continue
    rb.strip("key", 1100, 12, (0, -8, 12), (rad(40), 0, 0), "#e8f4ff", size_y=8)
    rb.strip("rim", 700, 2, (8, 5, 10), (rad(-40), 0, rad(55)), "#a8e6da", size_y=14)
    finale.hide_render = True
    for c in finale.children:
        c.hide_render = True
    s.render.film_transparent = True
rb.finish(on_frame)
