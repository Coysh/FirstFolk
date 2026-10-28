import { CALLINGS } from '../sim/callings';
import { BUILDINGS, DISCOVERIES, RANK_NAMES } from '../sim/defs';
import { DEEDS } from '../sim/deeds';
import { HOUSES } from '../sim/houses';
import { NO_OWNER } from '../sim/territory';
import { CONTESTED } from '../sim/crown';
import { STEADING_CHAR } from '../sim/steadingDefs';
import { TRADES } from '../sim/trades';
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
    case 'craftUp':
      return e.owner === me ? { channel: 'toast', priority: 2, icon: ICONS.renown, text: `${TRADES[e.skill].icon} ${TRADES[e.skill].name} ${'★'.repeat(e.tier)}: every workplace grows`, sub: TRADES[e.skill].perks[e.tier], tone: 'big' } : null;
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
    case 'calling':
      // Only your own, and only when a town finds or deepens a calling (losing one is quiet).
      if (e.owner !== me || !e.calling || !e.tier) return null;
      return { channel: 'toast', priority: 2, icon: ICONS.renown, text: `${CALLINGS[e.calling].icon} ${CALLINGS[e.calling].titles[e.tier - 1]}`, sub: CALLINGS[e.calling].perks[e.tier - 1], tone: 'good', key: 'calling' };
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
      // The warning strip shows the march, its countdown and the odds; this toast just turns heads.
      if (e.defender === me) return { channel: 'toast', priority: 3, icon: ICONS.shield, text: `⚔ ${e.owner === NO_OWNER ? 'Reavers' : 'Raiders'} march on your ${name}!`, tone: 'warn' };
      if (e.owner === me) return { channel: 'toast', priority: 2, icon: ICONS.shield, text: `⚔ Your huscarls march on their ${name}`, tone: 'info' };
      return null;
    }
    case 'scoutSent':
      return e.owner === me ? { channel: 'toast', priority: 1, icon: ICONS.lookout, text: '🔭 Your scout sets out', tone: 'info', key: 'scout' } : null;
    case 'scoutHome':
      return e.owner === me ? { channel: 'toast', priority: 2, icon: ICONS.lookout, text: e.found ? `🔭 Your scout is back: ${e.found} new ${e.found === 1 ? 'place' : 'places'} in view` : '🔭 Your scout is back with the lie of the land', tone: e.found ? 'good' : 'info' } : null;
    case 'scoutSpotted':
      return e.seer === me ? { channel: 'toast', priority: 2, icon: ICONS.lookout, text: '👁 A rival scout is watching your border', tone: 'rival' } : e.owner === me ? { channel: 'toast', priority: 1, icon: ICONS.lookout, text: '👁 Your scout was seen by the rival’s folk', tone: 'info' } : null;
    case 'clashBegan': {
      const name = BUILDINGS[e.buildingType].name;
      if (e.defender === me) return { channel: 'toast', priority: 3, icon: ICONS.shield, text: `⚔ The fight for your ${name} has begun: Rally (G)!`, tone: 'warn' };
      return null;
    }
    case 'clashRally':
      if (e.owner === me) return { channel: 'toast', priority: 2, icon: ICONS.shield, text: e.kind === 'rally' ? `📯 ${e.n || 'No'} townsfolk answer the call: +${e.strength}` : `🔥 Surge! +${e.strength} strength`, tone: 'good' };
      return { channel: 'toast', priority: 2, icon: ICONS.shield, text: e.kind === 'rally' ? '📯 The rival rallies their folk!' : '🔥 The raiders surge!', tone: 'warn' };
    case 'raidResolved': {
      const name = BUILDINGS[e.buildingType].name;
      if (e.owner === me) return e.won ? { channel: 'toast', priority: 3, icon: ICONS.shield, text: `🔥 Burned their ${name}: +${e.renown}★`, tone: 'big' } : { channel: 'toast', priority: 3, icon: ICONS.shield, text: `Driven off at their ${name} (${e.attack} vs ${e.defence})`, tone: 'warn' };
      if (e.defender === me) return e.won ? { channel: 'toast', priority: 3, icon: ICONS.shield, text: `🔥 Your ${name} burned (${e.attack} vs ${e.defence})`, tone: 'warn' } : { channel: 'toast', priority: 3, icon: ICONS.shield, text: `🛡 Your ${name} held: +${e.renown}★`, tone: 'big' };
      return null;
    }
    case 'wantPosted': {
      const st = world.sites.find((s) => s.id === e.siteId)?.st;
      if (!st) return null;
      const ask = e.kind === 'guard' ? 'a manned post beside them' : `${e.n} ${e.good}`;
      return { channel: 'toast', priority: 1, icon: ICONS.scroll, text: `${STEADING_CHAR[st.char].icon} ${st.name} want ${ask}`, sub: 'The first to deliver wins their favour', tone: 'info', key: `want${e.siteId}` };
    }
    case 'wantWon': {
      const st = world.sites.find((s) => s.id === e.siteId)?.st;
      if (!st) return null;
      return e.owner === me ? { channel: 'toast', priority: 3, icon: ICONS.renown, text: `🏆 ${st.name} thank you: +favour`, tone: 'big' } : { channel: 'toast', priority: 2, icon: ICONS.renown, text: `The rival won the favour of ${st.name}`, tone: 'warn' };
    }
    case 'steadingAlly': {
      const st = world.sites.find((s) => s.id === e.siteId)?.st;
      if (!st) return null;
      if (e.owner === me) return { channel: 'toast', priority: 3, icon: ICONS.renown, text: `🏘 ${st.name} now stand with you`, sub: 'A voice of the valley: the Crown fills for whoever holds more', tone: 'big' };
      if (e.owner >= 0) return { channel: 'toast', priority: 3, icon: ICONS.renown, text: `🏘 ${st.name} swear to the rival`, sub: 'Win them back with a Want, or burn the post that keeps them', tone: 'warn' };
      return e.was === me ? { channel: 'toast', priority: 3, icon: ICONS.renown, text: `${st.name} no longer stand with you`, sub: 'Their favour has faded: send a cart', tone: 'warn' } : null;
    }
    case 'starfall':
      return { channel: 'banner', priority: 3, icon: ICONS.renown, text: '☄️ A star has fallen: the Kingstone!', sub: 'Keep a manned post beside it, alone, and the Crown fills. First to fill it rules the valley', tone: 'big' };
    case 'crownKeeper': {
      if (e.keeper === me) return { channel: 'banner', priority: 3, icon: ICONS.renown, text: '👑 You keep the Kingstone', sub: 'The Crown is filling. Guard the post beside it!', tone: 'big' };
      if (e.keeper === CONTESTED) return { channel: 'banner', priority: 3, icon: ICONS.renown, text: '⚔️ The Kingstone is contested', sub: 'Both of you have a post beside it. The Crown is frozen: burn theirs', tone: 'big' };
      if (e.keeper >= 0) return { channel: 'banner', priority: 3, icon: ICONS.renown, text: '🔥 The rival keeps the Kingstone', sub: 'Your Crown is draining. Burn the post beside it and take it back', tone: 'warn' };
      return e.was === me ? { channel: 'banner', priority: 3, icon: ICONS.renown, text: '💨 Your hold on the Kingstone is gone', sub: 'Its post burned or was left unmanned', tone: 'warn' } : null;
    }
    case 'crownQuarter':
      return e.quarter >= 4 ? null : { channel: 'toast', priority: 3, icon: ICONS.renown, text: e.owner === me ? `👑 Your Crown is ${e.quarter * 25}% full` : `👑 The rival's Crown is ${e.quarter * 25}% full`, tone: e.owner === me ? 'good' : 'warn' };
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
