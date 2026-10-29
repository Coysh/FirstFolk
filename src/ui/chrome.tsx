import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { icon, PLAYER, type Game } from '../game';
import { audio } from '../audio/audio';
import { ICON } from '../render/overlay';
import { CALLINGS, CALLING_IDS, CALLING_TIERS, callingScores, callingTitle } from '../sim/callings';
import { BRIDGE_MAX, BRIDGE_RANK, bestBridge } from '../sim/bridges';
import { BASIC_GOODS, BUILDINGS, BUILD_MENU, DISCOVERIES, FOODS, GOODS, GOOD_INFO, RANK_NAMES, SKILLS, type BuildingType, type Good } from '../sim/defs';
import { NO_OWNER, territoryBox } from '../sim/territory';
import { BALANCE, TICK_HZ, secs } from '../sim/balance';
import { SEASON_NAMES, seasonOf, ticksToNextSeason } from '../sim/seasons';
import type { World } from '../sim/world';
import { TRADES, tierOf, tierProgress } from '../sim/trades';
import { settings } from '../settings';
import { formatTime } from './describe';
import { DEED_KEYS, HOTKEYS } from '../input/input';
import { lockLabel } from '../sim/commands';
import { DEEDS, activePowers, deedCooldown, deedProblem, deedWait } from '../sim/deeds';
import { HOUSES } from '../sim/houses';
import { caravanMax, caravanProblem, routeThreat, steadingsOf, suggestLoad } from '../sim/steadings';
import { STEADING_CHAR } from '../sim/steadingDefs';
import { homeLevelName, homeNeeds, prosperity } from '../sim/prosperity';
import { CONTESTED, crownEta, crownPace, crownPct, crownSite, hearthStatus } from '../sim/crown';
import { starfallTick } from '../sim/happenings';
import { OMENS } from '../sim/omens';
import { workOwner } from '../sim/works';
import { hallOf, huscarls, raidStrength } from '../sim/warfare';
import { BUILD_CATS, buildCat, catOf, sheet, toggleSheet } from './state';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const plural_ = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Subscribe a component to the periodic world refresh (signals skip prop-identical re-renders). */
export const useWorldRefresh = (game: Game) => void game.version.value;

// ---------------------------------------------------------------------------------------------
// Top bar: the town, what it holds, and the clock. Nothing else lives up here.
// ---------------------------------------------------------------------------------------------

function Res({ good, value, warn, waiting = 0 }: { good: Good; value: number; warn?: boolean; waiting?: number }) {
  const prev = useRef(value);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (value > prev.current) setBump((b) => b + 1);
    prev.current = value;
  }, [value]);
  return (
    <span class={`chip res ${warn ? 'warn' : ''}`} title={waiting ? `${GOOD_INFO[good].name}: ${value - waiting} in stores, ${waiting} waiting at gatherers` : GOOD_INFO[good].name}>
      <img src={ICON[good]} alt={GOOD_INFO[good].name} />
      <b key={bump} class={bump ? 'bump' : ''}>
        {value}
      </b>
    </span>
  );
}

export function TopBar({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const p = w.players[PLAYER];
  const pop = w.population(PLAYER);
  const housing = w.housing(PLAYER);
  const hungry = p.hungry;
  // Everyone eats about once every 85 s, guards three times as much: under one meal each is about 90 s of food.
  const lowLarder = !hungry && w.larder(PLAYER) < w.eaters(PLAYER);
  const showPlanks = p.produced.planks > 0 || w.isUnlocked(PLAYER, 'sawpit');
  const showFish = p.produced.fish > 0 || w.isUnlocked(PLAYER, 'fisher');
  const calling = p.calling;
  const next = p.rank === 1 ? BALANCE.rankProsperity[0] : p.rank === 2 ? BALANCE.rankProsperity[1] : 0;
  const pr = prosperity(w, PLAYER);
  const open = sheet.value === 'town';
  return (
    <header class="topbar">
      <button class={`town-chip ${open ? 'on' : ''}`} onClick={() => toggleSheet('town')} aria-expanded={open} title="Your town: rank, homes, calling and crafts (T is the scout; click here)">
        <span class="town-ico">{calling.id ? CALLINGS[calling.id].icon : '🏘'}</span>
        <span class="town-name">
          {RANK_NAMES[p.rank]}
          {next > 0 && <small>{pr}/{next}</small>}
        </span>
        {next > 0 && <i class="town-bar" style={{ width: `${Math.min(100, (pr / next) * 100)}%` }} />}
      </button>
      <div class="res-row">
        <span class={`chip res ${pop >= housing ? 'full' : ''}`} title={`${pop} settlers · homes for ${housing}`}>
          <img src={ICON.people} alt="Population" />
          <b>{pop}</b>
          <small>/{housing}</small>
        </span>
        {GOODS.filter((g) => (g !== 'planks' || showPlanks) && (g !== 'fish' || showFish) && (BASIC_GOODS.includes(g) || (g !== 'grain' && g !== 'ore' && (p.produced[g] > 0 || w.stored(PLAYER, g) > 0)))).map((g) => (
          <Res key={g} good={g} value={FOODS.includes(g) ? w.stored(PLAYER, g) + w.waiting(PLAYER, g) : w.stored(PLAYER, g)} waiting={FOODS.includes(g) ? w.waiting(PLAYER, g) : 0} warn={FOODS.includes(g) && (hungry || lowLarder)} />
        ))}
      </div>
      <CrownChip game={game} />
      <Clock game={game} />
    </header>
  );
}

const SEASON_ICONS = ['🌱', '☀️', '🍂', '❄️'];
const SPEEDS = [1, 2, 3, 5];

function Clock({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const season = seasonOf(w.tick);
  const left = Math.ceil(ticksToNextSeason(w.tick) / TICK_HZ);
  const warn = season === 2 && left <= 40;
  const sp = game.speed.value;
  const unread = game.unread.value;
  return (
    <div class="clock-row">
      <span class={`chip season ${season === 3 ? 'winter' : ''} ${warn ? 'warn pulse' : ''}`} title={season === 3 ? 'Winter: berries sleep, folk eat more, building is slower' : `${SEASON_NAMES[season]}: ${left}s left`}>
        {SEASON_ICONS[season]}
        <span class="season-name">{warn ? `Winter ${left}s` : SEASON_NAMES[season]}</span>
        <b>{formatTime(w.tick)}</b>
      </span>
      <div class="seg">
        <button class={game.paused.value ? 'on' : ''} onClick={() => game.togglePause()} title="Pause (Space)" aria-label="Pause">
          ❚❚
        </button>
        <span class="seg-all">
          {SPEEDS.map((s) => (
            <button key={s} class={!game.paused.value && sp === s ? 'on' : ''} onClick={() => game.setSpeed(s)} aria-label={`Speed ${s}x`}>
              {s}×
            </button>
          ))}
        </span>
        <button class="seg-one" onClick={() => game.setSpeed(SPEEDS[(SPEEDS.indexOf(sp) + 1) % SPEEDS.length])} aria-label="Change speed">
          {sp}×
        </button>
      </div>
      <button
        class={`icon-btn bell ${sheet.value === 'log' ? 'on' : ''}`}
        onClick={() => {
          toggleSheet('log');
          game.unread.value = 0;
        }}
        aria-label="Chronicle: what has happened"
        title="Chronicle: everything the valley has told you"
      >
        📜{unread > 0 && <i class="dot">{unread > 9 ? '9+' : unread}</i>}
      </button>
      <button class="icon-btn" onClick={() => (game.menuOpen.value = true)} aria-label="Menu" title="Menu (Esc)">
        ☰
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Under the top bar, left: only what needs you. Alerts appear and vanish; the goal is one line.
// ---------------------------------------------------------------------------------------------

export function Status({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const p = w.players[PLAYER];
  const pop = w.population(PLAYER);
  const hungry = p.hungry;
  const lowLarder = !hungry && w.larder(PLAYER) < w.eaters(PLAYER);
  const idle = [...w.settlers.values()].filter((s) => s.owner === PLAYER && !s.child && s.job.kind === 'idle').length;
  const full = pop >= w.housing(PLAYER) && w.population(PLAYER) > 6;
  const list = game.objectives.value;
  const current = list.find((o) => !o.done);
  const open = sheet.value === 'goals';
  return (
    <div class="status">
      <div class="alerts">
        {hungry && <span class="alert bad pulse">🍖 Hungry!</span>}
        {lowLarder && <span class="alert warn pulse" title="Food is running low: build a Forager or a Fisher before folk go hungry">🍖 Food low</span>}
        {idle >= 3 && (
          <span class="alert" title={`${idle} adults have nothing to do. Build workplaces (or more homes for families to grow).`}>
            💤 {idle} idle
          </span>
        )}
        {full && <span class="alert" title="Every home is full: build more huts">🏠 Homes full</span>}
      </div>
      {current && (
        <button class={`goal-line ${open ? 'on' : ''}`} onClick={() => toggleSheet('goals')} aria-expanded={open}>
          <span class="gl-arrow">➤</span>
          <span class="gl-text">{current.label}</span>
          {current.target > 1 && (
            <span class="gl-prog">
              {current.id.startsWith('trade') ? `${Math.round((current.current / current.target) * 100)}%` : `${Math.min(current.current, current.target)}/${current.target}`}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

/** The chapter checklist: opens from the goal line, closes with it. */
export function GoalsSheet({ game }: { game: Game }) {
  if (sheet.value !== 'goals') return null;
  const list = game.objectives.value;
  const current = list.find((o) => !o.done);
  const chapter = current?.chapter ?? list[list.length - 1]?.chapter ?? '';
  const inChapter = list.filter((o) => o.chapter === chapter);
  const hints = settings.value.hints;
  return (
    <section class="sheet goals-sheet panel" aria-label="Chapter goals">
      <header class="sheet-head">
        <span>
          <small>Chapter</small> <b>{chapter}</b>
        </span>
        <button class="close" onClick={() => (sheet.value = null)} aria-label="Close">✕</button>
      </header>
      <ul>
        {inChapter.map((o) => (
          <li key={o.id} class={o.done ? 'done' : o === current ? 'next' : ''}>
            <span class="tick">{o.done ? '✔' : o === current ? '➤' : '•'}</span>
            <span class="label">
              {o.label}
              {o === current && hints && o.hint && <em>{o.hint}</em>}
            </span>
            {!o.done && o.target > 1 && <span class="prog">{o.id.startsWith('trade') ? `${Math.round((o.current / o.target) * 100)}%` : `${Math.min(o.current, o.target)}/${o.target}`}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// The Crown chip (the race, in one glance) and the Valley sheet it opens.
// ---------------------------------------------------------------------------------------------

/** Wants you could meet right now from your stores: the single most useful thing the chip can say. */
function answerable(w: World): number {
  let n = 0;
  for (const s of steadingsOf(w)) {
    const want = s.st!.want;
    if (!(s.revealed & 1) || !want || want.kind !== 'goods') continue;
    if (want.progress[PLAYER] >= want.n) continue;
    if (w.stored(PLAYER, want.good) >= Math.min(want.n - want.progress[PLAYER], BALANCE.caravanLoad) / 2 && !caravanProblem(w, PLAYER, s.id, want.good, 1)) n++;
  }
  return n;
}

function Voices({ n, max = 4 }: { n: number; max?: number }) {
  return (
    <span class="voices" aria-label={`${n} voices`}>
      {Array.from({ length: Math.min(max, Math.max(n, 1)) }, (_, i) => (
        <i key={i} class={i < n ? 'on' : ''} />
      ))}
    </span>
  );
}

export function CrownChip({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  if (w.scenario.victory !== 'crown') return null;
  const c = w.crown;
  const limit = w.scenario.timeLimit ?? 0;
  const left = limit ? Math.max(0, limit - w.tick) : Infinity;
  const open = sheet.value === 'valley';
  const row = (owner: number, label: string) => {
    const pct = crownPct(w, owner);
    const pace = crownPace(w, owner);
    return (
      <span class={`cc-row ${owner === PLAYER ? 'me' : 'them'} ${pace > 0 ? 'rising' : pace < 0 ? 'falling' : ''}`}>
        <em>{label}</em>
        <i class="cc-track">
          <i style={{ width: `${pct}%` }} />
        </i>
        <b>{pct}%</b>
        <span class="cc-pace">{pace > 0 ? '▲' : pace < 0 ? '▼' : ''}</span>
      </span>
    );
  };
  const opens = !c || w.tick < BALANCE.crownOpens;
  const todo = opens ? 0 : answerable(w);
  return (
    <button class={`crown-chip ${open ? 'on' : ''} ${opens ? 'early' : ''}`} onClick={() => toggleSheet('valley')} aria-expanded={open} title="The Crown: hold more of the valley than your rival and it fills. Click for the voices of the valley (K)">
      <span class="cc-crown">👑</span>
      <span class="cc-rows">
        {opens ? (
          <span class="cc-early">The Crown opens in {formatTime(Math.max(0, BALANCE.crownOpens - w.tick))}</span>
        ) : (
          <>
            {row(PLAYER, 'You')}
            {w.players[1] && row(1, 'Rival')}
          </>
        )}
      </span>
      {!opens && (
        <span class="cc-voices">
          <Voices n={c?.voices[PLAYER] ?? 0} />
          <small>{c?.voices[1] ?? 0}</small>
        </span>
      )}
      {left <= secs(5 * 60) && <span class="cc-clock pulse">⏳{formatTime(left)}</span>}
      {todo > 0 && <i class="cc-badge" title={`${plural_(todo, 'steading')} want something you have`}>🛒{todo}</i>}
      <span class="cc-caret">{open ? '▴' : '▾'}</span>
    </button>
  );
}

/** The one sentence that says what the race is doing, and what to do about it. */
function raceStatus(w: World): { text: string; tone: 'mine' | 'theirs' | 'contested' } {
  const c = w.crown;
  const site = crownSite(w);
  const mine = c?.voices[PLAYER] ?? 0;
  const theirs = c?.voices[1] ?? 0;
  if (!c || w.tick < BALANCE.crownOpens) return { text: `The Crown opens in ${formatTime(Math.max(0, BALANCE.crownOpens - w.tick))}. Win steadings with carts, hold the Kingstone, grow a rich town: voices fill it.`, tone: 'contested' };
  if (mine > theirs) return { text: `You hold more of the valley (${plural_(mine, 'voice')} to ${theirs}): your Crown is filling.${site ? ' Guard it!' : ''}`, tone: 'mine' };
  if (mine < theirs) return { text: `The rival holds more (${plural_(theirs, 'voice')} to ${mine}): your Crown is draining. Win a steading, outgrow them, or take the Kingstone${site ? '' : ' when the star falls'}.`, tone: 'theirs' };
  return { text: mine === 0 ? 'Nobody holds the valley yet. The first voice starts the Crown filling.' : `Level at ${plural_(mine, 'voice')} each: the Crown is frozen. Win one more voice.`, tone: 'contested' };
}

export function ValleySheet({ game }: { game: Game }) {
  useWorldRefresh(game);
  const [places, setPlaces] = useState(false);
  if (sheet.value !== 'valley') return null;
  const w = game.world;
  const c = w.crown;
  const site = crownSite(w);
  const status = raceStatus(w);
  const mine = w.crown?.voices[PLAYER] ?? 0;
  const fallIn = Math.max(0, starfallTick(w) - w.tick);
  const rows = steadingsOf(w).filter((s) => s.revealed & 1);
  const carts = w.caravans.filter((x) => x.owner === PLAYER).length;
  const hearth = hearthStatus(w);
  const kingKeeper = c?.keeper ?? NO_OWNER;

  const crownLine = (owner: number, label: string) => {
    const pct = crownPct(w, owner);
    const pace = crownPace(w, owner);
    const eta = crownEta(w, owner);
    return (
      <div class={`vs-crown ${owner === PLAYER ? 'me' : 'them'}`} title={pace > 0 ? `Full in ${formatTime(eta * TICK_HZ)} at this pace` : pace < 0 ? 'Draining' : 'Not moving'}>
        <span>{label}</span>
        <i class="cc-track">
          <i style={{ width: `${pct}%` }} />
        </i>
        <b>{pct}%</b>
        <small>{pace > 0 ? `▲ ${formatTime(eta * TICK_HZ)}` : pace < 0 ? '▼ draining' : 'still'}</small>
      </div>
    );
  };

  return (
    <section class="sheet valley-sheet panel" aria-label="The valley">
      <header class="sheet-head">
        <b>👑 The Crown</b>
        {w.omens.length > 0 && (
          <span class="omens">
            {w.omens.map((o) => (
              <span key={o} title={`${OMENS[o].name}: ${OMENS[o].blurb}`}>
                {OMENS[o].icon}
              </span>
            ))}
          </span>
        )}
        <button class="close" onClick={() => (sheet.value = null)} aria-label="Close">✕</button>
      </header>
      {crownLine(PLAYER, 'You')}
      {w.players[1] && crownLine(1, 'Rival')}
      <p class={`vs-status ${status.tone}`}>{status.text}</p>

      <h4>
        <span>🛒 Trade</span>
        <small>Carts of what they want win them, each a voice · carts out {carts}/{caravanMax(w, PLAYER)} · a rival post beside the road waylays, yours escorts</small>
      </h4>
      <div class="steadings">
        {rows.map((s) => {
          const st = s.st!;
          const ch = STEADING_CHAR[st.char];
          const want = st.want;
          const load = suggestLoad(w, PLAYER, s);
          const problem = load ? caravanProblem(w, PLAYER, s.id, load.good, Math.max(1, load.n)) : 'Nothing to send';
          const left = want ? Math.max(0, want.endsAt - w.tick) : 0;
          const askText = !want ? 'no Want right now' : want.kind === 'guard' ? `a manned post beside them: ${want.progress[PLAYER]}/${want.n}s` : `${want.progress[PLAYER]}/${want.n} ${GOOD_INFO[want.good].icon} ${want.good}`;
          const who = st.ally === PLAYER ? 'mine' : st.ally >= 0 ? 'theirs' : 'open';
          const threat = routeThreat(w, PLAYER, s.id);
          return (
            <div class={`stead ${who}`} key={s.id}>
              <button class="stead-name" onClick={() => game.lookAt(s.x, s.y)} title={`${st.name}: ${ch.blurb} Sends ${ch.giftN} ${ch.gift} a minute to whoever they stand with.`}>
                <span class="stead-ico">{ch.icon}</span>
                <span class="stead-who">
                  {st.name.replace(/'s .*/, '')}
                  <small>{ch.people}</small>
                </span>
              </button>
              <div class="stead-mid">
                <div class="stead-favour" title={`Favour: you ${st.favour[PLAYER]}, rival ${st.favour[1] ?? 0}. At 50 with a lead of 20 they stand with you.`}>
                  <div class="f-me" style={{ width: `${st.favour[PLAYER]}%` }} />
                  <div class="f-them" style={{ width: `${st.favour[1] ?? 0}%` }} />
                  <i class="f-mark" />
                </div>
                <div class="stead-want">
                  <span class={want?.kind === 'guard' ? 'guard' : ''}>{askText}</span>
                  {want && <small class={left < 300 ? 'pulse' : ''}>{formatTime(left)}</small>}
                  {want && (want.progress[1] ?? 0) > 0 && <small class="rival-progress">rival {want.progress[1]}{want.kind === 'guard' ? 's' : ''}</small>}
                </div>
              </div>
              <button
                class={`stead-send ${threat ? 'danger' : ''}`}
                disabled={!!problem || !load || load.n < 1}
                onClick={() => load && game.sendCaravan(s.id, load.good, load.n)}
                title={problem || (threat ? '⚠ A rival post stands on this road: the cart would be waylaid. Man a post beside it first, or go another way' : load!.wanted ? `Send what they asked for: ${load!.n} ${load!.good}` : `Send a gift of ${load!.n} ${load!.good}: it earns a little favour`)}
              >
                {threat ? '⚠' : '🛒'} {load && load.n > 0 ? load.n : ''}
                {load && load.n > 0 && <small>{GOOD_INFO[load.good].icon}</small>}
              </button>
            </div>
          );
        })}
      </div>

      <h4>
        <span>⚔ War</span>
        <small>The Kingstone is worth two voices to whoever holds it alone.</small>
      </h4>
      <button class="road-row" onClick={() => site && game.lookAt(site.x, site.y)} disabled={!site}>
        <span class="road-ico">☄️</span>
        <span class="road-body">
          <b>The Kingstone</b>
          <small>
            {site
              ? kingKeeper === PLAYER
                ? 'You keep it (2 voices). Hold a manned post beside it; a Stockade tends it.'
                : kingKeeper === CONTESTED
                  ? 'Contested: both have a post beside it, so nothing counts. Burn theirs!'
                  : kingKeeper >= 0
                    ? 'The rival keeps it. Burn their post beside it, then hold it yourself.'
                    : 'Nobody keeps it. A manned post within 9 tiles claims it.'
              : fallIn > 0
                ? `A star falls in ${formatTime(fallIn)}: the Kingstone.`
                : 'A star is about to fall.'}
          </small>
        </span>
        <Voices n={kingKeeper === PLAYER ? 2 : 0} max={2} />
      </button>

      <h4>
        <span>🏡 Hearth</span>
        <small>The richer town is a voice: grow bread, ale and tools, and homes that level up.</small>
      </h4>
      <div class={`road-row static ${hearth.holder === PLAYER ? 'mine' : hearth.holder >= 0 ? 'theirs' : ''}`}>
        <span class="road-ico">🏡</span>
        <span class="road-body">
          <b>
            You {hearth.scores[PLAYER]} <span class="vs">vs</span> Rival {hearth.scores[1] ?? 0}
          </b>
          <small>
            {hearth.holder === PLAYER
              ? 'Your town is the richer: one voice for you.'
              : hearth.holder >= 0
                ? 'Their town is the richer: one voice for them. Out-grow them.'
                : `Needs at least ${hearth.min} and a clear lead (${hearth.leadPct}% more). ${homeLevelName(w.players[PLAYER].homeLevel)} now.`}
          </small>
        </span>
        <Voices n={hearth.holder === PLAYER ? 1 : 0} max={1} />
      </div>

      <button class="places-toggle" onClick={() => setPlaces(!places)} aria-expanded={places}>
        {places ? '▾' : '▸'} Landmarks out in the wild
      </button>
      {places && <Places game={game} />}
      <span class="sr-only">{mine} voices</span>
    </section>
  );
}

/** The "where next?" list: unclaimed discoveries and landmarks you don't hold, nearest first. */
function Places({ game }: { game: Game }) {
  const w = game.world;
  const open = w.sites.filter((s) => !s.st && s.revealed & 1 && (s.claimedBy === NO_OWNER || (DISCOVERIES[s.kind].renown && s.heldBy !== PLAYER)));
  const box = territoryBox(w, PLAYER);
  const gap = (x: number, y: number) => {
    let best = Infinity;
    for (let ty = box.y0; ty <= box.y1; ty += 1)
      for (let tx = box.x0; tx <= box.x1; tx += 1) if (w.territory[w.idx(tx, ty)] === PLAYER) best = Math.max(0, Math.min(best, Math.max(Math.abs(tx - x), Math.abs(ty - y))));
    return best;
  };
  const rows = useMemo(() => open.map((s) => ({ s, d: gap(s.x, s.y) })).sort((a, b) => a.d - b.d).slice(0, 5), [Math.floor(w.tick / 50), open.length]);
  if (!rows.length) return <p class="vs-note">Nothing unclaimed in sight. A scout (T) can look further.</p>;
  return (
    <div class="places">
      {rows.map(({ s, d }) => {
        const def = DISCOVERIES[s.kind];
        return (
          <button key={s.id} class={`frontier-row ${s.heldBy > 0 ? 'theirs' : ''}`} onClick={() => game.focusSite(s.id)} title={def.blurb}>
            <span class="fr-icon">{def.icon}</span>
            <span class="fr-name">
              {def.name}
              {def.renown ? <small> +{def.renown}★/m{s.heldBy > 0 ? ' · rival’s' : ''}</small> : null}
            </span>
            <span class="fr-dist">{d} tiles</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The Town sheet: the economy's dashboard. Rank, homes, calling and crafts live here, not on screen.
// ---------------------------------------------------------------------------------------------

export function TownSheet({ game }: { game: Game }) {
  useWorldRefresh(game);
  const [calls, setCalls] = useState(false);
  if (sheet.value !== 'town') return null;
  const w = game.world;
  const p = w.players[PLAYER];
  const pop = w.population(PLAYER);
  const children = [...w.settlers.values()].filter((s) => s.owner === PLAYER && s.child).length;
  const idle = [...w.settlers.values()].filter((s) => s.owner === PLAYER && !s.child && s.job.kind === 'idle').length;
  const next = p.rank === 1 ? BALANCE.rankProsperity[0] : p.rank === 2 ? BALANCE.rankProsperity[1] : 0;
  const pr = prosperity(w, PLAYER);
  const c = p.calling;
  const scores = calls ? callingScores(w, PLAYER) : null;
  const friends = steadingsOf(w).filter((s) => s.st!.ally === PLAYER).length;
  const needs = homeNeeds(w, PLAYER);
  return (
    <section class="sheet town-sheet panel" aria-label="Your town">
      <header class="sheet-head">
        <b>
          {RANK_NAMES[p.rank]} {callingTitle(c) && <small>· {callingTitle(c)} {'★'.repeat(c.tier)}</small>}
        </b>
        <button class="close" onClick={() => (sheet.value = null)} aria-label="Close">✕</button>
      </header>
      <div class="town-grid">
        <div>
          <small>Folk</small>
          <b>{pop}<span>/{w.housing(PLAYER)}</span></b>
          <small>{children} children{idle ? ` · ${idle} idle` : ''}</small>
        </div>
        <div>
          <small>Homes</small>
          <b>{homeLevelName(p.homeLevel)}</b>
          <small class="needs">
            {p.homeLevel >= 2
              ? 'the finest: keep ale and tools coming'
              : needs.goods.map((g) => (
                  <span key={g.good} class={g.have >= g.need ? 'met' : ''}>
                    {GOOD_INFO[g.good].icon} {Math.min(g.have, 999)}/{g.need}
                  </span>
                ))}
          </small>
        </div>
        <div>
          <small>Prosperity</small>
          <b>{pr}{next > 0 && <span>/{next}</span>}</b>
          <small>{next > 0 ? `for ${RANK_NAMES[p.rank + 1]}` : 'what the town amounts to'}</small>
        </div>
        <div>
          <small>Friends</small>
          <b>{friends}</b>
          <small>steadings at your side</small>
        </div>
      </div>
      <p class="vs-note">Prosperity is people, comfortable homes (bread, ale, tools), steadings at your side and Great Works. It raises your rank, and it is the Hearth voice.</p>
      {p.rank >= 1 && (
        <button class={`toggle-row ${p.autoHomes ? 'on' : ''}`} onClick={() => game.setAutoHomes(!p.autoHomes)} aria-pressed={p.autoHomes}>
          <span>🏠 Families build their own huts</span>
          <b>{p.autoHomes ? 'On' : 'Off'}</b>
        </button>
      )}
      <h4>
        <span>Crafts</span>
        <small>Every harvest fills them; each tier changes every workplace.</small>
      </h4>
      <div class="crafts-row">
        {SKILLS.map((k) => {
          const xp = p.crafts[k];
          const t = tierOf(xp);
          return (
            <span class={`craft t${t}`} key={k} title={`${TRADES[k].name}: ${['novice', 'skilled', 'masterly'][t]}${t < 2 ? ` · next: ${TRADES[k].perks[t + 1]}` : ''}`}>
              <span class="craft-icon" style={{ background: `conic-gradient(var(--gold) ${tierProgress(xp) * 360}deg, rgba(0,0,0,0.18) 0)` }}>
                <span>{TRADES[k].icon}</span>
              </span>
              <b>{TRADES[k].titles[t]}</b>
              <small>{'★'.repeat(t)}{'☆'.repeat(2 - t)}</small>
            </span>
          );
        })}
      </div>
      <button class="places-toggle" onClick={() => setCalls(!calls)} aria-expanded={calls}>
        {calls ? '▾' : '▸'} What your town is becoming
      </button>
      {calls && scores && (
        <div class="callings">
          {CALLING_IDS.map((id) => {
            const d = CALLINGS[id];
            const v = scores[id];
            const mine = c.id === id;
            const tier = mine ? c.tier : 0;
            return (
              <div class={`calling-row ${mine ? 'mine' : ''}`} key={id}>
                <span class="calling-icon">{d.icon}</span>
                <div class="calling-body">
                  <strong>
                    {tier ? d.titles[tier - 1] : d.name} <span class="calling-stars">{'★'.repeat(tier)}{'☆'.repeat(3 - tier)}</span>
                  </strong>
                  <div class="calling-bar">
                    <div style={{ width: `${Math.min(100, (v / CALLING_TIERS[2]) * 100)}%`, background: hex(d.color) }} />
                  </div>
                  <small>{mine ? d.perks[tier - 1] : d.earned}</small>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// The Chronicle: nothing is lost when the screen is kept quiet.
// ---------------------------------------------------------------------------------------------

export function ChronicleSheet({ game }: { game: Game }) {
  if (sheet.value !== 'log') return null;
  const items = [...game.chronicle.value].reverse();
  return (
    <section class="sheet log-sheet panel" aria-label="Chronicle">
      <header class="sheet-head">
        <b>📜 Chronicle</b>
        <button class="close" onClick={() => (sheet.value = null)} aria-label="Close">✕</button>
      </header>
      {items.length === 0 && <p class="vs-note">Nothing has happened yet. The valley is quiet.</p>}
      <ul class="log">
        {items.map((i) => (
          <li key={i.id} class={i.tone}>
            <time>{formatTime(i.at)}</time>
            <span>{i.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// The action rail: your powers, scout and raid, as round buttons on the right edge.
// ---------------------------------------------------------------------------------------------

function RailButton({ icon: glyph, label, pct, hotkey, state, onClick, title, tone }: { icon: string; label: string; pct: number; hotkey?: string; state?: string; onClick: () => void; title: string; tone?: string }) {
  const ready = pct >= 1 && !state;
  return (
    <button class={`rail-btn ${ready ? 'ready' : ''} ${tone ?? ''}`} onClick={onClick} title={title} aria-label={`${label}${hotkey ? ` (${hotkey})` : ''}`} data-label={label}>
      <span class="rail-ring" style={{ background: tone === 'blocked' ? 'rgba(255,255,255,0.22)' : `conic-gradient(var(--gold) ${Math.min(1, pct) * 360}deg, rgba(0,0,0,0.4) 0)` }}>
        <span class="rail-ico">{glyph}</span>
      </span>
      {state ? <small class="rail-state">{state}</small> : hotkey ? <small class="rail-key">{hotkey}</small> : null}
    </button>
  );
}

export function Rail({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const p = w.players[PLAYER];
  const hall = hallOf(w, PLAYER);
  if (!p.seats.length && !hall && p.rank < 1) return null;
  const running = activePowers(w, PLAYER);
  const out = w.scouts.some((s) => s.owner === PLAYER);
  const scoutRest = Math.max(0, p.scoutReady - w.tick);
  const n = hall ? huscarls(w, hall) : 0;
  const band = w.warbands.find((b) => b.owner === PLAYER);
  const raidRest = Math.max(0, p.raidReady - w.tick);
  const early = w.tick < BALANCE.raidsFrom;
  return (
    <aside class="rail" aria-label="Powers">
      {p.seats.map((seat, i) => {
        const h = HOUSES[seat.house];
        const d = DEEDS[h.power];
        const wait = deedWait(w, seat);
        const problem = deedProblem(w, PLAYER, i);
        const full = deedCooldown(w, PLAYER, h.power);
        const run = running.find((r) => r.id === h.power);
        return (
          <RailButton
            key={seat.house}
            icon={d.icon}
            label={d.name}
            pct={wait ? 1 - wait / Math.max(1, full) : 1}
            hotkey={DEED_KEYS[i].toUpperCase()}
            state={run ? (run.left > 0 ? `${Math.ceil(run.left / TICK_HZ)}s` : 'set') : wait > 0 ? `${Math.ceil(wait / TICK_HZ)}s` : problem ? '✕' : undefined}
            onClick={() => game.useDeed(i)}
            tone={problem && !wait ? 'blocked' : ''}
            title={`${d.name} (${DEED_KEYS[i].toUpperCase()}): ${d.blurb}${problem ? `\nNow: ${problem}.` : ''}\n${h.icon} ${h.name}: ${h.passive}`}
          />
        );
      })}
      <RailButton icon="🔭" label="Scout" pct={scoutRest ? 1 - scoutRest / BALANCE.scoutCooldown : out ? 0 : 1} hotkey="T" state={out ? '…' : scoutRest ? `${Math.ceil(scoutRest / TICK_HZ)}s` : undefined} onClick={() => game.startScout()} title="Scout (T): send a runner across the fog. Landmarks come into view, and the rival's posts become things a raid can strike." />
      {hall && (
        <RailButton
          icon="⚔️"
          label="Raid"
          pct={raidRest ? 1 - raidRest / BALANCE.raidCooldown : band ? 0 : 1}
          hotkey="R"
          state={band ? (band.phase === 'march' ? 'march' : band.phase === 'clash' ? 'fight' : 'home') : early ? '10:00' : raidRest ? `${Math.ceil(raidRest / TICK_HZ)}s` : n ? undefined : '0'}
          tone="war"
          onClick={() => game.startRaid()}
          title={`Raid (R): send your ${n} huscarls (${raidStrength(w, PLAYER, n)} strong) to burn a rival tower, outpost or stockade. They win if they are stronger than its defence. A burned post frees its land, and any landmark it held may change hands.`}
        />
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------------------------
// The build shelf: five categories, one row of cards.
// ---------------------------------------------------------------------------------------------

function costChips(type: BuildingType, cost = BUILDINGS[type].cost) {
  return Object.entries(cost).map(([g, n]) => (
    <span class="cost" key={g}>
      <img src={ICON[g]} alt={GOOD_INFO[g as Good].name} />
      {n}
    </span>
  ));
}

export function BuildShelf({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const bridgeOpen = w.players[PLAYER].rank >= BRIDGE_RANK;
  const hint = useMemo(() => (bridgeOpen ? bestBridge(w, PLAYER) : null), [bridgeOpen, Math.floor(w.tick / 50)]);
  const hinted = hint && hint.score >= 60 ? hint : null;
  // A hotkey or a placement from elsewhere brings its category forward.
  const mode = game.mode.value;
  useEffect(() => {
    if (mode.kind === 'place') buildCat.value = catOf(mode.type);
  }, [mode.kind === 'place' ? mode.type : '']);

  const visible = BUILD_CATS.filter((c) => c.id !== 'wonders' || c.types.some((t) => w.isUnlocked(PLAYER, t) || w.countBuildings(PLAYER, t, true) > 0 || workOwner(w, t) >= 0));
  const cat = visible.find((c) => c.id === buildCat.value) ?? visible[0];
  const attention = (id: string) => {
    // A dot on a category that holds something newly affordable you have never built.
    const c = BUILD_CATS.find((x) => x.id === id)!;
    return c.types.some((t) => w.isUnlocked(PLAYER, t) && !BUILDINGS[t].great && w.countBuildings(PLAYER, t, true) === 0 && w.canAffordBuilding(PLAYER, t));
  };
  const cards = cat.types.map((t) => {
    const i = BUILDINGS_ORDER.indexOf(t);
    const def = BUILDINGS[t];
    const unlocked = w.isUnlocked(PLAYER, t);
    if (def.great && !unlocked) return null;
    const holder = def.great ? workOwner(w, t) : -1;
    const begun = def.great && w.countBuildings(PLAYER, t, true) > 0;
    const affordable = w.canAffordBuilding(PLAYER, t);
    const lock = unlocked ? '' : lockLabel(w, PLAYER, t);
    const capped = def.frontier && w.frontierCount(PLAYER) >= w.frontierCap(PLAYER);
    const key = HOTKEYS[i];
    return (
      <button
        key={t}
        class={`card ${affordable || def.great ? '' : 'short'} ${unlocked && holder < 0 && !begun ? '' : 'locked'} ${def.great ? 'great' : ''}`}
        onClick={() => unlocked && holder < 0 && !begun && game.startPlacing(t)}
        aria-disabled={!unlocked || holder >= 0 || begun}
        title={def.great ? `${def.name}: ${def.blurb} Perk: ${def.great.perk} +${def.great.renown} renown.` : unlocked ? `${def.name}${key ? ` (${key})` : ''}: ${def.blurb}${def.frontier ? ` Towers held: ${w.frontierCount(PLAYER)} of ${w.frontierCap(PLAYER)} (rank up for more).` : ''}` : `${def.name}: needs ${lock}`}
      >
        {key && <span class="hotkey">{key}</span>}
        {def.frontier && unlocked && <span class={`card-count ${capped ? 'full' : ''}`} title="Towers and outposts you hold, of what your rank allows">{w.frontierCount(PLAYER)}/{w.frontierCap(PLAYER)}</span>}
        <img class="card-icon" src={icon(t)} alt="" />
        <span class="card-name">{def.name.replace(/^The /, '').replace(/^Mustering /, 'Muster ')}</span>
        <span class="card-cost">
          {holder === PLAYER ? <span class="lock">✓ Yours</span> : holder >= 0 ? <span class="lock">✗ Rival’s</span> : begun ? <span class="lock">Under way</span> : unlocked ? costChips(t, w.buildCost(PLAYER, t)) : <span class="lock">🔒 {lock}</span>}
        </span>
      </button>
    );
  });
  return (
    <nav class="shelf-wrap" aria-label="Build">
      <div class="cats" role="tablist">
        {visible.map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === cat.id} class={`cat ${c.id === cat.id ? 'on' : ''}`} onClick={() => ((buildCat.value = c.id), audio.play('click'))} title={c.name}>
            <span>{c.icon}</span>
            <small>{c.name}</small>
            {c.id !== cat.id && attention(c.id) && <i class="dot" />}
          </button>
        ))}
      </div>
      <div class="shelf">
        {cards}
        {cat.id === 'border' && (
          <button
            class={`card bridge ${bridgeOpen ? '' : 'locked'} ${hinted ? 'hinted' : ''}`}
            onClick={() => bridgeOpen && game.startBridging(hinted?.span)}
            aria-disabled={!bridgeOpen}
            title={bridgeOpen ? `Bridge (B): plank over water of up to ${BRIDGE_MAX} tiles, for ${BALANCE.bridgeCost.logs} logs and ${BALANCE.bridgeCost.stone} stone a tile.${hinted ? ' A bridge nearby would open new ground.' : ''}` : 'Bridge: needs Hamlet rank'}
          >
            <span class="hotkey">B</span>
            {hinted && <span class="card-count hint" title="A bridge nearby would open new ground">★</span>}
            <span class="card-icon glyph">🌉</span>
            <span class="card-name">Bridge</span>
            <span class="card-cost">
              {bridgeOpen ? (
                <>
                  <span class="cost"><img src={ICON.logs} alt="Logs" />{BALANCE.bridgeCost.logs}</span>
                  <span class="cost"><img src={ICON.stone} alt="Stone" />{BALANCE.bridgeCost.stone}</span>
                </>
              ) : (
                <span class="lock">🔒 Hamlet</span>
              )}
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}

/** Hotkey order follows the sim's own build menu, not the shelf's categories. */
const BUILDINGS_ORDER = BUILD_MENU;
