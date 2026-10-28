import { BALANCE } from './balance';
import { offerBoon } from './boons';
import { BUILDINGS, FOODS, SKILLS, type Good } from './defs';
import { plural, spawnFamily } from './population';
import { isWinter, seasonOf } from './seasons';
import { grantXp } from './settlers';
import { NO_OWNER, revealArea } from './territory';
import type { World } from './world';

/**
 * Valley Events: every couple of minutes a messenger brings news with a choice attached.
 * They break up the steady state with small dilemmas (trade, risk, feast or save) and point
 * at the frontier. Pure data: a condition, and options with costs and effects. Choosing is
 * a Command; an unanswered card resolves to its last option (usually the cautious one).
 */
export interface EventOption {
  label: string;
  /** What it does, shown on the button. */
  detail: string;
  cost?: Partial<Record<Good | 'food', number>>;
  apply(world: World, owner: number): string;
}

export interface ValleyEventDef {
  id: string;
  title: string;
  icon: string;
  text: string;
  /** Relative frequency; 0 or a failing condition skips it. */
  weight: number;
  when?(world: World, owner: number): boolean;
  options: EventOption[];
}

const give = (world: World, owner: number, good: Good, n: number) => {
  const store = world.storages(owner)[0];
  if (store) store.stock[good] += n;
};

/** Take goods from stores (food draws on any edible good). Assumes `canAfford` passed. */
export function pay(world: World, owner: number, cost: EventOption['cost']): void {
  for (const [k, n] of Object.entries(cost ?? {})) {
    let left = n ?? 0;
    const goods: readonly Good[] = k === 'food' ? FOODS : [k as Good];
    for (const g of goods)
      for (const b of world.storages(owner)) {
        const take = Math.min(left, b.stock[g] - b.reserved[g]);
        if (take > 0) {
          b.stock[g] -= take;
          left -= take;
        }
      }
  }
}

export function canAfford(world: World, owner: number, cost: EventOption['cost']): boolean {
  return Object.entries(cost ?? {}).every(([k, n]) => (k === 'food' ? world.food(owner) : world.stored(owner, k as Good)) >= (n ?? 0));
}

function adults(world: World, owner: number) {
  return [...world.settlers.values()].filter((s) => s.owner === owner && !s.child);
}

function loseFood(world: World, owner: number, n: number): number {
  const have = world.food(owner);
  const lost = Math.min(have, n);
  pay(world, owner, { food: lost });
  return lost;
}

export const VALLEY_EVENTS: ValleyEventDef[] = [
  {
    id: 'trader',
    title: 'A Travelling Trader',
    icon: '🐴',
    text: 'A pedlar with a laden mule stops by the hall. “Fine timber and good stone, for the right price.”',
    weight: 3,
    options: [
      { label: 'Buy planks', detail: '10 logs → 6 planks', cost: { logs: 10 }, apply: (w, o) => (give(w, o, 'planks', 6), 'The trader leaves lighter, your stores heavier.') },
      { label: 'Buy stone', detail: '8 food → 6 stone', cost: { food: 8 }, apply: (w, o) => (give(w, o, 'stone', 6), 'Six good blocks of dressed stone.') },
      { label: 'Send them on', detail: 'No trade', apply: () => 'The trader shrugs and heads on down the valley.' },
    ],
  },
  {
    id: 'wolves',
    title: 'Wolves in the Woods',
    icon: '🐺',
    text: 'Howling at dusk. Wolves have been seen near the larder, and the folk are uneasy.',
    weight: 2,
    when: (w, o) => w.food(o) >= 10,
    options: [
      { label: 'Build a palisade', detail: '6 logs: the larder is safe', cost: { logs: 6 }, apply: () => 'A stout fence of sharpened stakes keeps the wolves at bay.' },
      { label: 'Risk it', detail: 'Wolves may raid the larder', apply: (w, o) => (w.rng.int(100) < 60 ? `The wolves got in! ${loseFood(w, o, 12)} food lost.` : 'The wolves slink away. Lucky.') },
    ],
  },
  {
    id: 'bounty',
    title: 'A Bountiful Season',
    icon: '🧺',
    text: 'The hedgerows are heavy and the river is thick with fish. What will you do with the plenty?',
    weight: 2,
    when: (w) => seasonOf(w.tick) === 1 || seasonOf(w.tick) === 2,
    options: [
      { label: 'Preserve it', detail: '+20 food for the winter', apply: (w, o) => (give(w, o, 'berries', 20), 'Jars and smoke-racks fill the storehouse.') },
      { label: 'Hold a harvest fair', detail: 'Every adult +40 XP in their best craft', apply: (w, o) => feast(w, o, 40) },
    ],
  },
  {
    id: 'storm',
    title: 'A Great Storm',
    icon: '⛈️',
    text: 'Wind tore through the forest last night. Trunks lie everywhere.',
    weight: 2,
    options: [
      { label: 'Clear the deadfall', detail: '+12 logs', apply: (w, o) => (give(w, o, 'logs', 12), 'Willing hands drag the fallen timber home.') },
      { label: 'Replant the gaps', detail: 'Saplings spring up across your land', apply: (w, o) => replant(w, o, 12) },
    ],
  },
  {
    id: 'foundling',
    title: 'A Lost Child',
    icon: '🧒',
    text: 'A muddy child wanders in from the hills, alone and hungry.',
    weight: 2,
    options: [
      { label: 'Take them in', detail: 'A new child joins the family with most room', apply: (w, o) => foundling(w, o) },
      { label: 'Find their kin', detail: 'Their tale reveals a discovery', apply: (w, o) => scout(w, o, 'The child leads your scouts to'), },
    ],
  },
  {
    id: 'feast',
    title: 'Midsummer Feast',
    icon: '🍖',
    text: 'The folk want to celebrate the longest day around a great fire.',
    weight: 2,
    when: (w) => seasonOf(w.tick) === 1,
    options: [
      { label: 'Hold the feast', detail: '15 food: every adult +60 XP', cost: { food: 15 }, apply: (w, o) => feast(w, o, 60) },
      { label: 'Not this year', detail: 'Save the food', apply: () => 'Grumbles, but the larder stays full.' },
    ],
  },
  {
    id: 'frost',
    title: 'A Hard Frost',
    icon: '🥶',
    text: 'A bitter cold snap. The old folk shiver by the embers.',
    weight: 4,
    when: (w) => isWinter(w),
    options: [
      { label: 'Burn extra wood', detail: '8 logs: everyone stays warm', cost: { logs: 8 }, apply: () => 'Fires roar in every hearth.' },
      { label: 'Endure it', detail: 'Cold folk eat more: lose food', apply: (w, o) => `A hungry week: ${loseFood(w, o, 4 + Math.ceil(w.population(o) / 4))} food eaten.` },
    ],
  },
  {
    id: 'smoke',
    title: 'Smoke Beyond the Ridge',
    icon: '💨',
    text: 'A thin column of smoke rises far beyond your border. Someone, or something, is out there.',
    weight: 2,
    when: (w, o) => w.sites.some((s) => s.claimedBy === NO_OWNER && !(s.revealed & (1 << o))),
    options: [
      { label: 'Send a scout', detail: 'Reveal a far discovery', apply: (w, o) => scout(w, o, 'Your scout finds') },
      { label: 'Stay close to home', detail: 'Nothing happens', apply: () => 'The smoke fades by evening.' },
    ],
  },
  {
    id: 'masons',
    title: 'Masons from the South',
    icon: '🧱',
    text: 'Two journeying masons offer to teach your quarriers, for their keep.',
    weight: 2,
    when: (w, o) => w.players[o].rank >= 1,
    options: [
      { label: 'Host them', detail: '12 food: quarriers +100 stonework XP, +6 stone', cost: { food: 12 }, apply: (w, o) => teach(w, o, 'stonework', 100, 'stone', 6) },
      { label: 'Decline', detail: 'They move on', apply: () => 'The masons tip their caps and walk on.' },
    ],
  },
  {
    id: 'match',
    title: 'A Match from Afar',
    icon: '💌',
    text: 'A family from over the hills has heard of your town and seeks to join it.',
    weight: 2,
    when: (w, o) => w.players[o].rank >= 1,
    options: [
      { label: 'Welcome them', detail: 'A skilled family of 3 arrives (needs a home)', apply: (w, o) => joinFamily(w, o) },
      { label: 'Not now', detail: 'They stay in their own valley', apply: () => 'Perhaps another year.' },
    ],
  },
  {
    id: 'pilgrims',
    title: 'Pilgrims at the Stones',
    icon: '🕯️',
    text: 'Pilgrims gather at your standing stones and offer a blessing to one of your families.',
    weight: 3,
    when: (w, o) => w.sites.some((s) => s.kind === 'stones' && s.claimedBy === o),
    options: [
      { label: 'Accept the blessing', detail: 'A family chooses a new boon', apply: (w, o) => bless(w, o) },
      { label: 'Ask for alms', detail: '+10 food', apply: (w, o) => (give(w, o, 'berries', 10), 'The pilgrims share their bread.') },
    ],
  },
];

function feast(world: World, owner: number, xp: number): string {
  const folk = adults(world, owner);
  for (const s of folk) {
    const best = SKILLS.reduce((a, k) => (s.skills[k] > s.skills[a] ? k : a), SKILLS[0]);
    grantXp(world, s, best, xp);
  }
  return `${folk.length} adults sing, swap tricks of the trade and learn.`;
}

function teach(world: World, owner: number, skill: (typeof SKILLS)[number], xp: number, good: Good, n: number): string {
  give(world, owner, good, n);
  let taught = 0;
  for (const s of adults(world, owner))
    if (s.skills[skill] > 0) {
      grantXp(world, s, skill, xp);
      taught++;
    }
  return `${taught} of your folk learn new tricks.`;
}

function replant(world: World, owner: number, n: number): string {
  let planted = 0;
  for (let tries = 0; tries < 400 && planted < n; tries++) {
    const x = world.rng.int(world.size);
    const y = world.rng.int(world.size);
    const i = world.idx(x, y);
    if (world.territory[i] !== owner || world.nodeAt[i] || world.buildingAt[i] || world.map.terrain[i] !== 2) continue;
    world.addNode('tree', x, y, BALANCE.saplingGrowTicks);
    planted++;
  }
  return `${planted} saplings take root.`;
}

function foundling(world: World, owner: number): string {
  let best = 0;
  let room = 0;
  for (const fam of world.families.values()) {
    if (fam.owner !== owner) continue;
    const home = world.buildings.get(fam.homeId);
    if (!home) continue;
    let members = 0;
    for (const s of world.settlers.values()) if (s.familyId === fam.id) members++;
    const r = (BUILDINGS[home.type].housing ?? 0) - members;
    if (r > room) {
      room = r;
      best = fam.id;
    }
  }
  const fam = world.families.get(best) ?? [...world.families.values()].find((f) => f.owner === owner);
  const home = fam && world.buildings.get(fam.homeId);
  if (!fam) return 'The child slips away in the night.';
  const e = home ? world.entrance(home) : { x: 0, y: 0 };
  const s = world.addSettler(owner, fam.id, world.randomName(), 0.6, e.x, e.y);
  return `${s.name} joins the ${fam.surname} family.`;
}

function scout(world: World, owner: number, lead: string): string {
  const wagon = [...world.buildings.values()].find((b) => b.owner === owner && b.type === 'wagon');
  const hidden = world.sites.filter((s) => s.claimedBy === NO_OWNER && !(s.revealed & (1 << owner)));
  if (!wagon || !hidden.length) return 'The trail goes cold.';
  hidden.sort((a, b) => (a.x - wagon.x) ** 2 + (a.y - wagon.y) ** 2 - ((b.x - wagon.x) ** 2 + (b.y - wagon.y) ** 2));
  const site = hidden[0];
  revealArea(world, owner, site.x, site.y, 4);
  return `${lead} something out in the wild.`;
}

function joinFamily(world: World, owner: number): string {
  const fam = spawnFamily(world, world.players[owner], null, 0, 0, 3, 150);
  return `The ${fam.surname} family arrive. They will need a home.`;
}

function bless(world: World, owner: number): string {
  const fams = [...world.families.values()].filter((f) => f.owner === owner && f.boons.length < 5);
  if (!fams.length) return 'Every family is already richly blessed.';
  const fam = fams[world.rng.int(fams.length)];
  offerBoon(world, fam, 'Blessed at the stones');
  return `The ${plural(fam.surname)} are blessed.`;
}

/** Draw the next event for a player, if it's time. Runs about once a second. */
export function updateValleyEvents(world: World): void {
  for (const p of world.players) {
    const ev = p.event;
    if (ev && world.tick >= ev.expires) resolveEvent(world, p.id, ev.id, VALLEY_EVENTS.find((d) => d.id === ev.def)!.options.length - 1);
    if (p.event || world.tick < p.nextEventAt) continue;
    const pool = VALLEY_EVENTS.filter((d) => d.weight > 0 && d.id !== p.lastEvent && (!d.when || d.when(world, p.id)));
    if (!pool.length) continue;
    let r = world.rng.int(pool.reduce((a, d) => a + d.weight, 0));
    let i = 0;
    while (r >= pool[i].weight) r -= pool[i++].weight;
    const def = pool[i];
    p.event = { id: world.newId(), def: def.id, expires: world.tick + BALANCE.eventTimeout };
    p.lastEvent = def.id;
    world.emit({ type: 'valleyEvent', owner: p.id, eventId: p.event.id, def: def.id });
  }
}

export function resolveEvent(world: World, owner: number, eventId: number, option: number): void {
  const p = world.players[owner];
  if (!p?.event || p.event.id !== eventId) return;
  const def = VALLEY_EVENTS.find((d) => d.id === p.event!.def);
  p.event = null;
  p.nextEventAt = world.tick + BALANCE.eventGap[0] + world.rng.int(BALANCE.eventGap[1] - BALANCE.eventGap[0]);
  if (!def) return;
  // An unaffordable choice falls back to the last (free) option.
  let opt = def.options[Math.max(0, Math.min(def.options.length - 1, option))];
  if (!canAfford(world, owner, opt.cost)) opt = def.options[def.options.length - 1];
  pay(world, owner, opt.cost);
  const text = opt.apply(world, owner);
  world.emit({ type: 'eventResolved', owner, def: def.id, choice: opt.label, text });
}

export const eventDef = (id: string) => VALLEY_EVENTS.find((d) => d.id === id);
