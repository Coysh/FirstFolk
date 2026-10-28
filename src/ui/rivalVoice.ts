/**
 * The rival has a voice: their house's head sends word when the race turns, boasting,
 * grumbling or goading. Pure flavour (UI only), so it may pick lines at random.
 */
export type RivalMoment = 'greet' | 'theyTook' | 'youTook' | 'theyWon' | 'youWon' | 'theirWork' | 'yourWork' | 'starfall' | 'moot' | 'theyLead' | 'youLead' | 'raid' | 'burned' | 'repelled' | 'warMood' | 'wallsMood' | 'scout';

const LINES: Record<RivalMoment, string[]> = {
  greet: ['“The valley is wide, neighbour. Not wide enough for two great towns.”', '“Welcome to our valley. Do try to keep up.”'],
  theyTook: ['“The {site} sing for us now. Come and take them back, if you dare.”', '“Thank you for keeping the {site} warm for us.”', '“Our banners fly over the {site}. A fine view from up here.”'],
  youTook: ['“Enjoy the {site} while you can. We are coming for them.”', '“A lucky push. It will not happen twice.”', '“You have taken the {site}? Our elders are not amused.”'],
  theyWon: ['“Another prize for {house}! Perhaps practise more?”', '“Was that a contest? We barely noticed.”'],
  youWon: ['“Beginner’s luck. Next time the prize is ours.”', '“Hmph. Our folk were busy with more important work.”'],
  theirWork: ['“Behold {work}! Built by {house} hands. Your masons may visit to learn.”'],
  yourWork: ['“So you finished {work}. We meant to build a better one anyway.”'],
  starfall: ['“A star fell between us. The heavens choose {house}, surely?”', '“Did you see the star? It is ours, of course.”'],
  scout: ['“Our runner saw your border. Plain walls, plainer plans.”', '“Do wave to our scout. He will be reporting back.”', '“Looking for something? Our scout found it first.”'],
  moot: ['“The stone is lit, neighbour. Only one of us will stand in its light.”', '“Keep a spear by the Kingstone, if you like. Ours will be there too.”'],
  theyLead: ['“The bards sing of {house} this season. Your name? They forgot it.”'],
  youLead: ['“Renown is fickle, neighbour. The race is not over.”'],
  raid: ['“Your {building} looks lonely. We are coming to keep it company.”', '“Hear that horn? It blows for your {building}.”', '“A tower with no spears is a bonfire waiting for a spark.”'],
  burned: ['“You burned our {building}?! Our huscarls will remember this.”', '“Cowards, striking a tower by night. We will build it taller.”'],
  warMood: ['“You run ahead of us? Then our huscarls will slow you down.”', '“Sharpen the spears. Our neighbours have grown proud.”'],
  wallsMood: ['“We are ahead, and we mean to stay there. Raise the stockades!”', '“Let them come. Our walls are ready.”'],
  repelled: ['“Lucky. Your guards will not be so lucky twice.”', '“A stout wall. We will find a weaker one.”'],
};

export function rivalLine(moment: RivalMoment, vars: Record<string, string>): string {
  const pool = LINES[moment];
  return pool[Math.floor(Math.random() * pool.length)].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
