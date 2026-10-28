import { BALANCE, secs } from './balance';
import { crownPct } from './crown';
import type { World } from './world';

/**
 * The saga: the valley's story, told in a handful of beats. Each beat fires once when its moment
 * comes and gives the player a card: what has happened, and what to do about it. Nothing here
 * changes the sim (beats only announce); it is the thread that makes the long game feel like
 * one journey: the road in, the neighbours, the falling star, the crowning.
 *
 * State: `world.saga`, the number of beats told so far (saved).
 */
export interface SagaBeat {
  id: string;
  icon: string;
  title: string;
  /** Two or three short lines of story. `{rival}` is the neighbouring folk. */
  text: string[];
  /** What to do now, in one line. */
  goal: string;
  when(world: World): boolean;
}

const crownAt = (world: World, pct: number) => !!world.crown && world.players.some((p) => crownPct(world, p.id) >= pct);

export const SAGA: SagaBeat[] = [
  {
    id: 'road',
    icon: '🌠',
    title: 'The Long Road',
    text: ['Winter took the old country. You followed a falling star over the Grey Pass, and below you lay this valley: empty, green, waiting.', 'Your wagon is your hall for now. Raise a camp before the cold comes.'],
    goal: 'Build a Woodcutter and a Forager, then homes for your families.',
    when: (w) => w.tick >= 20,
  },
  {
    id: 'smoke',
    icon: '🔥',
    title: 'Smoke on the Far Hills',
    text: ['You are not alone. The {rival} followed the same star, and their cookfires rise beyond the water.', 'The valley is wide, but the old songs say it will crown only one folk.'],
    goal: 'Send a Scout (T) to find them, and push your border toward the middle of the valley.',
    when: (w) => w.players.length > 1 && (w.tick >= secs(5 * 60 + 30) || w.players[0].rivalSeen),
  },
  {
    id: 'banners',
    icon: '⚔️',
    title: 'Banners at the Border',
    text: ['Spears are being sharpened on both sides. A tower with no spears is a bonfire waiting for a spark.', 'Raiders will come for your outlying posts. Stand with your folk when they do: Rally (G) turns a lost post into a held one.'],
    goal: 'Man your posts, raise a Mustering Hall, and keep the landmarks you hold.',
    when: (w) => w.players.length > 1 && w.tick >= BALANCE.raidsFrom,
  },
  {
    id: 'star',
    icon: '☄️',
    title: 'The Star Falls',
    text: ['It comes down on the old crowning-hill between your folk and theirs, and wakes the Kingstone.', 'The songs are plain: keep a spear beside the stone, alone, and its light will crown your people.'],
    goal: 'Raise a manned post within 9 tiles of the Kingstone. Burn any post the {rival} raise there.',
    when: (w) => !!w.crown,
  },
  {
    id: 'rising',
    icon: '👑',
    title: 'The Crown Fills',
    text: ['Half the Crown is lit and every horn in the valley is blowing. Whoever keeps the stone is winning, and everyone knows it.', 'Their progress drains while you keep it, and yours drains when they do.'],
    goal: 'Hold the stone, or burn the post that holds it, and then take it yourself.',
    when: (w) => crownAt(w, 50),
  },
  {
    id: 'last',
    icon: '🌅',
    title: 'The Last Light',
    text: ['The Crown is almost full. There will not be a second chance to take the Kingstone.', 'Throw everything into the stone: Surge your huscarls, Rally your folk, call every house power.'],
    goal: 'Keep the stone, or break the {rival} at it, before the Crown fills.',
    when: (w) => crownAt(w, 80) || (!!w.scenario.timeLimit && w.tick >= w.scenario.timeLimit - secs(4 * 60)),
  },
];

/** Tell the next beat when its moment comes. Checked every couple of seconds. */
export function updateSaga(world: World): void {
  if (world.scenario.victory !== 'crown') return;
  while (world.saga < SAGA.length && SAGA[world.saga].when(world)) {
    world.emit({ type: 'sagaBeat', beat: world.saga });
    world.saga++;
  }
}
