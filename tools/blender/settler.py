"""
The FirstFolk settler, as separate parts so src/render/settlers.ts can keep posing them procedurally.

Conventions (matching settlers.ts):
  * feet at y = 0, facing +z, joints at HIP_Y = 0.18 and SHOULDER_Y = 0.37
  * `settler_arm` hangs from its own origin (the shoulder) down to -0.17 (ARM_LEN)
  * `settler_leg` hangs from its own origin (the hip) down to -0.18
  * colours are WHITE-based because the game tints each instance: tunic, skin, hair and crest
    colour are multiplied in at runtime. Anything darker than white is a shade of that tint
    (belt, boots, eyes), so it stays correct for every family and skin tone.
"""
import storybook as sb
from storybook import Model, box, prism, ico, sphere

W = 0xFFFFFF
HIP_Y, SHOULDER_Y, ARM_LEN = 0.18, 0.37, 0.17


def body():
    m = Model('settler_body')
    m.add(prism(8, 0.125, 0.082, 0.24), W, pos=(0, 0.29, 0))
    m.add(prism(8, 0.1, 0.095, 0.035), W, pos=(0, 0.3, 0), shade=0.45)
    m.add(box(0.045, 0.04, 0.02), W, pos=(0, 0.3, 0.098), shade=0.3)
    return m


def head():
    m = Model('settler_head')
    m.add(sphere(8, 5), W, pos=(0, 0.5, 0), scale=(0.1, 0.1, 0.1))
    m.add(prism(4, 0.024, 0, 0.055, phase=0), W, pos=(0, 0.485, 0.108), rot=(1.5708, 0, 0))
    for s in (-1, 1):
        m.add(box(0.022, 0.03, 0.012), W, pos=(s * 0.037, 0.52, 0.094), shade=0.07)
    return m


def hair():
    m = Model('settler_hair')
    m.add(sphere(7, 4), W, pos=(0, 0.505, -0.03), scale=(0.108, 0.1, 0.098))
    m.add(box(0.15, 0.04, 0.03), W, pos=(0, 0.575, 0.09), rot=(0.25, 0, 0))
    return m


def hood():
    m = Model('settler_hood')
    m.add(prism(8, 0.114, 0.114, 0.045), W, pos=(0, 0.575, 0), shade=0.78)
    m.add(prism(8, 0.1, 0.03, 0.17), W, pos=(0, 0.675, -0.02), rot=(-0.28, 0, 0))
    m.add(ico(), W, pos=(0, 0.745, -0.075), scale=(0.035, 0.035, 0.035), shade=0.8)
    return m


def arm():
    m = Model('settler_arm')
    m.add(box(0.058, 0.13, 0.058, top=(1.12, 1.12)), W, pos=(0, -0.065, 0))
    m.add(box(0.054, 0.05, 0.054), W, pos=(0, -0.145, 0), shade=0.82)
    return m


def leg():
    m = Model('settler_leg')
    m.add(box(0.065, 0.12, 0.065), W, pos=(0, -0.06, 0))
    m.add(box(0.078, 0.075, 0.1), W, pos=(0, -0.142, 0.012), shade=0.45)
    return m


def make_all():
    return {mm.name: mm for mm in [body(), head(), hair(), hood(), arm(), leg()]}
