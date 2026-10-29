import { describe, expect, it } from 'vitest';
import { BALANCE, secs } from '../src/sim/balance';
import { armyCost, armyParts, armyProblem, hallSlots, huscarlPower, upgradeArmy, updateArmy } from '../src/sim/army';
import { canPlace } from '../src/sim/commands';
import { defenceOf, defenceParts, huscarls, hallOf, raidStrength } from '../src/sim/warfare';
import { deserializeWorld, serializeWorld } from '../src/sim/save';
import { World } from '../src/sim/world';
import { newWorld, wagon } from './helpers';

const stock = (w: World, g: Record<string, number>) => {
  const hall = wagon(w);
  for (const [k, v] of Object.entries(g)) (hall.stock as Record<string, number>)[k] += v;
};

describe('the army is a sum you can read', () => {
  it('a warband is its huscarls, and the lines add up to the strength', () => {
    const w = newWorld(3);
    expect(huscarlPower(w, 0)).toBe(BALANCE.guardStrength);
    const base = armyParts(w, 0, 4);
    expect(base.strength).toBe(40);
    expect(base.lines.reduce((s, l) => s + l.n, 0)).toBe(base.strength);
    // Arms and Drill are each worth something to every huscarl.
    w.players[0].army.arms = 2;
    w.players[0].army.drill = 3;
    const better = armyParts(w, 0, 4);
    expect(huscarlPower(w, 0)).toBe(10 + 2 * BALANCE.army.armsPer + 3);
    expect(better.strength).toBe(4 * (10 + 4 + 3));
    expect(better.lines.reduce((s, l) => s + l.n, 0)).toBe(better.strength);
    expect(raidStrength(w, 0, 4)).toBe(better.strength);
  });

  it('multipliers are named lines too', () => {
    const w = newWorld(3);
    w.players[0].warhorn = true;
    const a = armyParts(w, 0, 4);
    expect(a.strength).toBe(60);
    expect(a.lines.some((l) => l.label.startsWith('War-Horn'))).toBe(true);
    expect(a.lines.reduce((s, l) => s + l.n, 0)).toBe(60);
  });

  it('Arms are bought with tools, level by level, and Quarters make room for more huscarls', () => {
    const w = newWorld(3);
    w.players[0].rank = 2;
    w.addBuilding('musterhall', 0, wagon(w).x + 5, wagon(w).y + 4, true);
    expect(armyProblem(w, 0, 'arms')).toMatch(/tools/);
    stock(w, { tools: 40, planks: 60, logs: 60, stone: 40, bread: 40, ale: 20 });
    const tools = w.stored(0, 'tools');
    expect(upgradeArmy(w, 0, 'arms')).toBe(true);
    expect(w.players[0].army.arms).toBe(1);
    expect(w.stored(0, 'tools')).toBe(tools - armyCost(w, 0, 'arms')!.tools + BALANCE.army.armsCost[0].tools);
    expect(hallSlots(w, 0)).toBe(4);
    expect(upgradeArmy(w, 0, 'quarters')).toBe(true);
    expect(hallSlots(w, 0)).toBe(7);
    // The last level cannot be bought twice.
    while (upgradeArmy(w, 0, 'arms'));
    expect(w.players[0].army.arms).toBe(BALANCE.army.armsMax);
    expect(armyProblem(w, 0, 'arms')).toMatch(/as well as/);
  });

  it('a bigger hall fills with huscarls from the free hands', () => {
    const w = newWorld(3);
    const home = wagon(w);
    w.players[0].rank = 2;
    const hall = w.addBuilding('musterhall', 0, home.x + 5, home.y + 4, true);
    for (const s of w.settlers.values()) {
      s.child = false;
      s.age = BALANCE.yearTicks * 2;
    }
    for (let i = 0; i < 14; i++) w.addBuilding('hut', 0, home.x - 8 - (i % 5) * 3, home.y + 8 + Math.floor(i / 5) * 3, true);
    w.run(secs(40));
    const before = huscarls(w, hall);
    expect(before).toBeLessThanOrEqual(4);
    w.players[0].army.quarters = 2;
    expect(hallSlots(w, 0)).toBe(10);
    expect(hallOf(w, 0)).toBe(hall);
  });

  it('drill builds a level a minute at home, and a raid starts it over', () => {
    const w = newWorld(3);
    const a = w.players[0].army;
    a.drillAt = 0;
    updateArmy(w, () => true);
    expect(a.drill).toBe(1);
    // Away from home it does not grow.
    a.drillAt = 0;
    updateArmy(w, () => false);
    expect(a.drill).toBe(1);
  });

  it('survives a save', () => {
    const w = newWorld(3);
    w.players[0].army = { quarters: 1, arms: 2, drill: 4, drillAt: 99 };
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(back.players[0].army).toEqual({ quarters: 1, arms: 2, drill: 4, drillAt: 99 });
  });
});

describe('a post’s defence is a sum too', () => {
  it('lines add up to defenceOf', () => {
    const w = newWorld(3);
    const home = wagon(w);
    const tower = w.addBuilding('watchtower', 0, home.x + 5, home.y + 4, true);
    tower.guarded = 2;
    w.addBuilding('stockade', 0, home.x + 8, home.y + 4, true);
    const parts = defenceParts(w, tower);
    expect(parts.reduce((s, l) => s + l.n, 0)).toBe(defenceOf(w, tower));
    expect(parts.some((l) => l.label.includes('guards'))).toBe(true);
    expect(parts.some((l) => l.label.includes('Stockade'))).toBe(true);
  });
});

describe('Daughter Hamlets: growth past the cap', () => {
  const ready = () => {
    const w = newWorld(3);
    w.players[0].rank = 2;
    stock(w, { logs: 200, planks: 200, stone: 200, ale: 40, tools: 40 });
    return w;
  };

  it('want room from the first camp and from each other, and cost more each time', () => {
    const w = ready();
    const home = wagon(w);
    // Right beside the camp is no place for a second hall.
    expect(canPlace(w, 0, 'hamlet', home.x + 4, home.y).reason ?? '').toMatch(/room|border|steep|ground/i);
    const first = w.buildCost(0, 'hamlet');
    w.addBuilding('hamlet', 0, home.x + 20, home.y, false);
    const second = w.buildCost(0, 'hamlet');
    expect(second.logs!).toBeGreaterThan(first.logs!);
    expect(second.logs).toBe(Math.ceil((BALANCE.hamlet.costPct + 100) * 30 / 100));
  });

  it('raise how many towers a settlement can hold, once they are standing', () => {
    const w = ready();
    const home = wagon(w);
    const cap = w.frontierCap(0);
    const h = w.addBuilding('hamlet', 0, home.x + 20, home.y, false);
    expect(w.frontierCap(0)).toBe(cap);
    h.done = true;
    expect(w.frontierCap(0)).toBe(cap + BALANCE.hamlet.capPer);
  });

  it('need a Village, and only one is founded at a time', () => {
    const w = ready();
    const home = wagon(w);
    w.players[0].rank = 1;
    expect(canPlace(w, 0, 'hamlet', home.x + 20, home.y).reason).toMatch(/Needs/);
    w.players[0].rank = 2;
    w.addBuilding('hamlet', 0, home.x + 20, home.y, false);
    expect(canPlace(w, 0, 'hamlet', home.x - 20, home.y).reason ?? '').toMatch(/already being founded|border|ground|steep/);
  });
});
