"""
Build FirstFolk's Blender art: models -> GLB -> preview renders.

  From the Blender MCP:   __file__ = '/…/tools/blender/build.py'; exec(open(__file__).read())
  Headless:               Blender -b -P tools/blender/build.py

Writes public/models/buildings.glb and public/models/settler.glb, and previews into
screenshots/blender/ (git-ignored). Works in its own scene ("FirstFolkArt"), never your own.
"""
import importlib
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import storybook as sb
import buildings
import settler

for mod in (sb, buildings, settler):
    importlib.reload(mod)

from storybook import fresh_scene, collection, export_glb, shoot

OUT = os.path.join(sb.ROOT, 'public', 'models')
PREVIEW = os.path.join(sb.ROOT, 'screenshots', 'blender')
os.makedirs(OUT, exist_ok=True)
os.makedirs(PREVIEW, exist_ok=True)

scene = fresh_scene()
bm = buildings.make_all()
sm = settler.make_all()

cb = collection(scene, 'export_buildings')
cs = collection(scene, 'export_settler')
bobjs = [o for m in bm.values() for o in m.build(cb)]
sobjs = [o for m in sm.values() for o in m.build(cs)]

export_glb(bobjs, os.path.join(OUT, 'buildings.glb'))
export_glb(sobjs, os.path.join(OUT, 'settler.glb'))

# ---- previews: objects only move after export, so the GLBs keep their origin-space geometry ----
cp = collection(scene, 'preview')
ground = sb.Model('ground')
ground.add(sb.box(200, 0.2, 200), 0x8FBF5A, pos=(0, -0.1, 0))
ground.build(cp)

ROWS = {
    'a': ['hut', 'woodcutter_0', 'woodcutter_1', 'woodcutter_2'],
    'b': ['quarry_0', 'quarry_1', 'quarry_2', 'lookout'],
    'c': ['wagon_0', 'wagon_1', 'wagon_2', 'wagon_3'],
    'd': ['forager_0', 'forager_1', 'storehouse'],
}
sun = bpy.data.objects.new('PreviewSun', bpy.data.lights.new('PreviewSun', 'SUN'))
cp.objects.link(sun)
for r, (row, names) in enumerate(ROWS.items()):
    gz = r * 3.4
    for i, n in enumerate(names):
        for o in bobjs:
            if o.name == n or o.name.startswith(n + '@'):
                o.location.x += (i - 1.5) * 2.6
                o.location.y -= gz
    shoot(scene, os.path.join(PREVIEW, f'row_{row}.png'), (0, 0.5, gz), 17, yaw=0.6, lens=45, res=(1800, 700))

# the settler: parts at their joints, arms and legs mirrored, off to one side
SX = 30.0
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
    'buildings': {n: {'tris': m.tris(), 'height': round(m.height(), 2), 'extent': [round(v, 2) for v in m.extent()]} for n, m in bm.items()},
    'settler': {n: m.tris() for n, m in sm.items()},
    'settler_total': sum(sm[k].tris() for k in ('settler_body', 'settler_head', 'settler_hair', 'settler_hood')) + 2 * sm['settler_arm'].tris() + 2 * sm['settler_leg'].tris(),
}
