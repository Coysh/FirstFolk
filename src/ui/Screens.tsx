import { useEffect, useState } from 'preact/hooks';
import { audio } from '../audio/audio';
import { DIFFICULTY_INFO, type Difficulty } from '../sim/rules';
import { saveSettings, saveSummary, settings, type Quality } from '../settings';
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

type Panel = null | 'new' | 'settings' | 'howto';

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

function NewGame({ shell, onClose }: { shell: Shell; onClose: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [seed, setSeed] = useState(String(randomSeed()));
  const [rival, setRival] = useState(true);
  const start = () => void shell.newGame(Number(seed.replace(/\D/g, '')) || randomSeed(), difficulty, rival);
  return (
    <Modal title="New Game" onClose={onClose}>
      <p class="muted">Your family arrives with a wagon of supplies in an unexplored valley.</p>
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
          <span>Another settlement across the valley races you for its prizes. First to renown wins.</span>
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
      {saveSummary.value && <p class="warn-note">Starting a new game replaces your current save.</p>}
      <button class="primary big" onClick={start}>
        Found your village
      </button>
    </Modal>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = settings.value;
  const set = (patch: Partial<typeof s>) => saveSettings({ ...s, ...patch });
  const slider = (key: 'master' | 'ambience' | 'effects', label: string) => (
    <label class="slider">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={s[key]} onInput={(e) => set({ [key]: Number((e.target as HTMLInputElement).value) })} onChange={() => audio.play('click')} />
      <span class="val">{Math.round(s[key] * 100)}</span>
    </label>
  );
  return (
    <Modal title="Settings" onClose={onClose}>
      <div class="field-label">Sound</div>
      {slider('master', 'Master')}
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
    { icon: '/assets/icons/renown.png', title: 'Win renown', text: 'First to 1,200 renown wins, or the most renown when the clock reaches 45:00. Landmarks, land, discoveries, Masters, deeds, Great Works and Market Day all count.' },
    { icon: '/assets/icons/woodcutter.png', title: 'Gather and grow', text: 'Woodcutters by trees, Foragers by bushes, Quarries by rocks. Families with room and food have children; empty huts draw newcomers; young adults marry into new households.' },
    { icon: '/assets/icons/lookout.png', title: 'Push your border', text: 'Influence decides the border: Lookouts and Watchtowers push it, and your rival can push back. Landmarks (groves, oakwoods, outcrops, standing stones) pay renown every minute you hold them.' },
    { icon: '/assets/icons/people.png', title: 'Raise great houses', text: 'Work makes Journeymen and Masters. Pick each family’s boons. Your four greatest houses each lend a Deed (Z X C V): Raise, Expeditions, Festivals and more.' },
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
