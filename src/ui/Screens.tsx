import { VALLEYS, VALLEY_IDS, valleyOf, type ValleyId } from '../sim/mapgen';
import { useEffect, useState } from 'preact/hooks';
import { audio } from '../audio/audio';
import { DIFFICULTY_INFO, type Difficulty } from '../sim/rules';
import { dailyBest, dailySeed, dynasties, saveSettings, saveSummary, settings, todayKey, type Quality, type StoredDynasty } from '../settings';
import { HOUSES } from '../sim/houses';
import { DEEDS } from '../sim/deeds';
import { ORIGINS, ORIGIN_IDS, type OriginId } from '../sim/origins';
import { OMENS, rollOmens } from '../sim/omens';
import type { Shell } from '../shell';
import { formatTime } from './describe';
import { Hud } from './Hud';

const LOGO = '/assets/ui/logo.png';

export function Root({ shell }: { shell: Shell }) {
  const screen = shell.screen.value;
  return (
    <>
      {screen === 'title' && <Title shell={shell} />}
      {screen === 'loading' && <Loading shell={shell} />}
      {screen === 'game' && shell.game && <Hud game={shell.game} shell={shell} />}
    </>
  );
}

type Panel = null | 'new' | 'daily' | 'settings' | 'howto';

function Title({ shell }: { shell: Shell }) {
  const [panel, setPanel] = useState<Panel>(null);
  const summary = saveSummary.value;
  const ready = shell.menuReady.value;
  const open = (p: Panel) => {
    audio.start();
    audio.play('click');
    setPanel(p);
  };
  return (
    <div class={`title ${ready ? 'ready' : ''}`}>
      <div class="title-backdrop" style={{ backgroundImage: 'url(/assets/ui/loading.jpg)' }} />
      <div class="title-vignette" />
      <div class="title-col">
        <img class="logo" src={LOGO} alt="FirstFolk" />
        <p class="tagline">Found a village. Claim the valley. Outshine your rival.</p>
        <nav class="title-menu">
          {summary && (
            <button class="plaque primary" onClick={() => void shell.continueGame()}>
              <span class="pl-title">Continue</span>
              <span class="pl-sub">
                {formatTime(summary.tick)} played · {summary.population} folk · {timeAgo(summary.savedAt)}
              </span>
            </button>
          )}
          <button class={`plaque ${summary ? '' : 'primary'}`} onClick={() => open('new')}>
            <span class="pl-title">New Game</span>
            <span class="pl-sub">A fresh valley awaits</span>
          </button>
          <button class="plaque daily" onClick={() => open('daily')}>
            <span class="pl-title">Daily Valley</span>
            <span class="pl-sub">
              {OmensLine(dailySeed(todayKey()))}
              {dailyBest.value?.date === todayKey() && ` · today’s best: ${dailyBest.value.won ? 'won' : 'lost'}, ${dailyBest.value.renown}★`}
            </span>
          </button>
          <button class="plaque" onClick={() => void shell.watchGame(Math.floor(Math.random() * 1_000_000))}>
            <span class="pl-title">Watch a valley</span>
            <span class="pl-sub">Two rival towns, played by the machine</span>
          </button>
          <button class="plaque" onClick={() => open('howto')}>
            <span class="pl-title">How to Play</span>
          </button>
          <button class="plaque" onClick={() => open('settings')}>
            <span class="pl-title">Settings</span>
          </button>
        </nav>
        {shell.error.value && <p class="title-error">{shell.error.value}</p>}
      </div>
      <footer class="title-foot">v{__APP_VERSION__} · Early build · Low-poly world rendered live with Three.js</footer>
      {panel === 'new' && <NewGame shell={shell} onClose={() => setPanel(null)} />}
      {panel === 'daily' && <NewGame shell={shell} onClose={() => setPanel(null)} daily />}
      {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}
      {panel === 'howto' && <HowTo onClose={() => setPanel(null)} />}
    </div>
  );
}

function timeAgo(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'saved just now';
  if (s < 3600) return `saved ${Math.round(s / 60)} min ago`;
  if (s < 86400) return `saved ${Math.round(s / 3600)} h ago`;
  return `saved ${Math.round(s / 86400)} days ago`;
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: preact.ComponentChildren; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`modal panel ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <button class="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

const randomSeed = () => Math.floor(Math.random() * 899999) + 100000;

/** The valley's two omens, as a short line. */
function OmensLine(seed: number): string {
  return rollOmens(seed)
    .map((o) => `${OMENS[o].icon} ${OMENS[o].name}`)
    .join(' · ');
}

/**
 * New Game, and the Daily Valley (today's fixed seed and omens, Normal, against the rival).
 * A picture-first screen: choose who your founders are, and go. The rest is a row of small
 * chips with sensible defaults.
 */
function NewGame({ shell, onClose, daily }: { shell: Shell; onClose: () => void; daily?: boolean }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [seed, setSeed] = useState(daily ? dailySeed(todayKey()) : randomSeed());
  const [rival, setRival] = useState(true);
  const [origin, setOrigin] = useState<OriginId>('woodfolk');
  const [heir, setHeir] = useState<StoredDynasty | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const pick = heir ? 'dynasty' : origin;
  const start = () =>
    daily
      ? void shell.newGame(dailySeed(todayKey()), 'normal', true, pick, `daily-${todayKey()}`, heir ?? undefined)
      : void shell.newGame(seed, difficulty, rival, pick, '', heir ?? undefined);
  const choose = (id: OriginId) => {
    audio.play('click');
    setOrigin(id);
    setHeir(null);
  };
  const chosen = heir ? HOUSES[heir.house] : HOUSES[ORIGINS[origin].house];
  const power = DEEDS[chosen.power];
  return (
    <div class="newgame" role="dialog" aria-label={daily ? 'Daily Valley' : 'New Game'}>
      <button class="close" onClick={onClose} aria-label="Back">
        ✕
      </button>
      <h2 class="ng-title">{daily ? `Daily Valley · ${todayKey()}` : 'Who are your founders?'}</h2>
      <div class="ng-origins">
        {ORIGIN_IDS.map((id) => {
          const o = ORIGINS[id];
          const h = HOUSES[o.house];
          const on = !heir && origin === id;
          return (
            <button key={id} class={`ng-origin ${on ? 'on' : ''}`} onClick={() => choose(id)} aria-pressed={on} title={o.blurb}>
              <span class="ng-art" style={{ backgroundImage: `url(/assets/ui/origin-${id}.jpg)` }} />
              <span class="ng-tag" style={{ background: hex(h.color) }}>
                {h.icon} {h.tag}
              </span>
              <span class="ng-name">{o.name}</span>
              <span class="ng-lead">{o.lead}</span>
            </button>
          );
        })}
        {dynasties.value.map((d) => {
          const on = heir?.surname === d.surname;
          return (
            <button key={d.surname} class={`ng-origin dynasty ${on ? 'on' : ''}`} onClick={() => setHeir(d)} aria-pressed={on} title={`Won with ${d.renown}★`}>
              <span class="ng-art crown">👑</span>
              <span class="ng-tag" style={{ background: hex(HOUSES[d.house].color) }}>
                {HOUSES[d.house].icon} {HOUSES[d.house].tag}
              </span>
              <span class="ng-name">The {d.surname} line</span>
              <span class="ng-lead">{d.generation > 1 ? `Generation ${d.generation}` : 'Your winning house returns'}</span>
            </button>
          );
        })}
      </div>
      <div class="ng-house" key={chosen.id}>
        <span class="ng-house-icon">{chosen.icon}</span>
        <span>
          <b>{chosen.bonus}</b> · {power.icon} {power.name}: {power.short.toLowerCase()}
        </span>
      </div>
      <div class="ng-options">
        {!daily && (
          <div class="seg" role="group" aria-label="Difficulty">
            {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map((d) => (
              <button key={d} class={difficulty === d ? 'on' : ''} onClick={() => setDifficulty(d)} title={DIFFICULTY_INFO[d].blurb} aria-pressed={difficulty === d}>
                {DIFFICULTY_INFO[d].name}
              </button>
            ))}
          </div>
        )}
        {!daily && (
          <div class="seg" role="group" aria-label="Rival">
            <button class={rival ? 'on' : ''} onClick={() => setRival(true)} aria-pressed={rival} title="Race a rival settlement for renown">
              ⚔️ Rival
            </button>
            <button class={!rival ? 'on' : ''} onClick={() => setRival(false)} aria-pressed={!rival} title="The valley is yours alone">
              🕊️ Peaceful
            </button>
          </div>
        )}
        <div class="valley-chip" title={`${VALLEYS[valleyOf(seed)].blurb}\n\n${rollOmens(seed).map((o) => `${OMENS[o].name}: ${OMENS[o].blurb}`).join('\n')}`}>
          <span class="valley-ico">{VALLEYS[valleyOf(seed)].icon}</span>
          <span class="valley-name">{VALLEYS[valleyOf(seed)].name}</span>
          {rollOmens(seed).map((o) => (
            <span key={o}>{OMENS[o].icon}</span>
          ))}
          {!daily && (
            <button onClick={() => setSeed(randomSeed())} title="Another valley" aria-label="Another valley">
              🎲
            </button>
          )}
        </div>
      </div>
      <div class="valley-box">
        <p class="valley-blurb">{VALLEYS[valleyOf(seed)].blurb}</p>
        <div class="valley-tags">
          {VALLEYS[valleyOf(seed)].tags.map(([text, tone]) => (
            <span key={text} class={`vtag ${tone}`}>
              {text}
            </span>
          ))}
        </div>
        {!daily && (
          <div class="valley-pick" role="group" aria-label="Kind of valley">
            {VALLEY_IDS.map((id) => (
              <button key={id} class={valleyOf(seed) === id ? 'on' : ''} title={VALLEYS[id].name} aria-label={VALLEYS[id].name} aria-pressed={valleyOf(seed) === id} onClick={() => setSeed(seedOfValley(id, seed))}>
                <span class="vp-ico">{VALLEYS[id].icon}</span>
                <span class="vp-name">{VALLEYS[id].name.replace(/^The /, '')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button class="primary big ng-go" onClick={start}>
        {daily ? 'Begin today’s valley' : 'Begin'}
      </button>
      {saveSummary.value && <p class="ng-note">This replaces your saved game.</p>}
    </div>
  );
}

/** A seed that makes the wanted kind of valley, found by walking on from the current one (so a pick is repeatable). */
function seedOfValley(id: ValleyId, from: number): number {
  for (let k = 1; k < 400; k++) if (valleyOf(from + k * 7919) === id) return (from + k * 7919) % 1000000;
  return from;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = settings.value;
  const set = (patch: Partial<typeof s>) => saveSettings({ ...s, ...patch });
  const slider = (key: 'master' | 'music' | 'ambience' | 'effects', label: string) => (
    <label class="slider">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={s[key]} aria-label={`${label} volume`} onInput={(e) => set({ [key]: Number((e.target as HTMLInputElement).value) })} onChange={() => audio.play('click')} />
      <span class="val">{Math.round(s[key] * 100)}</span>
    </label>
  );
  return (
    <Modal title="Settings" onClose={onClose}>
      <div class="field-label">Sound</div>
      <label class="toggle">
        <input type="checkbox" checked={s.muted} onChange={(e) => set({ muted: (e.target as HTMLInputElement).checked })} />
        Mute all sound (M)
      </label>
      {slider('master', 'Master')}
      {slider('music', 'Music')}
      {slider('ambience', 'Ambience')}
      {slider('effects', 'Effects')}
      <div class="field-label">Graphics</div>
      <div class="choices row">
        {(['high', 'balanced', 'low'] as Quality[]).map((q) => (
          <button key={q} class={`choice ${s.quality === q ? 'on' : ''}`} onClick={() => set({ quality: q })} aria-pressed={s.quality === q}>
            <strong>{q === 'high' ? 'High' : q === 'balanced' ? 'Balanced' : 'Fast'}</strong>
            <span>{q === 'high' ? 'Sharp shadows, full detail' : q === 'balanced' ? 'Good for phones' : 'No shadows, lighter detail'}</span>
          </button>
        ))}
      </div>
      <label class="toggle">
        <input type="checkbox" checked={s.dayNight} onChange={(e) => set({ dayNight: (e.target as HTMLInputElement).checked })} />
        Day and night (windows and fires glow after dusk)
      </label>
      <label class="toggle">
        <input type="checkbox" checked={s.hints} onChange={(e) => set({ hints: (e.target as HTMLInputElement).checked })} />
        Show objective hints
      </label>
      <p class="muted small">Graphics changes apply immediately; ground detail density updates with the next valley you load.</p>
    </Modal>
  );
}

export function HowTo({ onClose }: { onClose: () => void }) {
  const steps = [
    { icon: '/assets/icons/renown.png', title: 'Win the Crown: three roads', text: 'From 9:00 the Crown fills for whoever holds more voices of the valley, and drains the other. There are three roads to a voice. 🛒 Trade: each steading that stands with you is one. ⚔ War: the Kingstone, which falls at about 14:00, is worth two to whoever keeps it alone. 🏡 Hearth: the richer town is one, so bread, ale and tools pay too. Tap the Crown at the top (or press K) to see them all.' },
    { icon: '/assets/icons/storehouse.png', title: 'Win the steadings', text: 'Every steading posts a Want: so many planks, or a manned post beside it. The first to deliver wins a big swing of favour; at 50 favour and a lead of 20 they stand with you, push your border and send a gift every minute. Press 🛒 on a steading to send a cart with what they ask for. Carts take time on the road: guard it, because favour fades.' },
    { icon: '/assets/icons/lookout.png', title: 'Scout, fight, rally', text: 'Press T and tap the map to send a scout across the fog: it lifts the fog, shows landmarks and the rival’s posts, and the rival’s scouts will do the same to you. When raiders reach one of your posts, the fight takes a few seconds: press G to Rally every free hand nearby to its defence, and H to hire spears with ale and tools: the richer your homes, the more they add. In your own raids, G is a Surge.' },
    { icon: '/assets/icons/woodcutter.png', title: 'Gather and grow', text: 'Woodcutters by trees, Foragers by bushes, Quarries by rocks. Free homes and spare food grow your town. All work fills your crafts (tap your town at the top left): each new star upgrades every workplace of that craft. Buildings are on the shelf below, in five groups.' },
    { icon: '/assets/icons/lookout.png', title: 'Push your border', text: 'Lookouts and Watchtowers push your border, but every banner needs a spear: posts need guards (free adults) to push at full strength, and a landmark pays renown only while a manned post watches it. Guards eat three times as much as anyone, so a town of towers needs a big larder. Your rank limits how many posts you can hold; past that, from Village, found a Daughter Hamlet: a second hall 16 tiles from the first that lets you hold four more, if you can garrison it.' },
    { icon: '/assets/icons/stockade.png', title: 'Spears and shields', text: 'Wide or tall? A Stockade holds a little land hard and makes a landmark pay more. From 10:00 a Mustering Hall’s huscarls can raid (R) a rival post: the stronger side wins, and a burned post frees its land. Click the hall to see what your army is made of: each huscarl is worth 10, plus a House gift, +2 for every level of Arms (forged from tools; guards get it too) and +1 for every minute of Drill at home. Quarters make room for more of them. Reavers strike the furthest post of whoever spreads widest.' },
    { icon: '/assets/icons/people.png', title: 'Choose your Great Houses', text: 'Your origin seats your first house; you choose a second at Hamlet and a third at Village (letters at the top right). Each house gives a plain bonus and one power to call on (Z X C, or the round buttons at the right): Raise, Wagon Train, Open Hands, Expedition, Festival, War-Horn or Shield Wall. Win, and your founding house can found your next valley.' },
    { icon: '/assets/icons/henge.png', title: 'Race for Great Works', text: 'From Village rank: the Stone Circle, Mead Hall and Great Granary. Only one of each in the valley, so finish first!' },
    { icon: '/assets/icons/fisher.png', title: 'Read the valley', text: 'Every valley is different, and rivers and ridges are real borders: a post can’t claim across water. Cross at a ford or a pass, or lay a Bridge (B) from Hamlet, and a post that holds a crossing fights harder.' },
    { icon: '/assets/icons/storehouse.png', title: 'Your town finds its calling', text: 'What you build decides what your town becomes: storehouses and carts to steadings make Merchants, quarries and Great Works Masons, towers Wardens, fields and fed homes Hearthfolk. The leading calling grows a cluster beside your hall and grants perks. Tap your town at the top left to see them.' },
    { icon: '/assets/icons/berries.png', title: 'Seasons', text: 'Winters bite, so stockpile food: berries sleep and folk eat more, but Fishers keep working.' },
  ];
  return (
    <Modal title="How to Play" onClose={onClose} wide>
      <div class="howto-grid">
        {steps.map((s) => (
          <div class="howto-step" key={s.title}>
            <img src={s.icon} alt="" />
            <div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          </div>
        ))}
      </div>
      <table class="controls">
        <tbody>
          <tr>
            <th></th>
            <th>Mouse &amp; keys</th>
            <th>Touch</th>
          </tr>
          <tr>
            <td>Move</td>
            <td>Drag · WASD</td>
            <td>Drag</td>
          </tr>
          <tr>
            <td>Zoom</td>
            <td>Wheel · + −</td>
            <td>Pinch</td>
          </tr>
          <tr>
            <td>Rotate</td>
            <td>Right-drag · Q E</td>
            <td>Two-finger twist</td>
          </tr>
          <tr>
            <td>Build</td>
            <td>1–9, 0, − then click to place (Shift keeps placing)</td>
            <td>Tap a card, tap the ground, Build here</td>
          </tr>
          <tr>
            <td>House powers · raid</td>
            <td>Z X C, or click a Great House · R</td>
            <td>Tap a Great House</td>
          </tr>
          <tr>
            <td>Valley · Chronicle</td>
            <td>K · the 📜 button</td>
            <td>Tap the Crown · 📜</td>
          </tr>
          <tr>
            <td>Mute</td>
            <td>M</td>
            <td>Settings</td>
          </tr>
          <tr>
            <td>Pause / menu</td>
            <td>Space / Esc</td>
            <td>☰ button</td>
          </tr>
        </tbody>
      </table>
      <p class="muted small">Bubbles above buildings explain what they need: a worker, carriers, or nearby resources.</p>
    </Modal>
  );
}

const TIPS = [
  'Children haul goods. More families means more carriers.',
  'Foragers feed everyone; hungry folk work slowly.',
  'A Sawpit always leaves 6 logs in store for building.',
  'Newcomers bring a skill of their own. Put them to work in their trade.',
  'Footpaths wear into the grass wherever your folk walk most.',
];

function Loading({ shell }: { shell: Shell }) {
  const { fraction, label } = shell.loading.value;
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  return (
    <div class="loading" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)} aria-valuetext={label}>
      <div class="loading-art" style={{ backgroundImage: 'url(/assets/ui/loading.jpg)' }} />
      <div class="title-vignette" />
      <img class="logo small" src={LOGO} alt="FirstFolk" />
      <div class="loading-box">
        <div class="loading-label">
          <span>{label}…</span>
          <span>{Math.round(fraction * 100)}%</span>
        </div>
        <div class="loading-bar">
          <div style={{ width: `${Math.round(fraction * 100)}%` }} />
        </div>
        <p class="tip">Tip: {tip}</p>
      </div>
    </div>
  );
}
