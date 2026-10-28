import { useEffect, useRef, useState } from 'preact/hooks';
import { icon, PLAYER, type ClaimPreview, type Game } from '../game';
import { audio } from '../audio/audio';
import { ICON } from '../render/overlay';
import { BUILDINGS, BUILD_MENU, DISCOVERIES, FOODS, GOODS, GOOD_INFO, RANK_NAMES, SKILLS, type BuildingType, type Good } from '../sim/defs';
import { NO_OWNER, territoryBox } from '../sim/territory';
import { BOONS, BOON_TIMEOUT, familyTitle } from '../sim/boons';
import { BALANCE, TICK_HZ, secs } from '../sim/balance';
import { canAfford, eventDef } from '../sim/events';
import { SEASON_NAMES, seasonOf, ticksToNextSeason } from '../sim/seasons';
import type { Family, World } from '../sim/world';
import { CREST_COLORS, plural } from '../sim/population';
import { TIER_NAMES, TRADES, tierOf, tierProgress, tradeTitle } from '../sim/trades';
import { settings, toggleMute } from '../settings';
import type { Shell } from '../shell';
import { ageYears, describeSettler, formatTime } from './describe';
import { HowTo, SettingsPanel } from './Screens';
import { DEED_KEYS, HOTKEYS } from '../input/input';
import { lockLabel } from '../sim/commands';
import { DEEDS, council, deedCost, deedOf, deedPower, deedWait, prestige } from '../sim/deeds';
import { FAIR_LOT, FAIR_VALUE, fairPrice, marketOpen } from '../sim/market';
import { mootUnderway, renownRate } from '../sim/renown';
import { OMENS } from '../sim/omens';
import { ORIGINS } from '../sim/origins';
import { workOwner } from '../sim/works';
import { workSlots } from '../sim/settlers';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Subscribe a component to the periodic world refresh (signals skip prop-identical re-renders). */
const useWorldRefresh = (game: Game) => void game.version.value;

export function Hud({ game, shell }: { game: Game; shell: Shell }) {
  return (
    <div class="hud">
      <TopBar game={game} />
      <Goals game={game} />
      <RaceBar game={game} />
      <Frontier game={game} />
      <Ledger game={game} />
      <Toasts game={game} />
      <InfoPanel game={game} />
      {game.marketOpen.value && <Market game={game} />}
      {game.mode.value.kind === 'select' && <Council game={game} />}
      {game.mode.value.kind === 'place' ? <PlaceBar game={game} type={game.mode.value.type} /> : game.mode.value.kind === 'deed' ? <DeedBar game={game} /> : <BuildBar game={game} />}
      <Banner game={game} />
      <Victory game={game} />
      {game.menuOpen.value && <PauseMenu game={game} shell={shell} />}
      {game.paused.value && !game.menuOpen.value && <div class="paused-tag">Paused</div>}
    </div>
  );
}

/** A resource plaque that bumps when its value rises. */
function Res({ good, value, warn }: { good: Good; value: number; warn?: boolean }) {
  const prev = useRef(value);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (value > prev.current) setBump((b) => b + 1);
    prev.current = value;
  }, [value]);
  return (
    <span class={`res-plaque ${warn ? 'warn' : ''}`} title={GOOD_INFO[good].name}>
      <img src={ICON[good]} alt={GOOD_INFO[good].name} />
      <b key={bump} class={bump ? 'bump' : ''}>
        {value}
      </b>
    </span>
  );
}

function TopBar({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const pop = w.population(PLAYER);
  const housing = w.housing(PLAYER);
  const hungry = w.players[PLAYER].hungry;
  const children = [...w.settlers.values()].filter((s) => s.owner === PLAYER && s.child).length;
  const idle = [...w.settlers.values()].filter((s) => s.owner === PLAYER && !s.child && s.job.kind === 'idle').length;
  const showPlanks = w.players[PLAYER].produced.planks > 0 || w.isUnlocked(PLAYER, 'sawpit');
  const showFish = w.players[PLAYER].produced.fish > 0 || w.isUnlocked(PLAYER, 'fisher');
  return (
    <header class="topbar">
      <div class="res">
        {GOODS.filter((g) => (g !== 'planks' || showPlanks) && (g !== 'fish' || showFish)).map((g) => (
          <Res key={g} good={g} value={w.stored(PLAYER, g)} warn={(g === 'berries' || g === 'fish') && hungry} />
        ))}
        <span class={`res-plaque ${pop >= housing ? 'full' : ''}`} title={`${pop} settlers (${children} children) · homes for ${housing}`}>
          <img src={ICON.people} alt="Population" />
          <b>{pop}</b>
          <small>/{housing}</small>
        </span>
        {marketOpen(w, PLAYER) && (
          <button class={`market-btn ${game.marketOpen.value ? 'on' : ''}`} onClick={() => (game.marketOpen.value = !game.marketOpen.value)} title="Market Day: sell what piles up for renown">
            ⚖️ <span>Market</span>
          </button>
        )}
        {hungry && <span class="hungry pulse">Hungry!</span>}
        {idle >= 3 && (
          <span class="idle-chip" title={`${idle} adults have nothing to do. Build workplaces (or more homes for families to grow).`}>
            💤 {idle} idle
          </span>
        )}
      </div>
      <div class="speed">
        <SeasonChip game={game} />
        <span class="clock">{formatTime(w.tick)}</span>
        <div class="seg">
          <button class={game.paused.value ? 'on' : ''} onClick={() => game.togglePause()} title="Pause (Space)" aria-label="Pause">
            ❚❚
          </button>
          {[1, 2, 3, 5].map((s) => (
            <button key={s} class={!game.paused.value && game.speed.value === s ? 'on' : ''} onClick={() => game.setSpeed(s)} aria-label={`Speed ${s}x`}>
              {s}×
            </button>
          ))}
        </div>
        <button
          class={`mute-btn ${settings.value.muted ? 'on' : ''}`}
          onClick={() => toggleMute()}
          aria-label={settings.value.muted ? 'Unmute sound' : 'Mute sound'}
          aria-pressed={settings.value.muted}
          title={`${settings.value.muted ? 'Unmute' : 'Mute'} (M)`}
        >
          {settings.value.muted ? '🔇' : '🔊'}
        </button>
        <button class="menu-btn" onClick={() => (game.menuOpen.value = true)} aria-label="Menu" title="Menu (Esc)">
          ☰
        </button>
      </div>
    </header>
  );
}

const SEASON_ICONS = ['🌱', '☀️', '🍂', '❄️'];

/** Season and settlement rank, with a countdown when winter approaches. */
function SeasonChip({ game }: { game: Game }) {
  const w = game.world;
  const season = seasonOf(w.tick);
  const left = Math.ceil(ticksToNextSeason(w.tick) / TICK_HZ);
  const warn = season === 2 && left <= 40;
  const rank = w.players[PLAYER].rank;
  return (
    <div class="season-chip">
      <span class={`rank r${rank}`} title="Settlement rank: complete each chapter to rise">
        {RANK_NAMES[rank]}
      </span>
      <span class={`season ${season === 3 ? 'winter' : ''} ${warn ? 'warn pulse' : ''}`} title={season === 3 ? 'Winter: berries sleep, folk eat more, building is slower' : `${SEASON_NAMES[season]}: ${left}s left`}>
        {SEASON_ICONS[season]} {warn ? `Winter in ${left}s` : SEASON_NAMES[season]}
      </span>
    </div>
  );
}

function Goals({ game }: { game: Game }) {
  const [open, setOpen] = useState(() => window.innerWidth > 720);
  const list = game.objectives.value;
  if (!list.length) return null;
  const current = list.find((o) => !o.done);
  const chapter = current?.chapter ?? list[list.length - 1].chapter;
  const inChapter = list.filter((o) => o.chapter === chapter);
  const doneCount = inChapter.filter((o) => o.done).length;
  const hints = settings.value.hints;
  return (
    <section class={`goals scroll ${open ? '' : 'closed'}`}>
      <button class="goals-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <img src={ICON.scroll} alt="" />
        <span class="chap">
          <small>Chapter</small>
          {chapter}
        </span>
        <span class="count">
          {doneCount}/{inChapter.length} <span class="caret">{open ? '▾' : '▸'}</span>
        </span>
      </button>
      <div class="chapter-bar">
        <div style={{ width: `${(doneCount / inChapter.length) * 100}%` }} />
      </div>
      {open ? (
        <ul>
          {inChapter.map((o) => (
            <li key={o.id} class={o.done ? 'done' : o === current ? 'next' : ''}>
              <span class="tick">{o.done ? '✔' : o === current ? '➤' : '•'}</span>
              <span class="label">
                {o.label}
                {o === current && hints && o.hint && <em>{o.hint}</em>}
              </span>
              {!o.done && o.target > 1 && (
                <span class="prog">
                  {o.id.startsWith('trade') ? `${Math.round((o.current / o.target) * 100)}%` : `${Math.min(o.current, o.target)}/${o.target}`}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        current && <div class="goals-next">➤ {current.label}</div>
      )}
    </section>
  );
}

/** A family's title and boon badges, plus where the household came from. */
function FamilyLine({ w, fam }: { w: World; fam: Family }) {
  const best = SKILLS.reduce((a, k) => (fam.skills[k] > fam.skills[a] ? k : a), SKILLS[0]);
  const craft = fam.skills[best] > 0 ? TRADES[best].titles[tierOf(fam.skills[best])] + 's' : 'folk';
  const parents = fam.parents.map((id) => w.families.get(id)?.surname).filter(Boolean);
  return (
    <div class="family-line">
      <p class="fam-title">
        The {plural(fam.surname)}, <em>{familyTitle(fam, craft)}</em>
      </p>
      {fam.boons.length > 0 && (
        <p class="boon-badges">
          {fam.boons.map((id) => (
            <span key={id} class="boon-badge" title={`${BOONS[id].name}: ${BOONS[id].blurb}`}>
              {BOONS[id].icon} {BOONS[id].name}
            </span>
          ))}
        </p>
      )}
      {parents.length === 2 && <p class="muted small">A household joining the {parents[0]} and {parents[1]} lines.</p>}
      <FamilyDeed w={w} fam={fam} />
    </div>
  );
}

/** The deed a family would lend the council, and whether it sits there. */
function FamilyDeed({ w, fam }: { w: World; fam: Family }) {
  const id = deedOf(fam);
  const seated = council(w, fam.owner).includes(fam);
  return (
    <p class="muted small fam-deed">
      Prestige {prestige(w, fam)}
      {id ? (
        <>
          {' · '}Deed: {DEEDS[id].icon} <b>{DEEDS[id].name}</b> {seated ? '(on the council)' : '(another house lends it)'}
        </>
      ) : (
        ' · No deed yet: a Journeyman in the family, or a boon, brings one'
      )}
    </p>
  );
}

/** The renown race at a glance: both scores, their rates, the goal and the clock. */
function RaceBar({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const goal = renownGoal(w);
  if (!goal) return null;
  const limit = w.scenario.timeLimit ?? 0;
  const left = limit ? Math.max(0, limit - w.tick) : Infinity;
  const row = (owner: number, label: string) => {
    const p = w.players[owner];
    const rate = renownRate(w, owner);
    const perMin = rate.landmarks + rate.land;
    const held = w.sites.filter((st) => st.heldBy === owner).length;
    return (
      <div class={`race-row ${owner === PLAYER ? 'me' : 'them'}`} title={`${label}: ${p.renown} renown · ${held} landmarks held · +${perMin}/min from landmarks and land`}>
        <span class="race-name">{label}</span>
        <div class="race-track">
          <div style={{ width: `${Math.min(100, (p.renown / goal) * 100)}%` }} />
        </div>
        <span class="race-score">
          {p.renown}
          <small>★</small>
        </span>
        <span class="race-rate">+{perMin}/m</span>
        <span class="race-rank">{RANK_NAMES[p.rank]}</span>
      </div>
    );
  };
  return (
    <section class="race" aria-label="The renown race">
      <div class="race-head">
        <span>
          First to <b>{goal.toLocaleString('en-GB')}★</b> renown
        </span>
        {mootUnderway(w) && <span class="race-moot" title="The Valley Moot: landmarks pay double">📯 Moot ×2</span>}
        {left <= secs(5 * 60) ? <span class="race-clock pulse">⏳ {formatTime(left)} left</span> : limit ? <span class="race-clock">ends {formatTime(limit)}</span> : null}
      </div>
      {w.omens.length > 0 && (
        <div class="race-omens">
          {w.omens.map((o) => (
            <span key={o} title={`${OMENS[o].name}: ${OMENS[o].blurb}`}>
              {OMENS[o].icon} {OMENS[o].name}
            </span>
          ))}
        </div>
      )}
      {row(PLAYER, 'You')}
      {w.players[1] && row(1, 'Rival')}
    </section>
  );
}

const renownGoal = (w: World) => {
  const o = [...w.scenario.objectives].reverse().find((x) => x.id.startsWith('renown-'));
  return o ? Number(o.id.slice(7)) : 0;
};

/** The council of great houses: each lends its deed, a call-down power with a cooldown. */
function Council({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const seats = council(w, PLAYER);
  if (!seats.length) return null;
  return (
    <section class="council" aria-label="Great Houses">
      <span class="council-label">Great Houses</span>
      {seats.map((fam, i) => {
        const id = deedOf(fam)!;
        const d = DEEDS[id];
        const wait = deedWait(w, fam);
        const cost = deedCost(w, PLAYER, id);
        const ok = canAfford(w, PLAYER, cost);
        const ready = wait === 0 && ok;
        const pct = wait ? 1 - wait / Math.max(1, d.cooldown) : 1;
        const costText = Object.entries(cost).map(([g, n]) => `${n} ${g}`).join(', ');
        return (
          <button
            key={fam.id}
            class={`deed ${ready ? 'ready' : ''}`}
            disabled={!ready}
            onClick={() => game.useDeed(fam.id)}
            title={`${d.name} (${DEED_KEYS[i].toUpperCase()}), lent by the ${plural(fam.surname)}: ${d.blurb}${costText ? ` Costs ${costText}.` : ''}${wait ? ` Ready in ${Math.ceil(wait / TICK_HZ)}s.` : ''}`}
          >
            <span class="deed-ring" style={{ background: `conic-gradient(var(--gold) ${pct * 360}deg, rgba(0,0,0,0.35) 0)` }}>
              <span class="deed-icon">{d.icon}</span>
            </span>
            <span class="deed-name">{d.name}</span>
            <span class="deed-fam">
              <span class="crest" style={{ background: hex(CREST_COLORS[fam.color]) }} />
              {fam.surname}
              {deedPower(fam) > 1 && <b title="A Master's deed: stronger"> ★</b>}
            </span>
            {wait > 0 ? <span class="deed-wait">{Math.ceil(wait / TICK_HZ)}s</span> : !ok ? <span class="deed-wait">{costText}</span> : <span class="hotkey">{DEED_KEYS[i].toUpperCase()}</span>}
          </button>
        );
      })}
    </section>
  );
}

/** Choosing where a targeted deed lands. */
function DeedBar({ game }: { game: Game }) {
  const mode = game.mode.value;
  if (mode.kind !== 'deed') return null;
  const d = DEEDS[mode.deed];
  const pv = game.deedPreview.value;
  const base =
    mode.deed === 'expedition'
      ? 'Tap a spot beyond your border (up to 18 tiles out) for the outpost'
      : mode.deed === 'festival'
        ? 'Tap a spot at your border: your influence surges there for a minute'
        : 'Tap the construction site to raise';
  const hint = pv?.problem || (pv?.claim ? claimText(pv.claim) : base);
  const tone = pv?.problem ? 'bad' : pv?.claim?.sites.length ? 'great' : 'ok';
  return (
    <div class="placebar panel">
      <span class="deed-icon big">{d.icon}</span>
      <div class="ptext">
        <strong>{d.name}</strong>
        <span class={tone}>{hint}</span>
      </div>
      <div class="pbtns">
        {game.touchPlacing.value && pv && (
          <button class="primary" disabled={!!pv.problem} onClick={() => game.confirmDeed()}>
            ✓ Here
          </button>
        )}
        <button onClick={() => game.cancel()}>✕</button>
      </div>
    </div>
  );
}

/** Market Day: sell a lot of anything for renown, or set a standing order; prices drop as you sell and recover. */
function Market({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const routes = w.players[PLAYER].routes;
  return (
    <section class="market panel" aria-label="Market Day">
      <header>
        <strong>⚖️ Market Day</strong>
        <button class="close" onClick={() => (game.marketOpen.value = false)} aria-label="Close">
          ✕
        </button>
      </header>
      <p class="muted small">Traders take {FAIR_LOT} at a time; each sale floods the market for a while. A standing order sells whatever is above the reserve, every 20 s.</p>
      {GOODS.map((g) => {
        const price = fairPrice(w, PLAYER, g);
        const have = w.stored(PLAYER, g);
        const keep = routes[g];
        const reserve = FOODS.includes(g) ? Math.max(40, Math.ceil(w.population(PLAYER) / 10) * 10) : 60;
        return (
          <div class="mk-row" key={g}>
            <img src={ICON[g]} alt={GOOD_INFO[g].name} />
            <span class="mk-have">{have}</span>
            <span class={`mk-price ${price < FAIR_VALUE[g] ? 'low' : ''}`}>{price}★</span>
            <button disabled={have < FAIR_LOT || price <= 0} onClick={() => game.sell(g)}>
              Sell {FAIR_LOT}
            </button>
            <button
              class={`mk-route ${keep !== undefined ? 'on' : ''}`}
              onClick={() => game.setTrade(g, keep === undefined ? reserve : null)}
              title={keep !== undefined ? `Selling everything above ${keep}. Click to stop.` : `Keep selling ${GOOD_INFO[g].name.toLowerCase()} above a reserve of ${reserve}`}
            >
              {keep !== undefined ? `↻ above ${keep}` : '↻ Order'}
            </button>
          </div>
        );
      })}
    </section>
  );
}

/**
 * The ledger: decisions wait here as sealed letters instead of popping up over the game.
 * Open one whenever it suits you; each shows how long it will wait before it is settled
 * sensibly on your behalf. Only the very first decision of a game opens by itself, so you
 * learn where letters arrive.
 */
function Ledger({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const p = w.players[PLAYER];
  const items: LedgerItem[] = [];
  if (p.event) {
    const def = eventDef(p.event.def);
    if (def) items.push({ key: `e${p.event.id}`, icon: def.icon, title: def.title, left: (p.event.expires - w.tick) / BALANCE.eventTimeout, secs: Math.ceil((p.event.expires - w.tick) / TICK_HZ) });
  }
  for (const o of p.offers) {
    const fam = w.families.get(o.familyId);
    if (!fam) continue;
    const live = o.expires > 0;
    items.push({ key: `b${o.id}`, icon: '🎁', title: `A gift for the ${plural(fam.surname)}`, left: live ? (o.expires - w.tick) / BOON_TIMEOUT : 1, secs: live ? Math.ceil((o.expires - w.tick) / TICK_HZ) : 0, waiting: !live, crest: fam.color });
  }
  const open = game.ledgerOpen.value;
  const openItem = items.find((i) => i.key === open);
  useEffect(() => {
    // The first decision of the game opens itself; after that, letters wait to be opened.
    if (!game.ledgerTaught && items.some((i) => !i.waiting)) {
      game.ledgerTaught = true;
      game.ledgerOpen.value = items.find((i) => !i.waiting)!.key;
    }
    if (open && !openItem) game.ledgerOpen.value = null;
  });
  if (!items.length) return null;
  return (
    <section class="ledger" aria-label="Decisions waiting">
      {openItem ? (
        openItem.key.startsWith('e') ? (
          <EventLetter game={game} />
        ) : (
          <BoonLetter game={game} offerId={Number(openItem.key.slice(1))} />
        )
      ) : (
        <>
          <span class="ledger-label">Letters</span>
          {items.map((i) => (
            <button
              key={i.key}
              class={`letter ${i.waiting ? 'waiting' : ''} ${!i.waiting && i.secs <= 15 ? 'urgent' : ''}`}
              disabled={i.waiting}
              onClick={() => {
                audio.play('click');
                game.ledgerOpen.value = i.key;
              }}
              title={i.waiting ? 'Waiting its turn' : `${i.title}: ${i.secs}s before it is settled for you`}
            >
              <span class="seal" style={{ background: `conic-gradient(var(--gold) ${Math.max(0, i.left) * 360}deg, rgba(0,0,0,0.25) 0)` }}>
                <span>{i.icon}</span>
              </span>
              <span class="letter-title">{i.title}</span>
              {i.crest !== undefined && <span class="crest" style={{ background: hex(CREST_COLORS[i.crest]) }} />}
            </button>
          ))}
        </>
      )}
    </section>
  );
}

interface LedgerItem {
  key: string;
  icon: string;
  title: string;
  /** 0..1 of the waiting time left. */
  left: number;
  secs: number;
  waiting?: boolean;
  crest?: number;
}

function LetterHead({ game, icon, title, sub, left }: { game: Game; icon: string; title: string; sub?: string; left: number }) {
  return (
    <>
      <header class="letter-head">
        <span class="ev-icon">{icon}</span>
        <div>
          {sub && <small>{sub}</small>}
          <strong>{title}</strong>
        </div>
        <button class="later" onClick={() => (game.ledgerOpen.value = null)} title="Decide later" aria-label="Decide later">
          Later
        </button>
      </header>
      <div class="boon-timer">
        <div style={{ width: `${Math.max(0, left) * 100}%` }} />
      </div>
    </>
  );
}

/** A messenger's news with a choice attached. Resolves cautiously if left too long. */
function EventLetter({ game }: { game: Game }) {
  const w = game.world;
  const ev = w.players[PLAYER].event;
  const def = ev && eventDef(ev.def);
  if (!ev || !def) return null;
  return (
    <div class="letter-open" key={ev.id}>
      <LetterHead game={game} icon={def.icon} title={def.title} left={(ev.expires - w.tick) / BALANCE.eventTimeout} />
      <p class="ev-text">{def.text}</p>
      <div class="ev-options">
        {def.options.map((o, i) => {
          const ok = canAfford(w, PLAYER, o.cost);
          const d = o.describe ? o.describe(w, PLAYER, ev.data ?? []) : o;
          return (
            <button
              key={i}
              class={`ev-opt ${i === def.options.length - 1 ? 'quiet' : ''}`}
              disabled={!ok}
              onClick={() => {
                game.ledgerOpen.value = null;
                game.chooseEvent(ev.id, i);
              }}
            >
              <strong>{d.label}</strong>
              <small>{d.detail}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Spore-style evolution picks: choose how a family grows. */
function BoonLetter({ game, offerId }: { game: Game; offerId: number }) {
  const w = game.world;
  const o = w.players[PLAYER].offers.find((x) => x.id === offerId);
  const fam = o && w.families.get(o.familyId);
  if (!o || !fam) return null;
  return (
    <div class="letter-open boon-letter" key={o.id}>
      <LetterHead game={game} icon="🎁" sub={o.reason} title={`Choose a gift for the ${fam.surname} family`} left={(o.expires - w.tick) / BOON_TIMEOUT} />
      <div class="boon-cards">
        {o.choices.map((id, i) => (
          <button
            key={id}
            class="boon-card"
            style={{ animationDelay: `${i * 90}ms` }}
            onClick={() => {
              game.ledgerOpen.value = null;
              game.chooseBoon(o.id, i);
            }}
          >
            <span class="bc-icon">{BOONS[id].icon}</span>
            <strong>{BOONS[id].name}</strong>
            <span class="bc-blurb">{BOONS[id].blurb}</span>
            {BOONS[id].deed && (
              <span class="bc-deed">
                Deed: {DEEDS[BOONS[id].deed!].icon} {DEEDS[BOONS[id].deed!].name}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The "where next?" list: unclaimed discoveries and landmarks you don't hold, nearest first. */
function Frontier({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const open = w.sites.filter((s) => s.revealed & 1 && (s.claimedBy === NO_OWNER || (DISCOVERIES[s.kind].renown && s.heldBy !== PLAYER)));
  const mine = w.sites.filter((s) => s.heldBy === PLAYER).length;
  if (!open.length && !mine) return null;
  const box = territoryBox(w, PLAYER);
  const gap = (x: number, y: number) => {
    let best = Infinity;
    for (let ty = box.y0; ty <= box.y1; ty += 1)
      for (let tx = box.x0; tx <= box.x1; tx += 1) if (w.territory[w.idx(tx, ty)] === PLAYER) best = Math.max(0, Math.min(best, Math.max(Math.abs(tx - x), Math.abs(ty - y))));
    return best;
  };
  const rows = open.map((s) => ({ s, d: gap(s.x, s.y) })).sort((a, b) => a.d - b.d).slice(0, 4);
  return (
    <section class="frontier panel" aria-label="Out in the wild">
      <h3>
        Out in the wild {mine > 0 && <small class="held">· you hold {mine} landmark{mine > 1 ? 's' : ''}</small>}
      </h3>
      {rows.map(({ s, d }) => {
        const def = DISCOVERIES[s.kind];
        return (
          <button key={s.id} class={`frontier-row ${s.heldBy > 0 ? 'theirs' : ''}`} onClick={() => game.focusSite(s.id)} title={def.blurb}>
            <span class="fr-icon">{def.icon}</span>
            <span class="fr-name">
              {def.name}
              {def.renown ? <small> +{def.renown}★/m{s.heldBy > 0 ? ' · rival’s' : ''}</small> : null}
            </span>
            <span class="fr-dist">{d} tiles out</span>
          </button>
        );
      })}
    </section>
  );
}

function costChips(type: BuildingType, cost = BUILDINGS[type].cost) {
  return Object.entries(cost).map(([g, n]) => (
    <span class="cost" key={g}>
      <img src={ICON[g]} alt={GOOD_INFO[g as Good].name} />
      {n}
    </span>
  ));
}

function BuildBar({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  return (
    <nav class="buildbar shelf" aria-label="Build">
      {BUILD_MENU.map((t, i) => {
        const def = BUILDINGS[t];
        const unlocked = w.isUnlocked(PLAYER, t);
        // Great Works appear once the settlement can raise them, marked with who has them.
        if (def.great && !unlocked) return null;
        const holder = def.great ? workOwner(w, t) : -1;
        const begun = def.great && w.countBuildings(PLAYER, t, true) > 0;
        const affordable = w.canAffordBuilding(PLAYER, t);
        const lock = unlocked ? '' : lockLabel(w, PLAYER, t);
        const reqText = `Needs a ${lock}`;
        return (
          <button
            key={t}
            class={`card ${affordable || def.great ? '' : 'short'} ${unlocked && holder < 0 && !begun ? '' : 'locked'} ${def.great ? 'great' : ''}`}
            onClick={() => unlocked && holder < 0 && !begun && game.startPlacing(t)}
            aria-disabled={!unlocked || holder >= 0 || begun}
            title={def.great ? `${def.name}: ${def.blurb} Perk: ${def.great.perk} +${def.great.renown} renown.` : unlocked ? `${def.name} (${HOTKEYS[i]}): ${def.blurb}` : `${def.name}: ${reqText}`}
          >
            {HOTKEYS[i] && <span class="hotkey">{HOTKEYS[i]}</span>}
            <img class="card-icon" src={icon(t)} alt="" />
            <span class="card-name">{def.name.replace(/^The /, '')}</span>
            <span class="card-cost">
              {holder === PLAYER ? <span class="lock">✓ Yours</span> : holder >= 0 ? <span class="lock">✗ Rival’s</span> : begun ? <span class="lock">Under way</span> : unlocked ? costChips(t, w.buildCost(PLAYER, t)) : <span class="lock">🔒 {lock.replace(/^Journeyman /, '')}</span>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function PlaceBar({ game, type }: { game: Game; type: BuildingType }) {
  const def = BUILDINGS[type];
  const g = game.ghost.value;
  const touch = game.touchPlacing.value;
  const job = def.job;
  const what = job?.kind === 'gather' ? (job.node === 'tree' ? 'trees' : job.node === 'rock' ? 'rocks' : 'berry bushes') : job?.kind === 'plant' ? 'trees' : '';
  let hint: string | undefined;
  if (!g) hint = touch ? 'Tap the ground to choose a spot' : 'Move over the ground to choose a spot';
  else if (!g.ok) hint = g.reason;
  else if (g.inRange !== undefined) hint = g.inRange === 0 ? `No ${what} in reach here` : `${g.inRange} ${what} in reach`;
  else if (g.claim) hint = claimText(g.claim);
  else hint = touch ? 'Looks good!' : 'Click to build · Shift-click to keep building';
  const tone = g && !g.ok ? 'bad' : g?.inRange === 0 || g?.claim?.gained === 0 ? 'warn' : g?.claim?.sites.length ? 'great' : 'ok';
  return (
    <div class="placebar panel">
      <img src={icon(type)} alt="" />
      <div class="ptext">
        <strong>{def.name}</strong>
        <span class={tone}>{hint}</span>
      </div>
      <div class="pbtns">
        {touch && (
          <button class="primary" disabled={!g?.ok} onClick={() => game.confirmPlacement()}>
            ✓ Build here
          </button>
        )}
        <button onClick={() => game.cancel()}>✕</button>
      </div>
    </div>
  );
}

/** "+86 land (31 from your rival) · takes 🗿 Standing Stones!" */
function claimText(c: ClaimPreview): string {
  if (!c.gained) return 'Wins no new land here: try nearer the edge, or the rival’s side';
  return `+${c.gained} land${c.fromRival ? ` (${c.fromRival} from your rival)` : ''}${c.sites.length ? ` · takes ${c.sites.join(', ')}!` : ''}`;
}

function SkillBars({ skills }: { skills: Record<string, number> }) {
  return (
    <div class="skills">
      {SKILLS.map((k) => {
        const xp = skills[k];
        const t = tierOf(xp);
        return (
          <div class="skill" key={k} title={`${xp} XP`}>
            <span class="sk-name">{TRADES[k].name}</span>
            <span class="sk-tier">{xp > 0 ? tradeTitle(k, t) : '—'}</span>
            <div class="sk-bar">
              <div style={{ width: `${Math.round(tierProgress(xp) * 100)}%` }} class={`t${t}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InfoPanel({ game }: { game: Game }) {
  useWorldRefresh(game);
  const sel = game.selection.value;
  const [confirm, setConfirm] = useState<number | null>(null);
  if (!sel) return null;
  const w = game.world;

  if (sel.kind === 'settler') {
    const s = w.settlers.get(sel.id);
    if (!s) return null;
    const fam = w.families.get(s.familyId);
    return (
      <aside class="info panel">
        <button class="close" onClick={() => game.cancel()} aria-label="Close">
          ✕
        </button>
        <h3>
          <span class="crest" style={{ background: fam ? hex(CREST_COLORS[fam.color]) : '#888' }} />
          {s.name} {fam?.surname}
        </h3>
        <p class="sub">
          {s.child ? 'Child' : s.elder ? 'Elder (teaches the family)' : 'Adult'} · age {ageYears(s)}
        </p>
        <p class="doing">{describeSettler(w, s)}</p>
        {fam && <FamilyLine w={w} fam={fam} />}
        {s.spouseId > 0 && w.settlers.get(s.spouseId) && <p class="muted small">Married to {w.settlers.get(s.spouseId)!.name}</p>}
        {!s.child && <SkillBars skills={s.skills} />}
        {s.child && fam && <p class="muted small">Will inherit {BALANCE.inheritPct + (fam.mods.teach ?? 0)}% of the {fam.surname} family’s craft on coming of age.</p>}
      </aside>
    );
  }

  const b = w.buildings.get(sel.id);
  if (!b) return null;
  const def = BUILDINGS[b.type];
  const worker = b.workerId ? w.settlers.get(b.workerId) : undefined;
  const fam = b.familyId ? w.families.get(b.familyId) : undefined;
  const progress = b.done ? 1 : b.work / b.workNeeded;
  const trade = def.job ? TRADES[def.job.skill] : null;
  return (
    <aside class="info panel">
      <button class="close" onClick={() => game.cancel()} aria-label="Close">
        ✕
      </button>
      <h3>
        <img class="h-icon" src={icon(b.type)} alt="" />
        {def.name}
        {trade && b.tier > 0 && <span class={`tier-badge t${b.tier}`}>{trade.titles[b.tier]}</span>}
      </h3>
      <p class={`sub ${b.alert ? 'alert' : ''}`}>{b.done ? b.status || def.blurb : 'Construction site'}</p>
      {def.great && (
        <p class="great-perk">
          {b.done ? 'Perk' : 'When finished'}: {def.great.perk} {!b.done && `+${def.great.renown} renown, if your rival doesn’t finish theirs first.`}
        </p>
      )}
      {!b.done && (
        <>
          <div class="bar">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p class="mats">
            {Object.entries(b.cost).map(([g, n]) => (
              <span key={g}>
                <img src={ICON[g]} alt="" /> {b.delivered[g as Good]}/{n}
              </span>
            ))}
          </p>
          <p class="sub">{b.status}</p>
        </>
      )}
      {b.done && def.job && (
        <div class="worker">
          {worker ? (
            <>
              <p>
                Worker: <strong>{worker.name} {w.families.get(worker.familyId)?.surname ?? ''}</strong>
                <span class="muted small">
                  {' '}
                  · crew {[...w.settlers.values()].filter((o) => o.job.kind === 'work' && o.job.buildingId === b.id).length}/{workSlots(b)}
                </span>
              </p>
              {trade && (
                <div class="skill">
                  <span class="sk-name">{trade.name}</span>
                  <span class="sk-tier">{TIER_NAMES[tierOf(worker.skills[trade.skill])]}</span>
                  <div class="sk-bar">
                    <div class={`t${tierOf(worker.skills[trade.skill])}`} style={{ width: `${Math.round(tierProgress(worker.skills[trade.skill]) * 100)}%` }} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <p class="muted">Waiting for a free adult</p>
          )}
        </div>
      )}
      {b.done && def.job && def.job.kind !== 'plant' && (
        <p class="mats">
          {def.job.kind === 'process' && (
            <span title="Input">
              <img src={ICON[def.job.input]} alt="" /> {b.stock[def.job.input]} in
            </span>
          )}
          <span title="Ready for pickup">
            <img src={ICON[def.job.good]} alt="" /> {b.stock[def.job.good]} ready
          </span>
        </p>
      )}
      {def.storage && b.done && (
        <p class="mats">
          {GOODS.map((g) => (
            <span key={g}>
              <img src={ICON[g]} alt="" /> {b.stock[g]}
            </span>
          ))}
        </p>
      )}
      {def.housing && (
        <p>
          {fam ? (
            <>
              <span class="crest" style={{ background: hex(CREST_COLORS[fam.color]) }} /> Home of the {fam.surname} family
            </>
          ) : b.done ? (
            'Empty: a family will move in when there are berries to spare'
          ) : (
            'Will house a new family'
          )}
        </p>
      )}
      {fam && <SkillBars skills={fam.skills} />}
      {b.type !== 'wagon' && (
        <button
          class={`danger ${confirm === b.id ? 'armed' : ''}`}
          onClick={() => {
            if (confirm === b.id) {
              game.demolish(b.id);
              setConfirm(null);
            } else setConfirm(b.id);
          }}
        >
          {confirm === b.id ? 'Tap again to confirm' : b.done ? 'Demolish' : 'Cancel construction'}
        </button>
      )}
    </aside>
  );
}

function Toasts({ game }: { game: Game }) {
  return (
    <div class="toasts" aria-live="polite">
      {game.toasts.value.map((t) => (
        <div key={t.id} class={`toast ${t.tone}`}>
          <img src={t.icon} alt="" />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

function Banner({ game }: { game: Game }) {
  const b = game.banner.value;
  if (!b) return null;
  return (
    <div class="banner" role="status">
      <div class="banner-ribbon">
        <h2>{b.title}</h2>
        <p>{b.sub}</p>
      </div>
    </div>
  );
}

const SOURCE_NAMES: Record<string, string> = {
  landmarks: 'Landmarks',
  land: 'Land',
  discoveries: 'Discoveries',
  masters: 'Masters',
  goals: 'Goals',
  events: 'Events',
  deeds: 'Deeds',
  legends: 'Legends',
  works: 'Great Works',
  trade: 'Market Day',
};

/** Honours for how the game was played: a reason to try another way next time. */
function Awards({ w, won }: { w: World; won: boolean }) {
  const me = w.players[PLAYER];
  const works = BUILD_MENU.filter((t) => BUILDINGS[t].great && workOwner(w, t) === PLAYER).length;
  const outposts = w.countBuildings(PLAYER, 'outpost');
  const list: [string, string, string][] = [];
  if (won && me.maxDeficit >= 150) list.push(['⚡', 'The Comeback', `Won after trailing by ${me.maxDeficit}`]);
  if (won && w.tick < 28 * 60 * TICK_HZ) list.push(['⏱️', 'Swift Renown', `Won in ${formatTime(w.tick)}`]);
  if (me.taken >= 3) list.push(['⚑', 'Landmark Lord', `${me.taken} landmarks taken from your rival`]);
  if (works >= 2) list.push(['🏛️', 'Wonder Builder', `${works} Great Works raised`]);
  if (me.legends.length >= 3) list.push(['🕯️', 'Keeper of Legends', `${me.legends.length} legends`]);
  if ((me.renownBy.trade ?? 0) >= 150) list.push(['⚖️', 'Merchant Prince', `${me.renownBy.trade} renown from Market Day`]);
  if (outposts >= 4) list.push(['🧭', 'Pathfinder', `${outposts} outposts`]);
  if (me.deedsUsed >= 25) list.push(['✦', 'Great Houses', `${me.deedsUsed} family deeds`]);
  if (!list.length) return null;
  return (
    <div class="awards">
      {list.slice(0, 4).map(([icon, name, why]) => (
        <span class="award" key={name} title={why}>
          <b>{icon}</b> {name}
          <small>{why}</small>
        </span>
      ))}
    </div>
  );
}

function Victory({ game }: { game: Game }) {
  useWorldRefresh(game);
  const v = game.victory.value;
  if (!v) return null;
  const w = game.world;
  const me = w.players[PLAYER];
  const them = w.players[1];
  const won = v.winner === PLAYER;
  const fams = [...w.families.values()].filter((f) => f.owner === PLAYER);
  const greatest = fams.sort((a, b) => prestige(w, b) - prestige(w, a))[0];
  const sources = Object.entries(me.renownBy).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const works = BUILD_MENU.filter((t) => BUILDINGS[t].great && workOwner(w, t) === PLAYER);
  return (
    <div class="modal-wrap">
      <div class="modal panel celebrate report">
        <img class="modal-icon" src={ICON.hut} alt="" />
        <h2>{won ? `${v.scenario}: your folk are renowned!` : 'Your rival is the valley’s renowned town'}</h2>
        <p>
          {v.byTime ? 'The valley gathered at the end of the season to judge. ' : ''}
          After {formatTime(w.tick)}: <b>{me.renown}★</b> to your rival’s <b>{them?.renown ?? 0}★</b>.
        </p>
        <Awards w={w} won={won} />
        <div class="report-grid">
          <div>
            <h4>Where your renown came from</h4>
            {sources.map(([k, n]) => (
              <div class="rep-row" key={k}>
                <span>{SOURCE_NAMES[k] ?? k}</span>
                <div class="rep-bar">
                  <div style={{ width: `${Math.round(((n ?? 0) / Math.max(1, me.renown)) * 100)}%` }} />
                </div>
                <b>{n}</b>
              </div>
            ))}
          </div>
          <div>
            <h4>The chronicle</h4>
            <ul class="chronicle">
              {greatest && (
                <li>
                  Greatest house: the {plural(greatest.surname)} ({familyTitle(greatest, 'folk')})
                </li>
              )}
              {me.origin && (
                <li>
                  Founded by {me.origin === 'dynasty' ? 'your dynasty' : ORIGINS[me.origin].name}
                  {them?.origin ? `, against ${ORIGINS[them.origin].name}` : ''}
                </li>
              )}
              <li>
                {w.population(PLAYER)} folk in {fams.length} households · {me.deedsUsed} deeds done
              </li>
              <li>
                {me.taken} landmark{me.taken === 1 ? '' : 's'} taken from your rival
              </li>
              {works.length > 0 && <li>Raised {works.map((t) => BUILDINGS[t].name).join(' and ')}</li>}
              {me.legends.slice(0, 4).map((l) => (
                <li key={l.tick}>
                  Legend: {l.surname ? `${l.name} ${l.surname}` : l.name}, Master of {TRADES[l.skill].name.toLowerCase()}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {won && game.earned.value && (
          <p class="dynasty-note">
            👑 The {plural(game.earned.value.surname)} will be remembered
            {game.earned.value.generation > 1 ? ` (generation ${game.earned.value.generation})` : ''}. Found your next valley with them from New Game.
          </p>
        )}
        <p class="muted">{won ? 'Keep building as long as you like.' : 'Your folk carry on. A new valley awaits whenever you want a rematch.'}</p>
        <button class="primary big" onClick={() => (game.victory.value = null)}>
          Keep playing
        </button>
      </div>
    </div>
  );
}

function PauseMenu({ game, shell }: { game: Game; shell: Shell }) {
  const [panel, setPanel] = useState<null | 'settings' | 'howto'>(null);
  const saved = game.lastSaved.value;
  if (panel === 'settings') return <SettingsPanel onClose={() => setPanel(null)} />;
  if (panel === 'howto') return <HowTo onClose={() => setPanel(null)} />;
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && (game.menuOpen.value = false)}>
      <div class="modal panel pause">
        <img class="logo tiny" src="/assets/ui/logo.png" alt="FirstFolk" />
        <nav class="title-menu">
          <button class="plaque primary" onClick={() => (game.menuOpen.value = false)}>
            <span class="pl-title">Resume</span>
          </button>
          <button class="plaque" onClick={() => game.save(true)}>
            <span class="pl-title">Save game</span>
            <span class="pl-sub">{saved ? `Last saved ${new Date(saved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Also saves automatically'}</span>
          </button>
          <button class="plaque" onClick={() => setPanel('howto')}>
            <span class="pl-title">How to Play</span>
          </button>
          <button class="plaque" onClick={() => setPanel('settings')}>
            <span class="pl-title">Settings</span>
          </button>
          <button class="plaque" onClick={() => shell.quitToTitle()}>
            <span class="pl-title">Save &amp; quit to title</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
