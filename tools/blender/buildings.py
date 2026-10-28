"""
FirstFolk buildings, first batch: the family hut, woodcutter (3 tiers), quarry (3 tiers), lookout.

Rules shared with the code models in src/render/models.ts so gameplay and picking don't change:
  * centred on the 2x2 footprint, door facing +z, ground at y = 0
  * the front-left corner (-0.7, 0.75) stays clear: that is where output stock piles sit
  * crest-coloured parts use MARKER; pennants carry `_SWAY`
"""
import math

import storybook as sb
from storybook import C, MARKER, Model, box, ico, prism, extrude, halfpipe, rock, log, log_pile, barrel, crate, pole, flag, wheel, campfire, door, window, stone_footing, thatch_roof, kingpost_gable, half_timber, rng_for

PI = math.pi


def cottage(m, rng, w, d, h, cx, cz, wall=None, roof=None, light=None, roof_h=0.62, ridge=None, door_x=0.0, chimney=True, windows=True, door_w=0.24, door_h=0.34, timber=None):
    wall = wall or C.plaster
    roof = roof or C.thatch
    light = light or C.thatchLight
    fh = 0.14
    stone_footing(m, rng, w + 0.12, d + 0.12, cx, cz, fh)
    half_timber(m, w, h, d, cx, cz, fh, wall, door_x, timber)
    ye = fh + h
    thatch_roof(m, w, d, roof_h, ye, cx, cz, roof, ridge, light)
    apex = sb.roof_apex(roof_h, w)
    for sz in (1, -1):
        m.add(extrude([(-w / 2, 0), (w / 2, 0), (0, apex)], 0.05), wall, pos=(cx, ye, cz + sz * d / 2), convex=False)
    kingpost_gable(m, w, apex, ye, cz + d / 2 + 0.02, wall)
    door(m, cx + door_x, cz + d / 2 + 0.01, door_w, door_h, fh)
    # a hanging lantern by the door
    lx = cx + door_x - door_w / 2 - 0.12
    m.add(box(0.14, 0.025, 0.03), C.iron, pos=(lx + 0.04, fh + door_h + 0.02, cz + d / 2 + 0.06))
    m.add(box(0.07, 0.09, 0.07), C.glow, pos=(lx, fh + door_h - 0.05, cz + d / 2 + 0.08), sway=sb.GLOW)
    if windows:
        for sx in (-1, 1):
            window(m, cx + sx * (w / 2 + 0.01), fh + h * 0.52, cz + d * 0.1, sx * PI / 2, 0.12, 0.13, True, box_flowers=(sx > 0))
        window(m, cx + w * 0.3, fh + h * 0.5, cz + d / 2 + 0.02, 0.0, 0.11, 0.12, True)
    if chimney:
        top = ye + roof_h
        cz2 = cz - d / 2 + 0.2
        m.add(box(0.2, 0.34, 0.2, top=(0.9, 0.9)), C.stone, pos=(cx, top + 0.1, cz2))
        m.add(box(0.26, 0.05, 0.26), C.stoneDark, pos=(cx, top + 0.29, cz2))
        m.anchor('smoke', (cx, top + 0.36, cz2))
    return ye + roof_h


# ---------------------------------------------------------------------------------------------
def hut():
    m = Model('hut')
    rng = rng_for('hut')
    cz = -0.05
    m.add(prism(10, 0.66, 0.68, 0.14), C.stoneDark, pos=(0, 0.07, cz))
    for i in range(9):
        a = (i + 0.5) / 9 * 2 * PI
        if min(abs(a), abs(2 * PI - a)) < 0.55:
            continue
        rock(m, rng, (math.sin(a) * 0.68, 0.06, cz + math.cos(a) * 0.68), 0.085 + rng.random() * 0.03, rng.choice((C.stone, C.rock, C.stoneDark)), 0.65)
    m.add(prism(10, 0.6, 0.57, 0.62), C.plaster, pos=(0, 0.45, cz))
    for i in range(10):
        a = (i + 0.5) * 2 * PI / 10
        if abs(math.sin(a)) < 0.35 and math.cos(a) > 0:
            continue
        m.add(box(0.055, 0.62, 0.055), C.timber, pos=(math.sin(a) * 0.59, 0.45, cz + math.cos(a) * 0.59), rot=(0, a, 0))
    m.add(prism(10, 0.592, 0.586, 0.11), MARKER, pos=(0, 0.66, cz))
    # a beehive of thatch: rings that flare over each other, with a drooping fringe
    layers = [(0.74, 0.86, 0.68, 0xCFA043), (0.91, 0.80, 0.55, 0xDDB257), (1.07, 0.68, 0.40, 0xCFA043), (1.22, 0.54, 0.10, 0xDDB257)]
    for y, rb, rt, col in layers:
        m.add(prism(12, rb, rt, 0.25), col, pos=(0, y + 0.125, cz))
    for i in range(18):
        a = (i + 0.5) / 18 * 2 * PI
        m.add(prism(4, 0.055, 0, 0.1, phase=0), 0xA97C2E, pos=(math.sin(a) * 0.84, 0.7, cz + math.cos(a) * 0.84), rot=(PI, 0, 0))
    m.add(prism(6, 0.08, 0.07, 0.17), C.stone, pos=(0, 1.54, cz))
    m.add(prism(6, 0.1, 0.1, 0.035), C.stoneDark, pos=(0, 1.64, cz))
    m.anchor('smoke', (0, 1.7, cz))
    door(m, 0, cz + 0.555, 0.24, 0.34, 0.14)
    # a lantern on a post by the door: the village lights up after dusk
    pole(m, -0.3, 0, cz + 0.72, 0.5, 0.02)
    m.add(box(0.1, 0.12, 0.1), C.glow, pos=(-0.3, 0.52, cz + 0.72), sway=sb.GLOW)
    m.add(box(0.13, 0.03, 0.13), C.iron, pos=(-0.3, 0.6, cz + 0.72))
    for s in (-1, 1):
        a = s * 72 * PI / 180
        window(m, math.sin(a) * 0.55, 0.5, cz + math.cos(a) * 0.55, a, 0.11, 0.12, True)
    # the garden: wood pile, a bean-and-cabbage bed, a water butt and the family pennant
    log_pile(m, -0.66, 0.44, 3, 'x')
    m.add(sb.box(0.62, 0.05, 0.4), C.wood, pos=(-0.52, 0.025, -0.78))
    m.add(sb.box(0.54, 0.07, 0.32), 0x6B4F33, pos=(-0.52, 0.06, -0.78))
    for x, col in ((-0.7, C.leafLight), (-0.52, C.leaf), (-0.34, C.leafLight)):
        m.add(ico(), col, pos=(x, 0.12, -0.78), scale=(0.075, 0.07, 0.075))
    barrel(m, 0.7, -0.42)
    pole(m, 0.64, 0, 0.58, 1.34)
    m.add(ico(), C.ember, pos=(0.64, 1.37, 0.58), scale=(0.038, 0.038, 0.038))
    flag(m, 0.64, 1.32, 0.58, MARKER, 0.34, 0.26)
    return m


# ---------------------------------------------------------------------------------------------
def woodcutter(t):
    m = Model(f'woodcutter_{t}')
    rng = rng_for(m.name)
    if t == 0:
        cx, cz = -0.2, -0.2
        cottage(m, rng, 0.95, 0.75, 0.46, cx, cz, roof=C.thatch, roof_h=0.56)
        # the wood-shed: a stack of end-on logs under a little lean-to roof
        x0, zz = 0.62, -0.25
        for row, n in enumerate((4, 3, 2)):
            for k in range(n):
                log(m, x0 + (k - (n - 1) / 2) * 0.115 + 0.13, 0.065 + row * 0.1, zz, 0.46, 0.055, 'z')
        for sx in (0.43, 0.9):
            m.add(box(0.05, 0.5, 0.05), C.timber, pos=(sx, 0.25, zz + 0.2))
            m.add(box(0.05, 0.62, 0.05), C.timber, pos=(sx, 0.31, zz - 0.2))
        m.add(box(0.62, 0.04, 0.55), C.wood, pos=(0.67, 0.58, zz), rot=(0.18, 0, 0))
        # the chopping block, with the axe stuck in it
        m.add(prism(8, 0.13, 0.15, 0.2), C.lightWood, pos=(0.5, 0.1, 0.58), cap=C.thatchLight)
        m.add(box(0.03, 0.3, 0.03), C.wood, pos=(0.52, 0.32, 0.58), rot=(0, 0, 0.45))
        m.add(box(0.1, 0.07, 0.025), C.iron, pos=(0.44, 0.42, 0.58), rot=(0, 0, 0.45))
        log(m, 0.2, 0.05, 0.66, 0.36, 0.05, 'x')
    else:
        cx, cz = -0.15, -0.2
        top = cottage(m, rng, 1.15, 0.85, 0.6, cx, cz, roof=C.thatch if t == 1 else C.thatchDark, light=C.thatchLight if t == 1 else C.thatch, roof_h=0.66)
        # saw bench in the yard
        m.add(box(0.56, 0.05, 0.2), C.lightWood, pos=(0.62, 0.34, 0.52))
        for x in (0.4, 0.84):
            m.add(box(0.05, 0.32, 0.18), C.wood, pos=(x, 0.17, 0.52))
        m.add(box(0.04, 0.12, 0.34), C.iron, pos=(0.62, 0.44, 0.52))
        log(m, 0.62, 0.4, 0.52, 0.5, 0.05, 'x')
        # planks drying on stickers
        for i in range(5):
            m.add(box(0.5, 0.035, 0.12), C.lightWood if i % 2 else 0xD9B07A, pos=(0.66, 0.03 + i * 0.045, -0.5), rot=(0, 0.03 * (i - 2), 0))
        log_pile(m, -0.76, 0.4, 3, 'z', length=0.46)
        # the shop sign: a board with an axe on a bracket
        pole(m, -0.78, 0, 0.7, 0.7, 0.026, C.timber)
        m.add(box(0.28, 0.035, 0.035), C.timber, pos=(-0.64, 0.66, 0.7))
        m.add(box(0.3, 0.17, 0.03), C.thatch, pos=(-0.62, 0.52, 0.7))
        m.add(box(0.03, 0.12, 0.034), C.wood, pos=(-0.62, 0.52, 0.7), rot=(0, 0, 0.5))
        m.add(box(0.09, 0.05, 0.036), C.iron, pos=(-0.66, 0.57, 0.7), rot=(0, 0, 0.5))
    if t >= 2:
        # the master's crane, gilded gable tips and a pennant
        m.add(box(0.08, 1.15, 0.08), C.timber, pos=(0.88, 0.58, -0.75))
        m.add(box(0.7, 0.06, 0.06), C.timber, pos=(0.58, 1.12, -0.75))
        m.add(box(0.06, 0.4, 0.04), C.timber, pos=(0.75, 0.93, -0.75), rot=(0, 0, 0.6))
        m.add(box(0.012, 0.42, 0.012), C.darkTimber, pos=(0.3, 0.9, -0.75))
        m.add(box(0.14, 0.1, 0.1), C.lightWood, pos=(0.3, 0.64, -0.75))
        for sz in (1, -1):
            m.add(prism(4, 0.05, 0, 0.18, phase=0), 0xF2C14E, pos=(-0.15, 1.22 + 0.55, -0.2 + sz * 0.5))
        pole(m, 0.88, 1.15, -0.75, 0.3)
        flag(m, 0.88, 1.45, -0.75, MARKER, 0.3, 0.17, flip=True)
    return m


# ---------------------------------------------------------------------------------------------
def quarry(t):
    m = Model(f'quarry_{t}')
    rng = rng_for(m.name)
    m.add(box(1.7, 0.07, 1.55), C.stoneDark, pos=(-0.05, 0.035, -0.1))
    # the cut face: tall boulders stepping down into worked terraces
    for x, z, r, ys, col in ((-0.62, -0.62, 0.46, 1.25, C.rock), (0.02, -0.74, 0.52, 1.12, C.stone), (0.64, -0.6, 0.42, 1.18, C.rockDark), (-0.2, -0.2, 0.3, 0.9, C.stoneDark)):
        rock(m, rng, (x, 0.05 + r * ys * 1.0, z), r, col, ys)
    m.add(box(0.65, 0.18, 0.34), C.stone, pos=(0.3, 0.16, -0.3), rot=(0, 0.12, 0))
    m.add(box(0.46, 0.18, 0.26), C.stoneDark, pos=(0.36, 0.33, -0.36), rot=(0, 0.12, 0))
    m.add(ico(), C.moss, pos=(0.02, 1.2, -0.74), scale=(0.34, 0.1, 0.3))
    # timber lean-to over the working face, with a lantern
    for x in (-0.78, 0.0):
        m.add(box(0.075, 0.72, 0.075), C.timber, pos=(x, 0.4, 0.26))
    m.add(box(0.95, 0.06, 0.07), C.darkTimber, pos=(-0.39, 0.74, 0.26))
    m.add(box(1.0, 0.05, 0.78), C.wood, pos=(-0.39, 0.86, -0.1), rot=(0.34, 0, 0))
    for i in range(6):
        m.add(box(0.025, 0.02, 0.8), C.darkTimber, pos=(-0.78 + i * 0.16, 0.895, -0.1), rot=(0.34, 0, 0))
    m.add(box(0.018, 0.12, 0.018), C.iron, pos=(-0.39, 0.66, 0.26))
    m.add(box(0.08, 0.1, 0.08), C.glow, pos=(-0.39, 0.57, 0.26), sway=sb.GLOW)
    # the wheelbarrow, loaded with stone
    m.add(box(0.26, 0.09, 0.3, top=(1.25, 1.2)), C.wood, pos=(0.12, 0.2, 0.52), rot=(0, 0.25, 0))
    m.add(prism(8, 0.1, 0.1, 0.035), C.darkTimber, pos=(0.1, 0.1, 0.7), rot=(0, 0.25, PI / 2))
    for s in (-1, 1):
        m.add(box(0.025, 0.025, 0.34), C.lightWood, pos=(0.12 + s * 0.1 - 0.06, 0.2, 0.34), rot=(0, 0.25, 0))
    rock(m, rng, (0.12, 0.28, 0.52), 0.085, C.stone, 0.8)
    # a pick leaning on the lean-to
    m.add(box(0.03, 0.4, 0.03), C.wood, pos=(-0.7, 0.2, 0.42), rot=(-0.25, 0, -0.35))
    m.add(box(0.2, 0.04, 0.035), C.iron, pos=(-0.77, 0.4, 0.37), rot=(-0.25, 0, -0.35))
    if t == 0:
        for x, z, s, ry in ((0.62, 0.45, 0.2, 0.3), (0.82, 0.12, 0.15, -0.4)):
            m.add(box(s * 1.5, s, s * 1.15), C.stone, pos=(x, s / 2, z), rot=(0, ry, 0))
    if t >= 1:
        # the mason's yard: dressed blocks stacked square and a bench with a chisel
        for i, (x, z) in enumerate(((0.6, 0.5), (0.6, 0.5), (0.6, 0.5), (0.84, 0.5))):
            lvl = i if i < 3 else 0
            m.add(box(0.26, 0.12, 0.2), 0xC2BCB0, pos=(x, 0.06 + lvl * 0.12, z))
        m.add(box(0.4, 0.05, 0.2), C.lightWood, pos=(0.35, 0.3, 0.72))
        for x in (0.2, 0.5):
            m.add(box(0.05, 0.28, 0.18), C.wood, pos=(x, 0.14, 0.72))
        m.add(box(0.14, 0.1, 0.1), 0xC2BCB0, pos=(0.35, 0.38, 0.72))
    if t >= 2:
        # a stone crane with a block on the hook, and a pennant on the lean-to
        m.add(box(0.08, 1.15, 0.08), C.timber, pos=(0.88, 0.58, 0.9))
        m.add(box(0.62, 0.06, 0.06), C.timber, pos=(0.62, 1.12, 0.9))
        m.add(box(0.06, 0.4, 0.04), C.timber, pos=(0.78, 0.93, 0.9), rot=(0, 0, 0.6))
        m.add(box(0.012, 0.42, 0.012), C.darkTimber, pos=(0.38, 0.9, 0.9))
        m.add(box(0.2, 0.17, 0.17), 0xC2BCB0, pos=(0.38, 0.62, 0.9))
        pole(m, -0.78, 0.7, 0.26, 0.5)
        flag(m, -0.78, 1.18, 0.26, MARKER, 0.3, 0.17)
    return m


# ---------------------------------------------------------------------------------------------
def lookout():
    m = Model('lookout')
    rng = rng_for('lookout')
    cz = -0.1
    m.add(prism(8, 0.62, 0.66, 0.16), C.stoneDark, pos=(0, 0.08, cz))
    for i in range(8):
        a = (i + 0.5) / 8 * 2 * PI
        rock(m, rng, (math.sin(a) * 0.62, 0.08, cz + math.cos(a) * 0.62), 0.1, rng.choice((C.stone, C.rock)), 0.65)
    # four lashed legs that lean in towards the platform
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.add(box(0.09, 1.76, 0.09, top=(0.85, 0.85)), C.timber, pos=(sx * 0.38, 0.95, cz + sz * 0.36), rot=(-sz * 0.07, 0, sx * 0.07))
    for y in (0.5, 1.0):
        for sz in (-1, 1):
            for sx in (-1, 1):
                m.add(box(0.76, 0.045, 0.045), C.wood, pos=(0, y, cz + sz * 0.33), rot=(0, 0, sx * 0.55))
        for sx in (-1, 1):
            m.add(box(0.04, 0.04, 0.7), C.wood, pos=(sx * 0.35, y, cz))
        for sx in (-1, 1):
            for sz in (-1, 1):
                m.add(box(0.12, 0.05, 0.12), C.cloth, pos=(sx * 0.36, y - 0.02, cz + sz * 0.34))
    # the platform, with a woven rail and a hung lantern
    m.add(box(1.08, 0.08, 1.04), C.lightWood, pos=(0, 1.78, cz))
    for k in range(5):
        m.add(box(1.1, 0.012, 0.025), C.wood, pos=(0, 1.825, cz - 0.42 + k * 0.21))
    for sz, sx in ((-1, 0), (1, 0)):
        m.add(box(1.04, 0.1, 0.04), C.wood, pos=(0, 1.95, cz + sz * 0.5))
        for k in range(7):
            m.add(box(0.035, 0.2, 0.035), C.timber, pos=(-0.45 + k * 0.15, 1.9, cz + sz * 0.5))
    for sx in (-1, 1):
        m.add(box(0.04, 0.1, 1.0), C.wood, pos=(sx * 0.5, 1.95, cz))
        for k in range(6):
            m.add(box(0.035, 0.2, 0.035), C.timber, pos=(sx * 0.5, 1.9, cz - 0.4 + k * 0.16))
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.add(box(0.07, 0.62, 0.07), C.timber, pos=(sx * 0.5, 2.18, cz + sz * 0.48))
    m.add(box(0.07, 0.12, 0.07), C.iron, pos=(0.5, 2.05, cz + 0.48))
    m.add(box(0.08, 0.1, 0.08), C.glow, pos=(0.5, 1.98, cz + 0.48), sway=sb.GLOW)
    # a steep, flared roof of thatch with a ridge finial and the family banner
    m.add(prism(4, 0.9, 0.62, 0.22, phase=0), C.thatch, pos=(0, 2.4, cz))
    m.add(prism(4, 0.66, 0.0, 0.62, phase=0), C.thatchLight, pos=(0, 2.7, cz))
    m.add(prism(4, 0.82, 0.8, 0.05, phase=0), C.thatchDark, pos=(0, 2.285, cz))
    pole(m, 0, 2.9, cz, 0.55, 0.024)
    m.add(ico(), 0xF2C14E, pos=(0, 3.45, cz), scale=(0.045, 0.045, 0.045))
    flag(m, 0, 3.38, cz, MARKER, 0.5, 0.3)
    # a crooked ladder up the front
    for x in (-0.15, 0.15):
        m.add(box(0.035, 1.8, 0.035), C.wood, pos=(x, 0.9, cz + 0.52), rot=(-0.09, 0, 0))
    for i in range(7):
        m.add(box(0.3, 0.03, 0.03), C.lightWood, pos=(0, 0.25 + i * 0.25, cz + 0.52 - 0.02 * i / 3), rot=(0, 0, (i % 2) * 0.03))
    return m


# ---------------------------------------------------------------------------------------------
def wagon():
    """The founders' covered wagon, with a campfire at (-0.45, 0.78) where the game spawns smoke."""
    m = Model('wagon_0')
    rng = rng_for('wagon')
    y = 0.4
    m.add(box(1.3, 0.1, 0.7), C.wood, pos=(0, y, 0))
    for sz in (-1, 1):
        m.add(box(1.3, 0.2, 0.05), C.darkTimber, pos=(0, y + 0.15, sz * 0.34))
    for sx in (-1, 1):
        m.add(box(0.05, 0.2, 0.7), C.darkTimber, pos=(sx * 0.64, y + 0.15, 0))
    for sx in (-0.42, 0.42):
        for sz in (-0.4, 0.4):
            wheel(m, sx, 0.23, sz)
    m.add(box(0.05, 0.05, 0.78), C.timber, pos=(-0.42, 0.23, 0))
    m.add(box(0.05, 0.05, 0.78), C.timber, pos=(0.42, 0.23, 0))
    # the canvas cover on its hoops
    m.add(halfpipe(0.38, 1.12, 9), C.cloth, pos=(0, y + 0.2, 0), cap=C.clothShade)
    for x in (-0.46, 0.0, 0.46):
        m.add(halfpipe(0.395, 0.045, 9), C.clothShade, pos=(x, y + 0.2, 0))
    m.add(box(0.46, 0.05, 0.05), C.wood, pos=(-0.88, 0.32, 0), rot=(0, 0, 0.13))
    m.add(box(0.05, 0.05, 0.3), C.wood, pos=(-1.0, 0.36, 0))
    # cargo, a barrel, a lantern post and the cooking fire
    crate(m, 0.58, 0.62, 0.24)
    crate(m, 0.8, 0.4, 0.18, rot=0.4)
    m.add(ico(), C.clothShade, pos=(0.3, 0.12, 0.68), scale=(0.15, 0.12, 0.13))
    barrel(m, 0.8, -0.5)
    pole(m, 0.92, 0, -0.3, 0.95)
    m.add(box(0.09, 0.11, 0.09), C.glow, pos=(0.92, 0.9, -0.3), sway=sb.GLOW)
    m.add(box(0.12, 0.03, 0.12), C.iron, pos=(0.92, 0.97, -0.3))
    campfire(m, -0.45, 0.78)
    log(m, -0.2, 0.06, 1.0 - 0.1, 0.34, 0.06, 'x')
    log(m, -0.72, 0.06, 0.98, 0.3, 0.06, 'x')
    return m


def hall(rank):
    """The founders' camp grown into a hall: timber and thatch, one banner per rank, a keep at Town."""
    m = Model(f'wagon_{rank}')
    rng = rng_for(m.name)
    w, d, h = 1.28 + 0.06 * rank, 1.35 + 0.1 * rank, 0.62 + 0.06 * rank
    cx, cz = -0.15, -0.2
    wall = C.wattle if rank < 2 else C.plaster
    roof, light = (C.thatch, C.thatchLight) if rank < 3 else (C.thatchDark, C.thatch)
    if rank >= 2:
        m.add(box(w + 0.42, 0.1, d + 0.42), C.stone, pos=(cx, 0.05, cz))
    roof_h = 0.7 + 0.03 * rank
    top = cottage(m, rng, w, d, h, cx, cz, wall=wall, roof=roof, light=light, roof_h=roof_h, door_w=0.34, door_h=0.42, chimney=True)
    # carved ridge finials at both gables
    for sz in (1, -1):
        m.add(prism(4, 0.055, 0, 0.3, phase=0), C.darkTimber, pos=(cx, top + 0.12, cz + sz * (d / 2 + 0.16)), rot=(sz * 0.55, 0, 0))
    # the hearth fire where the game spawns smoke
    campfire(m, -0.45, 0.8)
    crate(m, -0.85, 0.5, 0.2)
    m.add(prism(12, 0.17, 0.17, 0.05), C.darkTimber, pos=(0.6, 0.2, 0.72), rot=(0.25, 0, PI / 2))
    # banners at the front corners: red at the Hamlet, blue at the Village, and the keep's gold flag at the Town
    for i, (bx, bz, col) in enumerate(((-0.92, 0.62, 0xC0392B), (0.56, 0.66, 0x2E86C1))):
        if rank > i:
            pole(m, bx, 0, bz, 1.5)
            flag(m, bx, 1.46, bz, col, 0.3, 0.26, flip=(i == 0))
    if rank >= 3:
        tx, tz = 0.8, -0.45
        m.add(box(0.5, 1.5, 0.5, top=(0.92, 0.92)), C.stone, pos=(tx, 0.75, tz))
        for k in range(3):
            m.add(box(0.54, 0.05, 0.54), C.stoneDark, pos=(tx, 0.3 + k * 0.4, tz))
        m.add(box(0.14, 0.2, 0.05), C.door, pos=(tx, 0.9, tz + 0.26))
        m.add(prism(4, 0.42, 0.02, 0.62, phase=0), C.thatchDark, pos=(tx, 1.81, tz))
        pole(m, tx, 2.1, tz, 0.5)
        flag(m, tx, 2.55, tz, 0xF2C14E, 0.3, 0.17)
    return m


def forager(t):
    m = Model(f'forager_{t}')
    rng = rng_for(m.name)
    cx, cz = -0.12, -0.2
    cottage(m, rng, 0.95, 0.8, 0.5, cx, cz, roof=0xB8903C, light=0xC9A44A, roof_h=0.58, ridge=C.thatchDark)
    for x, z in ((0.58, 0.5), (0.8, 0.22), (0.42, 0.78)) if t == 0 else ((0.58, 0.5), (0.8, 0.22), (0.42, 0.78), (0.82, 0.62)):
        m.add(prism(8, 0.13, 0.1, 0.12), C.lightWood, pos=(x, 0.06, z))
        for i in range(5):
            m.add(ico(), C.berry, pos=(x + ((i % 3) - 1) * 0.055, 0.13, z + (i // 3 - 0.3) * 0.07), scale=(0.04, 0.04, 0.04))
    # a drying rack hung with herbs and leaves
    for z in (-0.38, -0.78):
        m.add(box(0.04, 0.5, 0.04), C.wood, pos=(0.72, 0.25, z))
    m.add(box(0.04, 0.04, 0.5), C.wood, pos=(0.72, 0.5, -0.58))
    for z in (-0.46, -0.58, -0.7):
        m.add(box(0.03, 0.18, 0.07), C.leaf, pos=(0.72, 0.38, z))
    if t >= 1:
        sb.fence(m, -0.85, -0.25, 0.9, 4)
        for x in (-0.7, -0.5):
            m.add(ico(), C.leafLight, pos=(x, 0.07, 0.66), scale=(0.09, 0.08, 0.09))
    return m


def storehouse():
    m = Model('storehouse')
    rng = rng_for('storehouse')
    top = cottage(m, rng, 1.3, 1.1, 0.64, 0, -0.15, wall=C.wood, roof=C.thatch, light=C.thatchLight, roof_h=0.68, door_w=0.5, door_h=0.46, windows=False, chimney=False, timber=C.darkTimber)
    # a big X-braced door, a hay hoist beam over a loft hatch, and the loading ramp
    m.add(box(0.46, 0.04, 0.05), C.darkTimber, pos=(0, 0.37, 0.43), rot=(0, 0, 0.78))
    m.add(box(0.46, 0.04, 0.05), C.darkTimber, pos=(0, 0.37, 0.43), rot=(0, 0, -0.78))
    m.add(box(0.2, 0.2, 0.04), C.door, pos=(0, 1.12, 0.43))
    m.add(box(0.07, 0.07, 0.4), C.timber, pos=(0, 1.3, 0.62))
    m.add(box(0.012, 0.3, 0.012), C.darkTimber, pos=(0, 1.13, 0.78))
    m.add(box(0.12, 0.1, 0.08), C.thatchLight, pos=(0, 0.95, 0.78))
    m.add(box(0.5, 0.05, 0.34), C.wood, pos=(0, 0.1, 0.62), rot=(-0.25, 0, 0))
    crate(m, -0.7, 0.62, 0.24)
    barrel(m, 0.72, 0.64)
    m.add(ico(), C.clothShade, pos=(-0.5, 0.1, 0.8), scale=(0.14, 0.11, 0.12))
    return m


def make_all():
    return {mm.name: mm for mm in [hut(), woodcutter(0), woodcutter(1), woodcutter(2), quarry(0), quarry(1), quarry(2), lookout(), wagon(), hall(1), hall(2), hall(3), forager(0), forager(1), storehouse()]}
