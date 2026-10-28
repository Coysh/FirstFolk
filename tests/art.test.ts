import { readFileSync, statSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { artGeometry, hasArt, indexScene } from '../src/render/art';

/**
 * The Blender-built models (tools/blender → public/models) are the game's art budget:
 * everything here is checked through the same loader the browser uses.
 */
const BUILDINGS = [
  'hut', 'woodcutter_0', 'woodcutter_1', 'woodcutter_2', 'quarry_0', 'quarry_1', 'quarry_2', 'lookout',
  'wagon_0', 'wagon_1', 'wagon_2', 'wagon_3', 'forager_0', 'forager_1', 'storehouse',
];
const SETTLER_PARTS = ['settler_body', 'settler_head', 'settler_hair', 'settler_hood', 'settler_arm', 'settler_leg'];

const tris = (key: string) => artGeometry(key)!.getAttribute('position').count / 3;

async function load(file: string): Promise<void> {
  const buf = readFileSync(`public/models/${file}.glb`);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  indexScene(gltf.scene);
}

beforeAll(async () => {
  await load('buildings');
  await load('settler');
});

describe('Blender art', () => {
  it('ships every expected model', () => {
    for (const k of [...BUILDINGS, ...SETTLER_PARTS]) expect(hasArt(k), k).toBe(true);
  });

  it('keeps the files small', () => {
    expect(statSync('public/models/buildings.glb').size).toBeLessThan(400_000);
    expect(statSync('public/models/settler.glb').size).toBeLessThan(40_000);
  });

  it('stays inside its triangle budgets', () => {
    for (const k of BUILDINGS) expect(tris(k), k).toBeLessThanOrEqual(2000);
    // A hundred settlers should cost about as little as they ever did.
    const settler = ['settler_body', 'settler_head', 'settler_hair', 'settler_hood'].reduce((n, k) => n + tris(k), 0) + 2 * tris('settler_arm') + 2 * tris('settler_leg');
    expect(settler).toBeLessThanOrEqual(420);
  });

  it('bakes the geometry layout the renderer expects', () => {
    for (const k of [...BUILDINGS, ...SETTLER_PARTS]) {
      const g = artGeometry(k)!;
      expect(g.index, k).toBeNull();
      expect(g.getAttribute('color').itemSize, k).toBe(3);
      expect(g.getAttribute('sway').itemSize, k).toBe(1);
      expect(g.getAttribute('normal'), k).toBeDefined();
    }
  });

  it('keeps each building on its 2x2 footprint, door side +z, ground at y = 0', () => {
    for (const k of BUILDINGS) {
      const box = artGeometry(k)!.boundingBox!;
      expect(box.min.x, k).toBeGreaterThan(-1.3);
      expect(box.max.x, k).toBeLessThan(1.3);
      expect(box.min.z, k).toBeGreaterThan(-1.4);
      expect(box.max.z, k).toBeLessThan(1.3);
      expect(box.min.y, k).toBeGreaterThan(-0.05);
      expect(box.max.y, k).toBeGreaterThan(0.8);
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
    const colors = (crest?: number) => Array.from(artGeometry('hut', crest)!.getAttribute('color').array);
    const red = colors(0xc0392b);
    const blue = colors(0x2e86c1);
    expect(red).not.toEqual(blue);
    for (let i = 0; i < red.length; i += 3) expect(red[i] > 0.9 && red[i + 1] < 0.1 && red[i + 2] > 0.9).toBe(false);
  });

  it('weights only cloth for wind, and anchors chimneys', () => {
    const sway = artGeometry('hut')!.getAttribute('sway');
    let moving = 0;
    for (let i = 0; i < sway.count; i++) if (sway.getX(i) > 0) moving++;
    expect(moving).toBeGreaterThan(0);
    expect(moving).toBeLessThan(sway.count * 0.05);
    expect(artGeometry('hut')!.userData.smoke).toHaveLength(3);
    expect(artGeometry('woodcutter_1')!.userData.smoke).toHaveLength(3);
  });
});
