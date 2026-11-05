# rb.py: the small kit the videos/fx-demos scenes share. Blender 5 headless, Cycles on the GPU, Standard view
# transform (a screen's pixels stay the recording's own colours: no AgX tint on footage or on a real person's face).
#   blender -b -P <scene>.py -- --frames 1-120 --out <dir> [--scale 50] [--samples 32] [--stills 1,60,120]
# A scene calls rb.begin(...), builds its world, then rb.finish(). Every frame stands on its own; finished frames
# are skipped, so a killed render resumes and one bad range re-renders alone. Before each frame the kit waits while
# the GPU hold file exists (AVATAR_GPU_HOLD) and while the host is short of memory.
import bpy, bmesh, math, os, sys, json, time, ctypes
from mathutils import Vector, Matrix, Euler

ARGS = {}
_argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
i = 0
while i < len(_argv):
    if _argv[i].startswith("--"):
        ARGS[_argv[i][2:]] = _argv[i + 1] if i + 1 < len(_argv) and not _argv[i + 1].startswith("--") else "1"
        i += 2
    else:
        i += 1

TEAL, TEAL_L, CORAL, AMBER, INK = "#009688", "#4db6ac", "#ef5350", "#ffc107", "#061412"
VIDEOS = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../videos"))


def hex_rgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def rgba(h, a=1.0):
    return (*hex_rgb(h), a)


def begin(frames, res=(1920, 1080), fps=30, samples=48, world=(0.002, 0.006, 0.006), denoise=True, bounces=6):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.frame_start, s.frame_end = 1, frames
    s.render.fps = fps
    pct = int(ARGS.get("scale", 100))
    s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = res[0], res[1], pct
    s.render.engine = "CYCLES"
    c = s.cycles
    c.device = "GPU"
    c.samples = int(ARGS.get("samples", samples))
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.02
    c.use_denoising = denoise
    c.max_bounces, c.diffuse_bounces, c.glossy_bounces, c.transmission_bounces = bounces, 2, 4, 6
    c.caustics_reflective = c.caustics_refractive = False
    c.filter_width = 1.2
    s.view_settings.view_transform = "Standard"
    s.view_settings.look = "None"
    s.view_settings.exposure = 0
    s.render.use_persistent_data = True  # static geometry stays built between frames
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA" if ARGS.get("alpha") else "RGB"
    s.render.film_transparent = bool(ARGS.get("alpha"))
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*world, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1
    s.world = w
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    used = []
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
        if d.use:
            used.append(d.name)
    print("devices:", used)
    if c.use_denoising:
        c.denoiser = "OPTIX"
        c.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    return s


# ---------- materials ----------
def mat(name, base="#000000", rough=0.4, metal=0.0, emit=None, strength=1.0, trans=0.0, ior=1.45, alpha=1.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgba(base)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Transmission Weight"].default_value = trans
    b.inputs["IOR"].default_value = ior
    b.inputs["Alpha"].default_value = alpha
    b.inputs["Coat Weight"].default_value = coat
    if emit:
        b.inputs["Emission Color"].default_value = rgba(emit)
        b.inputs["Emission Strength"].default_value = strength
    return m


def emit_mat(name, color, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o, e = nt.nodes.new("ShaderNodeOutputMaterial"), nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = rgba(color)
    e.inputs[1].default_value = strength
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def glow_mat(name, color, strength=1.0, power=3.0):
    # A soft ball of light: bright where it faces the camera, nothing at its edge.
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o, e, tr, mix, lw, pw = (nt.nodes.new(n) for n in ("ShaderNodeOutputMaterial", "ShaderNodeEmission", "ShaderNodeBsdfTransparent", "ShaderNodeMixShader", "ShaderNodeLayerWeight", "ShaderNodeMath"))
    e.inputs[0].default_value = rgba(color)
    e.inputs[1].default_value = strength
    lw.inputs[0].default_value = 0.5
    pw.operation = "POWER"
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(lw.outputs["Facing"], inv.inputs[1])
    nt.links.new(inv.outputs[0], pw.inputs[0])
    pw.inputs[1].default_value = power
    nt.links.new(pw.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(e.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], o.inputs[0])
    return m


def show_between(o, a, b):
    # hide_render keys: visible only on frames a..b, children too.
    for f, h in ((1, a > 1), (a, False), (b + 1, True)):
        if f < 1:
            continue
        o.hide_render = h
        o.keyframe_insert("hide_render", frame=f)
    for fc in _fcurves(o.animation_data.action, "hide_render"):
        for kp in fc.keyframe_points:
            kp.interpolation = "CONSTANT"
    for c in o.children:
        show_between(c, a, b)


def key_strength(m, frame, value):
    for n in m.node_tree.nodes:
        if n.type == "EMISSION":
            n.inputs[1].default_value = value
            n.inputs[1].keyframe_insert("default_value", frame=frame)
            return
        if n.type == "BSDF_PRINCIPLED":
            n.inputs["Emission Strength"].default_value = value
            n.inputs["Emission Strength"].keyframe_insert("default_value", frame=frame)
            return


def footage_image(path, start=1, offset=0, frames=None, cyclic=False):
    # A movie file as a texture: frame `start` of the scene shows frame `offset` of the file.
    img = bpy.data.images.load(os.path.abspath(path), check_existing=False)
    img.source = "MOVIE"
    img.colorspace_settings.name = "sRGB"
    return img, dict(start=start, offset=offset, frames=frames or img.frame_duration, cyclic=cyclic)


def footage_mat(name, path, strength=1.0, start=1, offset=0, frames=None, cyclic=True, extension="EXTEND"):
    # A screen: emission only, so it needs no light, shows the file's own colours, and does not noise.
    img, u = footage_image(path, start, offset, frames, cyclic)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o, e, t = nt.nodes.new("ShaderNodeOutputMaterial"), nt.nodes.new("ShaderNodeEmission"), nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    t.extension = extension
    t.interpolation = "Cubic"
    iu = t.image_user
    iu.use_auto_refresh = True
    iu.frame_start, iu.frame_offset, iu.frame_duration, iu.use_cyclic = u["start"], u["offset"], u["frames"], u["cyclic"]
    nt.links.new(t.outputs[0], e.inputs[0])
    e.inputs[1].default_value = strength
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def still_mat(name, path, strength=1.0):
    img = bpy.data.images.load(os.path.abspath(path), check_existing=True)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o, e, t = nt.nodes.new("ShaderNodeOutputMaterial"), nt.nodes.new("ShaderNodeEmission"), nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    t.extension = "EXTEND"
    nt.links.new(t.outputs[0], e.inputs[0])
    e.inputs[1].default_value = strength
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


# ---------- geometry ----------
def _obj(name, mesh, material=None, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    o.location, o.rotation_euler = loc, rot
    if material:
        mesh.materials.append(material)
    if parent:
        o.parent = parent
    return o


def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(o)
    o.location, o.rotation_euler = loc, rot
    if parent:
        o.parent = parent
    return o


def box(name, size, material=None, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, seg=4, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:], offset=bevel, segments=seg, profile=0.5, affect="EDGES")
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return _obj(name, me, material, loc, rot, parent)


def plane(name, w, h, material=None, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, flip_u=False):
    # Faces -Y (towards a camera on -Y looking +Y) with z up, UV 0..1: a screen.
    me = bpy.data.meshes.new(name)
    v = [(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)]
    me.from_pydata(v, [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    q = [(0, 0), (1, 0), (1, 1), (0, 1)]
    for i, l in enumerate(me.loops):
        uv.data[i].uv = q[l.vertex_index] if not flip_u else (1 - q[l.vertex_index][0], q[l.vertex_index][1])
    me.update()
    return _obj(name, me, material, loc, rot, parent)


def floor(size=200, base="#050a0a", rough=0.12, z=0, material=None):
    m = material or mat("floor", base, rough=rough, metal=0.0, coat=0.0)
    return plane("floor", size, size, m, (0, 0, z), (math.radians(90), 0, 0))


def cyl(name, r, h, material=None, loc=(0, 0, 0), rot=(0, 0, 0), verts=48, parent=None, bevel=0.0, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=h)
    if bevel > 0:
        edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=3, profile=0.5, affect="EDGES")
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return _obj(name, me, material, loc, rot, parent)


def sphere(name, r, material=None, loc=(0, 0, 0), parent=None, seg=32, scale=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = _obj(name, me, material, loc, (0, 0, 0), parent)
    if scale:
        o.scale = scale
    return o


def hex_prism(name, r, h, material=None, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, parent=None):
    o = cyl(name, r, h, material, loc, rot, verts=6, parent=parent, bevel=bevel)
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def text3d(name, body, size=1.0, depth=0.05, material=None, loc=(0, 0, 0), rot=(math.radians(90), 0, 0), font=None, align="CENTER", bevel=0.0, parent=None):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body, cu.size, cu.extrude = body, size, depth
    cu.align_x, cu.align_y = align, "CENTER"
    cu.bevel_depth, cu.bevel_resolution = bevel, 2
    path = font or ARGS.get("font") or "C:/Windows/Fonts/seguibl.ttf"
    if os.path.exists(path):
        cu.font = bpy.data.fonts.load(path, check_existing=True)
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    o.location, o.rotation_euler = loc, rot
    if material:
        cu.materials.append(material)
    if parent:
        o.parent = parent
    return o


def svg_curves(path, name="svg", scale=1.0, extrude=0.0, bevel=0.0):
    # Imports an SVG as curve objects under one empty, centred on the origin, in the XY plane (y up).
    before = set(bpy.data.objects)
    bpy.ops.preferences.addon_enable(module="io_curve_svg") if False else None
    bpy.ops.wm.grease_pencil_import_svg if False else None
    bpy.ops.import_curve.svg(filepath=os.path.abspath(path))
    new = [o for o in bpy.data.objects if o not in before]
    root = empty(name)
    pts = []
    for o in new:
        o.parent = root
        if o.type == "CURVE":
            o.data.extrude, o.data.bevel_depth = extrude, bevel
            o.data.dimensions = "2D"
            for sp in o.data.splines:
                for p in list(sp.bezier_points) + list(sp.points):
                    pts.append(o.matrix_world @ Vector(p.co[:3]))
    return root, new, pts


def torus(name, major, minor, material=None, loc=(0, 0, 0), seg=96, seg2=10, parent=None):
    me = bpy.data.meshes.new(name)
    v, f = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for j in range(seg2):
            b = 2 * math.pi * j / seg2
            r = major + minor * math.cos(b)
            v.append((r * math.cos(a), r * math.sin(a), minor * math.sin(b)))
    for i in range(seg):
        for j in range(seg2):
            f.append((i * seg2 + j, ((i + 1) % seg) * seg2 + j, ((i + 1) % seg) * seg2 + (j + 1) % seg2, i * seg2 + (j + 1) % seg2))
    me.from_pydata(v, [], f)
    for p in me.polygons:
        p.use_smooth = True
    return _obj(name, me, material, loc, (0, 0, 0), parent)


# The pack's mark in 3D, from the same vector numbers as brand/logo/roomler-mark*.svg (viewBox 120): six nodes, the
# circle, the mesh lines (stroke 2.2), and the R. Nothing is redrawn by eye; depth is all it adds. It stands upright,
# facing -Y, centred on its own origin; `size` is the width of the 120 box in scene units.
LOGO_NODES = [(110, 60), (85, 16.7), (35, 16.7), (10, 60), (35, 103.3), (85, 103.3)]
LOGO_Q = [((110, 60), (76.5, 31.42), (35, 16.7)), ((35, 16.7), (27, 60), (35, 103.3)), ((35, 103.3), (76.5, 88.58), (110, 60)),
          ((85, 16.7), (43.5, 31.42), (10, 60)), ((10, 60), (43.5, 88.58), (85, 103.3)), ((85, 103.3), (93, 60), (85, 16.7))]
LOGO_L = [((110, 60), (10, 60)), ((85, 16.7), (35, 103.3)), ((35, 16.7), (85, 103.3))]
LOGO_R_OUT = "M65.41 83 55.84 65.64H53.15V83H41.95V37H60.75Q66.19 37 70.03 38.9Q73.86 40.8 75.76 44.11Q77.66 47.42 77.66 51.48Q77.66 56.07 75.07 59.67Q72.48 63.28 67.44 64.78L78.05 83Z"
LOGO_R_IN = "M53.15 57.71H60.1Q63.18 57.71 64.72 56.2Q66.26 54.69 66.26 51.94Q66.26 49.32 64.72 47.81Q63.18 46.3 60.1 46.3H53.15Z"


def _path_points(d, steps=10):
    import re
    tok = re.findall(r"[MLHVQZ]|-?\d+\.?\d*", d)
    pts, i, cmd, cur = [], 0, None, (0, 0)
    while i < len(tok):
        if tok[i].isalpha():
            cmd = tok[i]
            i += 1
            if cmd == "Z":
                break
            continue
        if cmd in ("M", "L"):
            cur = (float(tok[i]), float(tok[i + 1]))
            pts.append(cur)
            i += 2
            if cmd == "M":
                cmd = "L"
        elif cmd == "H":
            cur = (float(tok[i]), cur[1])
            pts.append(cur)
            i += 1
        elif cmd == "V":
            cur = (cur[0], float(tok[i]))
            pts.append(cur)
            i += 1
        elif cmd == "Q":
            c, e = (float(tok[i]), float(tok[i + 1])), (float(tok[i + 2]), float(tok[i + 3]))
            for k in range(1, steps + 1):
                t = k / steps
                pts.append(((1 - t) ** 2 * cur[0] + 2 * (1 - t) * t * c[0] + t * t * e[0], (1 - t) ** 2 * cur[1] + 2 * (1 - t) * t * c[1] + t * t * e[1]))
            cur = e
            i += 4
    return pts


def logo3d(size=4.0, depth=None, line_mat=None, node_mat=None, r_mat=None, name="logo", parent=None, glow=2.2):
    k = size / 120.0
    depth = depth if depth is not None else 7 * k
    P = lambda p, y=0.0: (Vector((p[0] - 60, y, 60 - p[1])) * k)
    line_mat = line_mat or emit_mat(name + "-line", "#2BD4C0", glow)
    node_mat = node_mat or emit_mat(name + "-node", "#2BD4C0", glow)
    r_mat = r_mat or emit_mat(name + "-r", "#FFFFFF", 0.92)
    root = empty(name)
    if parent:
        root.parent = parent
    root.rotation_euler = (math.radians(90), 0, 0) if False else (0, 0, 0)

    def tube(pts, n):
        cu = bpy.data.curves.new(n, "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth, cu.bevel_resolution = 1.1 * k, 3
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for i, q in enumerate(pts):
            sp.points[i].co = (*P(q), 1)
        o = bpy.data.objects.new(n, cu)
        bpy.context.scene.collection.objects.link(o)
        cu.materials.append(line_mat)
        o.parent = root
        return o

    # The circle
    tube([(60 + 50 * math.cos(2 * math.pi * i / 96), 60 + 50 * math.sin(2 * math.pi * i / 96)) for i in range(97)], name + "-circle")
    for j, (a, c, b) in enumerate(LOGO_Q):
        tube([((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]) for t in [i / 24 for i in range(25)]], f"{name}-q{j}")
    for j, (a, b) in enumerate(LOGO_L):
        tube([a, b], f"{name}-l{j}")
    for j, n_ in enumerate(LOGO_NODES):
        o = sphere(f"{name}-n{j}", 6 * k, node_mat, P(n_), parent=root, seg=24)
    # The R, extruded: outline minus counter, with the pack's clearance around it as a dark backing.
    outer, inner = _path_points(LOGO_R_OUT), _path_points(LOGO_R_IN)

    def r_solid(n, material, y_front, thick, grow=0.0, hole=True, shape=None):
        # A 2D curve with the counter as a second spline: Blender fills it with the hole. Stands up facing -Y.
        cu = bpy.data.curves.new(n, "CURVE")
        cu.dimensions, cu.fill_mode = "2D", "BOTH"
        cu.extrude, cu.offset = thick / 2, grow
        for loop in (shape,) if shape else ((outer, inner) if hole else (outer,)):
            sp = cu.splines.new("POLY")
            sp.points.add(len(loop) - 1)
            for i, q in enumerate(loop):
                sp.points[i].co = ((q[0] - 60) * k, (60 - q[1]) * k, 0, 1)
            sp.use_cyclic_u = True
        o = bpy.data.objects.new(n, cu)
        bpy.context.scene.collection.objects.link(o)
        cu.materials.append(material)
        o.parent = root
        o.rotation_euler = (math.radians(90), 0, 0)
        o.location = (0, y_front + thick / 2, 0)
        return o

    # The pack's clearance: its mask cuts the mesh lines 3 units around the R, here a dark backing just in front of them.
    r_solid(name + "-Rclear", emit_mat(name + "-clear", "#050c0c", 1.0), -2.2 * k, 1.0 * k, grow=3 * k, hole=False)
    # The mask's second shape: the notch between the stem and the leg.
    r_solid(name + "-Rclear2", emit_mat(name + "-clear2", "#050c0c", 1.0), -2.2 * k, 1.0 * k, grow=1.5 * k, hole=False, shape=_path_points("M53.15 65.64H55.84L65.41 83H53.15Z"))
    r_solid(name + "-R", r_mat, -depth * 0.9, depth * 0.55)
    return root


# ---------- lights and camera ----------
def strip(name, power, size, loc, rot=(0, 0, 0), color="#ffffff", size_y=None, in_glossy=False):
    # Area light. Off in glossy rays by default: the screens' black glass must not show white blocks.
    l = bpy.data.lights.new(name, "AREA")
    l.shape = "RECTANGLE"
    l.size, l.size_y = size, size_y or size
    l.energy = power
    l.color = hex_rgb(color)
    o = bpy.data.objects.new(name, l)
    bpy.context.scene.collection.objects.link(o)
    o.location, o.rotation_euler = loc, rot
    o.visible_glossy = in_glossy
    return o


def point(name, power, loc, color="#ffffff", radius=0.05):
    l = bpy.data.lights.new(name, "POINT")
    l.energy, l.shadow_soft_size, l.color = power, radius, hex_rgb(color)
    o = bpy.data.objects.new(name, l)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    return o


def camera(lens=35, loc=(0, -10, 2), look=(0, 0, 1), fstop=None, focus=None):
    c = bpy.data.cameras.new("cam")
    c.lens = lens
    c.sensor_width = 36
    c.clip_start, c.clip_end = 0.01, 50000
    o = bpy.data.objects.new("cam", c)
    bpy.context.scene.collection.objects.link(o)
    bpy.context.scene.camera = o
    o.location = loc
    tgt = empty("look", look)
    t = o.constraints.new("TRACK_TO")
    t.target, t.track_axis, t.up_axis = tgt, "TRACK_NEGATIVE_Z", "UP_Y"
    if fstop:
        c.dof.use_dof = True
        c.dof.aperture_fstop = fstop
        c.dof.focus_object = focus or tgt
    return o, tgt


# ---------- keys: every move is explicit, with an ease chosen by its role ----------
def key(o, prop, frame, value=None, interp="BEZIER", handle=None, easing=None):
    if value is not None:
        setattr(o, prop, value)
    o.keyframe_insert(prop, frame=frame)
    ad = o.animation_data
    if ad and ad.action:
        for fc in _fcurves(ad.action, prop):
            for kp in fc.keyframe_points:
                if abs(kp.co.x - frame) < 0.01:
                    kp.interpolation = interp
                    if handle:
                        kp.handle_left_type = kp.handle_right_type = handle
                    if easing:
                        kp.easing = easing


def _fcurves(action, prop):
    out = []
    try:
        for fc in action.fcurves:
            if fc.data_path == prop:
                out.append(fc)
    except AttributeError:
        for layer in action.layers:
            for strip_ in layer.strips:
                for bag in strip_.channelbags:
                    for fc in bag.fcurves:
                        if fc.data_path == prop:
                            out.append(fc)
    return out


def path(o, prop, keys, interp="BEZIER", handle="AUTO_CLAMPED"):
    # keys: [(frame, value), ...]
    for f, v in keys:
        key(o, prop, f, v, interp, handle)


def ease(t, kind="inout"):
    t = max(0.0, min(1.0, t))
    if kind == "out":
        return 1 - (1 - t) ** 4
    if kind == "in":
        return t ** 3
    if kind == "linear":
        return t
    return t * t * (3 - 2 * t) if kind == "smooth" else (4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2)


def lerp(a, b, t):
    return a + (b - a) * t


def shake(o, frame, amp, n=8):
    # A decaying wobble of an object already keyed elsewhere: read its value, key small offsets over n frames.
    bpy.context.scene.frame_set(frame)
    base = o.location.copy()
    import random
    r = random.Random(frame)
    for i in range(n):
        a = amp * (1 - i / n) ** 2
        key(o, "location", frame + i, base + Vector((r.uniform(-a, a), 0, r.uniform(-a, a))))
    key(o, "location", frame + n, base)


def screen_corners(o, w, h):
    # A plane's four corners in pixels for the current frame (for an exact footage overlay in HyperFrames).
    from bpy_extras.object_utils import world_to_camera_view as w2c
    s = bpy.context.scene
    cam = s.camera
    rx, ry = s.render.resolution_x, s.render.resolution_y
    out = []
    for c in [(-w / 2, 0, h / 2), (w / 2, 0, h / 2), (w / 2, 0, -h / 2), (-w / 2, 0, -h / 2)]:
        p = w2c(s, cam, o.matrix_world @ Vector(c))
        out.append((round(p.x * rx, 2), round((1 - p.y) * ry, 2)))
    return out


# ---------- render ----------
def _avail_mb():
    if not hasattr(ctypes, "windll"):
        return 1e9
    class M(ctypes.Structure):
        _fields_ = [("l", ctypes.c_ulong), ("load", ctypes.c_ulong), ("total", ctypes.c_ulonglong), ("avail", ctypes.c_ulonglong),
                    ("tp", ctypes.c_ulonglong), ("ap", ctypes.c_ulonglong), ("tv", ctypes.c_ulonglong), ("av", ctypes.c_ulonglong), ("e", ctypes.c_ulonglong)]
    m = M()
    m.l = ctypes.sizeof(M)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
    return min(m.avail, m.ap) / (1024 * 1024)


def _wait_ok():
    hold = os.environ.get("AVATAR_GPU_HOLD", "")
    while (hold and os.path.exists(hold)) or _avail_mb() < float(os.environ.get("RB_MIN_FREE_MB", 8000)):
        print("waiting: gpu hold or low memory", flush=True)
        time.sleep(20)


def _ranges(spec, a, b):
    out = []
    for part in spec.split(","):
        if "-" in part:
            x, y = part.split("-")
            out += list(range(int(x), int(y) + 1))
        else:
            out.append(int(part))
    return [f for f in out if a <= f <= b]


def finish(on_frame=None):
    s = bpy.context.scene
    out = ARGS.get("out")
    if ARGS.get("blend"):
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(ARGS["blend"]))
    if not out:
        print("no --out: scene built only")
        return
    os.makedirs(out, exist_ok=True)
    frames = _ranges(ARGS.get("stills") or ARGS.get("frames") or f"{s.frame_start}-{s.frame_end}", s.frame_start, s.frame_end)
    t0 = time.time()
    done = 0
    for f in frames:
        p = os.path.join(out, f"f_{f:05d}.png")
        if os.path.exists(p) and os.path.getsize(p) > 1000 and not ARGS.get("force"):
            continue
        _wait_ok()
        s.frame_set(f)
        if on_frame:
            on_frame(f)
        s.render.filepath = p
        bpy.ops.render.render(write_still=True)
        done += 1
        if done % 10 == 1:
            print(f"rendered {f} ({done}/{len(frames)}) {(time.time() - t0) / done:.2f} s/frame", flush=True)
    print(f"RENDER_DONE {done} frames in {time.time() - t0:.0f} s", flush=True)
