import { useEffect, useState } from 'preact/hooks';
import { icon, PLAYER, type ClaimPreview, type Game } from '../game';
import { audio } from '../audio/audio';
import { ICON } from '../render/overlay';
import { CALLINGS, callingTitle } from '../sim/callings';
import { VALLEYS } from '../sim/mapgen';
import { ORIGIN_IDS } from '../sim/origins';
import { bridgeCost } from '../sim/bridges';
import { BUILDINGS, BUILD_MENU, GOODS, GOOD_INFO, type BuildingType, type Good } from '../sim/defs';
import { NO_OWNER } from '../sim/territory';
import { HOUSES, HOUSE_TIMEOUT } from '../sim/houses';
import { BALANCE, TICK_HZ } from '../sim/balance';
import { canAfford, eventDef } from '../sim/events';
import type { World } from '../sim/world';
import { CREST_COLORS, plural } from '../sim/population';
import { TRADES, tierOf } from '../sim/trades';
import type { Shell } from '../shell';
import { describeSettler, formatTime } from './describe';
import { HowTo, SettingsPanel } from './Screens';
import { DEEDS } from '../sim/deeds';
import { steadingsOf } from '../sim/steadings';
import { homeLevelName, prosperity } from '../sim/prosperity';
import { crownPct } from '../sim/crown';
import { SAGA } from '../sim/saga';
import { ORIGINS } from '../sim/origins';
import { workOwner } from '../sim/works';
import { workSlots } from '../sim/settlers';
import { defenceOf, hireProblem, hireStrength, huscarls, raidStrength } from '../sim/warfare';

const plural_ = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

import { BuildShelf, ChronicleSheet, GoalsSheet, Rail, Status, TopBar, TownSheet, ValleySheet, useWorldRefresh } from './chrome';

export function Hud({ game, shell }: { game: Game; shell: Shell }) {
  const spectating = game.spectating;
  const mode = game.mode.value;
  return (
    <div class={`hud ${spectating ? 'spectating' : ''}`}>
      <TopBar game={game} />
      {!spectating && <Status game={game} />}
      {/* Alerts and news share one column under the bar, so they can never overlap each other or the race. */}
      <div class="notices">
        <Threats game={game} />
        <ValleySheet game={game} />
        <Toasts game={game} />
      </div>
      <TownSheet game={game} />
      <GoalsSheet game={game} />
      <ChronicleSheet game={game} />
      {!spectating && <Ledger game={game} />}
      <InfoPanel game={game} />
      {spectating && <div class="watch-chip">👁 Watching two towns play. Press Esc for the menu</div>}
      {!spectating && mode.kind === 'select' && <Rail game={game} />}
      {spectating ? null : mode.kind === 'place' ? <PlaceBar game={game} type={mode.type} /> : mode.kind === 'deed' ? <DeedBar game={game} /> : mode.kind === 'raid' ? <RaidBar game={game} /> : mode.kind === 'scout' ? <ScoutBar game={game} /> : mode.kind === 'bridge' ? <BridgeBar game={game} /> : <BuildShelf game={game} />}
      <StoryCard game={game} />
      <Banner game={game} />
      <Victory game={game} shell={shell} />
      {game.menuOpen.value && <PauseMenu game={game} shell={shell} />}
      {game.paused.value && !game.menuOpen.value && <div class="paused-tag">Paused</div>}
    </div>
  );
}

/** Hired Spears: ale and tools for strength in this fight, bigger the richer the homes. */
function HireButton({ game, done }: { game: Game; done: boolean }) {
  const w = game.world;
  const problem = hireProblem(w, PLAYER);
  const cost = Object.entries(BALANCE.hireCost).map(([g, n]) => `${n} ${GOOD_INFO[g as Good].icon}`).join(' ');
  return (
    <button class="rally hire" disabled={!!problem} onClick={() => game.hire()} title={done ? 'Spears already hired for this fight' : problem || `Hire spears (H): +${hireStrength(w, PLAYER)} strength for ${cost}`}>
      {done ? `💰 +${hireStrength(w, PLAYER)}` : `💰 Hire`}
      {!problem && <small>{cost}</small>}
    </button>
  );
}

/** Raids on your posts: the march (with its odds), then the clash itself, live, with a way to join in. */
function Threats({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const bands = w.warbands.filter((b) => b.phase !== 'home' && w.buildings.get(b.targetId)?.owner === PLAYER);
  const mine = w.warbands.find((b) => b.owner === PLAYER && b.phase === 'clash');
  if (!bands.length && !mine) return null;
  const rest = Math.max(0, w.players[PLAYER].rallyReady - w.tick);
  const tug = (band: (typeof bands)[number], attackerIsMe: boolean) => {
    const c = band.clash!;
    // The bar always reads from your side: gold fills as you win the line.
    const youPct = Math.round((attackerIsMe ? c.line : 1000 - c.line) / 10);
    return (
      <div class="tug" title={`${c.attack} against ${c.defence}`}>
        <div class="tug-bar">
          <div class={attackerIsMe ? 'atk' : 'def'} style={{ width: `${youPct}%` }} />
        </div>
        <span class="tug-nums">
          {attackerIsMe ? c.attack : c.defence} <small>vs</small> {attackerIsMe ? c.defence : c.attack}
        </span>
      </div>
    );
  };
  return (
    <section class="threats" aria-label="Raids under way">
      {bands.map((band) => {
        const t = w.buildings.get(band.targetId)!;
        const secsLeft = Math.ceil(((band.path.length - band.step) * 1000) / BALANCE.adultSpeed / TICK_HZ);
        const def = defenceOf(w, t);
        const c = band.clash;
        const who = band.owner === NO_OWNER ? 'Reavers' : 'Rival raiders';
        if (c)
          return (
            <div key={band.id} class={`threat clash ${c.line > 500 ? 'losing' : 'holding'}`}>
              <button class="threat-look" onClick={() => game.lookAt(t.x, t.y)} title="Look">
                <span class="threat-icon">⚔</span>
                <span>
                  <strong>{who} are at your {BUILDINGS[t.type].name}!</strong>
                  {tug(band, false)}
                </span>
              </button>
              <span class="clash-btns">
                <button class="rally" disabled={c.rallied || rest > 0} onClick={() => game.rally()} title="Call every free hand near the post to its defence (G)">
                  {c.rallied ? `📯 +${c.rally}` : rest > 0 ? `📯 ${Math.ceil(rest / TICK_HZ)}s` : '📯 Rally'}
                  {!c.rallied && !rest && <span class="hotkey">G</span>}
                </button>
                <HireButton game={game} done={!!c.hiredDef} />
              </span>
            </div>
          );
        return (
          <button key={band.id} class={`threat ${band.strength >= def ? 'losing' : 'holding'}`} onClick={() => game.lookAt(t.x, t.y)} title="Look">
            <span class="threat-icon">⚔</span>
            <span>
              <strong>{who}</strong> → your {BUILDINGS[t.type].name} in {secsLeft}s
              <span class="threat-odds">
                {band.strength} against your {def}: {band.strength > def ? 'it will burn unless help comes' : band.strength === def ? 'a coin toss' : 'it should hold'}. Be ready to Rally (G)
              </span>
            </span>
          </button>
        );
      })}
      {mine?.clash && (
        <div class="threat clash mine">
          <button class="threat-look" onClick={() => game.lookAt(w.buildings.get(mine.targetId)?.x ?? 0, w.buildings.get(mine.targetId)?.y ?? 0)} title="Look">
            <span class="threat-icon">⚔</span>
            <span>
              <strong>Your huscarls are storming their {BUILDINGS[w.buildings.get(mine.targetId)?.type ?? 'lookout'].name}!</strong>
              {tug(mine, true)}
            </span>
          </button>
          <span class="clash-btns">
            <button class="rally" disabled={mine.clash.surged} onClick={() => game.rally()} title="Throw everything in: +30% strength for this clash (G)">
              {mine.clash.surged ? `🔥 +${mine.clash.surge}` : '🔥 Surge'}
              {!mine.clash.surged && <span class="hotkey">G</span>}
            </button>
            <HireButton game={game} done={!!mine.clash.hiredAtk} />
          </span>
        </div>
      )}
    </section>
  );
}

/** Choosing which rival post the huscarls strike. */
function RaidBar({ game }: { game: Game }) {
  const pv = game.raidPreview.value;
  const hint = !pv
    ? 'Tap a rival tower, outpost or stockade'
    : pv.problem
      ? pv.problem
      : `${pv.name}: your ${pv.attack} against its ${pv.defence} · ${pv.attack > pv.defence ? 'they should burn it' : 'they would be driven off'}${pv.attack > pv.defence && (pv.lost || pv.sites.length) ? ` · frees ${pv.lost} tiles${pv.sites.length ? ` and ${pv.sites.join(', ')}` : ''}` : ''}`;
  const tone = !pv ? 'ok' : pv.problem || pv.attack <= pv.defence ? 'bad' : pv.sites.length ? 'great' : 'ok';
  return (
    <div class="placebar panel">
      <span class="deed-icon big">⚔️</span>
      <div class="ptext">
        <strong>Raid</strong>
        <span class={tone}>{hint}</span>
      </div>
      <div class="pbtns">
        {game.touchPlacing.value && pv && (
          <button class="primary" disabled={!!pv.problem} onClick={() => game.confirmRaid()}>
            ✓ Raid
          </button>
        )}
        <button onClick={() => game.cancel()}>✕</button>
      </div>
    </div>
  );
}

/** A beat of the saga: what has happened, and what to do about it. Never blocks play, fades on its own. */
function StoryCard({ game }: { game: Game }) {
  const s = game.story.value;
  if (!s) return null;
  const beat = SAGA[s.beat];
  const origin = game.world.players[1]?.origin;
  const rival = origin && origin !== 'dynasty' ? `the ${ORIGINS[origin].name}` : 'rival folk';
  const fill = (t: string) => t.replace(/\{rival\}/g, rival);
  return (
    <aside class="story panel" role="note" aria-label={beat.title}>
      <span class="story-ico">{beat.icon}</span>
      <div class="story-body">
        <h3>{beat.title}</h3>
        {beat.text.map((p) => (
          <p key={p}>{fill(p)}</p>
        ))}
        <p class="story-goal">➤ {fill(beat.goal)}</p>
      </div>
      <button class="story-ok" onClick={() => game.dismissStory()}>
        Onward
      </button>
    </aside>
  );
}

/** Choosing where the scout goes. */
function ScoutBar({ game }: { game: Game }) {
  return (
    <div class="placebar panel">
      <span class="deed-icon big">🔭</span>
      <div class="ptext">
        <strong>Scout</strong>
        <span class="ok">Tap the map: your scout runs out to look, then comes home. Range {BALANCE.scoutReach} tiles.</span>
      </div>
      <div class="pbtns">
        <button onClick={() => game.cancel()}>✕</button>
      </div>
    </div>
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
  const o = p.houseOffer;
  if (o) items.push({ key: `b${o.id}`, icon: '🏰', title: 'A seat on the council', left: (o.expires - w.tick) / HOUSE_TIMEOUT, secs: Math.ceil((o.expires - w.tick) / TICK_HZ) });
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
          <HouseLetter game={game} />
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

/** Choose a Great House for a council seat: each card says plainly what it always does and the power it lends. */
function HouseLetter({ game }: { game: Game }) {
  const w = game.world;
  const p = w.players[PLAYER];
  const o = p.houseOffer;
  if (!o) return null;
  return (
    <div class="letter-open boon-letter" key={o.id}>
      <LetterHead game={game} icon="🏰" sub={o.reason} title={`Choose a Great House`} left={(o.expires - w.tick) / HOUSE_TIMEOUT} />
      <div class="boon-cards">
        {o.choices.map((id, i) => {
          const h = HOUSES[id];
          const d = DEEDS[h.power];
          return (
            <button
              key={id}
              class="boon-card house-card"
              style={{ animationDelay: `${i * 90}ms`, borderTopColor: hex(h.color) }}
              onClick={() => {
                game.ledgerOpen.value = null;
                game.chooseHouse(o.id, i);
              }}
            >
              <span class="bc-icon">{h.icon}</span>
              <strong>{h.name.replace('House of the ', '')}</strong>
              <span class="bc-tag">{h.tag}</span>
              <span class="bc-line" title={h.passive}>
                ✦ {h.bonus}
              </span>
              <span class="bc-line power" title={d.blurb}>
                {d.icon} {d.name}
                <small>{d.short}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Aim a bridge: the span under the pointer, what it costs, and whether it can go up. */
function BridgeBar({ game }: { game: Game }) {
  useWorldRefresh(game);
  const g = game.bridgeGhost.value;
  const touch = game.touchPlacing.value;
  let hint: string;
  let tone: 'ok' | 'bad' | 'warn' = 'ok';
  if (!g) {
    hint = touch ? 'Tap the water between two banks' : 'Point at water between two banks';
    tone = 'warn';
  } else if (!g.check.ok) {
    hint = g.check.reason ?? 'Cannot bridge here';
    tone = 'bad';
  } else hint = touch ? `${g.span.len} tiles: tap it again to build` : `${g.span.len} tiles · click to build · Shift-click for more`;
  const cost = g ? g.check.cost : bridgeCost(1);
  return (
    <div class="placebar panel">
      <span class="card-icon glyph" style={{ width: '44px', height: '44px', fontSize: '34px' }}>🌉</span>
      <div class="ptext">
        <strong>Bridge</strong>
        <span class={tone}>{hint}</span>
      </div>
      <span class="bridge-cost">
        <span class="cost"><img src={ICON.logs} alt="Logs" />{cost.logs}</span>
        <span class="cost"><img src={ICON.stone} alt="Stone" />{cost.stone}</span>
      </span>
      <div class="pbtns">
        {touch && (
          <button class="primary" disabled={!g?.check.ok} onClick={() => game.confirmBridge()}>
            ✓ Build
          </button>
        )}
        <button onClick={() => game.cancel()}>✕</button>
      </div>
    </div>
  );
}

function PlaceBar({ game, type }: { game: Game; type: BuildingType }) {
  const def = BUILDINGS[type];
  const g = game.ghost.value;
  const touch = game.touchPlacing.value;
  const job = def.job;
  const what = job?.kind === 'gather' ? (job.node === 'tree' ? 'trees' : job.node === 'rock' ? 'rocks' : job.node === 'fish' ? 'fish shoals' : 'berry bushes') : job?.kind === 'plant' ? 'trees' : '';
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

function InfoPanel({ game }: { game: Game }) {
  useWorldRefresh(game);
  const sel = game.selection.value;
  const [confirm, setConfirm] = useState<number | null>(null);
  if (!sel) return null;
  const w = game.world;

  if (sel.kind === 'settler') {
    const s = w.settlers.get(sel.id);
    if (!s) return null;
    return (
      <aside class="info panel">
        <button class="close" onClick={() => game.cancel()} aria-label="Close">
          ✕
        </button>
        <h3>{s.name}</h3>
        <p class="doing">{s.child ? 'A child, growing up' : describeSettler(w, s)}</p>
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
                Crew <strong>{[...w.settlers.values()].filter((o) => o.job.kind === 'work' && o.job.buildingId === b.id).length}/{workSlots(b)}</strong>
                {trade && (
                  <span class="muted small">
                    {' '}
                    · {trade.icon} {trade.name} {'★'.repeat(tierOf(w.players[b.owner].crafts[trade.skill]))}
                  </span>
                )}
              </p>
            </>
          ) : (
            <p class="muted">Waiting for a free adult</p>
          )}
        </div>
      )}
      {b.done && b.type === 'musterhall' && (
        <div class="worker">
          <p>
            <img class="inline-icon" src={ICON.shield} alt="" /> Huscarls: <strong>{huscarls(w, b)}/{def.garrison}</strong>
            <span class="muted small"> · raid strength {raidStrength(w, b.owner, huscarls(w, b))}</span>
          </p>
          <p class="muted small">At home they defend any post within {BALANCE.interceptRange} tiles. Out raiding, they leave those posts to their own guards.</p>
          {b.owner === PLAYER && (
            <button class="primary" onClick={() => game.startRaid()}>
              ⚔️ Raid a rival post (R)
            </button>
          )}
        </div>
      )}
      {b.done && def.garrison && b.type !== 'musterhall' && (
        <div class="worker">
          <p>
            <img class="inline-icon" src={ICON.shield} alt="" /> Guards: <strong>{b.guarded}/{def.garrison}</strong>
            <span class="muted small"> · defence {defenceOf(w, b)}</span>
          </p>
          <p class="muted small">
            {w.players[PLAYER].rank < 1
              ? 'From Hamlet, posts need guards to push at full strength.'
              : b.guarded < def.garrison
                ? `Short-handed: it pushes at ${Math.round((100 * (1 + b.guarded)) / (1 + def.garrison))}% strength. Free adults (more homes, more folk) take up the watch.`
                : 'Fully manned: it pushes at full strength.'}
          </p>
        </div>
      )}
      {b.done && def.job && def.job.kind !== 'plant' && (
        <p class="mats">
          {def.job.kind === 'process' && def.job.input && (
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
        <div key={t.id} class={`toast ${t.tone === 'info' ? '' : t.tone}`}>
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
  masters: 'Crafts',
  goals: 'Goals',
  events: 'Events',
  deeds: 'Deeds',
  legends: 'Legends',
  works: 'Great Works',
  raids: 'Raids',
  defence: 'Holding the line',
  hearth: 'Hearth',
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
  if (me.caravanned >= 300) list.push(['🛒', 'Merchant Prince', `${me.caravanned} goods carried to steadings`]);
  if (steadingsOf(w).filter((s) => s.st!.ally === PLAYER).length >= 3) list.push(['🏘', 'Voice of the Valley', 'Three steadings stood with you']);
  if (outposts >= 4) list.push(['🧭', 'Pathfinder', `${outposts} outposts`]);
  if (me.deedsUsed >= 20) list.push(['✦', 'Great Houses', `${me.deedsUsed} house powers called`]);
  if (me.raidsWon >= 3) list.push(['🔥', 'Warlord', `${me.raidsWon} rival posts burned`]);
  if (me.repelled >= 3) list.push(['🛡️', 'Unbroken', `${me.repelled} raids driven off`]);
  const wants = steadingsOf(w).reduce((n, x) => n + x.st!.won[PLAYER], 0);
  if (wants >= 4) list.push(['🏆', 'Friend of the Folk', `${wants} Wants won`]);
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

/** The three roads to the Crown, in plain words: how the valley was held at the end, and one to try next. */
const ROADS: { id: string; name: string; icon: string; tip: string }[] = [
  { id: 'trade', name: 'Trade', icon: '🛒', tip: 'Run a surplus, keep a few posts along the road to escort your carts, and answer the steadings’ Wants before the rival does. Merchants earn more favour and faster carts a tier.' },
  { id: 'war', name: 'War', icon: '⚔', tip: 'A Mustering Hall, a manned post beside the Kingstone and a Stockade to tend it. Hired spears turn a close fight.' },
  { id: 'hearth', name: 'the Hearth', icon: '🏡', tip: 'Farms, a bakehouse, a brewhouse and a smithy: bread, ale and tools make cottages and hall-houses, and the richer town is a voice.' },
];

function Victory({ game, shell }: { game: Game; shell: Shell }) {
  useWorldRefresh(game);
  const v = game.victory.value;
  if (!v) return null;
  const w = game.world;
  const me = w.players[PLAYER];
  const them = w.players[1];
  const won = v.winner === PLAYER;
  const sources = Object.entries(me.renownBy).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const works = BUILD_MENU.filter((t) => BUILDINGS[t].great && workOwner(w, t) === PLAYER);
  return (
    <div class="modal-wrap">
      <div class="modal panel celebrate report">
        <img class="modal-icon" src={ICON.hut} alt="" />
        <h2>{won ? (v.crowned ? '👑 Crowned! Your folk rule the valley' : `${v.scenario}: your folk are renowned!`) : v.crowned ? 'Your rival is crowned' : 'Your rival is the valley’s renowned town'}</h2>
        <p>
          {v.crowned ? `${won ? 'The Kingstone’s light is yours.' : 'The Kingstone’s light is theirs.'} ` : v.byTime ? 'The clock ran out: the valley judged by the fuller Crown, then renown. ' : ''}
          After {formatTime(w.tick)}: Crown <b>{crownPct(w, PLAYER)}%</b> to your rival’s <b>{crownPct(w, 1)}%</b>, and <b>{me.renown}★</b> to <b>{them?.renown ?? 0}★</b>.
        </p>
        <Awards w={w} won={won} />
        {(() => {
          // How the valley was held, as roads: the one that carried the Crown, and one the town has barely walked.
          const c = w.crown;
          const held = [
            steadingsOf(w).filter((x) => x.st!.ally === PLAYER).length,
            c?.keeper === PLAYER ? BALANCE.kingstoneVoices : 0,
            c?.hearth === PLAYER ? 1 : 0,
          ];
          const totals = ROADS.map((r, i) => ({ ...r, n: held[i] })).sort((x, y) => y.n - x.n);
          const top = totals[0];
          const next = totals[totals.length - 1];
          const title = callingTitle(me.calling);
          return (
            <p class="report-path">
              {title && (
                <>
                  Your town became a <b>{CALLINGS[me.calling.id as keyof typeof CALLINGS].icon} {title}</b> in <b>{VALLEYS[w.map.valley].icon} {VALLEYS[w.map.valley].name}</b>.{' '}
                </>
              )}
              {!title && (
                <>
                  Played in <b>{VALLEYS[w.map.valley].icon} {VALLEYS[w.map.valley].name}</b>.{' '}
                </>
              )}
              At the end you held <b>{plural_(held[0] + held[1] + held[2], 'voice')}</b>: {held[0]} {held[0] === 1 ? 'steading' : 'steadings'}{held[1] ? ', the Kingstone' : ''}{held[2] ? ', the Hearth' : ''}.
              {top.n > 0 ? <> Your strongest road was <b>{top.icon} {top.name}</b>.</> : null}
              {next && next.id !== top.id ? <> Next time, try <b>{next.icon} {next.name}</b>: {next.tip}</> : null}
            </p>
          );
        })()}
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
              {me.seats.length > 0 && <li>Your council: {me.seats.map((s) => `${HOUSES[s.house].icon} ${HOUSES[s.house].name}`).join(', ')}</li>}
              {them?.seats.length ? <li>Your rival’s: {them.seats.map((s) => `${HOUSES[s.house].icon} ${HOUSES[s.house].name}`).join(', ')}</li> : null}
              {me.origin && (
                <li>
                  Founded by {me.origin === 'dynasty' ? 'your dynasty' : ORIGINS[me.origin].name}
                  {them?.origin ? `, against ${ORIGINS[them.origin].name}` : ''}
                </li>
              )}
              <li>
                {w.population(PLAYER)} folk · {me.deedsUsed} house powers called · {me.raidsWon} posts burned, {me.repelled} raids held
              </li>
              <li>
                🏘 {steadingsOf(w).filter((x) => x.st!.ally === PLAYER).length} of {steadingsOf(w).length} steadings stood with you at the end · {me.caravanned} goods carried by cart · {homeLevelName(me.homeLevel)} · prosperity {prosperity(w, PLAYER)}
              </li>
              <li>
                {me.taken} landmark{me.taken === 1 ? '' : 's'} taken from your rival · {steadingsOf(w).reduce((n, x) => n + x.st!.won[PLAYER], 0)} steading Wants won
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
        <div class="report-actions">
          <button class="primary big" onClick={() => void shell.newGame(Math.floor(Math.random() * 899999) + 100000, w.difficulty, true, ORIGIN_IDS[Math.floor(Math.random() * ORIGIN_IDS.length)])}>
            ▶ Another valley
          </button>
          <button class="big" onClick={() => (game.victory.value = null)}>
            Keep playing
          </button>
        </div>
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
