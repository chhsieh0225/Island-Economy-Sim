// ---------------------------------------------------------------------------
// Agent Dialogue / Emotional Connection System
// Template-based dialogue generation for the island economy simulator.
// ---------------------------------------------------------------------------

export type AgentMood = 'happy' | 'neutral' | 'worried' | 'desperate';

export interface AgentDialogue {
  mood: AgentMood;
  moodEmoji: string;
  speech: string;
  speechEn: string;
  thought: string;
  thoughtEn: string;
  request?: { label: string; labelEn: string; action: string };
}

// Minimal input shape so this module stays decoupled from the engine Agent class
export interface AgentDialogueInput {
  sector: string;
  goalType: string;
  age: number;       // in months (game turns)
  money: number;
  health: number;
  satisfaction: number;
  alive: boolean;
  savings: number;
}

// ---------------------------------------------------------------------------
// 1. Mood calculation
// ---------------------------------------------------------------------------

const MOOD_EMOJI: Record<AgentMood, string> = {
  happy: '\u{1F60A}',      // 😊
  neutral: '\u{1F610}',    // 😐
  worried: '\u{1F61F}',    // 😟
  desperate: '\u{1F630}',  // 😰
};

export function computeAgentMood(agent: AgentDialogueInput): AgentMood {
  if (!agent.alive) return 'desperate';
  const { satisfaction, health } = agent;
  if (satisfaction > 75 && health > 80) return 'happy';
  if (satisfaction > 50 && health > 50) return 'neutral';
  if (satisfaction > 25 || health > 25) return 'worried';
  return 'desperate';
}

// ---------------------------------------------------------------------------
// 2. Dialogue template pools
// ---------------------------------------------------------------------------

interface DialogueTemplate {
  speech: string;
  speechEn: string;
  thought: string;
  thoughtEn: string;
  request?: { label: string; labelEn: string; action: string };
}

// Helper: pick one template at random (deterministic-ish via agent id hash)
function pickTemplate(templates: DialogueTemplate[], seed: number): DialogueTemplate {
  return templates[Math.abs(seed) % templates.length];
}

// --- HAPPY templates by sector ------------------------------------------------

const HAPPY_FOOD: DialogueTemplate[] = [
  {
    speech: '最近收成不錯，家裡存糧充足！',
    speechEn: 'The harvest has been great lately — our pantry is well stocked!',
    thought: '田裡的作物長得很好，生活安穩。',
    thoughtEn: 'The crops are growing beautifully. Life feels steady.',
  },
  {
    speech: '今年的豐收讓我安心了不少。',
    speechEn: 'This year\'s bumper crop really puts my mind at ease.',
    thought: '努力耕作終於有了回報。',
    thoughtEn: 'All that hard work in the fields is finally paying off.',
  },
  {
    speech: '市場上食物價格穩定，買賣都很順利！',
    speechEn: 'Food prices are stable at the market — business is going smoothly!',
    thought: '島上的經濟似乎在穩步成長。',
    thoughtEn: 'The island\'s economy seems to be growing steadily.',
  },
  {
    speech: '我的農場生意興隆，鄰居也常來買新鮮蔬果。',
    speechEn: 'My farm is thriving! The neighbors often come by for fresh produce.',
    thought: '這樣的生活真讓人滿足。',
    thoughtEn: 'This kind of life is truly satisfying.',
  },
];

const HAPPY_GOODS: DialogueTemplate[] = [
  {
    speech: '工坊的訂單接不完，生意好得很！',
    speechEn: 'Orders are pouring into the workshop — business is booming!',
    thought: '島上的建設帶動了需求。',
    thoughtEn: 'All the construction on the island is driving demand.',
  },
  {
    speech: '最近做出了幾件精品，客人很滿意。',
    speechEn: 'I crafted some fine pieces recently and the customers loved them.',
    thought: '手藝越來越純熟了。',
    thoughtEn: 'My craftsmanship keeps getting better.',
  },
  {
    speech: '物資充裕，大家的生活越來越好了。',
    speechEn: 'Supplies are plentiful — everyone\'s quality of life is improving.',
    thought: '島上的發展讓我充滿希望。',
    thoughtEn: 'The island\'s progress fills me with hope.',
  },
];

const HAPPY_SERVICES: DialogueTemplate[] = [
  {
    speech: '最近來店裡的客人越來越多了！',
    speechEn: 'More and more customers are coming to the shop lately!',
    thought: '服務業果然是未來趨勢。',
    thoughtEn: 'The service industry really is the way of the future.',
  },
  {
    speech: '大家心情都不錯，島上很有活力！',
    speechEn: 'Everyone\'s in good spirits — the island is full of energy!',
    thought: '能幫助別人讓我很開心。',
    thoughtEn: 'Being able to help others makes me happy.',
  },
  {
    speech: '我的小店生意穩定，存了一筆錢。',
    speechEn: 'Business at my little shop is steady — I\'ve saved up some money.',
    thought: '再繼續努力就能實現夢想了。',
    thoughtEn: 'If I keep at it, I can make my dream come true.',
  },
];

// --- NEUTRAL templates by sector ----------------------------------------------

const NEUTRAL_FOOD: DialogueTemplate[] = [
  {
    speech: '日子過得去，收成還算正常。',
    speechEn: 'Getting by — the harvest is about average.',
    thought: '希望天氣別出什麼問題。',
    thoughtEn: 'Hope the weather doesn\'t cause any trouble.',
  },
  {
    speech: '今天又是普通的一天，繼續種田吧。',
    speechEn: 'Just another ordinary day. Back to the fields.',
    thought: '只要能糊口就好。',
    thoughtEn: 'As long as we can put food on the table, that\'s enough.',
  },
  {
    speech: '糧食夠吃，但也沒什麼多餘的。',
    speechEn: 'We have enough food, but nothing to spare.',
    thought: '穩定就好，不求大富大貴。',
    thoughtEn: 'Stability is fine — I\'m not chasing riches.',
  },
];

const NEUTRAL_GOODS: DialogueTemplate[] = [
  {
    speech: '工坊今天正常運作，沒什麼特別的。',
    speechEn: 'The workshop is running as usual — nothing out of the ordinary.',
    thought: '訂單不多不少，剛好夠忙。',
    thoughtEn: 'Orders are just enough to keep me busy.',
  },
  {
    speech: '原料價格還好，勉強維持得住。',
    speechEn: 'Material prices are manageable — barely hanging on.',
    thought: '希望市場不要突然波動。',
    thoughtEn: 'Hope the market doesn\'t swing suddenly.',
  },
  {
    speech: '做工就是這樣，一天接一天。',
    speechEn: 'That\'s just how workshop life goes — one day at a time.',
    thought: '至少有工作可做。',
    thoughtEn: 'At least I have work to do.',
  },
];

const NEUTRAL_SERVICES: DialogueTemplate[] = [
  {
    speech: '今天客人不多也不少，還過得去。',
    speechEn: 'Customer flow is average today — can\'t complain.',
    thought: '服務業就是起起落落的。',
    thoughtEn: 'The service business always has its ups and downs.',
  },
  {
    speech: '生意普普通通，希望以後會更好。',
    speechEn: 'Business is so-so. Hoping things pick up later.',
    thought: '需要想辦法吸引更多客人。',
    thoughtEn: 'Need to figure out how to attract more customers.',
  },
  {
    speech: '島上的氣氛還算平靜，繼續努力吧。',
    speechEn: 'The island\'s mood is calm enough. Just keep working.',
    thought: '穩定的日子也不錯。',
    thoughtEn: 'Steady days aren\'t bad at all.',
  },
];

// --- WORRIED templates by sector ----------------------------------------------

const WORRIED_FOOD: DialogueTemplate[] = [
  {
    speech: '最近收成不太好，有點擔心...',
    speechEn: 'The harvest hasn\'t been great lately... I\'m a bit worried.',
    thought: '如果繼續這樣下去，存糧很快就不夠了。',
    thoughtEn: 'If this keeps up, our food reserves will run out soon.',
    request: { label: '增加食物補貼', labelEn: 'Increase food subsidies', action: 'subsidy_food' },
  },
  {
    speech: '食物價格漲了不少，大家都在抱怨。',
    speechEn: 'Food prices have gone up a lot — everyone\'s complaining.',
    thought: '市場好像出了什麼問題。',
    thoughtEn: 'Something seems wrong with the market.',
    request: { label: '穩定食物價格', labelEn: 'Stabilize food prices', action: 'subsidy_food' },
  },
  {
    speech: '田裡的收成勉強夠自己吃，賣不了多少。',
    speechEn: 'The harvest barely feeds my family — there\'s nothing left to sell.',
    thought: '是不是該考慮換個行業？',
    thoughtEn: 'Maybe I should think about switching trades?',
  },
];

const WORRIED_GOODS: DialogueTemplate[] = [
  {
    speech: '工坊的訂單越來越少了，有點不安。',
    speechEn: 'Orders at the workshop keep dropping... it\'s unsettling.',
    thought: '大家是不是沒錢買東西了？',
    thoughtEn: 'Has everyone run out of money to buy things?',
    request: { label: '振興製造業', labelEn: 'Boost manufacturing', action: 'subsidy_goods' },
  },
  {
    speech: '原料越來越貴，利潤被壓得很薄。',
    speechEn: 'Raw materials keep getting more expensive — margins are razor thin.',
    thought: '這樣下去遲早要倒閉。',
    thoughtEn: 'At this rate, I\'ll have to shut down sooner or later.',
    request: { label: '降低稅率', labelEn: 'Lower tax rates', action: 'lower_tax' },
  },
  {
    speech: '最近常常做白工，入不敷出...',
    speechEn: 'Lately I\'ve been working for nothing — expenses exceed income...',
    thought: '得想辦法撐過這段艱難的日子。',
    thoughtEn: 'I need to find a way to get through these tough times.',
  },
];

const WORRIED_SERVICES: DialogueTemplate[] = [
  {
    speech: '客人明顯變少了，是不是島上出問題了？',
    speechEn: 'Customers have clearly dwindled. Is something wrong on the island?',
    thought: '經濟不景氣對服務業衝擊最大。',
    thoughtEn: 'An economic downturn hits the service sector the hardest.',
    request: { label: '增加服務業補貼', labelEn: 'Increase service subsidies', action: 'subsidy_services' },
  },
  {
    speech: '大家口袋都緊了，不太願意花錢享受。',
    speechEn: 'Everyone\'s tightening their belts — nobody wants to spend on luxuries.',
    thought: '先求生存再說吧。',
    thoughtEn: 'Survival first, everything else later.',
  },
  {
    speech: '最近壓力好大，生意不好做啊...',
    speechEn: 'The stress is really getting to me — business is tough...',
    thought: '是不是該換個方向試試？',
    thoughtEn: 'Maybe I should try a different direction?',
  },
];

// --- DESPERATE templates by sector --------------------------------------------

const DESPERATE_FOOD: DialogueTemplate[] = [
  {
    speech: '快要餓死了...誰來幫幫我們...',
    speechEn: 'We\'re starving... someone please help us...',
    thought: '這座島到底怎麼了？',
    thoughtEn: 'What on earth has happened to this island?',
    request: { label: '緊急糧食援助', labelEn: 'Emergency food aid', action: 'welfare_enable' },
  },
  {
    speech: '田裡什麼都長不出來，全家快斷糧了！',
    speechEn: 'Nothing will grow in the fields — my family is about to run out of food!',
    thought: '政府到底在做什麼？',
    thoughtEn: 'What is the government even doing?',
    request: { label: '啟動社會福利', labelEn: 'Enable social welfare', action: 'welfare_enable' },
  },
];

const DESPERATE_GOODS: DialogueTemplate[] = [
  {
    speech: '工坊已經停工了，完全沒有收入...',
    speechEn: 'The workshop has shut down completely — no income at all...',
    thought: '再這樣下去只能離開這座島了。',
    thoughtEn: 'If this goes on, I\'ll have no choice but to leave this island.',
    request: { label: '啟動公共建設', labelEn: 'Launch public works', action: 'public_works' },
  },
  {
    speech: '身上一毛錢都沒有了，怎麼辦...',
    speechEn: 'I don\'t have a single coin left... what do I do...',
    thought: '這不是我想要的生活。',
    thoughtEn: 'This is not the life I wanted.',
    request: { label: '啟動社會福利', labelEn: 'Enable social welfare', action: 'welfare_enable' },
  },
];

const DESPERATE_SERVICES: DialogueTemplate[] = [
  {
    speech: '店已經開不下去了，每天都在虧錢...',
    speechEn: 'I can\'t keep the shop open anymore — losing money every day...',
    thought: '是不是離開這座島會比較好？',
    thoughtEn: 'Would it be better to just leave this island?',
    request: { label: '降低稅率', labelEn: 'Lower tax rates', action: 'lower_tax' },
  },
  {
    speech: '已經好幾天沒有客人了...撐不住了。',
    speechEn: 'Haven\'t had a single customer in days... I can\'t hold on.',
    thought: '如果政府再不出手，我們都完了。',
    thoughtEn: 'If the government doesn\'t step in soon, we\'re all done for.',
    request: { label: '緊急經濟援助', labelEn: 'Emergency economic aid', action: 'welfare_enable' },
  },
];

// Sector template map keyed by mood then sector
const SECTOR_TEMPLATES: Record<AgentMood, Record<string, DialogueTemplate[]>> = {
  happy: { food: HAPPY_FOOD, goods: HAPPY_GOODS, services: HAPPY_SERVICES },
  neutral: { food: NEUTRAL_FOOD, goods: NEUTRAL_GOODS, services: NEUTRAL_SERVICES },
  worried: { food: WORRIED_FOOD, goods: WORRIED_GOODS, services: WORRIED_SERVICES },
  desperate: { food: DESPERATE_FOOD, goods: DESPERATE_GOODS, services: DESPERATE_SERVICES },
};

// --- Goal-specific thought overlays ------------------------------------------

const GOAL_THOUGHTS: Record<string, string[]> = {
  survival: [
    '只要能活下去就好。',
    '安全和溫飽是最重要的。',
    '先保住命再說其他的。',
    '每天能吃飽已經很感恩了。',
  ],
  wealth: [
    '我想賺更多錢，讓家人過好日子。',
    '目標是成為島上最富有的人！',
    '錢不是萬能的，但沒錢萬萬不能。',
    '投資和儲蓄才是長久之計。',
  ],
  happiness: [
    '開心最重要，錢夠用就好。',
    '希望島上每個人都能幸福。',
    '工作是為了生活，不是生活為了工作。',
    '能做自己喜歡的事就是幸福。',
  ],
  balanced: [
    '凡事求個平衡吧。',
    '健康、財富、快樂缺一不可。',
    '穩穩當當地過日子就好。',
    '不貪心，但也不能太安逸。',
  ],
};

const GOAL_THOUGHTS_EN: Record<string, string[]> = {
  survival: [
    'As long as I can survive, that\'s all that matters.',
    'Safety and a full stomach — that\'s what counts.',
    'Stay alive first, worry about the rest later.',
    'Being able to eat every day is something to be grateful for.',
  ],
  wealth: [
    'I want to earn more money so my family can live well.',
    'My goal is to become the wealthiest person on the island!',
    'Money isn\'t everything, but you can\'t do anything without it.',
    'Investing and saving — that\'s the key to lasting prosperity.',
  ],
  happiness: [
    'Happiness is what matters most — as long as I have enough money.',
    'I hope everyone on the island can find happiness.',
    'We work to live, not live to work.',
    'Being able to do what I love — that\'s true happiness.',
  ],
  balanced: [
    'Balance in all things, that\'s the way.',
    'Health, wealth, and happiness — you need all three.',
    'A steady, stable life is good enough for me.',
    'Don\'t be greedy, but don\'t get too comfortable either.',
  ],
};

// --- Conditional speech overlays (money / health specific) --------------------

function getConditionalSpeech(agent: AgentDialogueInput, mood: AgentMood): DialogueTemplate | null {
  // Low money
  if (agent.money < 5 && (mood === 'worried' || mood === 'desperate')) {
    return {
      speech: '錢快不夠用了，希望市長能想想辦法...',
      speechEn: 'Running out of money... I hope the mayor can figure something out.',
      thought: '口袋空空，日子怎麼過？',
      thoughtEn: 'Empty pockets — how am I supposed to get by?',
      request: { label: '啟動社會福利', labelEn: 'Enable social welfare', action: 'welfare_enable' },
    };
  }
  // Low health
  if (agent.health < 30 && (mood === 'worried' || mood === 'desperate')) {
    return {
      speech: '身體越來越差了...我們需要更好的醫療...',
      speechEn: 'My health is getting worse... we need better healthcare.',
      thought: '如果倒下了，家人怎麼辦？',
      thoughtEn: 'If I collapse, what will happen to my family?',
      request: { label: '改善醫療', labelEn: 'Improve healthcare', action: 'public_works' },
    };
  }
  // High savings + happy
  if (agent.savings > 100 && mood === 'happy') {
    return {
      speech: '存了一筆積蓄，心裡踏實多了。',
      speechEn: 'I\'ve built up a nice nest egg — feels so much more secure.',
      thought: '繼續努力，未來可期！',
      thoughtEn: 'Keep working hard — the future looks bright!',
    };
  }
  // Old age
  const ageYears = agent.age / 12;
  if (ageYears > 55 && (mood === 'neutral' || mood === 'worried')) {
    return {
      speech: '年紀大了，做不動了，希望有人接班。',
      speechEn: 'I\'m getting old and can\'t work like I used to. Hope someone takes over.',
      thought: '這座島的未來要靠年輕人了。',
      thoughtEn: 'The future of this island rests with the younger generation.',
    };
  }
  return null;
}

// --- Dead agent fallback -----------------------------------------------------

const DEAD_DIALOGUE: AgentDialogue = {
  mood: 'desperate',
  moodEmoji: '\u{1FAA6}', // 🪦
  speech: '...',
  speechEn: '...',
  thought: '（已離世）',
  thoughtEn: '(Departed)',
};

// ---------------------------------------------------------------------------
// 3. Main generation function
// ---------------------------------------------------------------------------

export function generateDialogue(agent: AgentDialogueInput, mood: AgentMood): AgentDialogue {
  if (!agent.alive) return { ...DEAD_DIALOGUE };

  const emoji = MOOD_EMOJI[mood];

  // Build a simple numeric seed from agent properties for deterministic-ish pick
  const seed = Math.floor(
    Math.abs(agent.money * 7 + agent.health * 13 + agent.satisfaction * 17 + agent.age * 3),
  );

  // Try conditional speech first (money/health/age overrides)
  const conditional = getConditionalSpeech(agent, mood);

  // Pick sector-based template
  const sectorKey = agent.sector as string;
  const pool = SECTOR_TEMPLATES[mood][sectorKey] ?? SECTOR_TEMPLATES[mood].food;
  const base = pickTemplate(pool, seed);

  // Pick goal-specific thought
  const goalPool = GOAL_THOUGHTS[agent.goalType] ?? GOAL_THOUGHTS.balanced;
  const goalThought = goalPool[seed % goalPool.length];
  const goalPoolEn = GOAL_THOUGHTS_EN[agent.goalType] ?? GOAL_THOUGHTS_EN.balanced;
  const goalThoughtEn = goalPoolEn[seed % goalPoolEn.length];

  // Merge: conditional override wins for speech/request, append goal thought
  const speech = conditional?.speech ?? base.speech;
  const speechEn = conditional?.speechEn ?? base.speechEn;
  const thought = (conditional?.thought ?? base.thought) + '\n' + goalThought;
  const thoughtEn = (conditional?.thoughtEn ?? base.thoughtEn) + '\n' + goalThoughtEn;
  const request = conditional?.request ?? base.request;

  return {
    mood,
    moodEmoji: emoji,
    speech,
    speechEn,
    thought,
    thoughtEn,
    request,
  };
}

// ---------------------------------------------------------------------------
// 4. Public API — single entry point
// ---------------------------------------------------------------------------

export function buildAgentDialogue(agent: AgentDialogueInput): AgentDialogue {
  const mood = computeAgentMood(agent);
  return generateDialogue(agent, mood);
}
