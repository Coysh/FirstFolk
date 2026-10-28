import { useEffect, useState } from 'preact/hooks';
import { audio } from '../audio/audio';
import { DIFFICULTY_INFO, type Difficulty } from '../sim/rules';
import { dailyBest, dailySeed, dynasties, saveSettings, saveSummary, settings, todayKey, type Quality, type StoredDynasty } from '../settings';
import { BOONS } from '../sim/boons';
import { TRADES } from '../sim/trades';
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
        <p class="tagline">Found a village. Raise a family. Pass down the craft.</p>
        <nav class="title-menu">
          {summary && (
            <button class="plaque primary" onClick={() => void shell.continueGame()}>
              <span class="pl-title">Continue</span>
              <span class="pl-sub">
                {formatTime(summary.tick)} played · {summary.population} folk · {summary.families} families · {timeAgo(summary.savedAt)}
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
 * The opener (origin) is chosen before the clock starts.
 */
function NewGame({ shell, onClose, daily }: { shell: Shell; onClose: () => void; daily?: boolean }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [seed, setSeed] = useState(String(daily ? dailySeed(todayKey()) : randomSeed()));
  const [rival, setRival] = useState(true);
  const [origin, setOrigin] = useState<OriginId>('woodfolk');
  const [heir, setHeir] = useState<StoredDynasty | null>(null);
  const seedNum = Number(seed.replace(/\D/g, '')) || 0;
  const pick = heir ? 'dynasty' : origin;
  const start = () =>
    daily
      ? void shell.newGame(dailySeed(todayKey()), 'normal', true, pick, `daily-${todayKey()}`, heir ?? undefined)
      : void shell.newGame(seedNum || randomSeed(), difficulty, rival, pick, '', heir ?? undefined);
  return (
    <Modal title={daily ? `Daily Valley · ${todayKey()}` : 'New Game'} onClose={onClose} wide>
      <p class="muted">{daily ? 'Everyone gets the same valley today. Win it, then beat your own renown.' : 'Your family arrives with a wagon of supplies in an unexplored valley.'}</p>
      <div class="field-label">Your founding house</div>
      <div class="choices origins">
        {ORIGIN_IDS.map((id) => (
          <button
            key={id}
            class={`choice origin ${!heir && origin === id ? 'on' : ''}`}
            onClick={() => {
              setOrigin(id);
              setHeir(null);
            }}
            aria-pressed={!heir && origin === id}
          >
            <strong>
              <span class="or-icon">{ORIGINS[id].icon}</span> {ORIGINS[id].name}
            </strong>
            <span>{ORIGINS[id].blurb}</span>
          </button>
        ))}
      </div>
      {dynasties.value.length > 0 && (
        <>
          <div class="field-label">Or carry on a dynasty (houses that won you a valley)</div>
          <div class="choices origins">
            {dynasties.value.map((d) => (
              <button key={d.surname} class={`choice origin dynasty ${heir?.surname === d.surname ? 'on' : ''}`} onClick={() => setHeir(d)} aria-pressed={heir?.surname === d.surname}>
                <strong>
                  <span class="or-icon">👑</span> The {d.surname} line{d.generation > 1 ? `, generation ${d.generation}` : ''}
                </strong>
                <span>
                  {d.boons.map((b) => BOONS[b].name).join(' & ') || 'No boons'}
                  {d.skill ? ` · ${TRADES[d.skill].name} from the start` : ''} · won with {d.renown}★
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {seedNum > 0 && (
        <div class="omens">
          <span class="field-label">This valley’s omens</span>
          {rollOmens(daily ? dailySeed(todayKey()) : seedNum).map((o) => (
            <span class="omen" key={o} title={OMENS[o].blurb}>
              {OMENS[o].icon} <b>{OMENS[o].name}</b> <small>{OMENS[o].blurb}</small>
            </span>
          ))}
        </div>
      )}
      {!daily && (
        <>
          <div class="field-label">Difficulty</div>
          <div class="choices">
            {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map((d) => (
              <button key={d} class={`choice ${difficulty === d ? 'on' : ''}`} onClick={() => setDifficulty(d)} aria-pressed={difficulty === d}>
                <strong>{DIFFICULTY_INFO[d].name}</strong>
                <span>{DIFFICULTY_INFO[d].blurb}</span>
              </button>
            ))}
          </div>
          <div class="field-label">Rival</div>
          <div class="choices">
            <button class={`choice ${rival ? 'on' : ''}`} onClick={() => setRival(true)} aria-pressed={rival}>
              <strong>Race a rival</strong>
              <span>Another settlement across the valley races you for renown. First to 1,600 wins.</span>
            </button>
            <button class={`choice ${!rival ? 'on' : ''}`} onClick={() => setRival(false)} aria-pressed={!rival}>
              <strong>Peaceful</strong>
              <span>The valley is yours alone. Build and explore at your own pace.</span>
            </button>
          </div>
          <label class="field-label" for="seed">
            Valley seed
          </label>
          <div class="seed-row">
            <input id="seed" inputMode="numeric" value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && start()} />
            <button onClick={() => setSeed(String(randomSeed()))} title="Random valley" aria-label="Random seed">
              🎲
            </button>
          </div>
        </>
      )}
      {saveSummary.value && <p class="warn-note">Starting a new game replaces your current save.</p>}
      <button class="primary big" onClick={start}>
        {daily ? 'Take on today’s valley' : 'Found your village'}
      </button>
    </Modal>
  );
}

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
        <input type="checkbox" checked={s.hints} onChange={(e) => set({ hints: (e.target as HTMLInputElement).checked })} />
        Show objective hints
      </label>
      <p class="muted small">Graphics changes apply immediately; ground detail density updates with the next valley you load.</p>
    </Modal>
  );
}

export function HowTo({ onClose }: { onClose: () => void }) {
  const steps = [
    { icon: '/assets/icons/renown.png', title: 'Win renown', text: 'First to 1,600 renown wins, or the most renown when the clock reaches 45:00. From 25:00 the Moot makes landmarks pay double. Landmarks, land, discoveries, Masters, deeds, Great Works and Market Day all count.' },
    { icon: '/assets/icons/woodcutter.png', title: 'Gather and grow', text: 'Woodcutters by trees, Foragers by bushes, Quarries by rocks. Families with room and food have children; empty huts draw newcomers; young adults marry into new households.' },
    { icon: '/assets/icons/lookout.png', title: 'Push your border', text: 'Influence decides the border: Lookouts and Watchtowers push it, and your rival can push back. Landmarks (groves, oakwoods, outcrops, standing stones) pay renown every minute you hold them.' },
    { icon: '/assets/icons/people.png', title: 'Raise great houses', text: 'Work makes Journeymen and Masters. Choices arrive as letters at the left: open them when you like. Your four greatest houses each lend a Deed (Z X C V). Win, and your greatest house can found your next valley.' },
    { icon: '/assets/icons/henge.png', title: 'Race for Great Works', text: 'From Village rank: the Stone Circle, Mead Hall and Great Granary. Only one of each in the valley, so finish first! Sell surplus on Market Day for renown.' },
    { icon: '/assets/icons/berries.png', title: 'Generations', text: 'Winters bite, so stockpile food. Folk grow old, teach their families and die; a Master who dies becomes a legend that makes their craft faster for all.' },
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
            <td>Family deeds</td>
            <td>Z X C V, or click a Great House</td>
            <td>Tap a Great House</td>
          </tr>
          <tr>
            <td>Mute</td>
            <td>M, or the 🔊 button</td>
            <td>🔊 button</td>
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
