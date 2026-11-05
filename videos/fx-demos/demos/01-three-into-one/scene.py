# 01 Three Into One: three glass slabs land, light up one by one with real footage, slam together, become the logo.
import bpy, json, math, os, sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../tools/blender")))
import rb

F = lambda s: int(round(s * 30)) + 1  # seconds on the film's clock to a frame
# Round 4: Goran asked for a one-second pause after "...that replaces three", so every beat after it is a second later.
s = rb.begin(frames=630, samples=48)
rb.floor(rough=0.09)

R = rb.VIDEOS
FOOT = os.path.join(R, "fx-demos/out/footage")
BRAND = os.path.join(R, "fx-demos/out/brand")
slab_w, slab_h, xs = 5.76, 3.24, (-6.1, 0.0, 6.1)
arc_y, arc_rot = (-1.5, 0.0, -1.5), (20, 0, -20)
sources = [
    # Each recording starts at its slab's power-on (a second later since the pause), so every frame after it is round 3's.
    rb.footage_mat("s1", os.path.join(R, "macbook-120fps/out/visuals/vis-drag.mp4"), strength=0.0, start=F(5.0), offset=0, cyclic=True),
    rb.footage_mat("s2", os.path.join(FOOT, "peers-boxed.mp4"), strength=0.0, start=F(8.6), offset=120, cyclic=True),
    # The call: the gallery with every camera a flat colour (call.mjs). HyperFrames lays the live clips over this screen on its
    # tracked corners, so the floor still mirrors a call and nobody's face passes through the renderer.
    rb.still_mat("s3", os.path.join(R, "fx-demos/out/01-three-into-one/call-layout.png"), strength=0.0),
]
glass = rb.mat("glass", "#060c0c", rough=0.04, coat=1.0)
rim = rb.emit_mat("rim", rb.TEAL_L, 0.0)
land = [F(1.2), F(2.0), F(2.8)]
on = [F(5.0), F(8.6), F(12.0)]
merge = F(16.6)
slabs, screens = [], []
for i, x in enumerate(xs):
    p = rb.empty(f"slab{i}", (x, arc_y[i], 22))
    rb.box(f"body{i}", (slab_w + 0.3, 0.18, slab_h + 0.3), glass, (0, 0, 0), bevel=0.05, parent=p)
    screens.append(rb.plane(f"screen{i}", slab_w, slab_h, sources[i], (0, -0.095, 0), parent=p))
    rb.box(f"rimb{i}", (slab_w + 0.34, 0.02, 0.022), rim, (0, -0.07, -(slab_h + 0.3) / 2 - 0.0), parent=p)
    rb.box(f"rimt{i}", (slab_w + 0.34, 0.02, 0.022), rim, (0, -0.07, (slab_h + 0.3) / 2 + 0.0), parent=p)
    # Drop: accelerates, lands, one small settle.
    rb.key(p, "location", land[i] - 14, (x, arc_y[i], 16), "CUBIC", easing="EASE_IN")
    rb.key(p, "location", land[i], (x, arc_y[i], 1.95), "BEZIER")
    rb.key(p, "location", land[i] + 3, (x, arc_y[i], 2.03))
    rb.key(p, "location", land[i] + 6, (x, arc_y[i], 2.0))
    # Slam together: ease-in over 16 frames, and gone in the flash.
    rb.key(p, "location", merge - 16, (x, arc_y[i], 2.0), "CUBIC", easing="EASE_IN")
    rb.key(p, "location", merge, (0, 0, 2.0))
    base_rot = (0, 0, math.radians(arc_rot[i]))
    p.rotation_euler = base_rot
    rb.key(p, "rotation_euler", 1, base_rot)
    rb.key(p, "rotation_euler", merge - 16, base_rot, "CUBIC", easing="EASE_IN")
    rb.key(p, "rotation_euler", merge, (0, 0, math.radians((i - 1) * 80)))
    for c in [p] + list(p.children):
        c.hide_render = False
        c.keyframe_insert("hide_render", frame=1)
        c.hide_render = True
        c.keyframe_insert("hide_render", frame=merge + 1)
        c.hide_render = False
    # Power on with a flicker, power stays until the merge.
    m = sources[i]
    for f, v in [(on[i] - 1, 0), (on[i], 0.8), (on[i] + 1, 0.1), (on[i] + 2, 0.15), (on[i] + 3, 1.0), (on[i] + 4, 0.55), (on[i] + 6, 1.0), (merge - 6, 1.0), (merge, 2.2)]:
        rb.key_strength(m, f, v)
    slabs.append(p)
for f, v in [(1, 0.0), (land[0], 0.0), (land[0] + 2, 3.0), (land[0] + 12, 1.1), (merge - 4, 1.1), (merge, 4.0)]:
    rb.key_strength(rim, f, v)

# Lights: dim key, two rims, all hidden from glossy rays so the glass stays black.
key_l = rb.strip("key", 260, 6, (0, -7, 11), (math.radians(35), 0, 0), "#d8f3ee", size_y=10)
rb.strip("rimL", 420, 2, (-13, 3, 6), (math.radians(-70), 0, math.radians(-70)), rb.TEAL_L, size_y=9)
rb.strip("sheen", 26, 26, (0, -14, 9), (math.radians(62), 0, 0), "#9fd8ce", size_y=3, in_glossy=True)
rb.strip("rimR", 420, 2, (13, 3, 6), (math.radians(-70), 0, math.radians(70)), rb.TEAL_L, size_y=9)

# The merge: a white-hot point, a ring running out along the floor, then the logo rises out of it.
flash_m = rb.glow_mat("flash", "#d9fff8", 0.0, power=5.0)
flash = rb.sphere("flash", 0.5, flash_m, (0, 0, 2.0))
rb.show_between(flash, merge - 1, merge + 18)
for f, v in [(merge - 1, 0), (merge, 14), (merge + 4, 6), (merge + 18, 0)]:
    rb.key_strength(flash_m, f, v)
rb.key(flash, "scale", merge, (1.0, 1.0, 1.0), "CUBIC", easing="EASE_OUT")
rb.key(flash, "scale", merge + 12, (7, 7, 7))
ring_m = rb.emit_mat("ring", rb.TEAL_L, 0.0)
ring = rb.torus("ring", 1.0, 0.012, ring_m, (0, 0, 0.03))
rb.show_between(ring, merge, merge + 40)
rb.key(ring, "scale", merge, (0.2, 0.2, 1), "CUBIC", easing="EASE_OUT")
rb.key(ring, "scale", merge + 40, (26, 26, 1))
for f, v in [(merge - 1, 0), (merge, 14), (merge + 40, 0)]:
    rb.key_strength(ring_m, f, v)
flash_l = rb.point("flashL", 0, (0, -1, 3), "#c8fff4", 0.5)
for f, v in [(merge - 1, 0), (merge, 26000), (merge + 16, 0)]:
    flash_l.data.energy = v
    flash_l.data.keyframe_insert("energy", frame=f)

logo = rb.logo3d(size=4.6, glow=1.15)
logo.location = (0, 0, -3.2)
# Spring on the way up (about 0.75 damping), then a slow turn against the camera.
rb.key(logo, "location", merge + 1, (0, 0, -3.2), "BEZIER")
rb.key(logo, "location", merge + 16, (0, 0, 3.18))
rb.key(logo, "location", merge + 25, (0, 0, 2.86))
rb.key(logo, "location", merge + 36, (0, 0, 2.95))
rb.key(logo, "rotation_euler", merge + 1, (0, 0, math.radians(-85)), "BEZIER")
rb.key(logo, "rotation_euler", merge + 34, (0, 0, math.radians(8)))
rb.key(logo, "rotation_euler", 630, (0, 0, math.radians(-14)))

cam, look = rb.camera(40, (0, -24, 3.1), (0, 0, 2.2), fstop=5.6)
cam_k = [
    (1, (0, -20.5, 3.6), (0, -0.5, 2.1)),
    (F(3.6), (0, -18.8, 3.0), (0, -0.5, 2.0)),
    (F(4.6), (0, -18.3, 2.95), (0, -0.5, 2.0)),  # the pause: three dark slabs, a slow push
    (F(5.3), (-3.6, -8.6, 2.5), (-6.1, -1.5, 2.0)),
    (F(8.2), (-4.2, -8.0, 2.3), (-6.1, -1.5, 2.0)),
    (F(8.9), (0.9, -7.6, 2.4), (0, 0, 2.0)),
    (F(11.8), (0.4, -7.0, 2.2), (0, 0, 2.0)),
    (F(12.3), (3.6, -8.6, 2.5), (6.1, -1.5, 2.0)),
    (F(15.2), (4.2, -8.0, 2.3), (6.1, -1.5, 2.0)),
    (F(16.0), (0, -22, 3.7), (0, -0.5, 2.1)),
    (merge, (0, -19, 2.8), (0, 0, 2.2)),
    (merge + 40, (1.6, -10.5, 3.1), (0, 0, 2.95)),
    (630, (-1.4, -9.2, 3.0), (0, 0, 2.95)),
]
for f, c, l in cam_k:
    rb.key(cam, "location", f, c)
    rb.key(look, "location", f, l)
# A small shake on each landing and a larger one on the merge.
rb.shake(look, land[0], 0.05)
rb.shake(look, land[1], 0.05)
rb.shake(look, land[2], 0.05)
rb.shake(look, merge, 0.2)
# --corners <file>: slab 3's screen in pixels, frame by frame, for the call overlay (no render).
if rb.ARGS.get("corners"):
    out = []
    for f in range(1, s.frame_end + 1):
        s.frame_set(f)
        out.append([[round(a, 1), round(b, 1)] for a, b in rb.screen_corners(screens[2], slab_w, slab_h)])
    with open(rb.ARGS["corners"], "w") as fh:
        json.dump(out, fh)
    print("CORNERS_DONE", flush=True)
else:
    rb.finish()
