"""
Build FirstFolk's Blender art: models -> GLB -> preview renders.

  From the Blender MCP:   __file__ = '/…/tools/blender/build.py'; exec(compile(open(__file__).read(), __file__, 'exec'))
  Headless:               Blender -b -P tools/blender/build.py

Writes public/models/{buildings,landmarks,settler}.glb, and previews into screenshots/blender/
(git-ignored). Works in its own scene ("FirstFolkArt"), never your own.
"""
import importlib
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

# Reload in dependency order, so edits are picked up inside a long-running Blender session.
import storybook as sb
importlib.reload(sb)
import kit2
importlib.reload(kit2)
import buildings
importlib.reload(buildings)
import buildings2
importlib.reload(buildings2)
import landmarks
importlib.reload(landmarks)
import settler
importlib.reload(settler)

from storybook import fresh_scene, collection, export_glb, shoot

OUT = os.path.join(sb.ROOT, 'public', 'models')
PREVIEW = os.path.join(sb.ROOT, 'screenshots', 'blender')
os.makedirs(OUT, exist_ok=True)
os.makedirs(PREVIEW, exist_ok=True)

scene = fresh_scene()
bm = {**buildings.make_all(), **buildings2.make_all()}
lm = landmarks.make_all()
sm = settler.make_all()

cb = collection(scene, 'export_buildings')
cl = collection(scene, 'export_landmarks')
cs = collection(scene, 'export_settler')
bobjs = [o for m in bm.values() for o in m.build(cb)]
lobjs = [o for m in lm.values() for o in m.build(cl)]
sobjs = [o for m in sm.values() for o in m.build(cs)]

export_glb(bobjs, os.path.join(OUT, 'buildings.glb'))
export_glb(lobjs, os.path.join(OUT, 'landmarks.glb'))
export_glb(sobjs, os.path.join(OUT, 'settler.glb'))

# ---- previews: objects only move after export, so the GLBs keep their origin-space geometry ----
cp = collection(scene, 'preview')
ground = sb.Model('ground')
ground.add(sb.box(300, 0.2, 300), 0x8FBF5A, pos=(0, -0.1, 0))
ground.build(cp)
sun = bpy.data.objects.new('PreviewSun', bpy.data.lights.new('PreviewSun', 'SUN'))
cp.objects.link(sun)

ROWS = {
    'a': ('b', ['hut', 'woodcutter_0', 'woodcutter_1', 'woodcutter_2']),
    'b': ('b', ['quarry_0', 'quarry_1', 'quarry_2', 'lookout']),
    'c': ('b', ['wagon_0', 'wagon_1', 'wagon_2', 'wagon_3']),
    'd': ('b', ['forager_0', 'forager_1', 'storehouse', 'sawpit']),
    'e': ('b', ['forester', 'fisher', 'longhouse', 'outpost']),
    'f': ('b', ['watchtower', 'stockade', 'musterhall']),
    'g': ('b', ['henge', 'meadhall', 'granary']),
    'h': ('l', ['discovery_cart', 'discovery_ruins', 'discovery_wanderers', 'discovery_stones', 'discovery_starstone']),
    'i': ('l', ['discovery_barrow', 'discovery_hermit', 'discovery_hoard', 'discovery_spring', 'discovery_shrine']),
    'j': ('l', ['discovery_grove', 'discovery_oakwood', 'discovery_outcrop']),
}
pool = {'b': bobjs, 'l': lobjs}
for r, (row, (kind, names)) in enumerate(ROWS.items()):
    gz = r * 3.8
    for i, n in enumerate(names):
        step = 3.4 if row in ('g',) else 2.7
        for o in pool[kind]:
            if o.name == n or o.name.startswith(n + '@') or o.name.startswith(n + '#'):
                o.location.x += (i - (len(names) - 1) / 2) * step
                o.location.y -= gz
    shoot(scene, os.path.join(PREVIEW, f'row_{row}.png'), (0, 0.5, gz), 14 if len(names) < 5 else 16, yaw=0.6, lens=45, res=(1800, 760))

# the settler: parts at their joints, arms and legs mirrored, off to one side
SX = 60.0
JOINT = {'settler_arm': 0.37, 'settler_leg': 0.18}
for o in sobjs:
    o.location.x = SX
for name, jy in JOINT.items():
    o = next(x for x in sobjs if x.name == name)
    off = 0.105 if name == 'settler_arm' else 0.045
    o.location = (SX - off, 0, jy)
    twin = o.copy()
    cp.objects.link(twin)
    twin.location = (SX + off, 0, jy)
shoot(scene, os.path.join(PREVIEW, 'settler.png'), (SX, 0.33, 0), 1.7, yaw=0.5, pitch=0.35, lens=60, res=(900, 900))

result = {
    'buildings': {n: {'tris': m.tris(), 'height': round(m.height(), 2), 'extent': [round(v, 2) for v in m.extent()]} for n, m in {**bm, **lm}.items()},
    'settler_total': sum(sm[k].tris() for k in ('settler_body', 'settler_head', 'settler_hair', 'settler_hood')) + 2 * sm['settler_arm'].tris() + 2 * sm['settler_leg'].tris(),
}
