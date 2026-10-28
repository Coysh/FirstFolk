"""
Shared kit for FirstFolk's Blender-built models.

Models are authored in *game space* (Three.js: +y up, door facing +z, one tile = 1 unit) as plain
Python geometry, then turned into one Blender mesh per model with flat per-face vertex colours.
The glTF exporter's Y-up conversion maps Blender (x, -z, y) back to game (x, y, z), so what you see
here is what the game loads.

Colours come straight from src/render/palette.ts, so the Blender art and the code art share one
palette. Colour is stored linear (like THREE.Color.setHex) so both renderers agree.

Special vertex data:
  * MARKER (#ff00ff) faces take the family crest colour at runtime (src/render/art.ts).
  * `_SWAY` (0..1 per vertex) drives wind flutter for flags and pennants (src/render/wind.ts).
  * Empties named "<model>@<anchor>" mark effect positions (e.g. "hut@smoke").
"""
import math
import os
import random
import re
import types

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
MARKER = 0xFF00FF


def _load_palette():
    src = open(os.path.join(ROOT, 'src', 'render', 'palette.ts'), encoding='utf8').read()
    block = src.split('export const C = {', 1)[1].split('};', 1)[0]
    return {k: int(v, 16) for k, v in re.findall(r'(\w+):\s*0x([0-9a-fA-F]{6})', block)}


C = types.SimpleNamespace(**_load_palette())


def lin(h, shade=1.0):
    def f(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f((h >> 16) & 255) * shade, f((h >> 8) & 255) * shade, f(h & 255) * shade)


# ---------------------------------------------------------------------------------------------
# primitives: each returns (verts, faces, tags). tags[i] is 'cap' or 'side' (caps may take a
# different colour, e.g. the pale end grain of a log).
# ---------------------------------------------------------------------------------------------

def box(w, h, d, top=(1.0, 1.0)):
    x, y, z = w / 2, h / 2, d / 2
    tx, tz = top
    v = [(-x, -y, -z), (x, -y, -z), (x, -y, z), (-x, -y, z),
         (-x * tx, y, -z * tz), (x * tx, y, -z * tz), (x * tx, y, z * tz), (-x * tx, y, z * tz)]
    f = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return v, f, ['cap', 'cap', 'side', 'side', 'side', 'side']


def prism(n, rb, rt, h, phase=0.5):
    """Cylinder / frustum / cone along y (rt = 0 gives a cone). Facets centred on +z when phase = .5."""
    v, f, t = [], [], []
    for i in range(n):
        a = (i + phase) * 2 * math.pi / n
        v.append((math.sin(a) * rb, -h / 2, math.cos(a) * rb))
    cone = rt <= 1e-6
    if cone:
        v.append((0.0, h / 2, 0.0))
    else:
        for i in range(n):
            a = (i + phase) * 2 * math.pi / n
            v.append((math.sin(a) * rt, h / 2, math.cos(a) * rt))
    for i in range(n):
        j = (i + 1) % n
        if cone:
            f.append((i, j, n))
        else:
            f.append((i, j, n + j, n + i))
        t.append('side')
    f.append(tuple(range(n)))
    t.append('cap')
    if not cone:
        f.append(tuple(range(n, 2 * n)))
        t.append('cap')
    return v, f, t


def ico(jitter=0.0, rng=None):
    p = (1 + 5 ** 0.5) / 2
    raw = [(-1, p, 0), (1, p, 0), (-1, -p, 0), (1, -p, 0), (0, -1, p), (0, 1, p), (0, -1, -p), (0, 1, -p),
           (p, 0, -1), (p, 0, 1), (-p, 0, -1), (-p, 0, 1)]
    v = []
    for x, y, z in raw:
        n = math.sqrt(x * x + y * y + z * z)
        k = 1.0 + ((rng.random() - 0.5) * 2 * jitter if rng else 0.0)
        v.append((x / n * k, y / n * k, z / n * k))
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6),
         (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10),
         (8, 6, 7), (9, 8, 1)]
    return v, f, ['side'] * len(f)


def sphere(seg=8, rings=5):
    v = [(0.0, -1.0, 0.0)]
    for r in range(1, rings):
        lat = -math.pi / 2 + math.pi * r / rings
        for s in range(seg):
            a = s * 2 * math.pi / seg
            v.append((math.cos(lat) * math.sin(a), math.sin(lat), math.cos(lat) * math.cos(a)))
    v.append((0.0, 1.0, 0.0))
    top = len(v) - 1
    f = []
    for s in range(seg):
        f.append((0, 1 + (s + 1) % seg, 1 + s))
    for r in range(rings - 2):
        for s in range(seg):
            a = 1 + r * seg + s
            b = 1 + r * seg + (s + 1) % seg
            f.append((a, b, b + seg, a + seg))
    last = 1 + (rings - 2) * seg
    for s in range(seg):
        f.append((last + s, last + (s + 1) % seg, top))
    return v, f, ['side'] * len(f)


def halfpipe(r, length, seg=8):
    """An arched canvas cover: a half cylinder along x (open underneath), with half-disc end caps."""
    v, f, t = [], [], []
    for i in range(seg + 1):
        a = math.pi * i / seg
        v.append((-length / 2, math.sin(a) * r, math.cos(a) * r))
    for i in range(seg + 1):
        a = math.pi * i / seg
        v.append((length / 2, math.sin(a) * r, math.cos(a) * r))
    n = seg + 1
    for i in range(seg):
        f.append((i, i + 1, n + i + 1, n + i))
        t.append('side')
    f.append(tuple(range(n)))
    t.append('cap')
    f.append(tuple(range(n, 2 * n)))
    t.append('cap')
    return v, f, t


def gable(w, d, h):
    """Gable prism, ridge along x, base at y = 0, centred on the eave."""
    x, z = w / 2, d / 2
    v = [(-x, 0, -z), (x, 0, -z), (x, 0, z), (-x, 0, z), (-x, h, 0), (x, h, 0)]
    f = [(3, 2, 5, 4), (1, 0, 4, 5), (0, 3, 4), (2, 1, 5), (0, 1, 2, 3)]
    return v, f, ['side'] * 5


def extrude(pts, t):
    """A flat polygon in the xy plane (counter-clockwise seen from +z) extruded t along z (centred)."""
    n = len(pts)
    v = [(x, y, -t / 2) for x, y in pts] + [(x, y, t / 2) for x, y in pts]
    f = [tuple(range(n, 2 * n)), tuple(reversed(range(n)))]
    tags = ['cap', 'cap']
    for i in range(n):
        j = (i + 1) % n
        f.append((i, j, n + j, n + i))
        tags.append('side')
    return v, f, tags


# ---------------------------------------------------------------------------------------------
# the model accumulator
# ---------------------------------------------------------------------------------------------

def _rotmat(rx, ry, rz):
    """Three.js Euler 'XYZ' (R = Rx * Ry * Rz), so rot= means the same here as in models.ts."""
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    return [
        [cy * cz, -cy * sz, sy],
        [cx * sz + sx * cz * sy, cx * cz - sx * sz * sy, -sx * cy],
        [sx * sz - cx * cz * sy, sx * cz + cx * sz * sy, cx * cy],
    ]


def _orient(v, faces):
    """Wind every face outwards (for convex primitives) by testing against the centroid."""
    cx = sum(p[0] for p in v) / len(v)
    cy = sum(p[1] for p in v) / len(v)
    cz = sum(p[2] for p in v) / len(v)
    out = []
    for f in faces:
        nx = ny = nz = 0.0
        fx = fy = fz = 0.0
        for i in range(len(f)):
            a, b = v[f[i]], v[f[(i + 1) % len(f)]]
            nx += (a[1] - b[1]) * (a[2] + b[2])
            ny += (a[2] - b[2]) * (a[0] + b[0])
            nz += (a[0] - b[0]) * (a[1] + b[1])
            fx += a[0]
            fy += a[1]
            fz += a[2]
        k = len(f)
        if (fx / k - cx) * nx + (fy / k - cy) * ny + (fz / k - cz) * nz < 0:
            f = tuple(reversed(f))
        out.append(tuple(f))
    return out


class Model:
    def __init__(self, name):
        self.name = name
        self.v, self.f, self.fc, self.sw = [], [], [], []
        self.anchors = {}

    def add(self, prim, color, pos=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), cap=None, sway=None,
            convex=True, shade=1.0):
        verts, faces, tags = prim
        R = _rotmat(*rot)
        out = []
        for x, y, z in verts:
            x, y, z = x * scale[0], y * scale[1], z * scale[2]
            out.append((R[0][0] * x + R[0][1] * y + R[0][2] * z + pos[0],
                        R[1][0] * x + R[1][1] * y + R[1][2] * z + pos[1],
                        R[2][0] * x + R[2][1] * y + R[2][2] * z + pos[2]))
        if convex:
            faces = _orient(out, faces)
        base = len(self.v)
        self.v.extend(out)
        side = lin(color, shade)
        capc = lin(cap if cap is not None else color, shade)
        for f, t in zip(faces, tags):
            self.f.append(tuple(i + base for i in f))
            self.fc.append(capc if t == 'cap' else side)
        if sway is None:
            self.sw.extend([0.0] * len(out))
        else:
            self.sw.extend([float(sway(p) if callable(sway) else sway) for p in out])
        return self

    def anchor(self, name, pos):
        self.anchors[name] = pos

    def tris(self):
        return sum(len(f) - 2 for f in self.f)

    def height(self):
        return max(p[1] for p in self.v)

    def extent(self):
        return (min(p[0] for p in self.v), max(p[0] for p in self.v), min(p[2] for p in self.v), max(p[2] for p in self.v))

    def build(self, coll):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata([(x, -z, y) for x, y, z in self.v], [], self.f)
        me.update()
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        flat = []
        for fi, poly in enumerate(me.polygons):
            for _ in poly.loop_indices:
                flat.extend((*self.fc[fi], 1.0))
        ca.data.foreach_set('color', flat)
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
        sw = me.attributes.new('_SWAY', 'FLOAT', 'POINT')
        sw.data.foreach_set('value', self.sw)
        for p in me.polygons:
            p.use_smooth = False
        obj = bpy.data.objects.new(self.name, me)
        coll.objects.link(obj)
        objs = [obj]
        for a, (x, y, z) in self.anchors.items():
            e = bpy.data.objects.new(f'{self.name}@{a}', None)
            e.location = (x, -z, y)
            coll.objects.link(e)
            objs.append(e)
        return objs


# ---------------------------------------------------------------------------------------------
# reusable bits of storybook architecture
# ---------------------------------------------------------------------------------------------

def rng_for(name):
    return random.Random(sum(ord(c) * (i + 7) for i, c in enumerate(name)))


def rock(m, rng, pos, r, color, squash=0.7, spin=None):
    m.add(ico(0.14, rng), color, pos=pos, rot=(0, spin if spin is not None else rng.random() * 6, 0), scale=(r, r * squash, r * 0.9))


def log(m, x, y, z, length=0.4, r=0.055, axis='x', color=None, cap=None):
    rot = (0, 0, math.pi / 2) if axis == 'x' else (math.pi / 2, 0, 0)
    m.add(prism(6, r, r, length), color or C.wood, pos=(x, y, z), rot=rot, cap=cap if cap is not None else C.lightWood)


def log_pile(m, x, z, n=3, axis='x', y0=0.0, length=0.42):
    spots = [(-0.095, 0), (0.095, 0), (0, 0.15), (-0.19, 0), (0.19, 0)]
    for i in range(n):
        dx, dy = spots[i % len(spots)]
        if axis == 'x':
            log(m, x, y0 + 0.07 + dy, z + dx, length, 0.06, 'x')
        else:
            log(m, x + dx, y0 + 0.07 + dy, z, length, 0.06, 'z')


def barrel(m, x, z, r=0.1, h=0.22, y0=0.0, color=None):
    c = color or C.wood
    m.add(prism(8, r * 0.9, r, h * 0.5), c, pos=(x, y0 + h * 0.25, z))
    m.add(prism(8, r, r * 0.9, h * 0.5), c, pos=(x, y0 + h * 0.75, z))
    for yy in (0.2, 0.8):
        m.add(prism(8, r * 1.03, r * 1.03, 0.025), C.iron, pos=(x, y0 + h * yy, z))


def crate(m, x, z, s=0.22, y0=0.0, rot=0.0, color=None):
    m.add(box(s, s, s), color or C.lightWood, pos=(x, y0 + s / 2, z), rot=(0, rot, 0))
    m.add(box(s * 1.04, s * 0.14, s * 1.04), C.wood, pos=(x, y0 + s * 0.2, z), rot=(0, rot, 0))
    m.add(box(s * 1.04, s * 0.14, s * 1.04), C.wood, pos=(x, y0 + s * 0.8, z), rot=(0, rot, 0))


def fence(m, x0, x1, z, posts=4):
    """A low wattle fence along x."""
    for i in range(posts):
        m.add(box(0.04, 0.22, 0.04), C.wood, pos=(x0 + (x1 - x0) * i / (posts - 1), 0.11, z))
    m.add(box(abs(x1 - x0), 0.03, 0.02), C.lightWood, pos=((x0 + x1) / 2, 0.16, z))
    m.add(box(abs(x1 - x0), 0.03, 0.02), C.lightWood, pos=((x0 + x1) / 2, 0.08, z))


def wheel(m, x, y, z, r=0.22):
    """A cart wheel with its axle along z: rim, lighter felloe, hub and crossed spokes."""
    m.add(prism(12, r, r, 0.055), C.darkTimber, pos=(x, y, z), rot=(math.pi / 2, 0, 0))
    m.add(prism(12, r * 0.78, r * 0.78, 0.07), C.wood, pos=(x, y, z), rot=(math.pi / 2, 0, 0))
    for ang in (0.3, 0.3 + math.pi / 2):
        m.add(box(r * 1.5, 0.03, 0.078), C.darkTimber, pos=(x, y, z), rot=(0, 0, ang))
    m.add(prism(6, 0.05, 0.05, 0.1), C.iron, pos=(x, y, z), rot=(math.pi / 2, 0, 0))


def campfire(m, x, z):
    """A ring of stones, crossed logs, a flame, a tripod and a hanging pot."""
    for i in range(7):
        a = i / 7 * 2 * math.pi
        m.add(ico(), C.stoneDark, pos=(x + math.cos(a) * 0.17, 0.035, z + math.sin(a) * 0.17), scale=(0.055, 0.045, 0.055), rot=(0, a, 0))
    log(m, x, 0.06, z, 0.3, 0.025, 'x', C.darkTimber)
    log(m, x, 0.065, z, 0.3, 0.025, 'z', C.darkTimber)
    m.add(prism(5, 0.075, 0, 0.2), C.ember, pos=(x, 0.15, z))
    m.add(prism(4, 0.04, 0, 0.13, phase=0), 0xFFD166, pos=(x, 0.14, z))
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.5
        m.add(prism(4, 0.014, 0.012, 0.5), C.wood, pos=(x + math.sin(a) * 0.1, 0.26, z + math.cos(a) * 0.1), rot=(-math.cos(a) * 0.4, 0, math.sin(a) * 0.4))
    m.add(prism(8, 0.075, 0.095, 0.1), C.iron, pos=(x, 0.3, z))


def pole(m, x, y0, z, h, r=0.022, color=None):
    m.add(prism(5, r, r * 0.9, h), color or C.wood, pos=(x, y0 + h / 2, z))


def flag(m, x, y, z, color, w=0.34, h=0.2, tail=True, flip=False):
    """A swallow-tailed pennant flying along +x from a pole at (x, y, z); `y` is the flag's top edge."""
    s = -1 if flip else 1
    top, bot = y, y - h
    if tail:
        pts = [(0, top), (0, bot), (s * w, bot), (s * w * 0.72, (top + bot) / 2), (s * w, top)]
    else:
        pts = [(0, top), (0, bot), (s * w, bot), (s * w, top)]
    if flip:
        pts = pts[::-1]
    m.add(extrude(pts, 0.022), color, pos=(x, 0, z), convex=False, sway=lambda p: min(1.0, abs(p[0] - x) / w))


def door(m, x, z, w=0.26, h=0.36, y0=0.0, frame=C.darkTimber, color=None, step=True, arch=True):
    """A planked, arched door on a wall facing +z; z is the wall surface."""
    m.add(box(w + 0.1, h + 0.07, 0.05), frame, pos=(x, y0 + h / 2 + 0.02, z + 0.005))
    if arch:
        m.add(prism(8, (w + 0.1) / 2, (w + 0.1) / 2, 0.05), frame, pos=(x, y0 + h + 0.04, z + 0.005), rot=(math.pi / 2, 0, 0))
    m.add(box(w, h, 0.06), color or C.door, pos=(x, y0 + h / 2, z + 0.02))
    if arch:
        m.add(prism(8, w / 2, w / 2, 0.06), color or C.door, pos=(x, y0 + h, z + 0.02), rot=(math.pi / 2, 0, 0))
    for yy in (0.28, 0.68):
        m.add(box(w * 1.02, 0.03, 0.065), C.iron, pos=(x, y0 + h * yy, z + 0.025))
    m.add(prism(5, 0.018, 0.018, 0.03), C.lightWood, pos=(x + w * 0.3, y0 + h * 0.5, z + 0.06), rot=(math.pi / 2, 0, 0))
    if step:
        m.add(box(w + 0.16, 0.05, 0.16), C.stone, pos=(x, y0 + 0.02, z + 0.1))


def window(m, x, y, z, rot_y=0.0, w=0.13, h=0.14, shutter=True, box_flowers=False):
    """A warm lit window with shutters, on a wall whose outward normal is rotated rot_y about y."""
    sn, cs = math.sin(rot_y), math.cos(rot_y)

    def at(lx, ly, lz):
        return (x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs)

    m.add(box(w + 0.06, h + 0.06, 0.03), C.timber, pos=at(0, 0, 0.0), rot=(0, rot_y, 0))
    m.add(box(w, h, 0.04), C.glow, pos=at(0, 0, 0.005), rot=(0, rot_y, 0))
    m.add(box(0.02, h, 0.045), C.timber, pos=at(0, 0, 0.012), rot=(0, rot_y, 0))
    m.add(box(w, 0.02, 0.045), C.timber, pos=at(0, 0, 0.012), rot=(0, rot_y, 0))
    if shutter:
        for sx in (-1, 1):
            m.add(box(0.055, h + 0.02, 0.025), C.wood, pos=at(sx * (w / 2 + 0.06), 0, 0.01), rot=(0, rot_y, 0))
    if box_flowers:
        m.add(box(w + 0.08, 0.05, 0.07), C.wood, pos=at(0, -h / 2 - 0.05, 0.05), rot=(0, rot_y, 0))
        for k, col in enumerate((C.berry, C.leafLight, 0xE0707A)):
            m.add(ico(), col, pos=at((k - 1) * 0.045, -h / 2 - 0.0, 0.06), scale=(0.028, 0.028, 0.028))


def stone_footing(m, rng, w, d, cx, cz, h=0.14, color=None):
    m.add(box(w, h, d), color or C.stoneDark, pos=(cx, h / 2, cz))
    for i in range(9):
        side = i % 4
        t = rng.random()
        if side == 0:
            p = (cx - w / 2 + t * w, cz + d / 2)
        elif side == 1:
            p = (cx - w / 2 + t * w, cz - d / 2)
        elif side == 2:
            p = (cx - w / 2, cz - d / 2 + t * d)
        else:
            p = (cx + w / 2, cz - d / 2 + t * d)
        rock(m, rng, (p[0], h * 0.55, p[1]), 0.075 + rng.random() * 0.03, rng.choice((C.stone, C.rock, C.stoneDark)), 0.7)


def thatch_roof(m, w, d, h, y, cx, cz, color, ridge=None, light=None, overhang=0.13, thick=0.075, fringe=True):
    """
    A thick gable thatch with the ridge running along z (front-to-back, like the old roofs):
    two slabs, a ridge roll, and a fringe of drooping tufts along both eaves.
    """
    hx = w / 2 + overhang
    L = math.hypot(hx, h)
    th = math.atan2(h, hx)
    ln = d + 0.2
    nx, ny = math.sin(th), math.cos(th)
    for sx in (-1, 1):
        mx, my = sx * hx / 2, h / 2
        c = light if (light is not None and sx > 0) else color
        m.add(box(L + 0.02, thick, ln), c, pos=(cx + mx - sx * nx * thick / 2, y + my - ny * thick / 2, cz), rot=(0, 0, -sx * th))
    m.add(prism(6, 0.075, 0.075, ln + 0.06), ridge or C.thatchDark, pos=(cx, y + h + 0.01, cz), rot=(math.pi / 2, 0, 0))
    if fringe:
        n = max(5, int(ln / 0.15))
        for sx in (-1, 1):
            for i in range(n):
                zz = cz - ln / 2 + (i + 0.5) * ln / n
                m.add(prism(4, 0.06, 0, 0.1, phase=0), ridge or C.thatchDark, pos=(cx + sx * (hx - 0.01), y - 0.045 - thick * 0.3, zz), rot=(math.pi, 0, sx * 0.25))


def roof_apex(h, w, overhang=0.13, thick=0.075):
    """Height of the gable infill's apex so it sits just under the thatch slabs (never through them)."""
    hx = w / 2 + overhang
    return h - thick / math.cos(math.atan2(h, hx)) - 0.025


def kingpost_gable(m, w, h, y, z, wall, timber=None):
    """Timber trim on a gable end: a kingpost, a collar beam and a tie beam. h = roof_apex(...)."""
    t = timber or C.timber
    m.add(box(0.05, h * 0.82, 0.06), t, pos=(0, y + h * 0.41, z + 0.01))
    m.add(box(w * 0.5, 0.045, 0.06), t, pos=(0, y + h * 0.3, z + 0.01))
    m.add(box(w * 0.94, 0.04, 0.06), t, pos=(0, y + 0.03, z + 0.01))


def half_timber(m, w, h, d, cx, cz, y0, wall, door_x=0.0, timber=None):
    """Plaster walls with an exposed timber frame: corner posts, mid rails and front braces."""
    t = timber or C.timber
    m.add(box(w, h, d), wall, pos=(cx, y0 + h / 2, cz))
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.add(box(0.075, h + 0.02, 0.075), t, pos=(cx + sx * w / 2, y0 + h / 2, cz + sz * d / 2))
    for z in (cz + d / 2, cz - d / 2):
        m.add(box(w + 0.03, 0.05, 0.06), t, pos=(cx, y0 + h * 0.62, z))
    for x in (cx + w / 2, cx - w / 2):
        m.add(box(0.06, 0.05, d + 0.03), t, pos=(x, y0 + h * 0.62, cz))
    # front braces, leaning towards the door
    for sx in (-1, 1):
        run = w / 2 - 0.2
        L = math.hypot(run, h * 0.6)
        ang = math.atan2(h * 0.6, run)
        m.add(box(L, 0.04, 0.05), t, pos=(cx + sx * (w / 2 - run / 2 - 0.02), y0 + h * 0.3 + 0.01, cz + d / 2 + 0.012), rot=(0, 0, sx * ang))


# ---------------------------------------------------------------------------------------------
# scene plumbing: a private scene, so the user's own Blender scene is never touched
# ---------------------------------------------------------------------------------------------

def fresh_scene(name='FirstFolkArt'):
    old = bpy.data.scenes.get(name)
    if old:
        for o in list(old.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        for c in list(old.collection.children):
            bpy.data.collections.remove(c)
        if bpy.context.window and bpy.context.window.scene == old:
            other = next((s for s in bpy.data.scenes if s != old), None)
            if other:
                bpy.context.window.scene = other
        bpy.data.scenes.remove(old)
    for me in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(me)
    sc = bpy.data.scenes.new(name)
    if bpy.context.window:
        bpy.context.window.scene = sc
    return sc


def collection(scene, name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


def export_glb(objs, path):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    op = bpy.ops.export_scene.gltf
    props = set(op.get_rna_type().properties.keys())
    scene = objs[0].users_scene[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_texcoords=False, export_normals=False, use_active_scene=True, export_meshopt_compression_enable=True, export_materials='NONE', export_cameras=False,
              export_lights=False, export_extras=False, export_attributes=True, export_vertex_color='ACTIVE',
              export_active_vertex_color_when_no_material=True, export_draco_mesh_compression_enable=False,
              export_image_format='NONE', export_animations=False, export_skins=False, export_morph=False)
    # Headless runs have no window, so pin the exporter's context to our scene explicitly.
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        op(**{k: v for k, v in kw.items() if k in props})


def shoot(scene, path, target, dist, yaw=0.6, pitch=0.86, lens=50, res=(1500, 900)):
    """Render a preview from the game's strategy-camera angle (yaw / pitch in game terms)."""
    tx, ty, tz = target
    cam = bpy.data.objects.get('PreviewCam')
    if cam is None:
        cam = bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
        scene.collection.objects.link(cam)
        aim = bpy.data.objects.new('PreviewAim', None)
        scene.collection.objects.link(aim)
        c = cam.constraints.new('TRACK_TO')
        c.target = aim
        c.track_axis = 'TRACK_NEGATIVE_Z'
        c.up_axis = 'UP_Y'
    aim = bpy.data.objects['PreviewAim']
    cam.data.lens = lens
    gx, gy, gz = tx + math.sin(yaw) * math.cos(pitch) * dist, ty + math.sin(pitch) * dist, tz + math.cos(yaw) * math.cos(pitch) * dist
    cam.location = (gx, -gz, gy)
    aim.location = (tx, -tz, ty)
    scene.camera = cam
    r = scene.render
    r.engine = 'BLENDER_WORKBENCH'
    r.resolution_x, r.resolution_y = res
    r.resolution_percentage = 100
    r.filepath = path
    r.image_settings.file_format = 'PNG'
    sh = scene.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'VERTEX'
    sh.show_shadows = True
    sh.show_cavity = False
    sh.show_object_outline = False
    scene.view_settings.view_transform = 'Standard'
    scene.world = scene.world or bpy.data.worlds.new('PreviewWorld')
    scene.world.color = (0.62, 0.78, 0.9)
    bpy.ops.render.render(write_still=True, scene=scene.name)
    return path
