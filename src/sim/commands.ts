import { BUILDINGS, GOODS, type BuildingType } from './defs';
import { HEIGHT_STEP, isWalkableTerrain } from './mapgen';
import { owns, territoryBox } from './territory';
import { tradeTitle } from './trades';
import type { World } from './world';

/** Every player and AI action goes through a Command so games are replayable and the AI cannot cheat. */
export type Command =
  | { type: 'place'; owner: number; building: BuildingType; x: number; y: number }
  | { type: 'demolish'; owner: number; id: number };

export interface PlaceCheck {
  ok: boolean;
  reason?: string;
}

/** Max height difference across a footprint, in world units. */
const MAX_SLOPE = 0.6;

export function canPlace(world: World, owner: number, type: BuildingType, x: number, y: number): PlaceCheck {
  const def = BUILDINGS[type];
  if (!def.buildable) return { ok: false, reason: 'Cannot be built' };
  if (!world.isUnlocked(owner, type)) {
    const r = def.requires!;
    return { ok: false, reason: `Needs a ${tradeTitle(r.skill, r.tier)}` };
  }
  const size = def.size;
  const ex = x;
  const ey = y + size;
  if (!world.inBounds(x, y) || !world.inBounds(x + size - 1, ey)) return { ok: false, reason: 'Out of bounds' };

  const home = homeOf(world, owner);
  for (let dy = 0; dy <= size; dy++)
    for (let dx = 0; dx < size; dx++) if (!owns(world, owner, x + dx, y + dy)) return { ok: false, reason: 'Outside your border: build a Lookout near the edge' };

  let minH = Infinity;
  let maxH = -Infinity;
  for (let dy = 0; dy <= size; dy++)
    for (let dx = 0; dx <= size; dx++) {
      const h = world.cornerHeight(x + dx, y + dy);
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
    }
  if ((maxH - minH) * HEIGHT_STEP > MAX_SLOPE) return { ok: false, reason: 'Too steep' };

  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) {
      const i = world.idx(x + dx, y + dy);
      if (!isWalkableTerrain(world.map.terrain[i])) return { ok: false, reason: 'Unsuitable ground' };
      if (world.buildingAt[i]) return { ok: false, reason: 'Occupied' };
      const node = world.nodes.get(world.nodeAt[i]);
      if (node && node.kind === 'rock') return { ok: false, reason: 'Rocks in the way' };
    }
  for (const site of world.sites)
    if (site.x >= x && site.x < x + size && site.y >= y && site.y <= y + size) return { ok: false, reason: 'Something old stands here' };

  const ei = world.idx(ex, ey);
  if (!world.walkable(ei)) return { ok: false, reason: 'Entrance blocked' };

  // Do not cover another building's entrance.
  for (const b of world.buildings.values()) {
    const e = world.entrance(b);
    if (e.x >= x && e.x < x + size && e.y >= y && e.y < y + size) return { ok: false, reason: 'Blocks an entrance' };
  }
  if (home && !entrancesStayReachable(world, owner, home, x, y, size)) return { ok: false, reason: 'Would cut off a path' };
  return { ok: true };
}

/**
 * Flood-fill from the wagon with the new footprint treated as blocked, and make sure every
 * entrance (including the new one) can still be reached. Prevents walled-in pockets.
 */
function entrancesStayReachable(world: World, owner: number, home: { x: number; y: number; type: BuildingType }, x: number, y: number, size: number): boolean {
  // Search the player's land plus a margin, so paths may skirt just outside the border.
  const box = territoryBox(world, owner);
  const ox = Math.max(0, box.x0 - 6);
  const oy = Math.max(0, box.y0 - 6);
  const W = Math.min(world.size, box.x1 + 7) - ox;
  const H = Math.min(world.size, box.y1 + 7) - oy;
  const seen = new Uint8Array(W * H);
  const inBox = (tx: number, ty: number) => tx >= ox && ty >= oy && tx < ox + W && ty < oy + H;
  const blockedNew = (tx: number, ty: number) => tx >= x && tx < x + size && ty >= y && ty < y + size;
  const start = world.entrance(home);
  const queue: number[] = [start.x, start.y];
  seen[(start.y - oy) * W + (start.x - ox)] = 1;
  for (let q = 0; q < queue.length; q += 2) {
    const cx = queue[q];
    const cy = queue[q + 1];
    for (let d = 0; d < 4; d++) {
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (!inBox(nx, ny)) continue;
      const k = (ny - oy) * W + (nx - ox);
      if (seen[k] || blockedNew(nx, ny) || !world.walkable(world.idx(nx, ny))) continue;
      seen[k] = 1;
      queue.push(nx, ny);
    }
  }
  const reached = (tx: number, ty: number) => inBox(tx, ty) && seen[(ty - oy) * W + (tx - ox)] === 1;
  if (!reached(x, y + size)) return false;
  for (const b of world.buildings.values()) {
    if (b.owner !== owner) continue;
    const e = world.entrance(b);
    if (!reached(e.x, e.y)) return false;
  }
  return true;
}

function homeOf(world: World, owner: number) {
  for (const b of world.buildings.values()) if (b.owner === owner && b.type === 'wagon') return b;
  return undefined;
}

export function applyCommand(world: World, cmd: Command): void {
  switch (cmd.type) {
    case 'place': {
      if (!canPlace(world, cmd.owner, cmd.building, cmd.x, cmd.y).ok) return;
      const b = world.addBuilding(cmd.building, cmd.owner, cmd.x, cmd.y);
      world.emit({ type: 'buildingPlaced', id: b.id, buildingType: b.type });
      return;
    }
    case 'demolish': {
      const b = world.buildings.get(cmd.id);
      if (!b || b.owner !== cmd.owner || b.type === 'wagon') return;
      demolish(world, b.id);
      return;
    }
  }
}

/** Remove a building, refunding delivered materials and stored goods to the nearest storage. */
export function demolish(world: World, id: number): void {
  const b = world.buildings.get(id);
  if (!b) return;
  const store = world.storages(b.owner).find((s) => s.id !== b.id);
  if (store) {
    for (const g of GOODS) store.stock[g] += (b.done ? 0 : b.delivered[g]) + b.stock[g] - b.reserved[g];
  }
  world.buildings.delete(id);
  const size = BUILDINGS[b.type].size;
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) world.buildingAt[world.idx(b.x + dx, b.y + dy)] = 0;

  for (const s of world.settlers.values()) {
    const j = s.job;
    const touches =
      (j.kind === 'work' && j.buildingId === id) ||
      (j.kind === 'build' && j.siteId === id) ||
      (j.kind === 'haul' && (j.fromId === id || j.toId === id));
    if (!touches) continue;
    if (j.kind === 'haul') {
      // Undo the reservation on whichever end still exists.
      const from = world.buildings.get(j.fromId);
      const to = world.buildings.get(j.toId);
      if (j.phase === 'toSource' && from) from.reserved[j.good]--;
      if (to) to.incoming[j.good]--;
    }
    if (j.kind === 'work' && j.phase === 'deliver') {
      const st = world.buildings.get(j.nodeId);
      if (st && s.carry) st.incoming[s.carry]--;
    } else if (j.kind === 'work' && j.nodeId) {
      const node = world.nodes.get(j.nodeId);
      if (node && node.reservedBy === s.id) node.reservedBy = 0;
    }
    if (s.carry && store) store.stock[s.carry]++;
    s.carry = null;
    s.tool = null;
    s.job = { kind: 'idle', wait: 0 };
    s.path = [];
    s.busy = 0;
  }
  if (b.familyId) {
    const fam = world.families.get(b.familyId);
    if (fam && fam.homeId === b.id) fam.homeId = 0;
  }
}
