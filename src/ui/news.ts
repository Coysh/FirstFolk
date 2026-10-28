import { BUILDINGS, DISCOVERIES, RANK_NAMES } from '../sim/defs';
import { DEEDS } from '../sim/deeds';
import { HOUSES } from '../sim/houses';
import { NO_OWNER } from '../sim/territory';
import { challengeDef } from '../sim/challenges';
import type { SimEvent, World } from '../sim/world';

/**
 * What the player is told, and how loudly. Most of what happens in the valley is shown by the
 * world itself (floaters, buildings rising, folk walking), so only news that changes a decision
 * reaches the screen:
 *  - a **banner** for the handful of moments that shape a game (a rank, a raid on you, the star),
 *  - a short **toast** for things worth knowing now,
 *  - nothing at all for routine life (births, sales, finished huts), which used to flood the screen.
 * Pure: the same event always gives the same news, so the harness can count what a player sees.
 */
export interface News {
  channel: 'banner' | 'toast';
  /** 3 must be seen, 2 should be, 1 only if the screen is quiet. */
  priority: 1 | 2 | 3;
  icon: string;
  text: string;
  sub?: string;
  tone: 'info' | 'good' | 'warn' | 'big' | 'rival';
  /** News with the same key replaces what's waiting (land lost twice is one message). */
  key?: string;
}

const ICONS = {
  scroll: '/assets/icons/scroll.png',
  renown: '/assets/icons/renown.png',
  shield: '/assets/icons/shield.png',
  berries: '/assets/icons/berries.png',
  lookout: '/assets/icons/lookout.png',
};
const icon = (type: string) => `/assets/icons/${type === 'wagon' ? 'hut' : type}.png`;

export function newsFor(world: World, e: SimEvent, me = 0): News | null {
  switch (e.type) {
    case 'buildingComplete':
      if (!BUILDINGS[e.buildingType].great) return null;
      return e.owner === me
        ? { channel: 'banner', priority: 3, icon: icon(e.buildingType), text: `${BUILDINGS[e.buildingType].name} is yours!`, sub: BUILDINGS[e.buildingType].great!.perk, tone: 'big' }
        : { channel: 'toast', priority: 2, icon: icon(e.buildingType), text: `Rival finished the ${BUILDINGS[e.buildingType].name.replace(/^The /, '')}`, tone: 'warn' };
    case 'workBegun':
      return e.owner === me ? null : { channel: 'toast', priority: 2, icon: icon(e.buildingType), text: `Rival began the ${BUILDINGS[e.buildingType].name.replace(/^The /, '')}: race them!`, tone: 'warn', key: `work${e.buildingType}` };
    case 'workLost':
      return e.owner === me ? { channel: 'toast', priority: 2, icon: icon(e.buildingType), text: `Lost the race for the ${BUILDINGS[e.buildingType].name.replace(/^The /, '')}: half its goods came home`, tone: 'warn' } : null;
    case 'unlocked':
      return e.owner === me ? { channel: 'toast', priority: 1, icon: icon(e.buildingType), text: `New: ${BUILDINGS[e.buildingType].name}`, tone: 'good' } : null;
    case 'hungry':
      return e.owner === me ? { channel: 'toast', priority: 2, icon: ICONS.berries, text: 'Hungry! Build Foragers or Fishers', tone: 'warn', key: 'hunger' } : null;
    case 'winterComing':
      return { channel: 'toast', priority: 1, icon: ICONS.berries, text: 'Winter is coming: stock food', tone: 'warn' };
    case 'discovered':
      return e.owner === me ? { channel: 'toast', priority: 1, icon: ICONS.scroll, text: `Spotted: ${DISCOVERIES[e.kind].icon} ${DISCOVERIES[e.kind].name}`, tone: 'info' } : null;
    case 'rumour':
      return e.owner === me ? { channel: 'toast', priority: 1, icon: ICONS.scroll, text: `${DISCOVERIES[e.kind].icon} ${DISCOVERIES[e.kind].name} lies to the ${e.dir}`, tone: 'info', key: 'rumour' } : null;
    case 'claimed':
      return e.owner === me ? { channel: 'toast', priority: 2, icon: ICONS.scroll, text: `${DISCOVERIES[e.kind].icon} ${DISCOVERIES[e.kind].name} claimed`, sub: e.text, tone: 'good' } : null;
    case 'holdingChanged': {
      const d = DISCOVERIES[e.kind];
      if (e.owner === me) return { channel: 'toast', priority: 2, icon: ICONS.renown, text: `${d.icon} ${d.name} is yours: +${d.renown}★/min`, tone: 'good' };
      if (e.from === me) return { channel: 'toast', priority: 3, icon: ICONS.lookout, text: `Lost the ${d.icon} ${d.name}!`, tone: 'warn' };
      return null;
    }
    case 'rivalSighted':
      return { channel: 'toast', priority: 2, icon: ICONS.lookout, text: 'Rival border sighted', tone: 'warn' };
    case 'rankUp':
      return e.owner === me
        ? { channel: 'banner', priority: 3, icon: ICONS.renown, text: `You are a ${RANK_NAMES[e.rank]}!`, sub: e.unlocks.length ? `New: ${e.unlocks.map((t) => BUILDINGS[t].name).join(', ')}` : 'Your border grows', tone: 'big' }
        : { channel: 'toast', priority: 1, icon: ICONS.scroll, text: `Rival is now a ${RANK_NAMES[e.rank]}`, tone: 'rival' };
    case 'houseSeated': {
      const h = HOUSES[e.house];
      return e.owner === me
        ? { channel: 'toast', priority: 2, icon: ICONS.renown, text: `${h.icon} ${h.name} joins your council`, sub: `${DEEDS[h.power].icon} ${DEEDS[h.power].name}`, tone: 'good' }
        : { channel: 'toast', priority: 1, icon: ICONS.scroll, text: `Rival seats the ${h.icon} ${h.name}`, tone: 'rival' };
    }
    case 'deed':
      return e.owner === me ? { channel: 'toast', priority: 2, icon: ICONS.renown, text: `${DEEDS[e.deed].icon} ${e.text}`, tone: 'good' } : null;
    case 'raidLaunched': {
      const name = BUILDINGS[e.buildingType].name;
      if (e.defender === me) return { channel: 'banner', priority: 3, icon: ICONS.shield, text: `⚔ ${e.owner === NO_OWNER ? 'Reavers' : 'Raiders'} march on your ${name}!`, sub: `${e.strength} strong · ${e.eta}s`, tone: 'warn' };
      if (e.owner === me) return { channel: 'toast', priority: 2, icon: ICONS.shield, text: `⚔ Your huscarls march on their ${name}`, tone: 'info' };
      return null;
    }
    case 'raidResolved': {
      const name = BUILDINGS[e.buildingType].name;
      if (e.owner === me) return e.won ? { channel: 'toast', priority: 3, icon: ICONS.shield, text: `🔥 Burned their ${name}: +${e.renown}★`, tone: 'big' } : { channel: 'toast', priority: 3, icon: ICONS.shield, text: `Driven off at their ${name} (${e.attack} vs ${e.defence})`, tone: 'warn' };
      if (e.defender === me) return e.won ? { channel: 'toast', priority: 3, icon: ICONS.shield, text: `🔥 Your ${name} burned (${e.attack} vs ${e.defence})`, tone: 'warn' } : { channel: 'toast', priority: 3, icon: ICONS.shield, text: `🛡 Your ${name} held: +${e.renown}★`, tone: 'big' };
      return null;
    }
    case 'challenge': {
      const def = challengeDef(e.def)!;
      return { channel: 'toast', priority: 2, icon: ICONS.renown, text: `${def.icon} ${def.title}: +${def.prize}★`, sub: def.text, tone: 'big' };
    }
    case 'challengeWon': {
      const def = challengeDef(e.def)!;
      return e.winner === me ? { channel: 'toast', priority: 3, icon: ICONS.renown, text: `${def.icon} You won ${def.title}: +${e.prize}★`, tone: 'big' } : { channel: 'toast', priority: 2, icon: ICONS.renown, text: `Rival won ${def.title}`, tone: 'warn' };
    }
    case 'starfall':
      return { channel: 'banner', priority: 3, icon: ICONS.renown, text: '☄️ A star has fallen!', sub: 'The Star-Stone lies between you: the richest landmark in the valley', tone: 'big' };
    case 'moot':
      return { channel: 'banner', priority: 3, icon: ICONS.renown, text: '📯 The Moot', sub: 'Landmarks pay double until the end', tone: 'big' };
    case 'landLost':
      return e.owner === me ? { channel: 'toast', priority: 1, icon: ICONS.lookout, text: `Rival pushing into your land (−${e.tiles})`, tone: 'warn', key: 'landLost' } : null;
    case 'eventResolved':
      return e.owner === me ? { channel: 'toast', priority: 1, icon: ICONS.scroll, text: e.text, tone: 'info' } : null;
    default:
      // Births, marriages, finished huts, sales, arrivals, seasons, objectives (the goals panel shows
      // them): the world shows these, the screen stays clear.
      void world;
      return null;
  }
}

/**
 * What a player would actually see, for the harness: the same rules as the game's notifier
 * (two toasts on screen at most, quiet news dropped when busy, one banner at a time), run on
 * game time. Returns how many banners and toasts reached the screen.
 */
export function simulateDesk(items: { tick: number; news: News }[]): { banners: number; toasts: number; dropped: number } {
  let banners = 0;
  let toasts = 0;
  let dropped = 0;
  let bannerFree = 0;
  let onScreen: number[] = [];
  let queue: News[] = [];
  const pump = (t: number) => {
    onScreen = onScreen.filter((until) => until > t);
    while (onScreen.length < 2 && queue.length) {
      const n = queue.shift()!;
      onScreen.push(t + (n.tone === 'big' ? 55 : 42));
      toasts++;
    }
  };
  for (const { tick, news } of items) {
    pump(tick);
    if (news.channel === 'banner') {
      if (tick >= bannerFree) {
        banners++;
        bannerFree = tick + 42;
      } else dropped++;
      continue;
    }
    if (news.key) queue = queue.filter((q) => q.key !== news.key);
    if (news.priority === 1 && (onScreen.length >= 1 || queue.length)) {
      dropped++;
      continue;
    }
    queue.push(news);
    queue.sort((a, b) => b.priority - a.priority);
    if (queue.length > 3) dropped += queue.length - 3;
    queue.length = Math.min(queue.length, 3);
    pump(tick);
  }
  return { banners, toasts, dropped };
}
