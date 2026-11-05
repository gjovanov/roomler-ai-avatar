# 03 One Second, Sliced: 120 consecutive real frames stand on 120 glass slabs. One continuous camera move: it starts flat
# on frame 1, swings aside, glides along the stack, drifts up and out behind the flat graphic (HyperFrames draws the 120
# slots and the one slot), then one frame slides out of the stack and the camera settles flat on it.
import bpy, math, os, sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../tools/blender")))
import rb
from mathutils import Vector

F = lambda s: int(round(s * 30)) + 1
s = rb.begin(frames=int(20.3 * 30), samples=40)
FRAMES = os.path.join(rb.VIDEOS, "fx-demos/out/footage/drag120")
N, DY, SW, SH = 120, 0.62, 3.2, 1.8
rb.floor(rough=0.1, z=-0.25)
Z = SH / 2 + 0.25
edge = rb.emit_mat("edge", rb.TEAL_L, 1.0)
back = rb.mat("slabback", "#050a0a", rough=0.08, coat=1.0)
mats = []
PULL = 100  # the frame that slides out, ahead of the camera's drift
pulled = []
SWEEP0, SWEEP1 = F(6.2), F(9.0)  # "encodes a whole frame": a plane passes through the whole stack
for i in range(N):
    m = rb.still_mat(f"fr{i}", os.path.join(FRAMES, f"f_{i + 1:03d}.jpg"), strength=1.0)
    mats.append(m)
    y = i * DY
    a_ = rb.plane(f"s{i}", SW, SH, m, (0, y, Z))
    b_ = rb.box(f"b{i}", (SW + 0.05, 0.03, SH + 0.05), back, (0, y + 0.022, Z), bevel=0.008, seg=1)
    if i == PULL:
        pulled = [(a_, y), (b_, y + 0.022)]
    # Each slab flashes as the plane passes it.
    fh = SWEEP0 + (SWEEP1 - SWEEP0) * i / (N - 1)
    if fh > 2:
        for f_, v in [(int(fh) - 1, 1.0), (int(fh), 2.1), (int(fh) + 5, 1.0)]:
            rb.key_strength(m, f_, v)
sweep_m = rb.glow_mat("sweep", "#c8fff2", 2.4, power=2.0)
sweep = rb.box("sweep", (SW + 0.5, 0.02, SH + 0.5), sweep_m, (0, -0.2, Z))
rb.show_between(sweep, SWEEP0, SWEEP1 + 2)
rb.key(sweep, "location", SWEEP0, (0, 0, Z), "LINEAR")
rb.key(sweep, "location", SWEEP1, (0, (N - 1) * DY, Z), "LINEAR")

# Round 4: the rail of 120 slots under the stack is gone. Seen from above it read as a row of teal tiles, the 6.3 of 8.3 ms
# in each could not be seen and nobody could count them; the flat graphic in HyperFrames carries both now.
rb.strip("sky", 500, 8, (6, 40, 9), (0, 0, 0), "#d8f3ee", size_y=90)
rb.strip("rim", 900, 2, (-7, 40, 4), (math.radians(90), 0, math.radians(-90)), rb.TEAL_L, size_y=90)

# Flat on a slab: the slab fills the frame exactly at this distance for a 36 mm sensor and this lens.
LENS = 35.0
flat = SW * LENS / 36.0
cam, look = rb.camera(LENS, (0, -flat, Z), (0, 0, Z), fstop=3.2)
C = lambda c, l, kind="BEZIER": (Vector(c), Vector(l), kind)
seg_y = PULL * DY  # the frame that slides out
OUTX = -6.6
K = [
    (1, (0, -flat, Z), (0, 0, Z)),
    (F(0.9), (0, -flat, Z), (0, 0, Z)),
    (F(2.1), (-0.9, -5.2, Z + 0.25), (0, 3.0, Z)),
    (F(3.6), (-3.9, -2.6, Z + 0.35), (0, 8, Z)),
    (F(6.2), (-3.2, 12, Z - 0.1), (0.2, 30, Z)),
    (F(8.9), (-3.0, 34, Z + 0.15), (0.2, 52, Z)),
    # Behind the flat graphic (9.2 to 17.9 s): still moving forward, slower, up and out, so the stack stays a quiet
    # background, and it ends on a high three-quarter view of the frame that will slide out.
    (F(12.9), (-5.4, 44, Z + 1.8), (-0.4, 60, Z)),
    (F(17.6), (-9.0, 50.5, Z + 2.6), (-2.4, seg_y, Z)),
    (F(18.9), (OUTX + 0.6, seg_y - 3.6, Z + 0.1), (OUTX * 0.8, seg_y, Z)),
    (F(19.7), (OUTX, seg_y - flat, Z), (OUTX, seg_y, Z)),
    (F(20.3), (OUTX, seg_y - flat, Z), (OUTX, seg_y, Z)),
]
# After Helen's line, one frame slides out of the stack, sideways, like a card pulled from a deck, and the camera settles flat on it.
for o, y in pulled:
    rb.key(o, "location", F(17.8), (0, y, Z), "BEZIER", easing="EASE_IN_OUT")
    rb.key(o, "location", F(18.9), (OUTX, y, Z))
for f, c, l in K:
    rb.key(cam, "location", f, Vector(c), "BEZIER", "AUTO_CLAMPED")
    rb.key(look, "location", f, Vector(l), "BEZIER", "AUTO_CLAMPED")
cam.data.dof.aperture_fstop = 3.2
def f_stop(f, v):
    cam.data.dof.aperture_fstop = v
    cam.data.dof.keyframe_insert("aperture_fstop", frame=f)
f_stop(1, 64)  # flat frames stay sharp
f_stop(F(0.9), 64)
f_stop(F(2.1), 3.2)
f_stop(F(19.1), 3.2)
f_stop(F(19.7), 64)
rb.finish()
