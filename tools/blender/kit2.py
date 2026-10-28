"""
More storybook helpers: halls with the ridge along x, braziers, tents, sacks, standing stones.
Everything works in game space like storybook.py (door on +z, ground at y = 0).
"""
import math

import storybook as sb
from storybook import C, GLOW, Model, box, prism, ico, extrude, rock, door, window, flame, stone_footing, thatch_roof, roof_apex, pole, flag

PI = math.pi


def brazier(m, x, z, h=0.5):
    """A torch-bowl on three legs, glowing at night."""
    for k in range(3):
        a = k * 2 * PI / 3
        m.add(prism(4, 0.014, 0.012, h), C.wood, pos=(x + math.sin(a) * 0.06, h / 2, z + math.cos(a) * 0.06), rot=(-math.cos(a) * 0.18, 0, math.sin(a) * 0.18))
    m.add(prism(8, 0.1, 0.06, 0.08), C.iron, pos=(x, h, z))
    flame(m, x, h + 0.03, z, 0.2, 0.065)


def torch(m, x, y, z, h=0.34):
    """A wall torch on a post."""
    m.add(prism(5, 0.018, 0.016, h), C.wood, pos=(x, y + h / 2, z))
    flame(m, x, y + h, z, 0.14, 0.045)


def tent(m, x, z, r=0.45, rot=0.0, color=None, stripe=None):
    """A canvas tent: a pyramid with a coloured band and a dark flap."""
    h = r * 1.5
    m.add(prism(4, r * 1.2, 0, h, phase=0), color or C.cloth, pos=(x, h / 2, z), rot=(0, rot + PI / 4, 0))
    m.add(prism(4, r * 1.2 * 0.62, r * 1.2 * 0.5, h * 0.12, phase=0), stripe or C.thatchDark, pos=(x, h * 0.42, z), rot=(0, rot + PI / 4, 0))
    sn, cs = math.sin(rot), math.cos(rot)
    m.add(box(0.2, h * 0.52, 0.04), C.door, pos=(x + sn * r * 0.62, h * 0.26, z + cs * r * 0.62), rot=(0, rot, 0))


def sack(m, x, z, s=0.14, y0=0.0, color=None):
    m.add(ico(), color or C.clothShade, pos=(x, y0 + s * 0.8, z), scale=(s, s * 0.85, s * 0.9))


def roof_x(m, length, wid, h, y, cx, cz, color, ridge=None, light=None, overhang=0.13, thick=0.075, fringe=True):
    """A gable thatch with the ridge running along x (the long way of a hall)."""
    t = Model('tmp')
    thatch_roof(t, wid, length, h, y, 0, 0, color, ridge, light, overhang, thick, fringe)
    m.merge(t, PI / 2, (cx, 0, cz))


def long_hall(m, rng, L, W, H, cx, cz, wall, timber, roof, light, roof_h, ridge=None, door_x=0.0, door_w=0.3, door_h=0.42, windows=(), overhang=0.13):
    """A long timber hall, ridge along x, door on the +z side. Returns the ridge height."""
    fh = 0.14
    stone_footing(m, rng, L + 0.12, W + 0.12, cx, cz, fh)
    m.add(box(L, H, W), wall, pos=(cx, fh + H / 2, cz))
    n = max(3, int(L / 0.4))
    for i in range(n + 1):
        x = cx - L / 2 + L * i / n
        for sz in (-1, 1):
            m.add(box(0.075, H + 0.02, 0.075), timber, pos=(x, fh + H / 2, cz + sz * W / 2))
    for sz in (-1, 1):
        m.add(box(L + 0.03, 0.05, 0.06), timber, pos=(cx, fh + H * 0.64, cz + sz * W / 2))
    ye = fh + H
    roof_x(m, L, W, roof_h, ye, cx, cz, roof, ridge, light, overhang)
    apex = roof_apex(roof_h, W, overhang)
    for sx in (-1, 1):
        m.add(extrude([(-W / 2, 0), (W / 2, 0), (0, apex)], 0.05), wall, pos=(cx + sx * L / 2, ye, cz), rot=(0, PI / 2, 0), convex=False)
        m.add(box(0.06, apex * 0.8, 0.06), timber, pos=(cx + sx * (L / 2 + 0.02), ye + apex * 0.4, cz))
    door(m, cx + door_x, cz + W / 2 + 0.01, door_w, door_h, fh)
    for wx in windows:
        window(m, cx + wx, fh + H * 0.55, cz + W / 2 + 0.02, 0.0, 0.12, 0.13, True)
    return ye + roof_h


def menhir(m, rng, x, z, h, w=0.28, d=0.18, ry=0.0, color=None, moss=True):
    """A standing stone: tapered, a little crooked, with a cap of moss."""
    c = color or rng.choice((C.stone, C.rock, C.stoneDark))
    lean = (rng.random() - 0.5) * 0.12
    m.add(box(w, h, d, top=(0.7, 0.75)), c, pos=(x, h / 2, z), rot=(lean, ry, lean * 0.7))
    if moss:
        m.add(ico(), C.moss, pos=(x, 0.06, z), scale=(w * 0.8, 0.07, d * 1.0), rot=(0, ry, 0))


def dragon_head(m, x, y, z, side=1, color=None, s=1.6):
    """A carved gable finial: a long neck curling out and up, a snout and a gilded eye."""
    c = color or C.darkTimber
    m.add(box(0.07 * s, 0.34 * s, 0.07 * s), c, pos=(x, y + 0.14 * s, z), rot=(0, 0, -side * 0.45))
    m.add(prism(4, 0.06 * s, 0.02 * s, 0.2 * s, phase=0), c, pos=(x + side * 0.1 * s, y + 0.36 * s, z), rot=(0, 0, -side * 1.2))
    m.add(ico(), 0xF2C14E, pos=(x + side * 0.04 * s, y + 0.38 * s, z + 0.045 * s), scale=(0.02 * s, 0.02 * s, 0.02 * s))


def horns(m, x, y, z, s=1.0, color=None):
    """Crossed gable beams with gilded tips (the gable plane is y-z, so they lean about the x axis)."""
    c = color or C.darkTimber
    for a in (0.5, -0.5):
        m.add(box(0.05 * s, 0.78 * s, 0.05 * s), c, pos=(x, y + 0.3 * s, z), rot=(a, 0, 0))
        for e in (-1, 1):
            m.add(prism(4, 0.04 * s, 0, 0.12 * s, phase=0), 0xF2C14E, pos=(x, y + 0.3 * s + math.cos(a) * 0.39 * s * e, z + math.sin(a) * -0.39 * s * e), rot=(a if e > 0 else a + PI, 0, 0))
