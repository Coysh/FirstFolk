"""
FirstFolk buildings, second batch: sawpit, forester, fisher, watchtower, stockade, muster hall,
longhouse, outpost, and the three Great Works (Stone Circle, Mead Hall, Great Granary).

Same rules as buildings.py: door on +z, nothing outside the footprint by more than ~0.3, and the
front-left corner (-0.7, 0.75) clear (output stock piles). Great Works are 3x3 (+-1.5).
A model named "<name>#spinz" is an animated part of <name>: it spins about the z axis through its
"<name>#spinz@pivot" empty (see art.ts / buildings.ts).
"""
import math

import storybook as sb
from storybook import C, GLOW, MARKER, Model, box, ico, prism, extrude, rock, log, log_pile, barrel, crate, pole, flag, door, window, stone_footing, thatch_roof, kingpost_gable, campfire, flame, fence, rng_for
from kit2 import brazier, torch, tent, sack, roof_x, long_hall, menhir, dragon_head, horns
from buildings import cottage

PI = math.pi


def sawpit():
    m = Model('sawpit')
    rng = rng_for('sawpit')
    m.add(box(1.7, 0.05, 1.5), 0x8A7650, pos=(0, 0.025, -0.1))
    for x, z in ((-0.7, -0.62), (0.7, -0.62), (-0.7, 0.4), (0.7, 0.4)):
        m.add(box(0.09, 0.84, 0.09, top=(0.9, 0.9)), C.timber, pos=(x, 0.47, z))
    for z in (-0.62, 0.4):
        m.add(box(1.5, 0.07, 0.07), C.darkTimber, pos=(0, 0.86, z))
    for x in (-0.7, 0.7):
        m.add(box(0.07, 0.07, 1.04), C.darkTimber, pos=(x, 0.86, -0.11))
    for x in (-0.7, 0.7):
        for sz in (-1, 1):
            m.add(box(0.045, 0.3, 0.045), C.wood, pos=(x, 0.7, -0.11 + sz * 0.3), rot=(sz * 0.7, 0, 0))
    roof_x(m, 1.65, 1.3, 0.46, 0.9, 0, -0.11, C.thatch, C.thatchDark, C.thatchLight, 0.12)
    # the saw trestle with a log on it and a two-handed pit saw
    for x in (-0.38, 0.38):
        m.add(box(0.05, 0.42, 0.05), C.wood, pos=(x, 0.21, -0.22), rot=(0.25, 0, 0))
        m.add(box(0.05, 0.42, 0.05), C.wood, pos=(x, 0.21, 0.0), rot=(-0.25, 0, 0))
    m.add(prism(8, 0.1, 0.095, 1.0), C.wood, pos=(0, 0.5, -0.11), rot=(0, 0, PI / 2), cap=C.lightWood)
    m.add(box(0.02, 0.4, 0.5), C.iron, pos=(0.12, 0.62, -0.11))
    for z in (-0.34, 0.12):
        m.add(box(0.035, 0.12, 0.035), C.timber, pos=(0.12, 0.84, z))
    m.add(ico(), 0xE8CF98, pos=(0.22, 0.05, 0.22), scale=(0.2, 0.07, 0.17))
    # logs waiting at the back left; planks stickered to dry at the back right
    for row, n in enumerate((3, 2)):
        for k in range(n):
            log(m, -0.62 + (k - (n - 1) / 2) * 0.12 + 0.06, 0.065 + row * 0.1, -0.52, 0.5, 0.055, 'z')
    for i in range(5):
        m.add(box(0.5, 0.035, 0.14), C.lightWood if i % 2 else 0xD9B07A, pos=(0.6, 0.05 + i * 0.075, -0.5), rot=(0, 0.02 * (i - 2), 0))
        m.add(box(0.5, 0.02, 0.035), C.timber, pos=(0.6, 0.085 + i * 0.075, -0.5 + 0.04))
    pole(m, 0.82, 0, 0.62, 0.8, 0.022, C.timber)
    m.add(box(0.26, 0.15, 0.03), C.lightWood, pos=(0.7, 0.62, 0.62))
    m.add(box(0.015, 0.1, 0.034), C.iron, pos=(0.7, 0.62, 0.62), rot=(0, 0, 0.5))
    return m


def forester():
    m = Model('forester')
    rng = rng_for('forester')
    cottage(m, rng, 0.95, 0.8, 0.5, -0.2, -0.22, roof=C.moss, light=0x93AD5A, roof_h=0.58, ridge=0x5F7A35)
    # a fenced nursery of saplings
    m.add(box(0.7, 0.04, 0.55), 0x6B4F33, pos=(0.62, 0.03, 0.55))
    fence(m, 0.27, 0.97, 0.26, 5)
    fence(m, 0.27, 0.97, 0.84, 5)
    for i, (x, z) in enumerate(((0.42, 0.42), (0.66, 0.42), (0.9, 0.42), (0.42, 0.68), (0.66, 0.68), (0.9, 0.68))):
        h = 0.18 + (i % 3) * 0.06
        m.add(prism(4, 0.012, 0.01, h * 0.6), C.wood, pos=(x, 0.05 + h * 0.3, z))
        m.add(prism(6, 0.07 + (i % 2) * 0.02, 0, h), C.leafLight if i % 2 else C.leaf, pos=(x, 0.1 + h * 0.62, z))
    # a spade in a mound, a seed sack and a water butt
    m.add(ico(), 0x6B4F33, pos=(-0.62, 0.05, 0.6), scale=(0.16, 0.08, 0.13))
    m.add(box(0.03, 0.4, 0.03), C.wood, pos=(-0.62, 0.3, 0.6), rot=(0.1, 0, 0.15))
    m.add(box(0.1, 0.12, 0.02), C.iron, pos=(-0.64, 0.12, 0.6), rot=(0.1, 0, 0.15))
    sack(m, -0.35, 0.72, 0.13)
    barrel(m, 0.95, -0.55)
    pole(m, -0.9, 0, 0.35, 0.7, 0.022, C.timber)
    m.add(extrude([(0, 0), (0.22, -0.05), (0.18, -0.2), (0.02, -0.22)], 0.025), C.leaf, pos=(-0.9, 0.66, 0.35), convex=False)
    return m


def fisher():
    m = Model('fisher')
    rng = rng_for('fisher')
    cottage(m, rng, 0.85, 0.7, 0.46, -0.28, -0.3, wall=C.wattle, roof=C.thatchDark, light=0xC9A44A, roof_h=0.55, ridge=0x8A6A2A, chimney=False)
    # drying rack hung with silver fish, and a net that stirs in the breeze
    for z in (0.0, 0.62):
        m.add(box(0.045, 0.68, 0.045), C.wood, pos=(0.62, 0.34, z))
    m.add(box(0.045, 0.045, 0.7), C.wood, pos=(0.62, 0.64, 0.31))
    for k in range(5):
        z = 0.06 + k * 0.12
        m.add(ico(), 0x9FB7C4, pos=(0.62, 0.5, z), scale=(0.025, 0.1, 0.04), sway=0.25)
        m.add(prism(4, 0.025, 0, 0.05, phase=0), 0x6F8A99, pos=(0.62, 0.39, z), rot=(PI, 0, 0), sway=0.35)
    for z in (-0.28, -0.72):
        m.add(box(0.04, 0.5, 0.04), C.wood, pos=(0.82, 0.25, z))
    m.add(box(0.015, 0.34, 0.5), 0xC8C0A0, pos=(0.82, 0.3, -0.5), sway=lambda p: 0.5 * max(0.0, 1 - (p[1] - 0.1) / 0.4))
    # an upturned boat, a barrel of the catch and a coil of rope
    m.add(sb.sphere(8, 4), C.darkTimber, pos=(-0.55, 0.17, 0.55), scale=(0.36, 0.2, 0.17), rot=(0, 0.3, 0))
    m.add(box(0.6, 0.03, 0.03), C.lightWood, pos=(-0.55, 0.36, 0.55), rot=(0, 0.3, 0))
    barrel(m, 0.3, 0.7)
    m.add(prism(8, 0.08, 0.08, 0.04), 0xC8B48A, pos=(0.05, 0.02, 0.62))
    return m


def watchtower():
    m = Model('watchtower')
    rng = rng_for('watchtower')
    cz = -0.1
    m.add(box(1.22, 0.14, 1.22), C.stoneDark, pos=(0, 0.07, cz))
    m.add(box(1.0, 0.85, 1.0, top=(0.95, 0.95)), C.stone, pos=(0, 0.56, cz))
    for y in (0.4, 0.66, 0.9):
        m.add(box(1.05, 0.035, 1.05), C.stoneDark, pos=(0, y, cz))
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.add(box(0.12, 0.88, 0.12), C.rock, pos=(sx * 0.5, 0.57, cz + sz * 0.5))
    for x in (-0.3, 0.3):
        m.add(box(0.05, 0.22, 0.03), C.door, pos=(x, 0.72, cz + 0.505))
    for sz in (-1, 1):
        m.add(box(0.03, 0.22, 0.05), C.door, pos=(0.505, 0.72, cz + sz * 0.25))
        m.add(box(0.03, 0.22, 0.05), C.door, pos=(-0.505, 0.72, cz + sz * 0.25))
    door(m, 0, cz + 0.5, 0.26, 0.4, 0.14)
    torch(m, -0.3, 0.2, cz + 0.58)
    torch(m, 0.3, 0.2, cz + 0.58)
    # the jettied timber storey, held out on corbels
    yb = 0.99
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.add(box(0.1, 0.1, 0.1), C.timber, pos=(sx * 0.5, yb - 0.02, cz + sz * 0.5), rot=(0, PI / 4, 0))
    m.add(box(1.28, 0.66, 1.28), C.plaster, pos=(0, yb + 0.35, cz))
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.add(box(0.09, 0.68, 0.09), C.timber, pos=(sx * 0.64, yb + 0.35, cz + sz * 0.64))
    for z in (cz + 0.645, cz - 0.645):
        m.add(box(1.3, 0.05, 0.06), C.timber, pos=(0, yb + 0.38, z))
    for x in (0.645, -0.645):
        m.add(box(0.06, 0.05, 1.3), C.timber, pos=(x, yb + 0.38, cz))
    for sx in (-1, 1):
        run = 0.45
        m.add(box(math.hypot(run, 0.5), 0.045, 0.05), C.timber, pos=(sx * 0.32, yb + 0.55, cz + 0.65), rot=(0, 0, sx * math.atan2(0.5, run) * -1))
    window(m, 0.0, yb + 0.42, cz + 0.66, 0.0, 0.16, 0.18, True)
    for sx in (-1, 1):
        window(m, sx * 0.655, yb + 0.42, cz + 0.0, sx * PI / 2, 0.14, 0.16, True)
    m.add(prism(10, 0.13, 0.13, 0.03), MARKER, pos=(-0.3, yb + 0.3, cz + 0.67), rot=(PI / 2, 0, 0))
    # a flared hip roof, a gilded finial and a big banner
    m.add(prism(4, 1.12, 0.98, 0.1, phase=0), C.thatch, pos=(0, yb + 0.72, cz), rot=(0, PI / 4, 0))
    m.add(prism(4, 1.02, 0.1, 0.78, phase=0), C.thatchDark, pos=(0, yb + 1.14, cz), rot=(0, PI / 4, 0))
    m.add(prism(4, 0.6, 0.08, 0.3, phase=0), C.thatch, pos=(0, yb + 1.4, cz), rot=(0, PI / 4, 0))
    pole(m, 0, yb + 1.45, cz, 0.7, 0.026)
    m.add(ico(), 0xF2C14E, pos=(0, yb + 2.18, cz), scale=(0.05, 0.05, 0.05))
    flag(m, 0, yb + 2.14, cz, MARKER, 0.55, 0.34)
    return m


def stockade():
    m = Model('stockade')
    rng = rng_for('stockade')
    m.add(prism(14, 0.95, 0.98, 0.06), 0x7A6646, pos=(0, 0.03, -0.05))
    n = 24
    for i in range(n):
        a = (i + 0.5) / n * 2 * PI
        if min(a, 2 * PI - a) < 0.36:
            continue
        h = 0.64 + ((i * 7) % 5) * 0.035
        x, z = math.sin(a) * 0.88, -0.05 + math.cos(a) * 0.88
        m.add(prism(5, 0.056, 0.05, h), C.timber if i % 3 else C.darkTimber, pos=(x, h / 2, z))
        m.add(prism(5, 0.058, 0, 0.15), C.lightWood, pos=(x, h + 0.07, z))
        if i % 4 == 0:
            m.add(box(0.2, 0.03, 0.025), C.cloth, pos=(x, h * 0.55, z), rot=(0, a + PI / 2, 0))
    # the gate: tall posts, a lintel with the family's shield, and two leaves swung open
    for x in (-0.34, 0.34):
        m.add(prism(6, 0.06, 0.055, 1.08), C.darkTimber, pos=(x, 0.54, 0.84))
        m.add(prism(6, 0.07, 0, 0.14), C.lightWood, pos=(x, 1.14, 0.84))
    m.add(box(0.78, 0.09, 0.1), C.darkTimber, pos=(0, 0.98, 0.84))
    m.add(prism(10, 0.14, 0.14, 0.03), MARKER, pos=(0, 0.78, 0.9), rot=(PI / 2, 0, 0))
    for sx in (-1, 1):
        m.add(box(0.3, 0.72, 0.04), C.wood, pos=(sx * 0.4, 0.38, 0.99), rot=(0, sx * 1.0, 0))
    brazier(m, 0.58, 1.02, 0.42)
    brazier(m, -0.58, 1.02, 0.42)
    # the guardhouse inside
    m.add(box(0.78, 0.14, 0.7), C.stoneDark, pos=(0, 0.07, -0.25))
    m.add(box(0.66, 0.5, 0.56), C.wood, pos=(0, 0.39, -0.25))
    for x in (-0.31, 0.31):
        for z in (-0.5, 0.0):
            m.add(box(0.07, 0.52, 0.07), C.timber, pos=(x, 0.39, z))
    thatch_roof(m, 0.66, 0.56, 0.5, 0.64, 0, -0.25, C.thatchDark, C.thatchDark, C.thatch, 0.1, 0.07)
    door(m, 0.0, 0.04, 0.2, 0.3, 0.14)
    window(m, 0.24, 0.45, 0.04, 0.0, 0.08, 0.09, True)
    m.add(box(0.02, 0.7, 0.02), C.wood, pos=(-0.5, 0.4, 0.2), rot=(0, 0, 0.35))
    m.add(box(0.02, 0.7, 0.02), C.wood, pos=(-0.5, 0.4, 0.2), rot=(0, 0, -0.35))
    pole(m, 0.5, 0, -0.55, 1.4)
    flag(m, 0.5, 1.36, -0.55, MARKER, 0.4, 0.28)
    return m


def musterhall():
    m = Model('musterhall')
    rng = rng_for('musterhall')
    cz = -0.3
    top = long_hall(m, rng, 1.7, 0.85, 0.55, 0, cz, C.wood, C.darkTimber, C.thatchDark, C.thatch, 0.72, ridge=0x6F5320, door_w=0.32, door_h=0.44)
    for sx in (-1, 1):
        dragon_head(m, sx * 0.99, top - 0.12, cz, sx)
        horns(m, sx * 0.9, top - 0.62, cz, 0.7)
    # painted shields along the front, between the posts
    for x, c in ((-0.75, 0xC0392B), (-0.55, 0xF2C14E), (-0.33, 0x2E86C1), (0.33, MARKER), (0.55, 0xC0392B), (0.75, 0xF2C14E)):
        m.add(prism(10, 0.1, 0.1, 0.03), c, pos=(x, 0.46, cz + 0.45), rot=(PI / 2, 0, 0))
        m.add(ico(), C.iron, pos=(x, 0.46, cz + 0.47), scale=(0.028, 0.028, 0.02))
    brazier(m, -0.32, 0.38, 0.42)
    brazier(m, 0.32, 0.38, 0.42)
    # the practice yard: a spear rack and a straw dummy in a helmet
    m.add(box(0.5, 0.05, 0.05), C.wood, pos=(-0.6, 0.45, 0.78))
    for x in (-0.82, -0.7, -0.58, -0.46, -0.34):
        m.add(box(0.02, 0.85, 0.02), C.wood, pos=(x, 0.42, 0.74), rot=(0.12, 0, 0))
        m.add(prism(4, 0.022, 0, 0.07, phase=0), C.iron, pos=(x, 0.88, 0.7))
    pole(m, 0.58, 0, 0.78, 0.7, 0.028)
    m.add(prism(7, 0.12, 0.1, 0.34), C.thatch, pos=(0.58, 0.55, 0.78))
    m.add(box(0.5, 0.05, 0.05), C.wood, pos=(0.58, 0.6, 0.78))
    m.add(prism(7, 0.085, 0.085, 0.09), C.iron, pos=(0.58, 0.8, 0.78))
    m.add(prism(5, 0.015, 0, 0.1), 0xC0392B, pos=(0.58, 0.9, 0.78))
    barrel(m, 0.92, 0.55)
    pole(m, 0.92, 0, 0.1, 1.7, 0.028)
    flag(m, 0.92, 1.66, 0.1, MARKER, 0.4, 0.34, flip=True)
    return m


def longhouse():
    m = Model('longhouse')
    rng = rng_for('longhouse')
    cz = -0.1
    top = long_hall(m, rng, 1.7, 1.0, 0.5, 0, cz, C.wood, C.timber, C.thatch, C.thatchLight, 0.74, door_x=-0.35, door_w=0.28, door_h=0.4, windows=(0.35,))
    m.add(box(0.5, 0.05, 0.05), MARKER, pos=(-0.35, 0.58, cz + 0.52))
    # a smoke louver on the ridge
    m.add(box(0.22, 0.12, 0.22), C.darkTimber, pos=(0.1, top + 0.04, cz))
    m.add(prism(4, 0.17, 0.02, 0.1, phase=0), C.thatchDark, pos=(0.1, top + 0.15, cz), rot=(0, PI / 4, 0))
    m.anchor('smoke', (0.1, top + 0.3, cz))
    for sx in (-1, 1):
        dragon_head(m, sx * 0.99, top - 0.1, cz, sx, C.timber, 1.3)
    log_pile(m, -0.72, 0.55, 3, 'x')
    barrel(m, 0.72, 0.6)
    pole(m, 0.88, 0, 0.62, 1.2)
    flag(m, 0.88, 1.16, 0.62, MARKER, 0.36, 0.24, flip=True)
    return m


def outpost():
    m = Model('outpost')
    rng = rng_for('outpost')
    tent(m, -0.45, -0.32, 0.5, rot=0.4, color=C.cloth, stripe=MARKER)
    tent(m, 0.42, -0.22, 0.42, rot=-0.3, color=C.clothShade, stripe=MARKER)
    campfire(m, 0.08, 0.56)
    for x, z, a in ((-0.35, 0.5, 0.2), (0.5, 0.55, -0.3)):
        m.add(prism(7, 0.07, 0.07, 0.4), C.cloth, pos=(x, 0.07, z), rot=(0, a, PI / 2))
    log(m, 0.35, 0.06, 0.9, 0.3, 0.06, 'x')
    crate(m, 0.7, 0.2, 0.18, rot=0.3)
    for k in range(3):
        m.add(box(0.02, 0.62, 0.02), C.wood, pos=(-0.8, 0.3, 0.2 + k * 0.06), rot=(0, 0, 0.2 - k * 0.1))
    pole(m, -0.8, 0, 0.6, 2.3, 0.032)
    m.add(ico(), 0xF2C14E, pos=(-0.8, 2.34, 0.6), scale=(0.05, 0.05, 0.05))
    flag(m, -0.8, 2.28, 0.6, MARKER, 0.55, 0.36)
    return m


def henge():
    """The Stone Circle (3x3): crooked mossy menhirs, three trilithons, an altar with a lit brazier."""
    m = Model('henge')
    rng = rng_for('henge')
    m.add(prism(20, 1.38, 1.46, 0.08), C.moss, pos=(0, 0.04, 0))
    m.add(prism(20, 1.2, 1.28, 0.05), 0x6F8F44, pos=(0, 0.09, 0))
    n = 10
    for i in range(n):
        a = i / n * 2 * PI + 0.15
        h = 0.95 + (i % 3) * 0.13
        menhir(m, rng, math.sin(a) * 1.12, math.cos(a) * 1.12, h, 0.3, 0.2, a, moss=True)
        if i % 3 == 0:
            a2 = a + 2 * PI / n
            mid = (a + a2) / 2
            m.add(box(0.8, 0.14, 0.22), C.stoneDark, pos=(math.sin(mid) * 1.1, h + 0.07, math.cos(mid) * 1.1), rot=(0, mid, 0))
            menhir(m, rng, math.sin(a2) * 1.12, math.cos(a2) * 1.12, h, 0.3, 0.2, a2)
    # the altar: a slab on a plinth, runes that glow, a brazier burning on it
    m.add(box(0.8, 0.16, 0.5), C.stoneDark, pos=(0, 0.16, 0))
    m.add(box(0.64, 0.2, 0.38, top=(0.9, 0.9)), C.stone, pos=(0, 0.34, 0))
    for x in (-0.2, 0.0, 0.2):
        m.add(box(0.05, 0.08, 0.02), C.glow, pos=(x, 0.3, 0.2), sway=GLOW)
    m.add(prism(8, 0.13, 0.09, 0.07), C.iron, pos=(0, 0.48, 0))
    flame(m, 0, 0.5, 0, 0.3, 0.1)
    for x in (-0.5, 0.5):
        brazier(m, x, 0.85, 0.5)
    for k in range(5):
        m.add(box(0.4, 0.03, 0.3), C.stoneDark, pos=(0.12 * (k % 2), 0.1, 0.55 + k * 0.17), rot=(0, 0.1 * k, 0))
    pole(m, 1.2, 0, 1.2, 1.7)
    flag(m, 1.2, 1.66, 1.2, MARKER, 0.5, 0.34)
    return m


def meadhall():
    """The Mead Hall (3x3): a great carved hall, dragon-headed gables, a feasting yard with a fire pit."""
    m = Model('meadhall')
    rng = rng_for('meadhall')
    cz = -0.55
    top = long_hall(m, rng, 2.5, 1.3, 0.8, 0, cz, C.wood, C.darkTimber, C.thatchDark, C.thatch, 0.98, ridge=0x6F5320, door_w=0.46, door_h=0.56, windows=(-0.95, -0.62, 0.62, 0.95), overhang=0.2)
    for sx in (-1, 1):
        dragon_head(m, sx * 1.42, top - 0.14, cz, sx, None, 2.0)
        horns(m, sx * 1.3, top - 0.9, cz, 1.0)
    # a carved porch over the great door
    for sx in (-1, 1):
        m.add(prism(6, 0.065, 0.075, 0.78), C.darkTimber, pos=(sx * 0.42, 0.39, 0.52))
        m.add(prism(4, 0.07, 0, 0.14, phase=0), 0xF2C14E, pos=(sx * 0.42, 0.85, 0.52))
    sb.thatch_roof(m, 0.9, 0.62, 0.2, 0.78, 0, 0.3, C.thatchDark, C.thatchDark, C.thatch, 0.05, 0.06, False)
    for x, c in ((-0.55, 0xC0392B), (-0.33, 0xF2C14E), (0.33, 0x2E86C1), (0.55, MARKER)):
        m.add(prism(10, 0.1, 0.1, 0.03), c, pos=(x, 0.72, cz + 0.68), rot=(PI / 2, 0, 0))
    m.add(box(0.16, 0.16, 0.16, top=(0.8, 0.8)), C.darkTimber, pos=(0, top + 0.06, cz))
    m.anchor('smoke', (0, top + 0.3, cz))
    torch(m, -0.4, 0.2, cz + 0.72)
    torch(m, 0.4, 0.2, cz + 0.72)
    # the feasting yard: trestle tables and benches, a fire pit with a roasting spit, mead barrels
    for x in (-0.95, 0.95):
        m.add(box(0.8, 0.05, 0.28), C.lightWood, pos=(x, 0.3, 0.95))
        for sx in (-0.32, 0.32):
            m.add(box(0.05, 0.28, 0.05), C.wood, pos=(x + sx, 0.14, 0.95))
        for sz in (-1, 1):
            m.add(box(0.76, 0.04, 0.1), C.wood, pos=(x, 0.19, 0.95 + sz * 0.26))
    for i in range(8):
        a = i / 8 * 2 * PI
        m.add(ico(), C.stoneDark, pos=(math.sin(a) * 0.24, 0.05, 1.05 + math.cos(a) * 0.24), scale=(0.07, 0.06, 0.07))
    flame(m, 0, 0.06, 1.05, 0.3, 0.12)
    for x in (-0.3, 0.3):
        m.add(box(0.03, 0.4, 0.03), C.wood, pos=(x, 0.2, 1.05), rot=(0, 0, x * 0.3))
    m.add(prism(6, 0.02, 0.02, 0.7), C.iron, pos=(0, 0.38, 1.05), rot=(0, 0, PI / 2))
    m.add(ico(), 0xA0522D, pos=(0, 0.3, 1.05), scale=(0.12, 0.06, 0.07))
    for k in range(3):
        barrel(m, 1.28, 0.45 + k * 0.28, 0.1, 0.24)
    for x, c in ((-1.28, MARKER), (1.28, 0xF2C14E)):
        pole(m, x, 0, 0.6, 1.9, 0.03)
        flag(m, x, 1.86, 0.6, c, 0.36, 0.34, flip=(x > 0))
    return m


def granary():
    """The Great Granary (3x3): a barn on staddle stones under a vast thatch, with a windmill."""
    m = Model('granary')
    rng = rng_for('granary')
    cz = 0.1
    for sx in (-0.75, 0.0, 0.75):
        for sz in (-0.4, 0.5):
            m.add(prism(8, 0.07, 0.1, 0.34), C.stone, pos=(sx, 0.17, cz + sz - 0.1))
            m.add(prism(8, 0.2, 0.16, 0.07), C.stone, pos=(sx, 0.38, cz + sz - 0.1))
    m.add(box(1.95, 0.1, 1.4), C.lightWood, pos=(0, 0.46, cz))
    m.add(box(1.8, 0.7, 1.22), C.wood, pos=(0, 0.86, cz))
    for i in range(7):
        m.add(box(0.07, 0.72, 1.26), C.timber, pos=(-0.9 + i * 0.3, 0.86, cz))
    for i in range(5):
        m.add(box(1.84, 0.03, 1.26), C.darkTimber, pos=(0, 0.6 + i * 0.14, cz))
    roof_x(m, 1.9, 1.22, 0.95, 1.21, 0, cz, C.thatch, C.thatchDark, C.thatchLight, 0.24, 0.085)
    apex = sb.roof_apex(0.95, 1.22, 0.24, 0.085)
    for sx in (-1, 1):
        m.add(extrude([(-0.61, 0), (0.61, 0), (0, apex)], 0.05), C.wood, pos=(sx * 0.9, 1.21, cz), rot=(0, PI / 2, 0), convex=False)
    door(m, 0.0, cz + 0.62, 0.34, 0.46, 0.58, step=False)
    for i in range(4):
        m.add(box(0.36, 0.04, 0.11), C.lightWood, pos=(0, 0.08 + i * 0.12, cz + 0.7 + (3 - i) * 0.07), rot=(0.3, 0, 0))
    m.add(box(0.2, 0.2, 0.04), C.door, pos=(0.5, 1.18, cz + 0.62))
    m.add(box(0.06, 0.06, 0.4), C.timber, pos=(0.5, 1.38, cz + 0.8))
    for x, z in ((-0.9, 0.95), (-0.62, 1.05), (0.72, 1.02), (0.98, 0.84)):
        sack(m, x, z, 0.17, 0.0, C.cloth)
    for x in (-0.3, 0.2):
        m.add(prism(8, 0.18, 0.14, 0.22), C.wood, pos=(x, 0.11, 1.12))
        for k in range(4):
            m.add(ico(), C.berry, pos=(x + (k % 2 - 0.5) * 0.12, 0.25, 1.12 + (k // 2 - 0.5) * 0.1), scale=(0.045, 0.045, 0.045))
    m.add(ico(), 0xE3C56A, pos=(-0.5, 0.18, -0.7), scale=(0.3, 0.2, 0.26))
    # a post-mill at the back left, its sails a separate spinning part
    mx, mz = -1.02, -0.85
    m.add(box(0.14, 0.95, 0.14), C.timber, pos=(mx, 0.55, mz))
    for a in (0.0, PI / 2):
        m.add(box(0.8, 0.07, 0.07), C.timber, pos=(mx, 0.12, mz), rot=(0, a + 0.4, 0))
    m.add(box(0.46, 0.52, 0.6), C.wood, pos=(mx, 1.28, mz))
    thatch_roof(m, 0.46, 0.6, 0.3, 1.54, mx, mz, C.thatchDark, C.thatchDark, C.thatch, 0.06, 0.06, False)
    m.add(box(0.05, 0.05, 0.42), C.timber, pos=(mx, 1.16, mz - 0.46), rot=(0.1, 0, 0))
    m.add(box(0.2, 0.28, 0.04), C.glow, pos=(mx, 1.2, mz + 0.31), sway=GLOW)
    sails = Model('granary#spinz')
    ax, ay, az = mx, 1.38, mz + 0.4
    sails.anchor('pivot', (ax, ay, az))
    sails.add(prism(6, 0.07, 0.06, 0.14), C.iron, pos=(ax, ay, az), rot=(PI / 2, 0, 0))
    r = 0.62
    for k in range(4):
        a = k * PI / 2 + 0.35
        dx, dy = -math.sin(a), math.cos(a)
        sails.add(box(0.045, r, 0.04), C.wood, pos=(ax + dx * r / 2, ay + dy * r / 2, az + 0.02), rot=(0, 0, a))
        sails.add(box(0.2, r * 0.8, 0.018), C.cloth, pos=(ax + dx * r * 0.5 + math.cos(a) * 0.12, ay + dy * r * 0.5 + math.sin(a) * 0.12, az + 0.03), rot=(0, 0, a))
        sails.add(box(0.2, 0.025, 0.02), C.clothShade, pos=(ax + dx * r * 0.9 + math.cos(a) * 0.12, ay + dy * r * 0.9 + math.sin(a) * 0.12, az + 0.03), rot=(0, 0, a))
    return m, sails


def make_all():
    out = {mm.name: mm for mm in [sawpit(), forester(), fisher(), watchtower(), stockade(), musterhall(), longhouse(), outpost(), henge(), meadhall()]}
    g, sails = granary()
    out[g.name] = g
    out[sails.name] = sails
    return out
