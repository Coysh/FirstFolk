import { readFileSync, statSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { artGeometry, artParts, hasArt, indexScene } from '../src/render/art';
import { DISCOVERIES } from '../src/sim/defs';

/**
 * The Blender-built models (tools/blender → public/models) are the game's art budget:
 * everything here is checked through the same loader the browser uses.
 */
const SMALL = [
  'hut', 'woodcutter_0', 'woodcutter_1', 'woodcutter_2', 'quarry_0', 'quarry_1', 'quarry_2', 'lookout',
  'wagon_0', 'wagon_1', 'wagon_2', 'wagon_3', 'forager_0', 'forager_1', 'storehouse',
  'sawpit', 'forester', 'fisher', 'watchtower', 'stockade', 'musterhall', 'longhouse', 'outpost',
];
/** The Great Works are 3x3. */
const GREAT = ['henge', 'meadhall', 'granary'];
const BUILDINGS = [...SMALL, ...GREAT];
const LANDMARKS = Object.keys(DISCOVERIES).map((k) => `discovery_${k}`);
const CALLING_PROPS = ['calling_trader', 'calling_masons', 'calling_stronghold', 'calling_hearth'];
const SETTLER_PARTS = ['settler_body', 'settler_head', 'settler_hair', 'settler_hood', 'settler_arm', 'settler_leg'];

const tris = (key: string) => artGeometry(key)!.getAttribute('position').count / 3;
const GLOW_FROM = 1.5;

async function load(file: string): Promise<void> {
  const buf = readFileSync(`public/models/${file}.glb`);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  indexScene(gltf.scene);
}

beforeAll(async () => {
  await load('buildings');
  await load('landmarks');
  await load('settler');
});

describe('Blender art', () => {
  it('ships every expected model, and a prop for every discovery', () => {
    for (const k of [...BUILDINGS, ...LANDMARKS, ...CALLING_PROPS, ...SETTLER_PARTS]) expect(hasArt(k), k).toBe(true);
  });

  it('keeps the files small', () => {
    expect(statSync('public/models/buildings.glb').size).toBeLessThan(500_000);
    expect(statSync('public/models/landmarks.glb').size).toBeLessThan(150_000);
    expect(statSync('public/models/settler.glb').size).toBeLessThan(40_000);
  });

  it('stays inside its triangle budgets', () => {
    for (const k of BUILDINGS) expect(tris(k), k).toBeLessThanOrEqual(2600);
    for (const k of [...LANDMARKS, ...CALLING_PROPS]) expect(tris(k), k).toBeLessThanOrEqual(1200);
    // A hundred settlers should cost about as little as they ever did.
    const settler = ['settler_body', 'settler_head', 'settler_hair', 'settler_hood'].reduce((n, k) => n + tris(k), 0) + 2 * tris('settler_arm') + 2 * tris('settler_leg');
    expect(settler).toBeLessThanOrEqual(420);
  });

  it('bakes the geometry layout the renderer expects', () => {
    for (const k of [...BUILDINGS, ...LANDMARKS, ...CALLING_PROPS, ...SETTLER_PARTS]) {
      const g = artGeometry(k)!;
      expect(g.index, k).toBeNull();
      expect(g.getAttribute('color').itemSize, k).toBe(3);
      expect(g.getAttribute('sway').itemSize, k).toBe(1);
      expect(g.getAttribute('normal'), k).toBeDefined();
    }
  });

  it('keeps each building on its footprint, door side +z, ground at y = 0', () => {
    for (const k of BUILDINGS) {
      const box = artGeometry(k)!.boundingBox!;
      const r = GREAT.includes(k) ? 2.0 : 1.35;
      expect(box.min.x, k).toBeGreaterThan(-r);
      expect(box.max.x, k).toBeLessThan(r);
      expect(box.min.z, k).toBeGreaterThan(-r - 0.1);
      expect(box.max.z, k).toBeLessThan(r);
      expect(box.min.y, k).toBeGreaterThan(-0.05);
      expect(box.max.y, k).toBeGreaterThan(0.8);
    }
    for (const k of [...LANDMARKS, ...CALLING_PROPS]) {
      const box = artGeometry(k)!.boundingBox!;
      expect(box.min.x, k).toBeGreaterThan(-1.3);
      expect(box.max.x, k).toBeLessThan(1.3);
      // Props stand straight on the terrain; a mound (the barrow) is mostly buried, which is fine.
      expect(box.min.y, k).toBeGreaterThan(k === 'discovery_barrow' ? -1 : -0.3);
    }
  });

  it('builds settler parts around the joints the animation uses', () => {
    const box = (k: string) => artGeometry(k)!.boundingBox!;
    expect(box('settler_leg').min.y).toBeCloseTo(-0.18, 1); // hangs from the hip (y = 0.18) to the ground
    expect(box('settler_arm').min.y).toBeGreaterThan(-0.19); // hangs from the shoulder, ARM_LEN = 0.17
    expect(box('settler_arm').min.y).toBeLessThan(-0.15);
    expect(box('settler_body').min.y).toBeGreaterThan(0.1);
    expect(box('settler_head').max.y).toBeLessThan(0.62);
    expect(box('settler_hood').max.y).toBeLessThan(0.8);
  });

  it('paints crest-marker faces with the family colour', () => {
    for (const key of ['hut', 'watchtower', 'stockade', 'musterhall']) {
      const colors = (crest?: number) => Array.from(artGeometry(key, crest)!.getAttribute('color').array);
      const red = colors(0xc0392b);
      expect(red, key).not.toEqual(colors(0x2e86c1));
      for (let i = 0; i < red.length; i += 3) expect(red[i] > 0.9 && red[i + 1] < 0.1 && red[i + 2] > 0.9, key).toBe(false);
    }
  });

  it('weights cloth for wind and lights for night, and only a little of each', () => {
    for (const key of ['hut', 'watchtower', 'meadhall']) {
      const sway = artGeometry(key)!.getAttribute('sway');
      let cloth = 0;
      let glow = 0;
      for (let i = 0; i < sway.count; i++) {
        const s = sway.getX(i);
        if (s >= GLOW_FROM) glow++;
        else if (s > 0) cloth++;
      }
      expect(cloth, `${key} cloth`).toBeGreaterThan(0);
      expect(cloth, `${key} cloth`).toBeLessThan(sway.count * 0.06);
      expect(glow, `${key} glow`).toBeGreaterThan(0);
      expect(glow, `${key} glow`).toBeLessThan(sway.count * 0.12);
    }
  });

  it('anchors chimneys', () => {
    for (const key of ['hut', 'woodcutter_1', 'longhouse', 'meadhall', 'discovery_hermit']) expect(artGeometry(key)!.userData.smoke, key).toHaveLength(3);
  });

  it('gives the Great Granary a windmill that turns about its own axle', () => {
    const parts = artParts('granary');
    expect(parts).toHaveLength(1);
    const [sails] = parts;
    expect(sails.mode).toBe('spinz');
    // Centred on the pivot (so rotating the mesh turns it about the axle), and placed at the mill.
    const c = sails.geo.boundingBox!.getCenter(sails.geo.boundingBox!.min.clone());
    expect(Math.hypot(c.x, c.y)).toBeLessThan(0.15);
    expect(sails.pivot.y).toBeGreaterThan(1);
    expect(hasArt('granary#spinz')).toBe(false);
  });
});
