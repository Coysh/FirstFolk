import { BALANCE } from './balance';
import { GOOD_INFO, type Good } from './defs';
import { pay } from './events';
import { playerMod } from './houses';
import { callingTier } from './callings';
import type { Building, World } from './world';

/**
 * The army, as a sum you can read. A warband is its huscarls, and every huscarl is worth
 *
 *     10 (a spear) + the House's gift + 2 for each level of Arms + 1 for each level of Drill
 *
 * so there are exactly three things to do about it, and each shows on the Mustering Hall:
 *  - **Quarters** (planks, logs, bread): the hall holds 4 huscarls, 7, then 10. More spears, and more mouths.
 *  - **Arms** (tools, from the smithy): each level is +2 for every huscarl, and for every guard on every post. This is where the economy becomes steel.
 *  - **Drill** (time): +1 for every huscarl for each minute they are kept at home, up to 4. A raid sends them out and
 *    the drill starts again, so there is always a choice between striking now with what you have, and waiting.
 * Then the multipliers, each named when it applies: Wardens, the underdog's fury, the War-Horn.
 * Nothing is hidden: `armyParts` is the number the game uses, line by line, and the HUD prints it.
 *
 * State: `player.army` (saved).
 */
export interface ArmyState {
  quarters: number;
  arms: number;
  /** Drill levels earned, and the tick the next one comes. */
  drill: number;
  drillAt: number;
}

export const emptyArmy = (): ArmyState => ({ quarters: 0, arms: 0, drill: 0, drillAt: 0 });

export type ArmyUpgrade = 'quarters' | 'arms';

/** How many huscarls a Mustering Hall holds: the hall's four, and four more for each Quarters level. */
export const hallSlots = (world: World, owner: number): number => BALANCE.army.hallSlots + BALANCE.army.quartersAdd * (world.players[owner]?.army?.quarters ?? 0);

/** Slots a post garrisons: the Mustering Hall grows with its Quarters; everything else is as defined. */
export function slotsOf(world: World, b: Building, base: number | undefined): number {
  return b.type === 'musterhall' ? hallSlots(world, b.owner) : (base ?? 0);
}

/** What one huscarl is worth before the multipliers: the spear, the House, the Arms and the Drill. */
export function huscarlPower(world: World, owner: number): number {
  const a = world.players[owner]?.army;
  return BALANCE.guardStrength + playerMod(world, owner, 'husc') + BALANCE.army.armsPer * (a?.arms ?? 0) + (a?.drill ?? 0);
}

export interface ArmyLine {
  label: string;
  /** What it adds to the total (the lines sum to the strength). */
  n: number;
  /** Where to put the effort: a hint the HUD shows next to the line. */
  how?: string;
}

/** A warband of n huscarls, line by line. The lines sum to `strength`. */
export function armyParts(world: World, owner: number, n: number): { lines: ArmyLine[]; strength: number } {
  const p = world.players[owner];
  const a = p?.army ?? emptyArmy();
  const lines: ArmyLine[] = [];
  const house = playerMod(world, owner, 'husc');
  lines.push({ label: `${n} huscarl${n === 1 ? '' : 's'} × ${BALANCE.guardStrength}`, n: n * BALANCE.guardStrength });
  if (house) lines.push({ label: `House bonus +${house} each`, n: n * house });
  lines.push({ label: `Arms ${a.arms}/${BALANCE.army.armsMax}: +${BALANCE.army.armsPer * a.arms} each`, n: n * BALANCE.army.armsPer * a.arms, how: a.arms < BALANCE.army.armsMax ? 'Forge arms (tools)' : undefined });
  lines.push({ label: `Drill ${a.drill}/${BALANCE.army.drillMax}: +${a.drill} each`, n: n * a.drill, how: a.drill < BALANCE.army.drillMax ? 'a minute at home each' : undefined });
  let total = lines.reduce((s, l) => s + l.n, 0);
  const mult = (label: string, pct: number) => {
    const next = Math.floor((total * pct) / 100);
    if (next !== total) lines.push({ label, n: next - total });
    total = next;
  };
  const wardens = callingTier(world, owner, 'stronghold');
  if (wardens) mult(`Wardens ×${(100 + 10 * wardens) / 100}`, 100 + 10 * wardens);
  if (p && world.players.some((o) => o.id !== owner && o.renown - p.renown >= BALANCE.underdogGap)) mult(`Underdog fury ×${(100 + BALANCE.underdogFury) / 100}`, 100 + BALANCE.underdogFury);
  if (p?.warhorn) mult('War-Horn ×1.5', 150);
  return { lines, strength: total };
}

/** Why an upgrade can't be bought now ('' when it can), and what it costs. */
export function armyCost(world: World, owner: number, what: ArmyUpgrade): Record<string, number> | null {
  const a = world.players[owner]?.army;
  if (!a) return null;
  const levels = what === 'quarters' ? BALANCE.army.quartersCost : BALANCE.army.armsCost;
  return levels[a[what]] ?? null;
}

export function armyProblem(world: World, owner: number, what: ArmyUpgrade): string {
  const p = world.players[owner];
  if (!p) return 'No such settlement';
  if (!world.buildings.size || ![...world.buildings.values()].some((b) => b.owner === owner && b.type === 'musterhall' && b.done)) return 'Build a Mustering Hall first';
  const cost = armyCost(world, owner, what);
  if (!cost) return what === 'quarters' ? 'The hall has all the quarters it can hold' : 'The huscarls are armed as well as they can be';
  if (what === 'quarters' && p.rank < BALANCE.army.quartersRank[p.army.quarters]) return `Needs a ${['Camp', 'Hamlet', 'Village', 'Town'][BALANCE.army.quartersRank[p.army.quarters]]}`;
  for (const [g, n] of Object.entries(cost)) if (world.stored(owner, g as Good) < n) return `Needs ${n} ${GOOD_INFO[g as Good].name.toLowerCase()} in store`;
  return '';
}

/** Buy a level of Quarters or Arms (a Command). */
export function upgradeArmy(world: World, owner: number, what: ArmyUpgrade): boolean {
  if (armyProblem(world, owner, what)) return false;
  const p = world.players[owner];
  pay(world, owner, armyCost(world, owner, what)!);
  p.army[what]++;
  const hall = [...world.buildings.values()].find((b) => b.owner === owner && b.type === 'musterhall' && b.done)!;
  world.emit({ type: 'armyUpgraded', owner, what, level: p.army[what], x: hall.x, y: hall.y });
  return true;
}

/** Once a second: huscarls at home drill (one level a minute); a warband out on a raid does not. */
export function updateArmy(world: World, atHome: (owner: number) => boolean): void {
  for (const p of world.players) {
    if (!p.army) p.army = emptyArmy();
    const a = p.army;
    if (a.drill >= BALANCE.army.drillMax || !atHome(p.id)) {
      a.drillAt = world.tick + BALANCE.army.drillEvery;
      continue;
    }
    if (world.tick >= a.drillAt) {
      a.drill++;
      a.drillAt = world.tick + BALANCE.army.drillEvery;
      const hall = [...world.buildings.values()].find((b) => b.owner === p.id && b.type === 'musterhall' && b.done);
      if (hall) world.emit({ type: 'drillLevel', owner: p.id, level: a.drill, x: hall.x, y: hall.y });
    }
  }
}

/** A raid sends the huscarls out: the drill starts over. */
export function resetDrill(world: World, owner: number): void {
  const a = world.players[owner]?.army;
  if (a) {
    a.drill = 0;
    a.drillAt = world.tick + BALANCE.army.drillEvery;
  }
}
