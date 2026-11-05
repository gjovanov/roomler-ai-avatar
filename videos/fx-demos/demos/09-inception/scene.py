# 09 Remote Inception: each device floats on the screen of the one before; the camera is one pure zoom on the fixed point of the
# similarity, so after three levels the picture is the first picture again and the film loops with no seam.
# Three things make it exact: every clip is exactly 360 frames and loops into itself (kit: forward, then back), so level n+3 at frame
# t+360 shows what level n showed at t; level 0 has a parent like every other level; and the light is the world's, which is the same at
# every scale (lamps would add up with each level).
import bpy, math, os, sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../tools/blender")))
import rb
from mathutils import Vector

T = 360  # 12 s; frame 361 equals frame 1
s = rb.begin(frames=T, samples=40, world=(0.0015, 0.004, 0.0045))
rad = math.radians
FOOT = os.path.join(rb.VIDEOS, "fx-demos/out/footage")
SRC = [os.path.join(FOOT, n) for n in ("loop-mac.mp4", "loop-win.mp4", "loop-lin.mp4")]
k = 1 / 5.2
FIRST, LAST = -1, 6
S0 = 100.0  # level 0's screen is 100 wide
SW, SH = 1.0, 9 / 16
# Where the next device's screen centre sits on this device's screen, in screen widths, and how far in front.
OFF = Vector((0.15, -0.075, -0.085))
alum = rb.mat("alum", "#8f9a9c", rough=0.3, metal=1.0)
dark = rb.mat("dark", "#0c1112", rough=0.3, metal=0.4)
black = rb.mat("black", "#040606", rough=0.2)
kind_m = [rb.footage_mat(f"scr{i}", p, strength=1.0, start=1, offset=0, cyclic=True) for i, p in enumerate(SRC)]

# The light: a soft gradient from the world, brighter overhead, with a teal cast. No lamps.
wn = s.world.node_tree
bg = wn.nodes["Background"]
tc, sep, ramp = wn.nodes.new("ShaderNodeTexCoord"), wn.nodes.new("ShaderNodeSeparateXYZ"), wn.nodes.new("ShaderNodeValToRGB")
wn.links.new(tc.outputs["Normal"], sep.inputs[0])
add = wn.nodes.new("ShaderNodeMath")
add.operation = "MULTIPLY_ADD"
add.inputs[1].default_value = 0.5
add.inputs[2].default_value = 0.5
wn.links.new(sep.outputs["Z"], add.inputs[0])
wn.links.new(add.outputs[0], ramp.inputs[0])
ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.45, (0.0, 0.0, 0.0, 1)
ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.95, (0.62, 0.8, 0.78, 1)
wn.links.new(ramp.outputs[0], bg.inputs[0])
bg.inputs[1].default_value = 1.0


def device(kind, n, scale, centre):
    # A device whose SCREEN is `scale` wide and centred on `centre`; the screen plane faces -Y. kind: 0 laptop, 1 PC laptop, 2 monitor + mini.
    root = rb.empty(f"dev{n}", centre)
    root.scale = (scale, scale, scale)
    rb.plane(f"p{n}", SW, SH, kind_m[kind], (0, 0, 0), parent=root)
    bz = 0.018
    if kind == 0:  # MacBook-like
        rb.box(f"lid{n}", (SW + bz * 2, 0.012, SH + bz * 2.4), alum, (0, 0.008, 0), bevel=0.004, parent=root)
        rb.box(f"base{n}", (SW + bz * 2, 0.75, 0.018), alum, (0, -0.37, -SH / 2 - bz - 0.012), (rad(-6), 0, 0), bevel=0.006, parent=root)
        rb.box(f"kb{n}", (SW * 0.9, 0.32, 0.002), black, (0, -0.3, -SH / 2 - bz + 0.0), (rad(-6), 0, 0), parent=root)
    elif kind == 1:  # A thick black PC laptop
        rb.box(f"lid{n}", (SW + bz * 2.6, 0.02, SH + bz * 3), dark, (0, 0.012, 0), bevel=0.005, parent=root)
        rb.box(f"base{n}", (SW + bz * 2.6, 0.72, 0.03), dark, (0, -0.36, -SH / 2 - bz * 1.5 - 0.016), (rad(-6), 0, 0), bevel=0.008, parent=root)
        rb.box(f"tl{n}", (0.2, 0.002, 0.004), rb.emit_mat(f"te{n}", rb.TEAL_L, 2.0), (0, -0.74, -SH / 2 - bz * 1.5 - 0.03), parent=root)
    else:  # A monitor on a stand, and a small square box beside it
        rb.box(f"lid{n}", (SW + bz * 1.6, 0.03, SH + bz * 1.6), black, (0, 0.018, 0), bevel=0.006, parent=root)
        rb.box(f"neck{n}", (0.08, 0.03, 0.2), alum, (0, 0.05, -SH / 2 - 0.1), parent=root)
        rb.box(f"foot{n}", (0.34, 0.2, 0.014), alum, (0, -0.01, -SH / 2 - 0.2), bevel=0.004, parent=root)
        rb.box(f"mini{n}", (0.2, 0.2, 0.05), alum, (0.56, -0.05, -SH / 2 - 0.17), bevel=0.012, parent=root)
    return root


# The chain, by the fixed point: centre_n = -k^n * C * S0, with C chosen so centre_(n+1) - centre_n = k^n * OFF * S0.
C = OFF / (1 - k)
for n in range(FIRST, LAST + 1):
    sc = S0 * k ** n
    centre = -C * sc
    device(n % 3, n, sc, centre)
    if n > FIRST:
        # A soft pad of dark behind the device on its parent's screen, so it reads as floating on it.
        rb.plane(f"pad{n}", SW * 1.34 * sc, SH * 1.62 * sc, rb.emit_mat(f"padm{n}", "#050c0c", 1.0), centre + Vector((0, 0.03 * sc, -0.09 * sc)))

# The camera: pure zoom on the fixed point. Level L = 3 * (frame-1)/T. Keyed per frame so nothing interpolates.
LENS = 36.0
start = Vector((-0.05, -1.32, 0.02)) * S0
cam, look = rb.camera(LENS, tuple(start), (0, 0, 0))
cam.constraints.clear()
cam.rotation_euler = (rad(90), 0, 0)
cam.data.dof.use_dof = False
for f in range(1, T + 2):
    L = 3 * (f - 1) / T
    sc = k ** L
    cam.location = start * sc
    cam.keyframe_insert("location", frame=f)
    cam.data.clip_start = max(0.002, 0.02 * S0 * sc)
    cam.data.clip_end = 8 * S0 * sc * 30
    cam.data.keyframe_insert("clip_start", frame=f)
    cam.data.keyframe_insert("clip_end", frame=f)
s.frame_end = T + 1 if rb.ARGS.get("seam") else T
for a_ in (cam.animation_data.action, cam.data.animation_data.action):
    try:
        curves = list(a_.fcurves)
    except AttributeError:
        curves = [fc for l_ in a_.layers for st in l_.strips for b in st.channelbags for fc in b.fcurves]
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
rb.finish()
