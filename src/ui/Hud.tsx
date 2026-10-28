import { useEffect, useRef, useState } from 'preact/hooks';
import { icon, PLAYER, type Game } from '../game';
import { ICON } from '../render/overlay';
import { BUILDINGS, BUILD_MENU, DISCOVERIES, GOODS, GOOD_INFO, RANK_NAMES, SKILLS, type BuildingType, type Good } from '../sim/defs';
import { NO_OWNER, territoryBox } from '../sim/territory';
import { BOONS, BOON_TIMEOUT, familyTitle } from '../sim/boons';
import { BALANCE, TICK_HZ } from '../sim/balance';
import { canAfford, eventDef } from '../sim/events';
import { objectiveStatus } from '../sim/scenario';
import { SEASON_NAMES, seasonOf, ticksToNextSeason } from '../sim/seasons';
import type { Family, World } from '../sim/world';
import { CREST_COLORS, plural } from '../sim/population';
import { TIER_NAMES, TRADES, tierOf, tierProgress, tradeTitle } from '../sim/trades';
import { settings } from '../settings';
import type { Shell } from '../shell';
import { ageYears, describeSettler, formatTime } from './describe';
import { HowTo, SettingsPanel } from './Screens';
import { HOTKEYS } from '../input/input';
import { lockLabel } from '../sim/commands';

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
      <BoonTray game={game} />
      <EventCard game={game} />
      <Toasts game={game} />
      <InfoPanel game={game} />
      {game.mode.value.kind === 'place' ? <PlaceBar game={game} type={game.mode.value.type} /> : <BuildBar game={game} />}
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
    </div>
  );
}

/** Both settlements' progress through the chapters: the race at a glance. */
function RaceBar({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  if (!w.players[1]) return null;
  const total = w.scenario.objectives.length;
  const row = (owner: number, label: string) => {
    const st = objectiveStatus(w, owner);
    const done = st.filter((o) => o.done).length;
    return (
      <div class={`race-row ${owner === PLAYER ? 'me' : 'them'}`} title={`${label}: ${done}/${total} goals`}>
        <span class="race-name">{label}</span>
        <div class="race-track">
          <div style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <span class="race-rank">{RANK_NAMES[w.players[owner].rank]}</span>
      </div>
    );
  };
  return (
    <section class="race" aria-label="The race">
      {row(PLAYER, 'You')}
      {row(1, 'Rival')}
    </section>
  );
}

/** A messenger's news with a choice attached. Never blocks; resolves cautiously if ignored. */
function EventCard({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const ev = w.players[PLAYER].event;
  if (!ev) return null;
  const def = eventDef(ev.def);
  if (!def) return null;
  const left = Math.max(0, (ev.expires - w.tick) / BALANCE.eventTimeout);
  return (
    <section class="event-card" key={ev.id} aria-label={def.title}>
      <header>
        <span class="ev-icon">{def.icon}</span>
        <strong>{def.title}</strong>
      </header>
      <p class="ev-text">{def.text}</p>
      <div class="ev-options">
        {def.options.map((o, i) => {
          const ok = canAfford(w, PLAYER, o.cost);
          return (
            <button key={o.label} class={`ev-opt ${i === def.options.length - 1 ? 'quiet' : ''}`} disabled={!ok} onClick={() => game.chooseEvent(ev.id, i)}>
              <strong>{o.label}</strong>
              <small>{o.detail}</small>
            </button>
          );
        })}
      </div>
      <div class="boon-timer">
        <div style={{ width: `${left * 100}%` }} />
      </div>
    </section>
  );
}

/** Spore-style evolution picks: choose how a family grows. Never blocks the game. */
function BoonTray({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const offers = w.players[PLAYER].offers;
  const o = offers[0];
  if (!o || o.expires === 0) return null;
  const fam = w.families.get(o.familyId);
  if (!fam) return null;
  const left = Math.max(0, (o.expires - w.tick) / BOON_TIMEOUT);
  return (
    <section class="boon-tray" key={o.id} aria-label="Choose a family boon">
      <header>
        <span class="crest" style={{ background: hex(CREST_COLORS[fam.color]) }} />
        <div>
          <small>{o.reason}</small>
          <strong>Choose a boon for the {fam.surname} family</strong>
        </div>
        {offers.length > 1 && <span class="more">+{offers.length - 1}</span>}
      </header>
      <div class="boon-cards">
        {o.choices.map((id, i) => (
          <button key={id} class="boon-card" style={{ animationDelay: `${i * 90}ms` }} onClick={() => game.chooseBoon(o.id, i)}>
            <span class="bc-icon">{BOONS[id].icon}</span>
            <strong>{BOONS[id].name}</strong>
            <span class="bc-blurb">{BOONS[id].blurb}</span>
          </button>
        ))}
      </div>
      <div class="boon-timer">
        <div style={{ width: `${left * 100}%` }} />
      </div>
    </section>
  );
}

/** Discoveries seen but not yet claimed, nearest first: the "where next?" list. */
function Frontier({ game }: { game: Game }) {
  useWorldRefresh(game);
  const w = game.world;
  const open = w.sites.filter((s) => s.revealed & 1 && s.claimedBy === NO_OWNER);
  if (!open.length) return null;
  const box = territoryBox(w, PLAYER);
  const gap = (x: number, y: number) => {
    let best = Infinity;
    for (let ty = box.y0; ty <= box.y1; ty += 1)
      for (let tx = box.x0; tx <= box.x1; tx += 1) if (w.territory[w.idx(tx, ty)] === PLAYER) best = Math.min(best, Math.max(Math.abs(tx - x), Math.abs(ty - y)));
    return best;
  };
  const rows = open.map((s) => ({ s, d: gap(s.x, s.y) })).sort((a, b) => a.d - b.d).slice(0, 4);
  return (
    <section class="frontier panel" aria-label="Out in the wild">
      <h3>Out in the wild</h3>
      {rows.map(({ s, d }) => (
        <button key={s.id} class="frontier-row" onClick={() => game.focusSite(s.id)} title={DISCOVERIES[s.kind].blurb}>
          <span class="fr-icon">{DISCOVERIES[s.kind].icon}</span>
          <span class="fr-name">{DISCOVERIES[s.kind].name}</span>
          <span class="fr-dist">{d} tiles out</span>
        </button>
      ))}
    </section>
  );
}

function costChips(type: BuildingType) {
  return Object.entries(BUILDINGS[type].cost).map(([g, n]) => (
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
        const affordable = Object.entries(def.cost).every(([g, n]) => w.stored(PLAYER, g as Good) >= (n ?? 0));
        const lock = unlocked ? '' : lockLabel(w, PLAYER, t);
        const reqText = `Needs a ${lock}`;
        return (
          <button
            key={t}
            class={`card ${affordable ? '' : 'short'} ${unlocked ? '' : 'locked'}`}
            onClick={() => unlocked && game.startPlacing(t)}
            aria-disabled={!unlocked}
            title={unlocked ? `${def.name} (${HOTKEYS[i]}): ${def.blurb}` : `${def.name}: ${reqText}`}
          >
            <span class="hotkey">{HOTKEYS[i]}</span>
            <img class="card-icon" src={icon(t)} alt="" />
            <span class="card-name">{def.name}</span>
            <span class="card-cost">{unlocked ? costChips(t) : <span class="lock">🔒 {lock.replace(/^Journeyman /, '')}</span>}</span>
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
  else hint = touch ? 'Looks good!' : 'Click to build · Shift-click to keep building';
  const tone = g && !g.ok ? 'bad' : g?.inRange === 0 ? 'warn' : 'ok';
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
          {s.child ? 'Child' : 'Adult'} · age {ageYears(s)}
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
      {!b.done && (
        <>
          <div class="bar">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p class="mats">
            {Object.entries(def.cost).map(([g, n]) => (
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

function Victory({ game }: { game: Game }) {
  useWorldRefresh(game);
  const v = game.victory.value;
  if (!v) return null;
  const w = game.world;
  return (
    <div class="modal-wrap">
      <div class="modal panel celebrate">
        <img class="modal-icon" src={ICON.hut} alt="" />
        {v.winner === PLAYER ? (
          <>
            <h2>{v.scenario}: you win!</h2>
            <p>
              In {formatTime(w.tick)} your folk turned a lone wagon into a town of {w.population(PLAYER)} across {[...w.families.values()].filter((f) => f.owner === PLAYER).length} families, and
              won renown before your rival.
            </p>
          </>
        ) : (
          <>
            <h2>The rival town won renown first</h2>
            <p>
              After {formatTime(w.tick)}, the settlement across the valley completed every chapter before you. Your {w.population(PLAYER)} folk carry on. Try a bolder frontier next time.
            </p>
          </>
        )}
        <p class="muted">Keep building as long as you like.</p>
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
