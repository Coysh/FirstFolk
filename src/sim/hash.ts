import { GOODS } from './defs';
import type { World } from './world';

/** FNV-1a over the gameplay-relevant state. Equal hashes ⇒ identical simulations. */
export function hashWorld(world: World): string {
  const parts: (string | number)[] = [world.tick, world.rng.getState().join(',')];
  for (const s of world.settlers.values()) {
    const j = s.job;
    parts.push(s.id, s.x, s.y, s.next, s.progress, s.busy, s.carry ?? '-', j.kind, 'phase' in j ? j.phase : '');
  }
  for (const b of world.buildings.values()) {
    parts.push(b.id, b.type, b.x, b.y, b.done ? 1 : 0, b.work);
    for (const g of GOODS) parts.push(b.stock[g], b.delivered[g], b.reserved[g], b.incoming[g]);
  }
  for (const n of world.nodes.values()) parts.push(n.id, n.amount, n.growth, n.stump, n.reservedBy);
  for (const p of world.players) parts.push(p.hungry ? 1 : 0, p.mealAccum, p.newcomerCooldown, p.claimed);
  for (const f of world.families.values()) parts.push(f.id, f.homeId, f.birthCooldown);
  for (const site of world.sites) parts.push(site.id, site.revealed, site.claimedBy);
  let t = 0;
  for (let i = 0; i < world.territory.length; i++) t = (t * 31 + world.territory[i] + 2 * world.explored[i]) | 0;
  parts.push(t);

  const str = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
