// ---------------------------------------------------------------------------
// Agent Dialogue / Emotional Connection System
// Template-based dialogue generation for the island economy simulator.
// ---------------------------------------------------------------------------

export type AgentMood = 'happy' | 'neutral' | 'worried' | 'desperate';

export interface AgentDialogue {
  mood: AgentMood;
  moodEmoji: string;
  speech: string;
  thought: string;
  request?: { label: string; action: string };
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
  thought: string;
  request?: { label: string; action: string };
}

// Helper: pick one template at random (deterministic-ish via agent id hash)
function pickTemplate(templates: DialogueTemplate[], seed: number): DialogueTemplate {
  return templates[Math.abs(seed) % templates.length];
}

// --- HAPPY templates by sector ------------------------------------------------

const HAPPY_FOOD: DialogueTemplate[] = [
  {
    speech: '最近收成不錯，家裡存糧充足！',
    thought: '田裡的作物長得很好，生活安穩。',
  },
  {
    speech: '今年的豐收讓我安心了不少。',
    thought: '努力耕作終於有了回報。',
  },
  {
    speech: '市場上食物價格穩定，買賣都很順利！',
    thought: '島上的經濟似乎在穩步成長。',
  },
  {
    speech: '我的農場生意興隆，鄰居也常來買新鮮蔬果。',
    thought: '這樣的生活真讓人滿足。',
  },
];

const HAPPY_GOODS: DialogueTemplate[] = [
  {
    speech: '工坊的訂單接不完，生意好得很！',
    thought: '島上的建設帶動了需求。',
  },
  {
    speech: '最近做出了幾件精品，客人很滿意。',
    thought: '手藝越來越純熟了。',
  },
  {
    speech: '物資充裕，大家的生活越來越好了。',
    thought: '島上的發展讓我充滿希望。',
  },
];

const HAPPY_SERVICES: DialogueTemplate[] = [
  {
    speech: '最近來店裡的客人越來越多了！',
    thought: '服務業果然是未來趨勢。',
  },
  {
    speech: '大家心情都不錯，島上很有活力！',
    thought: '能幫助別人讓我很開心。',
  },
  {
    speech: '我的小店生意穩定，存了一筆錢。',
    thought: '再繼續努力就能實現夢想了。',
  },
];

// --- NEUTRAL templates by sector ----------------------------------------------

const NEUTRAL_FOOD: DialogueTemplate[] = [
  {
    speech: '日子過得去，收成還算正常。',
    thought: '希望天氣別出什麼問題。',
  },
  {
    speech: '今天又是普通的一天，繼續種田吧。',
    thought: '只要能糊口就好。',
  },
  {
    speech: '糧食夠吃，但也沒什麼多餘的。',
    thought: '穩定就好，不求大富大貴。',
  },
];

const NEUTRAL_GOODS: DialogueTemplate[] = [
  {
    speech: '工坊今天正常運作，沒什麼特別的。',
    thought: '訂單不多不少，剛好夠忙。',
  },
  {
    speech: '原料價格還好，勉強維持得住。',
    thought: '希望市場不要突然波動。',
  },
  {
    speech: '做工就是這樣，一天接一天。',
    thought: '至少有工作可做。',
  },
];

const NEUTRAL_SERVICES: DialogueTemplate[] = [
  {
    speech: '今天客人不多也不少，還過得去。',
    thought: '服務業就是起起落落的。',
  },
  {
    speech: '生意普普通通，希望以後會更好。',
    thought: '需要想辦法吸引更多客人。',
  },
  {
    speech: '島上的氣氛還算平靜，繼續努力吧。',
    thought: '穩定的日子也不錯。',
  },
];

// --- WORRIED templates by sector ----------------------------------------------

const WORRIED_FOOD: DialogueTemplate[] = [
  {
    speech: '最近收成不太好，有點擔心...',
    thought: '如果繼續這樣下去，存糧很快就不夠了。',
    request: { label: '增加食物補貼', action: 'subsidy_food' },
  },
  {
    speech: '食物價格漲了不少，大家都在抱怨。',
    thought: '市場好像出了什麼問題。',
    request: { label: '穩定食物價格', action: 'subsidy_food' },
  },
  {
    speech: '田裡的收成勉強夠自己吃，賣不了多少。',
    thought: '是不是該考慮換個行業？',
  },
];

const WORRIED_GOODS: DialogueTemplate[] = [
  {
    speech: '工坊的訂單越來越少了，有點不安。',
    thought: '大家是不是沒錢買東西了？',
    request: { label: '振興製造業', action: 'subsidy_goods' },
  },
  {
    speech: '原料越來越貴，利潤被壓得很薄。',
    thought: '這樣下去遲早要倒閉。',
    request: { label: '降低稅率', action: 'lower_tax' },
  },
  {
    speech: '最近常常做白工，入不敷出...',
    thought: '得想辦法撐過這段艱難的日子。',
  },
];

const WORRIED_SERVICES: DialogueTemplate[] = [
  {
    speech: '客人明顯變少了，是不是島上出問題了？',
    thought: '經濟不景氣對服務業衝擊最大。',
    request: { label: '增加服務業補貼', action: 'subsidy_services' },
  },
  {
    speech: '大家口袋都緊了，不太願意花錢享受。',
    thought: '先求生存再說吧。',
  },
  {
    speech: '最近壓力好大，生意不好做啊...',
    thought: '是不是該換個方向試試？',
  },
];

// --- DESPERATE templates by sector --------------------------------------------

const DESPERATE_FOOD: DialogueTemplate[] = [
  {
    speech: '快要餓死了...誰來幫幫我們...',
    thought: '這座島到底怎麼了？',
    request: { label: '緊急糧食援助', action: 'welfare_enable' },
  },
  {
    speech: '田裡什麼都長不出來，全家快斷糧了！',
    thought: '政府到底在做什麼？',
    request: { label: '啟動社會福利', action: 'welfare_enable' },
  },
];

const DESPERATE_GOODS: DialogueTemplate[] = [
  {
    speech: '工坊已經停工了，完全沒有收入...',
    thought: '再這樣下去只能離開這座島了。',
    request: { label: '啟動公共建設', action: 'public_works' },
  },
  {
    speech: '身上一毛錢都沒有了，怎麼辦...',
    thought: '這不是我想要的生活。',
    request: { label: '啟動社會福利', action: 'welfare_enable' },
  },
];

const DESPERATE_SERVICES: DialogueTemplate[] = [
  {
    speech: '店已經開不下去了，每天都在虧錢...',
    thought: '是不是離開這座島會比較好？',
    request: { label: '降低稅率', action: 'lower_tax' },
  },
  {
    speech: '已經好幾天沒有客人了...撐不住了。',
    thought: '如果政府再不出手，我們都完了。',
    request: { label: '緊急經濟援助', action: 'welfare_enable' },
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

// --- Conditional speech overlays (money / health specific) --------------------

function getConditionalSpeech(agent: AgentDialogueInput, mood: AgentMood): DialogueTemplate | null {
  // Low money
  if (agent.money < 5 && (mood === 'worried' || mood === 'desperate')) {
    return {
      speech: '錢快不夠用了，希望市長能想想辦法...',
      thought: '口袋空空，日子怎麼過？',
      request: { label: '啟動社會福利', action: 'welfare_enable' },
    };
  }
  // Low health
  if (agent.health < 30 && (mood === 'worried' || mood === 'desperate')) {
    return {
      speech: '身體越來越差了...我們需要更好的醫療...',
      thought: '如果倒下了，家人怎麼辦？',
      request: { label: '改善醫療', action: 'public_works' },
    };
  }
  // High savings + happy
  if (agent.savings > 100 && mood === 'happy') {
    return {
      speech: '存了一筆積蓄，心裡踏實多了。',
      thought: '繼續努力，未來可期！',
    };
  }
  // Old age
  const ageYears = agent.age / 12;
  if (ageYears > 55 && (mood === 'neutral' || mood === 'worried')) {
    return {
      speech: '年紀大了，做不動了，希望有人接班。',
      thought: '這座島的未來要靠年輕人了。',
    };
  }
  return null;
}

// --- Dead agent fallback -----------------------------------------------------

const DEAD_DIALOGUE: AgentDialogue = {
  mood: 'desperate',
  moodEmoji: '\u{1FAA6}', // 🪦
  speech: '...',
  thought: '（已離世）',
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

  // Merge: conditional override wins for speech/request, append goal thought
  const speech = conditional?.speech ?? base.speech;
  const thought = (conditional?.thought ?? base.thought) + '\n' + goalThought;
  const request = conditional?.request ?? base.request;

  return {
    mood,
    moodEmoji: emoji,
    speech,
    thought,
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
