"""
Calling props: the signature cluster that grows beside the hall as a town finds its calling.
Each is built around the origin (about 1.5 x 1.5, ground at y = 0) and scaled by tier in the game.
"""
import math

import storybook as sb
from storybook import C, GLOW, MARKER, Model, box, ico, prism, extrude, rock, log, barrel, crate, pole, flag, flame, fence, rng_for
from kit2 import brazier, torch, tent, sack, menhir

PI = math.pi


def stall(m, x, z, awning, rot=0.0):
    """A market stall: trestle table, a striped awning on two posts, wares."""
    sn, cs = math.sin(rot), math.cos(rot)

    def at(lx, lz):
        return (x + lx * cs + lz * sn, z - lx * sn + lz * cs)

    for lx in (-0.3, 0.3):
        px, pz = at(lx, -0.18)
        m.add(box(0.045, 0.62, 0.045), C.timber, pos=(px, 0.31, pz))
        px, pz = at(lx, 0.18)
        m.add(box(0.045, 0.46, 0.045), C.timber, pos=(px, 0.23, pz))
    tx, tz = at(0, 0.0)
    m.add(box(0.7, 0.05, 0.4), C.lightWood, pos=(tx, 0.36, tz), rot=(0, rot, 0))
    for k in range(4):
        ax, az = at(-0.27 + k * 0.18, -0.02)
        m.add(box(0.18, 0.025, 0.5), awning if k % 2 else C.cloth, pos=(ax, 0.66, az), rot=(0.28, rot, 0))
    for k in range(3):
        wx, wz = at(-0.2 + k * 0.2, 0.0)
        m.add(ico(), [C.berry, C.leaf, 0xE0707A][k], pos=(wx, 0.43, wz), scale=(0.06, 0.05, 0.06))


def trader():
    m = Model('calling_trader')
    rng = rng_for('calling_trader')
    m.add(box(1.5, 0.04, 1.4), 0xB59A6A, pos=(0, 0.02, 0))
    stall(m, -0.4, -0.2, 0x2E86C1, 0.0)
    stall(m, 0.35, -0.35, 0xC0392B, 0.3)
    stall(m, 0.15, 0.4, 0xF2C14E, -0.5)
    barrel(m, -0.65, 0.35, 0.1, 0.22)
    crate(m, -0.55, 0.62, 0.2, rot=0.4)
    sack(m, 0.7, 0.35, 0.13)
    # a hanging balance and a signpost with a coin
    pole(m, -0.72, 0, -0.55, 0.9, 0.022)
    m.add(box(0.3, 0.03, 0.03), C.timber, pos=(-0.6, 0.86, -0.55))
    for dx in (-0.14, 0.14):
        m.add(prism(8, 0.07, 0.07, 0.015), 0xF2C14E, pos=(-0.6 + dx, 0.7, -0.55))
    flag(m, 0.7, 1.0, -0.6, 0x2E86C1, 0.3, 0.2)
    pole(m, 0.7, 0, -0.6, 1.0, 0.022)
    return m


def masons():
    m = Model('calling_masons')
    rng = rng_for('calling_masons')
    m.add(box(1.5, 0.04, 1.4), 0x9A948A, pos=(0, 0.02, 0))
    # dressed blocks stacked square, a cutting bench with a chisel, a half-cut block
    for i in range(3):
        for j in range(2):
            m.add(box(0.3, 0.14, 0.22), 0xC2BCB0 if (i + j) % 2 else C.stone, pos=(-0.5 + j * 0.34, 0.09 + i * 0.145, -0.4))
    m.add(box(0.7, 0.05, 0.3), C.lightWood, pos=(0.2, 0.34, 0.45))
    for x in (-0.1, 0.5):
        m.add(box(0.05, 0.32, 0.26), C.wood, pos=(x, 0.17, 0.45))
    m.add(box(0.26, 0.16, 0.2), C.stone, pos=(0.1, 0.45, 0.45))
    m.add(box(0.03, 0.18, 0.03), C.iron, pos=(0.32, 0.44, 0.45), rot=(0, 0, 0.5))
    # a little forge: stone hearth, chimney, glowing fire
    m.add(box(0.5, 0.42, 0.4), C.stoneDark, pos=(0.45, 0.21, -0.35))
    m.add(box(0.2, 0.6, 0.2), C.stone, pos=(0.5, 0.72, -0.4))
    m.add(box(0.26, 0.05, 0.26), C.stoneDark, pos=(0.5, 1.04, -0.4))
    m.anchor('smoke', (0.5, 1.1, -0.4))
    flame(m, 0.4, 0.38, -0.2, 0.2, 0.08)
    m.add(box(0.2, 0.08, 0.12), C.iron, pos=(0.0, 0.07, 0.0))
    m.add(box(0.14, 0.14, 0.1), C.iron, pos=(0.0, 0.18, 0.0))
    # a crane for the heavy blocks
    m.add(box(0.07, 0.95, 0.07), C.timber, pos=(-0.62, 0.48, 0.3))
    m.add(box(0.55, 0.06, 0.06), C.timber, pos=(-0.38, 0.92, 0.3))
    m.add(box(0.012, 0.3, 0.012), C.darkTimber, pos=(-0.12, 0.76, 0.3))
    m.add(box(0.12, 0.1, 0.1), C.stone, pos=(-0.12, 0.6, 0.3))
    flag(m, 0.72, 1.0, 0.5, 0x8C8478, 0.3, 0.2)
    pole(m, 0.72, 0, 0.5, 1.0, 0.022)
    return m


def stronghold():
    m = Model('calling_stronghold')
    rng = rng_for('calling_stronghold')
    m.add(box(1.5, 0.04, 1.4), 0x8A7650, pos=(0, 0.02, 0))
    # a palisade stretch with a watch platform, a weapon rack, a practice dummy and a banner
    for i in range(7):
        x = -0.66 + i * 0.22
        h = 0.7 + (i % 3) * 0.04
        m.add(prism(5, 0.055, 0.05, h), C.timber if i % 2 else C.darkTimber, pos=(x, h / 2, -0.62))
        m.add(prism(5, 0.058, 0, 0.14), C.lightWood, pos=(x, h + 0.07, -0.62))
    m.add(box(1.5, 0.04, 0.05), C.cloth, pos=(0, 0.45, -0.58))
    m.add(box(0.5, 0.05, 0.05), C.wood, pos=(-0.45, 0.46, 0.2))
    for x in (-0.62, -0.5, -0.38, -0.26):
        m.add(box(0.02, 0.8, 0.02), C.wood, pos=(x, 0.4, 0.17), rot=(0.12, 0, 0))
        m.add(prism(4, 0.02, 0, 0.07, phase=0), C.iron, pos=(x, 0.82, 0.13))
    pole(m, 0.4, 0, 0.3, 0.6, 0.03)
    m.add(prism(7, 0.12, 0.1, 0.32), C.thatch, pos=(0.4, 0.5, 0.3))
    m.add(box(0.5, 0.05, 0.05), C.wood, pos=(0.4, 0.55, 0.3))
    m.add(prism(7, 0.085, 0.085, 0.09), C.iron, pos=(0.4, 0.76, 0.3))
    for k, c in enumerate((0xC0392B, 0xF2C14E, 0xC0392B)):
        m.add(prism(10, 0.1, 0.1, 0.03), c, pos=(-0.3 + k * 0.3, 0.3, 0.6), rot=(PI / 2, 0, 0))
    brazier(m, 0.7, -0.3, 0.45)
    pole(m, -0.7, 0, 0.55, 1.5, 0.026)
    flag(m, -0.7, 1.46, 0.55, 0xC0392B, 0.38, 0.28)
    return m


def hearth():
    m = Model('calling_hearth')
    rng = rng_for('calling_hearth')
    m.add(box(1.5, 0.04, 1.4), 0x7A9A4A, pos=(0, 0.02, 0))
    # haystacks, a bench of beehive skeps, garden beds, a scarecrow and a wicker fence
    for x, z, s in ((-0.45, -0.4, 1.0), (-0.05, -0.5, 0.8)):
        m.add(prism(9, 0.26 * s, 0.17 * s, 0.34 * s), 0xE3C56A, pos=(x, 0.17 * s, z))
        m.add(prism(9, 0.17 * s, 0.02, 0.22 * s), 0xD6AA43, pos=(x, 0.45 * s, z))
    m.add(box(0.7, 0.04, 0.2), C.lightWood, pos=(0.45, 0.3, -0.45))
    for x in (0.2, 0.7):
        m.add(box(0.04, 0.3, 0.18), C.wood, pos=(x, 0.15, -0.45))
    for k in range(3):
        m.add(prism(8, 0.09, 0.03, 0.14), 0xE3C56A, pos=(0.27 + k * 0.18, 0.39, -0.45))
        m.add(box(0.03, 0.03, 0.02), C.door, pos=(0.27 + k * 0.18, 0.37, -0.36))
    for z, c in ((0.25, C.leaf), (0.55, C.leafLight)):
        m.add(box(0.8, 0.07, 0.22), 0x6B4F33, pos=(-0.15, 0.04, z))
        for k in range(4):
            m.add(ico(), c, pos=(-0.45 + k * 0.2, 0.12, z), scale=(0.075, 0.07, 0.075))
    pole(m, 0.55, 0, 0.3, 0.75, 0.025)
    m.add(box(0.5, 0.04, 0.04), C.wood, pos=(0.55, 0.6, 0.3))
    m.add(box(0.2, 0.22, 0.12), C.cloth, pos=(0.55, 0.45, 0.3))
    m.add(prism(6, 0.1, 0.02, 0.14), C.thatch, pos=(0.55, 0.84, 0.3))
    fence(m, -0.7, 0.7, 0.75, 6)
    for x in (-0.7, 0.7):
        pole(m, x, 0, 0.75, 0.3)
    flag(m, 0.72, 1.1, -0.65, 0x3F8A4A, 0.3, 0.2)
    pole(m, 0.72, 0, -0.65, 1.1, 0.022)
    return m


def make_all():
    return {mm.name: mm for mm in [trader(), masons(), stronghold(), hearth()]}
