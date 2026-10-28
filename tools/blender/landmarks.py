"""
Props that mark discoveries and landmarks out in the wild, centred on their tile (ground at y = 0,
nothing past ~1.0). Models are named "discovery_<kind>" to match src/sim/defs.ts DiscoveryKind.
Landmarks are the things you plant a banner on, so each one needs a silhouette you can read from far.
"""
import math

import storybook as sb
from storybook import C, GLOW, MARKER, Model, box, ico, prism, extrude, rock, log, barrel, crate, pole, flag, wheel, flame, campfire, rng_for
from kit2 import brazier, tent, sack, menhir

PI = math.pi


def cart():
    m = Model('discovery_cart')
    rng = rng_for('cart')
    m.add(box(0.95, 0.1, 0.56), C.wood, pos=(0, 0.34, 0), rot=(0, 0.3, 0.2))
    for sz in (-1, 1):
        m.add(box(0.95, 0.18, 0.04), C.darkTimber, pos=(0, 0.45, sz * 0.27), rot=(0, 0.3, 0.2))
    wheel(m, -0.3, 0.2, 0.33, 0.21)
    m.add(prism(12, 0.21, 0.21, 0.055), C.darkTimber, pos=(0.62, 0.06, -0.3), rot=(0.12, 0.4, PI / 2))
    m.add(box(0.5, 0.05, 0.05), C.wood, pos=(-0.78, 0.18, 0.02), rot=(0, 0.3, -0.35))
    crate(m, 0.1, 0.0, 0.26, 0.38, rot=0.6)
    sack(m, -0.28, -0.05, 0.16, 0.38)
    barrel(m, 0.45, 0.55, 0.11, 0.24)
    for k in range(4):
        m.add(ico(), 0xE0C878, pos=(0.55 + k * 0.05, 0.03, 0.2 + (k % 2) * 0.08), scale=(0.04, 0.025, 0.04))
    m.add(box(0.4, 0.015, 0.3), C.cloth, pos=(0.05, 0.025, 0.62), rot=(0, 0.5, 0))
    return m


def ruins():
    m = Model('discovery_ruins')
    rng = rng_for('ruins')
    m.add(box(1.3, 0.08, 1.0), C.stoneDark, pos=(0, 0.03, 0))
    for x, h in ((-0.5, 0.95), (0.5, 0.65)):
        m.add(prism(8, 0.12, 0.1, h), C.stone, pos=(x, h / 2, -0.2))
        m.add(prism(8, 0.17, 0.17, 0.08), C.stoneDark, pos=(x, 0.04, -0.2))
        m.add(prism(8, 0.16, 0.13, 0.07), C.stoneDark, pos=(x, h + 0.02, -0.2))
    m.add(box(1.2, 0.17, 0.24), C.stone, pos=(-0.05, 0.9, -0.2), rot=(0, 0, -0.2))
    for i in range(3):
        m.add(box(0.24, 0.17, 0.24), C.stone, pos=(-0.18 + i * 0.26, 1.05 + i * 0.01, -0.2), rot=(0, 0, -0.2))
    m.add(prism(8, 0.1, 0.1, 0.5), C.stone, pos=(0.3, 0.12, 0.35), rot=(0.2, 0.3, PI / 2.2))
    m.add(box(0.26, 0.2, 0.22), C.stoneDark, pos=(-0.3, 0.1, 0.35), rot=(0, 0.6, 0.1))
    m.add(box(0.3, 0.2, 0.04), C.stoneDark, pos=(0.0, 0.28, 0.0), rot=(-0.3, 0, 0))
    for x in (-0.12, 0.0, 0.12):
        m.add(box(0.03, 0.06, 0.02), C.glow, pos=(x, 0.3, 0.02), sway=GLOW)
    for pos, sc in (((-0.5, 1.0, -0.2), 0.2), ((0.5, 0.7, -0.2), 0.16), ((0.0, 0.1, 0.1), 0.18)):
        m.add(ico(), C.moss, pos=pos, scale=(sc * 1.3, sc * 0.4, sc * 1.2))
    return m


def wanderers():
    m = Model('discovery_wanderers')
    tent(m, -0.4, -0.15, 0.48, rot=0.5, color=C.cloth, stripe=C.berry)
    tent(m, 0.38, -0.32, 0.38, rot=-0.2, color=C.clothShade, stripe=0xC0392B)
    campfire(m, 0.2, 0.42)
    for x, z, a in ((-0.55, 0.45, 0.4), (0.7, 0.3, -0.5)):
        m.add(prism(7, 0.07, 0.07, 0.4), 0x9A6B5B, pos=(x, 0.07, z), rot=(0, a, PI / 2))
    sack(m, -0.25, 0.55, 0.13)
    m.add(box(0.03, 0.9, 0.03), C.wood, pos=(0.75, 0.45, -0.7))
    m.add(box(0.36, 0.2, 0.02), 0xC0392B, pos=(0.92, 0.82, -0.7), sway=lambda p: min(1.0, max(0.0, (p[0] - 0.75) / 0.36)))
    return m


def stones():
    m = Model('discovery_stones')
    rng = rng_for('stones')
    n = 7
    for i in range(n):
        a = i / n * 2 * PI
        menhir(m, rng, math.sin(a) * 0.72, math.cos(a) * 0.72, 0.62 + ((i * 37) % 5) * 0.09, 0.22, 0.15, a)
    m.add(box(0.5, 0.13, 0.34), C.stone, pos=(0, 0.065, 0))
    m.add(box(0.2, 0.34, 0.16, top=(0.7, 0.7)), C.stoneDark, pos=(0, 0.3, 0))
    m.add(prism(20, 0.88, 0.92, 0.05), C.moss, pos=(0, 0.02, 0))
    return m


def starstone():
    m = Model('discovery_starstone')
    rng = rng_for('starstone')
    m.add(prism(14, 0.95, 1.05, 0.08), C.rockDark, pos=(0, 0.04, 0))
    m.add(prism(14, 0.6, 0.78, 0.1), 0x3A3550, pos=(0, 0.06, 0))
    for i in range(10):
        a = i / 10 * 2 * PI
        rock(m, rng, (math.sin(a) * 0.95, 0.1, math.cos(a) * 0.95), 0.15, C.rock, 0.7)
    m.add(ico(), 0x2B2540, pos=(0, 0.36, 0), scale=(0.4, 0.46, 0.38))
    for x, y, z, s in ((0.2, 0.62, 0.1, 0.1), (-0.2, 0.5, -0.12, 0.09), (0.04, 0.82, -0.04, 0.085), (0.0, 0.4, 0.3, 0.07)):
        m.add(ico(), 0x9FE8FF, pos=(x, y, z), scale=(s, s * 1.3, s), sway=GLOW + 0.4)
    return m


def kingstone():
    """The crowning-stone: a tall dark monolith on a stepped plinth, a ring of low pillars, a crown of gold and star-light on top."""
    m = Model('discovery_kingstone')
    rng = rng_for('kingstone')
    GOLD = 0xF2C14E
    m.add(prism(16, 1.1, 1.2, 0.08), C.rockDark, pos=(0, 0.04, 0))
    m.add(prism(16, 0.88, 0.98, 0.1), C.stoneDark, pos=(0, 0.13, 0))
    m.add(prism(16, 0.66, 0.76, 0.1), C.stone, pos=(0, 0.23, 0))
    # eight low pillars around the steps; four carry braziers
    for i in range(8):
        a = i / 8 * 2 * PI + 0.2
        px, pz = math.sin(a) * 1.0, math.cos(a) * 1.0
        m.add(box(0.2, 0.44, 0.2, top=(0.8, 0.8)), C.stone, pos=(px, 0.22, pz), rot=(0, a, 0))
        m.add(box(0.24, 0.05, 0.24), C.stoneDark, pos=(px, 0.46, pz), rot=(0, a, 0))
        if i % 2 == 0:
            flame(m, px, 0.5, pz, 0.26, 0.06)
    # the monolith: three tapering blocks, slightly twisted, with a carved band
    m.add(box(0.5, 0.6, 0.46, top=(0.82, 0.82)), 0x2F2B3C, pos=(0, 0.6, 0), rot=(0, 0.1, 0))
    m.add(box(0.41, 0.6, 0.38, top=(0.78, 0.78)), 0x383348, pos=(0, 1.2, 0), rot=(0, 0.2, 0))
    m.add(box(0.32, 0.5, 0.3, top=(0.55, 0.55)), 0x433D56, pos=(0, 1.75, 0), rot=(0, 0.3, 0))
    m.add(box(0.6, 0.06, 0.56), GOLD, pos=(0, 0.95, 0), rot=(0, 0.15, 0))
    for sx in (-1, 1):
        for sz in (0, 1):
            x, z = (sx * 0.25, 0.0) if sz == 0 else (0.0, sx * 0.23)
            m.add(box(0.05, 0.3, 0.05), 0x9FE8FF, pos=(x, 0.6, z), sway=GLOW)
    # the crown: a golden band with five points, and a star hanging over it
    m.add(prism(10, 0.2, 0.22, 0.07), GOLD, pos=(0, 2.04, 0))
    for k in range(5):
        a = k / 5 * 2 * PI
        m.add(prism(3, 0.05, 0.001, 0.2), GOLD, pos=(math.sin(a) * 0.18, 2.17, math.cos(a) * 0.18))
        m.add(ico(), 0xFFF2B0, pos=(math.sin(a) * 0.18, 2.29, math.cos(a) * 0.18), scale=(0.03, 0.03, 0.03), sway=GLOW)
    m.add(ico(), 0xFFF2B0, pos=(0, 2.4, 0), scale=(0.1, 0.13, 0.1), sway=GLOW + 0.4)
    return m


def barrow():
    m = Model('discovery_barrow')
    rng = rng_for('barrow')
    m.add(sb.sphere(10, 6), C.moss, pos=(0, -0.2, -0.1), scale=(1.15, 0.7, 0.92))
    m.add(sb.sphere(8, 5), 0x6F8F44, pos=(-0.2, 0.2, -0.2), scale=(0.5, 0.18, 0.4))
    for x in (-0.2, 0.2):
        m.add(box(0.13, 0.46, 0.16), C.stone, pos=(x, 0.23, 0.6))
    m.add(box(0.56, 0.12, 0.22), C.stoneDark, pos=(0, 0.5, 0.6))
    m.add(box(0.26, 0.36, 0.05), 0x1D140C, pos=(0, 0.19, 0.66))
    for x, z in ((-0.5, 0.55), (0.55, 0.5)):
        m.add(box(0.22, 0.5, 0.14, top=(0.7, 0.7)), C.rock, pos=(x, 0.25, z), rot=(0.05, 0.4, 0.06))
    return m


def hermit():
    m = Model('discovery_hermit')
    rng = rng_for('hermit')
    m.add(box(0.7, 0.4, 0.55), C.wattle, pos=(0, 0.2, 0))
    for sx in (-1, 1):
        m.add(box(0.06, 0.42, 0.06), C.timber, pos=(sx * 0.35, 0.21, 0.28))
    sb.thatch_roof(m, 0.7, 0.55, 0.36, 0.4, 0, 0, C.moss, 0x5F7A35, 0x93AD5A, 0.1, 0.07)
    m.add(box(0.12, 0.34, 0.12), C.stoneDark, pos=(0.22, 0.72, -0.12), rot=(0, 0, 0.12))
    m.anchor('smoke', (0.26, 0.94, -0.12))
    sb.door(m, -0.12, 0.275, 0.17, 0.26, 0.0, step=False)
    sb.window(m, 0.22, 0.24, 0.285, 0.0, 0.1, 0.1, True)
    for x in (0.3, 0.45, 0.6):
        m.add(ico(), C.leafLight, pos=(x, 0.07, 0.5), scale=(0.07, 0.065, 0.07))
    m.add(box(0.5, 0.03, 0.2), 0x6B4F33, pos=(0.45, 0.02, 0.5))
    log(m, -0.5, 0.06, 0.3, 0.34, 0.055, 'x')
    log(m, -0.5, 0.06, 0.42, 0.34, 0.055, 'x')
    m.add(box(0.08, 0.1, 0.08), C.glow, pos=(0.4, 0.38, 0.32), sway=GLOW)
    return m


def hoard():
    m = Model('discovery_hoard')
    rng = rng_for('hoard')
    m.add(ico(), 0x6B4F33, pos=(0, 0.04, 0.02), scale=(0.55, 0.1, 0.45))
    m.add(box(0.52, 0.3, 0.36), C.darkTimber, pos=(0, 0.17, 0), rot=(0, 0.4, 0.1))
    m.add(prism(8, 0.18, 0.18, 0.52), C.darkTimber, pos=(0, 0.34, 0), rot=(0, 0.4 + PI / 2, PI / 2 + 0.1))
    for dx in (-0.16, 0.16):
        m.add(box(0.04, 0.34, 0.4), C.iron, pos=(dx, 0.2, 0.0), rot=(0, 0.4, 0.1))
    for x, z in ((0.3, 0.25), (0.38, 0.12), (0.22, 0.34), (-0.3, 0.3), (0.45, 0.28)):
        m.add(prism(8, 0.06, 0.06, 0.02), 0xE8E4D8, pos=(x, 0.02, z), sway=GLOW + 0.2)
    m.add(ico(), 0xE8E4D8, pos=(0.0, 0.34, 0.2), scale=(0.1, 0.05, 0.08), sway=GLOW + 0.5)
    m.add(box(0.05, 0.62, 0.05), C.wood, pos=(-0.38, 0.3, -0.22), rot=(0.2, 0, -0.3))
    m.add(box(0.16, 0.2, 0.03), C.iron, pos=(-0.3, 0.05, -0.19), rot=(0.2, 0, -0.3))
    return m


def spring():
    m = Model('discovery_spring')
    rng = rng_for('spring')
    m.add(prism(14, 0.62, 0.68, 0.08), C.stoneDark, pos=(0, 0.04, 0))
    m.add(prism(14, 0.5, 0.5, 0.07), 0x5FB0C9, pos=(0, 0.075, 0))
    for i in range(11):
        a = i / 11 * 2 * PI
        c = C.stone if i % 3 else C.moss
        rock(m, rng, (math.sin(a) * 0.62, 0.08, math.cos(a) * 0.62), 0.13, c, 0.7)
    for x, z, h in ((-0.12, 0.05, 0.5), (0.14, -0.1, 0.68), (0.0, 0.14, 0.4)):
        m.add(sb.sphere(6, 4), 0xF4F1EA, pos=(x, h, z), scale=(0.075, 0.14, 0.075), sway=lambda p, h=h: min(1.0, max(0.0, (p[1] - (h - 0.14)) / 0.28)))
    for x in (-0.55, 0.5):
        m.add(ico(), C.leafLight, pos=(x, 0.1, 0.4), scale=(0.1, 0.1, 0.1))
    return m


def shrine():
    m = Model('discovery_shrine')
    rng = rng_for('shrine')
    m.add(box(0.7, 0.07, 0.5), C.stoneDark, pos=(0, 0.035, 0))
    for x in (-0.3, 0.3):
        m.add(prism(6, 0.055, 0.065, 0.95), C.darkTimber, pos=(x, 0.5, 0))
        m.add(prism(4, 0.06, 0, 0.16, phase=0), 0xF2C14E, pos=(x, 1.04, 0))
    sb.thatch_roof(m, 0.5, 0.3, 0.3, 0.95, 0, 0, C.thatchDark, C.thatchDark, C.thatch, 0.1, 0.06)
    m.add(box(0.36, 0.2, 0.24), C.stone, pos=(0, 0.17, 0))
    m.add(prism(6, 0.035, 0.035, 0.12), 0xF4EAD0, pos=(0, 0.33, 0))
    flame(m, 0, 0.39, 0, 0.1, 0.03)
    for x in (-0.12, 0.12):
        m.add(ico(), C.berry if x < 0 else 0xE0707A, pos=(x, 0.29, 0.1), scale=(0.035, 0.035, 0.035))
    m.add(box(0.5, 0.025, 0.025), C.cloth, pos=(0, 0.8, 0.12), sway=0.4)
    return m


def grove():
    """Berry Grove: a ring of laden bushes round a waymarker."""
    m = Model('discovery_grove')
    rng = rng_for('grove')
    for i in range(7):
        a = i / 7 * 2 * PI + 0.2
        x, z = math.sin(a) * 0.62, math.cos(a) * 0.62
        m.add(ico(), C.bush, pos=(x, 0.18, z), scale=(0.24, 0.2, 0.22), rot=(0, a, 0))
        m.add(ico(), C.leafLight, pos=(x + 0.05, 0.3, z - 0.03), scale=(0.15, 0.12, 0.14))
        for k in range(4):
            b = k * 1.6 + i
            m.add(ico(), C.berry, pos=(x + math.sin(b) * 0.17, 0.2 + (k % 2) * 0.08, z + math.cos(b) * 0.17), scale=(0.035, 0.035, 0.035))
    m.add(prism(6, 0.06, 0.07, 0.9), C.timber, pos=(0, 0.45, 0))
    m.add(box(0.34, 0.16, 0.04), C.lightWood, pos=(0.12, 0.7, 0), rot=(0, 0, -0.1))
    m.add(ico(), C.berry, pos=(0.18, 0.7, 0.03), scale=(0.04, 0.04, 0.03))
    m.add(prism(4, 0.08, 0, 0.14, phase=0), C.thatch, pos=(0, 0.97, 0))
    return m


def oakwood():
    """Old-Growth Oakwood: three ancient oaks."""
    m = Model('discovery_oakwood')
    rng = rng_for('oakwood')
    for x, z, s in ((-0.4, -0.2, 1.0), (0.45, -0.3, 0.85), (0.05, 0.4, 0.72)):
        m.add(prism(7, 0.1 * s, 0.17 * s, 0.9 * s), C.bark, pos=(x, 0.45 * s, z))
        for dx, dz in ((0.15, 0.0), (-0.1, 0.12)):
            m.add(prism(5, 0.04 * s, 0.07 * s, 0.3 * s), C.bark, pos=(x + dx * s, 0.9 * s, z + dz * s), rot=(0, 0, -dx * 4))
        for k, (ox, oy, oz, r) in enumerate(((0, 1.25, 0, 0.5), (0.3, 1.1, 0.1, 0.34), (-0.3, 1.12, -0.1, 0.36), (0.05, 1.55, 0.05, 0.34))):
            m.add(ico(), C.leaf if k % 2 else C.leafLight, pos=(x + ox * s, oy * s, z + oz * s), scale=(r * s, r * s * 0.8, r * s), rot=(0, k, 0))
    m.add(prism(6, 0.05, 0.06, 0.7), C.timber, pos=(0.75, 0.35, 0.55))
    m.add(box(0.3, 0.14, 0.04), C.lightWood, pos=(0.85, 0.58, 0.55), rot=(0, 0, -0.1))
    m.add(prism(4, 0.07, 0, 0.12, phase=0), C.thatch, pos=(0.75, 0.76, 0.55))
    return m


def outcrop():
    """Rich Outcrop: tilted slabs of dressed stone with pale seams, a pick left in the rock."""
    m = Model('discovery_outcrop')
    rng = rng_for('outcrop')
    for x, z, w, h, tilt, c in ((-0.35, -0.1, 0.5, 0.75, -0.2, C.rock), (0.15, -0.25, 0.6, 1.0, 0.1, C.stone), (0.55, 0.05, 0.45, 0.65, 0.25, C.rockDark), (-0.1, 0.3, 0.45, 0.45, -0.1, C.stoneDark)):
        m.add(box(w, h, 0.3, top=(0.75, 0.8)), c, pos=(x, h / 2, z), rot=(0.05, tilt, tilt * 0.6))
    for x, y, z in ((0.15, 0.55, -0.08), (-0.35, 0.4, 0.06), (0.55, 0.35, 0.2)):
        m.add(box(0.2, 0.04, 0.03), 0xE8E4D8, pos=(x, y, z), rot=(0, 0, 0.5), sway=GLOW + 0.1)
    for x, z in ((-0.7, 0.35), (0.8, 0.5), (0.3, 0.6)):
        rock(m, rng, (x, 0.08, z), 0.13, C.stone, 0.7)
    m.add(box(0.03, 0.4, 0.03), C.wood, pos=(-0.62, 0.22, 0.2), rot=(-0.2, 0, -0.5))
    m.add(box(0.2, 0.04, 0.035), C.iron, pos=(-0.7, 0.4, 0.15), rot=(-0.2, 0, -0.5))
    m.add(prism(6, 0.05, 0.06, 0.7), C.timber, pos=(0.85, 0.35, -0.5))
    m.add(box(0.3, 0.14, 0.04), C.lightWood, pos=(0.95, 0.58, -0.5), rot=(0, 0, -0.1))
    return m


def make_all():
    return {mm.name: mm for mm in [cart(), ruins(), wanderers(), stones(), starstone(), kingstone(), barrow(), hermit(), hoard(), spring(), shrine(), grove(), oakwood(), outcrop()]}
