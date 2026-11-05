# 04 The Frustrated Postman: a toy diorama. A sealed letter bonks a wall, goes through door 443 with the web pages, reaches a
# small robot postman who tries everything and cannot open it. All acting by keyframes; every part is a toy shape.
import bpy, math, os, sys, random
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../tools/blender")))
import rb
from mathutils import Vector

F = lambda t: int(round(t * 30)) + 1
s = rb.begin(frames=int(26.2 * 30), samples=48, world=(0.004, 0.012, 0.012))
rd = random.Random(4)
rad = math.radians

# ---------- materials ----------
ground = rb.mat("ground", "#16352f", rough=0.42)
wallm = rb.mat("wall", "#2a4a44", rough=0.55)
wall2 = rb.mat("wall2", "#355a53", rough=0.65)
paper = rb.mat("paper", "#eef4f2", rough=0.55)
flap = rb.mat("flap", "#d5e2df", rough=0.6)
seal = rb.mat("seal", rb.TEAL, rough=0.25, coat=1.0, emit=rb.TEAL_L, strength=0.5)
page = rb.mat("page", "#d9e4f5", rough=0.5)
pagebar = rb.emit_mat("pagebar", "#7fb4ff", 1.2)
metal = rb.mat("metal", "#8a9ea0", rough=0.28, metal=0.9)
dark = rb.mat("dark", "#0d1414", rough=0.35)
bodym = rb.mat("robot", "#d8e4e1", rough=0.3, coat=0.8)
cap = rb.mat("cap", "#143e6e", rough=0.45)
capv = rb.mat("capv", "#0b1e36", rough=0.2, coat=1.0)
screenm = rb.emit_mat("visor", "#04100e", 1.0)
wood = rb.mat("desk", "#4a3322", rough=0.5)
belt = rb.mat("belt", "#101717", rough=0.7)
door_glow = rb.emit_mat("door", rb.TEAL_L, 0.0)
sign_m = rb.emit_mat("sign", rb.TEAL_L, 0.0)
scr_m = rb.emit_mat("lapscr", rb.TEAL_L, 0.5)

rb.plane("ground", 200, 200, ground, (0, 0, 0), (rad(-90), 0, 0))
# ---------- the wall with one door ----------
WX = 0.0  # the wall runs along Y at x=0, the door at y=0
for sign_, cy in ((-1, -12.8), (1, 12.8)):
    rb.box("wallseg", (0.8, 24, 6), wallm, (WX, cy, 3), bevel=0.04)
rb.box("lintel", (0.8, 1.6, 3.2), wallm, (WX, 0, 4.4), bevel=0.04)
for yy in (-0.84, 0.84):
    rb.box("jamb", (0.9, 0.08, 2.9), door_glow, (WX, yy, 1.45))
rb.box("jambt", (0.9, 1.76, 0.08), door_glow, (WX, 0, 2.86))
sign = rb.text3d("443", "443", 1.25, 0.015, sign_m, (WX - 0.45, 0, 3.8), (rad(90), 0, rad(-90)), font="C:/Windows/Fonts/segoeuib.ttf")
# Bricks: a toy pattern on the wall's face.
for r in range(8):
    for c in range(-9, 10):
        y = c * 2.4 + (1.2 if r % 2 else 0)
        if abs(y) < 1.9 and r < 5:
            continue
        rb.box("brick", (0.06, 2.3, 0.64), wall2, (WX - 0.42, y, 0.38 + r * 0.74), bevel=0.012, seg=1)

# ---------- the laptop on the left, the server on the right ----------
lap = rb.empty("laptop", (-11, -2.2, 0), (0, 0, rad(-62)))
rb.box("lapbase", (3.0, 2.0, 0.14), metal, (0, 0, 0.1), parent=lap, bevel=0.04)
rb.box("lapscrb", (3.0, 0.1, 1.9), metal, (0, 1.05, 1.06), (rad(-12), 0, 0), parent=lap, bevel=0.03)
rb.plane("lapscr", 2.7, 1.62, scr_m, (0, 0.98, 1.06), (rad(-12), 0, 0), parent=lap)
srv = rb.empty("server", (12.5, -3.8, 0))
for i in range(4):
    rb.box("srv", (2.6, 1.8, 0.82), dark, (0, 0, 0.5 + i * 0.92), parent=srv, bevel=0.04)
    rb.box("led", (0.1, 0.02, 0.1), rb.emit_mat("ledg", "#39ff9c", 2.5), (-1.0, -0.91, 0.5 + i * 0.92), parent=srv)
    rb.box("led2", (0.1, 0.02, 0.1), rb.emit_mat("ledb", rb.TEAL_L, 2.5), (-0.8, -0.91, 0.5 + i * 0.92), parent=srv)


# ---------- letters ----------
def letter(name, scale=1.0):
    p = rb.empty(name)
    p.scale = (scale, scale, scale)
    rb.box(name + "b", (1.5, 0.05, 1.0), paper, (0, 0, 0), parent=p, bevel=0.015, seg=2)
    # the flap, a flattened triangle facing the viewer
    me = bpy.data.meshes.new(name + "f")
    me.from_pydata([(-0.74, 0, 0.48), (0.74, 0, 0.48), (0, 0, -0.1)], [], [(0, 2, 1)])
    fo = rb._obj(name + "f", me, flap, (0, -0.032, 0), (0, 0, 0), p)
    # the seal: a tiny hexagon with a lock, on the side a viewer sees
    rb.hex_prism(name + "s", 0.24, 0.04, seal, (0, -0.05, 0.02), (rad(90), 0, 0), parent=p)
    return p


L = letter("L0")
Lx = lambda f, x, y, z, rx=0, ry=0, rz=0.0, kind="BEZIER": (rb.key(L, "location", f, Vector((x, y, z)), kind), rb.key(L, "rotation_euler", f, (rx, ry, rz), kind))
RX, RY = 6.6, 1.9  # the robot's station, behind the belt
# 0.5-2.4 from the laptop to the wall: bonk at 2.0
Lx(F(0.5), -9.6, -1.6, 1.6, 0, 0, rad(-24))
Lx(F(1.95), -1.0, -3.0, 1.7, 0, 0, rad(-40))
Lx(F(2.08), -2.5, -3.2, 1.25, rad(25), 0, rad(-60))
Lx(F(2.7), -4.4, -3.1, 1.15, 0, 0, rad(-30))
Lx(F(5.4), -4.4, -2.6, 1.15, 0, 0, rad(-30))
# 5.6-7.6 joins the stream of pages, heads for the door; through it at 7.6
Lx(F(7.0), -1.8, -0.3, 1.35, 0, 0, rad(-50))
Lx(F(7.6), 1.0, 0, 1.75, 0, 0, rad(-30))
# 7.8-9.6 on the belt, slower, to the robot
BZ = 1.72
Lx(F(8.0), 2.0, 0, BZ, 0, 0, 0)
Lx(F(9.6), 5.4, 0, BZ, 0, 0, 0)
Lx(F(10.1), 5.4, 0, BZ, 0, 0, 0)
Lx(F(10.6), 7.6, 0.8, 2.3, 0, 0, rad(-8))
rb.key(L, "scale", F(10.1), (1, 1, 1))
rb.key(L, "scale", F(10.6), (0.72, 0.72, 0.72))
Lx(F(12.6), 7.6, 0.75, 2.35, 0, 0, rad(6))
# 14.9 turns it, 15.6 to the lamp, 16.8 shake, 18 picks at the seal
Lx(F(15.2), 7.5, 0.7, 2.35, 0, 0, rad(-28))
Lx(F(15.9), 7.55, 0.95, 3.25, rad(-10), 0, rad(-10))
Lx(F(16.7), 7.55, 0.95, 3.25, rad(-10), 0, rad(-10))
for i in range(7):
    Lx(F(16.8 + i * 0.1), 7.45 + (0.2 if i % 2 else -0.2), 0.8, 2.25 + (0.12 if i % 2 else -0.12), rad(8 if i % 2 else -8), 0, rad(10))
Lx(F(17.6), 7.2, 0.75, 2.0, rad(4), 0, 0)
Lx(F(19.4), 7.2, 0.75, 2.0, rad(-4), 0, 0)
# 19.6 forwards it onto the belt, off to the server
Lx(F(19.9), 7.9, 0, BZ, 0, 0, 0)
rb.key(L, "scale", F(19.4), (0.72, 0.72, 0.72))
rb.key(L, "scale", F(19.9), (0.9, 0.9, 0.9))
Lx(F(21.5), 11.2, -2.9, 2.0, 0, 0, rad(-30))
rb.key(L, "scale", F(21.45), (0.9, 0.9, 0.9))
rb.key(L, "scale", F(21.6), (0.01, 0.01, 0.01))

# Web pages: 26 little sheets with a blue bar zip through the door along their own line, 5.4-7.3 (and they never stop).
for i in range(26):
    t0 = 5.3 + i * 0.075
    p = rb.empty(f"pg{i}")
    p.scale = (0.5, 0.5, 0.5)
    rb.box(f"pgb{i}", (1.2, 0.03, 1.5), page, (0, 0, 0), parent=p, bevel=0.012, seg=1)
    rb.box(f"pgh{i}", (1.05, 0.02, 0.2), pagebar, (0, -0.02, 0.5), parent=p)
    y0 = rd.uniform(-0.5, 0.5)
    z0 = rd.uniform(0.6, 2.1)
    rb.key(p, "location", 1, Vector((-30, y0, z0)))
    rb.key(p, "location", F(t0), Vector((-14, y0 - 2.4, z0)), "LINEAR")
    rb.key(p, "location", F(t0 + 0.8), Vector((1.5, y0, z0)), "LINEAR")
    rb.key(p, "location", F(t0 + 1.0), Vector((8.5, y0 + 5.0, z0 + 3.2)), "LINEAR")
    rb.key(p, "rotation_euler", F(t0), (0, 0, rad(-20)), "LINEAR")
    rb.key(p, "rotation_euler", F(t0 + 1.0), (rad(50), 0, rad(-20)))
    rb.show_between(p, F(t0), F(t0 + 1.0))

# More letters after his first try: they arrive on the belt, 20.2-25.5, and leave past him.
for i in range(9):
    t0 = 19.9 + i * 0.62
    q = letter(f"LQ{i}", 0.8)
    rb.key(q, "location", F(t0), Vector((1.0, 0, BZ)), "LINEAR")
    rb.key(q, "location", F(t0 + 1.5), Vector((9.8, 0, BZ)), "LINEAR")
    rb.key(q, "location", F(t0 + 2.2), Vector((11.2, -2.9, 1.8)))
    rb.key(q, "rotation_euler", F(t0), (0, 0, 0))
    rb.show_between(q, F(t0), F(t0 + 2.2))

# ---------- the sorting desk and the belts ----------
rb.box("beltin", (10.5, 1.3, 0.14), belt, (5.6, 0, 1.15), bevel=0.03)
rb.box("counter", (10.5, 1.2, 1.08), rb.mat("ctr", "#2b3f3b", rough=0.5), (5.6, 0, 0.54), bevel=0.03)

# Lamp over the desk: warm, the only warm thing in the world.
lampc = rb.emit_mat("lampb", "#ffd9a0", 6.0)
rb.cyl("lamppole", 0.05, 4.4, metal, (9.3, 0.9, 2.2))
rb.box("lamparm", (2.2, 0.07, 0.07), metal, (8.2, 0.9, 4.4))
shade = rb.cyl("shade", 0.62, 0.52, rb.mat("lsh", "#1a2e2a", rough=0.3), (7.1, 0.9, 4.2), r2=0.2)
rb.sphere("bulb", 0.2, lampc, (7.1, 0.9, 3.92))
warm = rb.point("warm", 240, (7.1, 0.7, 3.75), "#ffc98a", 0.2)

# ---------- the robot ----------
rob = rb.empty("robot", (RX, RY, 0.35))
rb.cyl("base", 0.75, 0.3, dark, (0, 0, 0.18), parent=rob, bevel=0.05)
trunk = rb.empty("trunk", (0, 0, 0.32), parent=rob)
rb.box("chest", (1.25, 0.95, 1.25), bodym, (0, 0, 0.72), parent=trunk, bevel=0.14)
rb.box("hatch", (0.55, 0.02, 0.32), rb.mat("hatch", rb.TEAL, rough=0.3), (0, -0.48, 0.82), parent=trunk)
head = rb.empty("head", (0, 0, 1.45), parent=trunk)
rb.box("skull", (1.2, 0.95, 0.82), bodym, (0, 0, 0.42), parent=head, bevel=0.16)
rb.box("visor", (1.02, 0.03, 0.42), screenm, (0, -0.48, 0.42), parent=head, bevel=0.012, seg=1)
# Cap
rb.cyl("capt", 0.62, 0.3, cap, (0, 0.02, 0.98), parent=head, bevel=0.04)
capb = rb.box("capbrim", (0.92, 0.5, 0.05), capv, (0, -0.46, 0.84), (rad(10), 0, 0), parent=head, bevel=0.02)
rb.box("capband", (0.2, 0.02, 0.12), rb.emit_mat("capb", rb.AMBER, 1.0), (0, -0.62, 1.0), parent=head)
# Eyes: round ones most of the time, slits for suspicion, > < at the end. Each a set of boxes shown over its window.
eye_white = rb.emit_mat("eye", "#7ffbe6", 3.0)
eye_red = rb.emit_mat("eyer", "#ff5f4d", 3.0)
def eye(cx, kind, a, b):
    o = []
    if kind == "round":
        o.append(rb.sphere("eye", 0.11, eye_white, (cx, -0.5, 0.42), parent=head, scale=(1, 0.2, 1.1)))
    elif kind == "slit":
        o.append(rb.box("eye", (0.28, 0.02, 0.055), eye_white, (cx, -0.5, 0.42), parent=head))
    elif kind in (">", "<"):
        s_ = 1 if kind == ">" else -1
        o.append(rb.box("eye", (0.24, 0.02, 0.05), eye_red, (cx, -0.5, 0.47), (0, s_ * rad(32), 0), parent=head))
        o.append(rb.box("eye", (0.24, 0.02, 0.05), eye_red, (cx, -0.5, 0.37), (0, -s_ * rad(32), 0), parent=head))
    for e in o:
        rb.show_between(e, a, b)
T = int(26.2 * 30)
for cx in (-0.25, 0.25):
    eye(cx, "round", 1, F(20.6))
    eye(cx, "slit", F(20.6) + 1, F(22.3))
eye(-0.25, ">", F(22.3) + 1, T)
eye(0.25, "<", F(22.3) + 1, T)
# Arms: shoulder and forearm, both keyed.
def arm(sign_):
    sh = rb.empty("sh", (sign_ * 0.76, 0, 1.12), parent=trunk)
    rb.cyl("up", 0.11, 0.52, metal, (0, 0, -0.26), parent=sh)
    el = rb.empty("el", (0, 0, -0.52), parent=sh)
    rb.cyl("fo", 0.1, 0.52, metal, (0, 0, -0.26), parent=el)
    rb.sphere("hand", 0.14, dark, (0, 0, -0.56), parent=el)
    return sh, el
shL, elL = arm(1)   # his left, viewer's right: the letter's side
shR, elR = arm(-1)
def pose(f, sL, eL, sR, eR, kind="BEZIER"):
    # (x rotation, y rotation) of each joint, in degrees. x<0 swings forward.
    rb.key(shL, "rotation_euler", f, (rad(sL[0]), rad(sL[1]), 0), kind)
    rb.key(elL, "rotation_euler", f, (rad(eL), 0, 0), kind)
    rb.key(shR, "rotation_euler", f, (rad(sR[0]), rad(sR[1]), 0), kind)
    rb.key(elR, "rotation_euler", f, (rad(eR), 0, 0), kind)
pose(1, (-8, 6), -14, (-8, -6), -14)
pose(F(10.0), (-8, 6), -14, (-8, -6), -14)
pose(F(10.6), (-95, 24), -50, (-40, -6), -30)   # takes it
pose(F(14.8), (-100, 24), -60, (-85, -20), -55) # both hands on it
pose(F(15.9), (-150, 20), -40, (-40, -6), -30)  # up to the lamp
pose(F(16.7), (-150, 20), -40, (-40, -6), -30)
for i in range(7):
    pose(F(16.8 + i * 0.1), (-95 - (12 if i % 2 else 0), 10), -50, (-95 - (12 if i % 2 else 0), -10), -50)  # shakes
pose(F(17.6), (-95, 22), -55, (-110, -30), -75)  # picks at the seal
for i in range(6):
    pose(F(17.9 + i * 0.25), (-95, 22), -55, (-112 if i % 2 else -102, -30), -75 if i % 2 else -60)
pose(F(19.9), (-70, 6), -30, (-40, -6), -30)  # puts it on the belt
pose(F(20.6), (-20, 6), -20, (-20, -6), -20)
pose(F(22.2), (-20, 6), -20, (-20, -6), -20)
pose(F(22.6), (-175, 30), -20, (-175, -30), -20)  # arms up
for i in range(8):
    pose(F(22.9 + i * 0.32), (-175 - (i % 2) * 14, 30), -20 - (i % 2) * 22, (-175 - (i % 2) * 14, -30), -20 - (i % 2) * 22)
# Head: looks at the letter, follows the belt, shakes.
def look_head(f, rx, rz, kind="BEZIER"):
    rb.key(head, "rotation_euler", f, (rad(rx), 0, rad(rz)), kind)
look_head(1, 0, 18)
look_head(F(9.6), 0, 18)
look_head(F(10.5), -10, 34)
look_head(F(13), -8, 30)
look_head(F(15.9), -26, 30)
look_head(F(16.8), -14, 26)
look_head(F(17.7), -16, 22)
look_head(F(19.4), -16, 18)
look_head(F(20.3), -5, -32)
look_head(F(21.0), -5, 34)
look_head(F(21.6), -5, -32)
look_head(F(22.2), -5, 30)
for i in range(9):
    look_head(F(22.5 + i * 0.3), 10, 16 if i % 2 else -16)
rb.key(trunk, "rotation_euler", F(22.2), (0, 0, 0))
rb.key(trunk, "location", F(22.2), (0, 0, 0.32))
for i in range(9):
    rb.key(trunk, "location", F(22.5 + i * 0.3), (0, 0, 0.32 + (0.09 if i % 2 else 0)))
# Steam from the cap: glowing white puffs on the way up, once he has given up.
steam_m = rb.glow_mat("steam", "#ffffff", 1.1, power=3.2)
for i in range(24):
    t0 = 22.9 + i * 0.11
    pf = rb.sphere(f"puff{i}", 0.2, steam_m, (RX + rd.uniform(-0.35, 0.35), RY, 3.9), seg=12)
    rb.show_between(pf, F(t0), F(t0 + 0.9))
    rb.key(pf, "scale", F(t0), (0.3, 0.3, 0.3), "BEZIER", easing="EASE_OUT")
    rb.key(pf, "scale", F(t0 + 0.9), (3.2, 3.2, 3.2))
    rb.key(pf, "location", F(t0), Vector((RX + rd.uniform(-0.35, 0.35), RY, 3.95)))
    rb.key(pf, "location", F(t0 + 0.9), Vector((RX + rd.uniform(-1.3, 1.3), RY, 5.6)))

# ---------- lights ----------
rb.strip("moon", 5200, 34, (-2, -12, 18), (rad(30), 0, 0), "#a4d8e0", size_y=34)
rb.strip("rim", 3200, 3, (18, 8, 8), (rad(-60), 0, rad(55)), rb.TEAL_L, size_y=24)
for f, v in [(F(2.75), 0), (F(2.85), 3.2), (F(2.95), 0.5), (F(3.05), 3.2), (T, 2.2)]:
    rb.key_strength(door_glow, f, v)
    rb.key_strength(sign_m, f, v * 0.55)
doorl = rb.point("doorl", 0, (-1.2, 0, 1.7), rb.TEAL_L, 0.3)
for f, v in [(F(2.75), 0), (F(2.85), 90), (T, 60)]:
    doorl.data.energy = v
    doorl.data.keyframe_insert("energy", frame=f)

# ---------- the camera: miniature dolly, ever closer on the robot ----------
cam, look = rb.camera(50, (-13, -19, 8), (-4, -1, 1.5), fstop=1.4)
K = [
    (1, (-13.5, -20, 7.5), (-5.5, -1, 1.6)),
    (F(2.2), (-11, -18.5, 6.4), (-3.2, -2.2, 1.6)),
    (F(4.0), (-8.5, -15.5, 4.6), (-0.8, 0, 2.2)),
    (F(7.0), (-5.5, -14, 4.6), (0.2, 0, 1.9)),
    (F(9.3), (1.5, -11.5, 4.2), (4.8, 0.6, 2.0)),
    (F(12.0), (4.6, -9.2, 3.7), (6.5, 1.2, 2.6)),
    (F(14.8), (5.2, -8.2, 3.5), (6.7, 1.3, 2.75)),
    (F(16.6), (5.6, -7.6, 3.8), (6.8, 1.3, 3.1)),
    (F(19.8), (5.0, -7.2, 3.4), (6.7, 1.3, 2.7)),
    (F(22.1), (4.6, -7.4, 3.3), (6.9, 1.3, 2.7)),
    (F(22.9), (5.7, -5.4, 3.3), (6.6, 1.6, 3.0)),  # the comic push-in on 'frustrated'
    (F(25.5), (5.9, -5.1, 3.3), (6.6, 1.6, 3.0)),
    (F(26.2), (5.4, -7.5, 4.2), (6.6, 1.0, 2.9)),
]
for f, c, l in K:
    rb.key(cam, "location", f, Vector(c), "BEZIER", "AUTO_CLAMPED")
    rb.key(look, "location", f, Vector(l), "BEZIER", "AUTO_CLAMPED")
rb.finish()
