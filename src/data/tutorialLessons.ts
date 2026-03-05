import type { GameState } from '../types';

/* ────────────────────────────────────────────────────────────────────────────
 * Tutorial Lesson System
 *
 * Each lesson focuses on ONE economic concept, with constrained controls
 * and clear objectives. Lessons must be completed in order.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TutorialObjective {
  id: string;
  text: string;
  textEn: string;
  check: (state: GameState) => boolean;
}

export interface TutorialHint {
  text: string;
  textEn: string;
  /** Return true when this hint should be shown */
  showWhen: (state: GameState) => boolean;
}

export type PolicySection =
  | 'taxRate'
  | 'subsidy'
  | 'welfare'
  | 'publicWorks'
  | 'policyRate'
  | 'liquiditySupport';

export interface TutorialLesson {
  id: string;
  order: number;
  emoji: string;
  title: string;
  titleEn: string;
  /** Link to encyclopedia entries for "learn more" */
  conceptIds: string[];

  /** Opening narrative shown as a modal when lesson starts */
  intro: string[];
  introEn: string[];

  /** Which policy controls are available in this lesson */
  enabledControls: Set<PolicySection>;

  /** Brief instruction shown in the tutorial sidebar */
  instruction: string;
  instructionEn: string;

  /** Objectives the player must achieve */
  objectives: TutorialObjective[];

  /** Contextual hints that appear based on game state */
  hints: TutorialHint[];

  /** Summary shown on lesson completion */
  summary: string;
  summaryEn: string;

  /** Max turns before auto-completing (prevents getting stuck) */
  maxTurns: number;

  /** Fixed seed for reproducible experience */
  seed: number;

  /** Whether to start with inflation scenario prices */
  useInflationPrices?: boolean;
}

/* ─── Lesson Definitions ────────────────────────────────────────────────── */

export const TUTORIAL_LESSONS: TutorialLesson[] = [
  // ─── Lesson 1: Supply & Demand ─────────────────────────────────────────
  {
    id: 'market_basics',
    order: 0,
    emoji: '🏪',
    title: '觀察市場：供給與需求',
    titleEn: 'Observe the Market: Supply & Demand',
    conceptIds: ['supply_demand', 'market_equilibrium'],
    intro: [
      '歡迎來到經濟學教室！在這第一堂課中，你只需要觀察——先不急著動手。',
      '島上有 100 位居民，他們每回合會生產東西、在市場上交易、消費物資。',
      '市場價格由供給（賣家願意賣的量）和需求（買家想買的量）共同決定。',
      '請按「下一回合」推進時間，同時觀察右方市場面板中的價格變化。',
    ],
    introEn: [
      'Welcome to Economics class! In this first lesson, just observe — no need to act yet.',
      'The island has 100 residents who produce, trade, and consume goods each turn.',
      'Market prices are determined by supply (what sellers offer) and demand (what buyers want).',
      'Press "Next Turn" to advance time and watch price changes in the Market panel.',
    ],
    enabledControls: new Set(),
    instruction: '按「下一回合」推進 5 回合，觀察市場面板中三種商品的價格走勢。',
    instructionEn: 'Press "Next Turn" 5 times and watch how prices of all 3 goods change in the Market panel.',
    objectives: [
      {
        id: 'advance_5',
        text: '推進到第 5 回合',
        textEn: 'Advance to turn 5',
        check: (s) => s.turn >= 5,
      },
    ],
    hints: [
      {
        text: '💡 注意食物價格——它是最基本的生活必需品，需求最穩定。',
        textEn: '💡 Notice food prices — it\'s the most essential good with the most stable demand.',
        showWhen: (s) => s.turn >= 2 && s.turn < 4,
      },
      {
        text: '💡 如果某商品供不應求（Demand > Supply），價格就會上漲。反之則下跌。',
        textEn: '💡 When demand exceeds supply, prices rise. When supply exceeds demand, prices fall.',
        showWhen: (s) => s.turn >= 4,
      },
    ],
    summary:
      '你觀察到了市場的自動調節機制！當需求大於供給時價格上漲，供給大於需求時價格下跌。' +
      '這就是亞當·斯密所說的「看不見的手」——市場會自動找到均衡價格。',
    summaryEn:
      'You observed the market\'s self-adjusting mechanism! Prices rise when demand exceeds supply, ' +
      'and fall when supply exceeds demand. This is Adam Smith\'s "invisible hand" — markets naturally find equilibrium.',
    maxTurns: 10,
    seed: 42,
  },

  // ─── Lesson 2: Price Discovery ─────────────────────────────────────────
  {
    id: 'price_discovery',
    order: 1,
    emoji: '📊',
    title: '價格如何決定：瓦爾拉斯調價',
    titleEn: 'How Prices Are Set: Walrasian Pricing',
    conceptIds: ['walrasian', 'elasticity'],
    intro: [
      '上一課你看到價格會波動。但價格究竟如何被「決定」的？',
      '本島使用一種叫做「瓦爾拉斯試探」（Tatonnement）的機制：每回合結束後，系統計算超額需求，根據差距微調價格。',
      '食物是必需品，需求彈性低（漲價了也得買）；服務是奢侈品，彈性高（漲了就不買）。',
      '繼續觀察 10 回合，注意三種商品的價格收斂速度有何不同。',
    ],
    introEn: [
      'In the last lesson you saw prices fluctuate. But how exactly are prices "determined"?',
      'The island uses "Walrasian tatonnement": after each turn, the system calculates excess demand and adjusts prices.',
      'Food is essential (low elasticity — must buy even at high prices). Services are optional (high elasticity).',
      'Observe for 10 more turns and notice how the three goods converge at different speeds.',
    ],
    enabledControls: new Set(),
    instruction: '觀察 10 回合，比較食物、商品、服務的價格波動幅度。',
    instructionEn: 'Observe for 10 turns and compare price volatility across food, goods, and services.',
    objectives: [
      {
        id: 'advance_10',
        text: '推進到第 10 回合',
        textEn: 'Advance to turn 10',
        check: (s) => s.turn >= 10,
      },
    ],
    hints: [
      {
        text: '💡 觀察市場面板中 Supply（供給量）和 Demand（需求量）的數字。差距越大，下回合價格調整幅度越大。',
        textEn: '💡 Check Supply and Demand numbers in the Market panel. Larger gaps mean bigger price adjustments.',
        showWhen: (s) => s.turn >= 3 && s.turn < 6,
      },
      {
        text: '💡 食物價格通常最穩定，因為每個人都需要食物。服務價格波動較大，因為不是必需品。',
        textEn: '💡 Food prices are usually most stable since everyone needs food. Service prices fluctuate more.',
        showWhen: (s) => s.turn >= 6,
      },
    ],
    summary:
      '瓦爾拉斯調價是市場尋找均衡的過程。必需品（食物）因為需求穩定，價格收斂較快；' +
      '非必需品（服務）因為需求彈性高，價格波動較大。了解這個機制是制定政策的基礎！',
    summaryEn:
      'Walrasian pricing is how markets find equilibrium. Essential goods (food) converge faster due to stable demand; ' +
      'non-essentials (services) fluctuate more due to higher elasticity. Understanding this is the foundation for policy-making!',
    maxTurns: 15,
    seed: 42,
  },

  // ─── Lesson 3: Taxation ────────────────────────────────────────────────
  {
    id: 'taxation',
    order: 2,
    emoji: '💰',
    title: '認識稅收：政府的收入來源',
    titleEn: 'Understanding Taxation: Government Revenue',
    conceptIds: ['tax_policy', 'fiscal_policy'],
    intro: [
      '現在輪到你當市長了！你的第一個工具是「稅率」。',
      '稅收是政府的主要收入來源——用來支付公共服務、福利、建設。',
      '但稅率太高會減少居民的可支配所得，讓他們買不起東西，經濟可能萎縮。',
      '試試調整稅率，觀察國庫（Treasury）的變化，找出一個好的平衡點。',
    ],
    introEn: [
      'Now it\'s your turn to govern! Your first tool is the "tax rate".',
      'Taxes are the government\'s main revenue source — used for public services, welfare, and infrastructure.',
      'But taxes that are too high reduce disposable income, causing people to buy less and shrinking the economy.',
      'Try adjusting the tax rate and observe how the Treasury changes. Find a good balance!',
    ],
    enabledControls: new Set<PolicySection>(['taxRate']),
    instruction: '將稅率調到 15% 以上，推進 5 回合觀察國庫增長。',
    instructionEn: 'Set tax rate to 15% or higher and advance 5 turns to observe treasury growth.',
    objectives: [
      {
        id: 'set_tax',
        text: '設定稅率至少 15%',
        textEn: 'Set tax rate to at least 15%',
        check: (s) => s.government.taxRate >= 0.15,
      },
      {
        id: 'treasury_grow',
        text: '國庫餘額達到 $50 以上',
        textEn: 'Treasury balance reaches $50+',
        check: (s) => s.government.treasury >= 50,
      },
      {
        id: 'advance_8',
        text: '推進到第 8 回合',
        textEn: 'Advance to turn 8',
        check: (s) => s.turn >= 8,
      },
    ],
    hints: [
      {
        text: '💡 左下方的政策面板有「稅率」滑桿，拖動它來調整稅率。',
        textEn: '💡 The Policy panel below has a "Tax Rate" slider. Drag it to adjust.',
        showWhen: (s) => s.turn < 2 && s.government.taxRate < 0.15,
      },
      {
        text: '💡 注意儀表板上的「國庫」數字——它代表政府手上有多少錢可以花。',
        textEn: '💡 Watch the "Treasury" number on the Dashboard — it shows how much money the government has.',
        showWhen: (s) => s.government.taxRate >= 0.15 && s.turn < 5,
      },
      {
        text: '💡 如果稅率太高（>30%），居民的消費能力會明顯下降，觀察滿意度的變化。',
        textEn: '💡 If tax rate is too high (>30%), residents\' spending drops. Watch satisfaction change.',
        showWhen: (s) => s.government.taxRate > 0.3,
      },
    ],
    summary:
      '你體驗了稅收的基本原理：稅率越高，政府收入越多，但居民可支配所得越少。' +
      '這就是經濟學中的「拉弗曲線」概念——存在一個最佳稅率，超過後反而稅收減少。',
    summaryEn:
      'You experienced the basics of taxation: higher rates mean more revenue but less disposable income. ' +
      'This is the "Laffer Curve" concept — there\'s an optimal rate, beyond which revenue actually decreases.',
    maxTurns: 15,
    seed: 42,
  },

  // ─── Lesson 4: Subsidies ───────────────────────────────────────────────
  {
    id: 'subsidies',
    order: 3,
    emoji: '🌾',
    title: '補貼的力量：扶持產業',
    titleEn: 'Power of Subsidies: Supporting Industries',
    conceptIds: ['subsidy_policy', 'externality'],
    intro: [
      '政府除了收稅，還可以「給錢」——那就是補貼。',
      '補貼可以直接提高某個產業的生產力，讓它產出更多、價格更低。',
      '但補貼也有成本：它可能扭曲市場，讓效率降低。',
      '試試對食物部門補貼，觀察食物產量和價格的變化。',
    ],
    introEn: [
      'Besides collecting taxes, the government can also "give money" — that\'s subsidies.',
      'Subsidies directly boost a sector\'s productivity, increasing output and lowering prices.',
      'But subsidies have costs: they can distort markets and reduce efficiency.',
      'Try subsidizing the food sector and observe changes in food output and prices.',
    ],
    enabledControls: new Set<PolicySection>(['taxRate', 'subsidy']),
    instruction: '將食物補貼設到 30% 以上，觀察食物價格下降。記得先設稅率來維持國庫。',
    instructionEn: 'Set food subsidy to 30%+ and watch food prices drop. Remember to set taxes to maintain treasury.',
    objectives: [
      {
        id: 'set_subsidy',
        text: '設定食物補貼至少 30%',
        textEn: 'Set food subsidy to at least 30%',
        check: (s) => s.government.subsidies.food >= 30,
      },
      {
        id: 'advance_10',
        text: '推進到第 10 回合',
        textEn: 'Advance to turn 10',
        check: (s) => s.turn >= 10,
      },
    ],
    hints: [
      {
        text: '💡 在政策面板的「產業補貼」區找到食物補貼滑桿。',
        textEn: '💡 Find the food subsidy slider in the "Subsidies" section of the Policy panel.',
        showWhen: (s) => s.government.subsidies.food < 30 && s.turn < 3,
      },
      {
        text: '💡 觀察市場面板中的食物供給量——補貼後應該會增加。',
        textEn: '💡 Watch food supply in the Market panel — it should increase after subsidizing.',
        showWhen: (s) => s.government.subsidies.food >= 30 && s.turn < 6,
      },
      {
        text: '💡 補貼提高了食物產量（供給增加），所以食物價格應該下降。這就是供需法則！',
        textEn: '💡 Subsidies increased food output (supply up), so food prices should drop. That\'s supply & demand!',
        showWhen: (s) => s.turn >= 6,
      },
    ],
    summary:
      '補貼通過增加供給來降低價格，直接惠及消費者。但補貼也可能讓產業依賴政府、' +
      '失去自力更生的動力。世界各國對農業補貼的爭論已持續數十年。',
    summaryEn:
      'Subsidies lower prices by increasing supply, directly benefiting consumers. But they can create ' +
      'dependency and reduce self-sufficiency. The debate over agricultural subsidies has lasted decades worldwide.',
    maxTurns: 15,
    seed: 42,
  },

  // ─── Lesson 5: Welfare ─────────────────────────────────────────────────
  {
    id: 'welfare',
    order: 4,
    emoji: '🤝',
    title: '社會福利：照顧弱勢',
    titleEn: 'Social Welfare: Caring for the Vulnerable',
    conceptIds: ['welfare_policy', 'gini', 'moral_hazard'],
    intro: [
      '市場經濟雖然有效率，但不保證公平——有些人會被拋在後面。',
      '「福利政策」讓政府從國庫撥錢給最窮的居民，確保每個人都有基本生活保障。',
      '吉尼係數（Gini）衡量不平等程度：0 = 完全平等，1 = 極端不平等。',
      '啟用福利後，觀察吉尼係數的變化。但小心——福利花的錢，來自你的國庫！',
    ],
    introEn: [
      'Markets are efficient, but not always fair — some people get left behind.',
      '"Welfare policy" lets the government pay the poorest residents from the treasury.',
      'The Gini coefficient measures inequality: 0 = perfect equality, 1 = extreme inequality.',
      'Enable welfare and observe how the Gini coefficient changes. But beware — welfare costs money!',
    ],
    enabledControls: new Set<PolicySection>(['taxRate', 'welfare']),
    instruction: '先設稅率 15% 以上（確保國庫有錢），再啟用福利。觀察吉尼係數下降。',
    instructionEn: 'Set tax rate to 15%+ first (to fund the treasury), then enable welfare. Watch Gini coefficient drop.',
    objectives: [
      {
        id: 'enable_welfare',
        text: '啟用社會福利',
        textEn: 'Enable social welfare',
        check: (s) => s.government.welfareEnabled,
      },
      {
        id: 'gini_drop',
        text: '吉尼係數降到 0.40 以下',
        textEn: 'Gini coefficient drops below 0.40',
        check: (s) => {
          const stats = s.statistics;
          return stats.length > 0 && stats[stats.length - 1].giniCoefficient < 0.40;
        },
      },
      {
        id: 'advance_10',
        text: '推進到第 10 回合',
        textEn: 'Advance to turn 10',
        check: (s) => s.turn >= 10,
      },
    ],
    hints: [
      {
        text: '💡 先設稅率！沒有稅收，國庫就沒錢發福利。',
        textEn: '💡 Set taxes first! Without revenue, the treasury can\'t fund welfare.',
        showWhen: (s) => s.government.taxRate < 0.1 && !s.government.welfareEnabled,
      },
      {
        text: '💡 在社會政策區勾選「社會福利」核取方塊即可啟用。',
        textEn: '💡 Check the "Welfare" checkbox in the Social section to enable it.',
        showWhen: (s) => s.government.taxRate >= 0.1 && !s.government.welfareEnabled,
      },
      {
        text: '💡 觀察儀表板上的 Gini 數字。福利會把錢從國庫轉移給窮人，降低不平等。',
        textEn: '💡 Watch the Gini number on the Dashboard. Welfare transfers money to the poor, reducing inequality.',
        showWhen: (s) => s.government.welfareEnabled && s.turn < 8,
      },
    ],
    summary:
      '福利政策是政府調節不平等的重要工具。它直接把錢發給窮人，降低吉尼係數。' +
      '但也要注意「道德風險」——太舒適的安全網可能降低工作動力。這是公平與效率的經典取捨。',
    summaryEn:
      'Welfare is a key tool for reducing inequality, directly transferring money to the poor. ' +
      'But beware of "moral hazard" — too generous a safety net may reduce work motivation. A classic fairness vs. efficiency trade-off.',
    maxTurns: 20,
    seed: 42,
  },

  // ─── Lesson 6: Public Goods ────────────────────────────────────────────
  {
    id: 'public_goods',
    order: 5,
    emoji: '🏗️',
    title: '公共建設：人人受益的投資',
    titleEn: 'Public Works: Investment That Benefits All',
    conceptIds: ['public_goods', 'externality'],
    intro: [
      '有些東西，一個人用了不會減少別人的使用，而且沒辦法排除別人使用——這就是「公共財」。',
      '道路、路燈、公園……沒有人願意自己出錢建，因為別人可以白白享用（搭便車問題）。',
      '所以政府必須用稅收來提供公共財。在遊戲中，「公共建設」會提升所有部門的生產力。',
      '啟用公共建設，觀察 GDP 的成長！',
    ],
    introEn: [
      'Some goods are non-rivalrous (one person using it doesn\'t reduce others\') and non-excludable — these are "public goods".',
      'Roads, streetlights, parks... nobody would pay for them alone because others can use them for free (free-rider problem).',
      'So the government must use taxes to provide public goods. In the game, "Public Works" boosts all sectors\' productivity.',
      'Enable Public Works and watch GDP grow!',
    ],
    enabledControls: new Set<PolicySection>(['taxRate', 'publicWorks']),
    instruction: '設稅率 15%+ 維持國庫，啟用公共建設，觀察 GDP 上升。',
    instructionEn: 'Set tax rate to 15%+ for treasury, enable Public Works, and watch GDP rise.',
    objectives: [
      {
        id: 'enable_pw',
        text: '啟用公共建設',
        textEn: 'Enable Public Works',
        check: (s) => s.government.publicWorksActive,
      },
      {
        id: 'advance_10',
        text: '推進到第 10 回合',
        textEn: 'Advance to turn 10',
        check: (s) => s.turn >= 10,
      },
    ],
    hints: [
      {
        text: '💡 公共建設每回合會從國庫扣錢。確保你有足夠的稅收來支撐！',
        textEn: '💡 Public Works cost money each turn. Make sure you have enough tax revenue!',
        showWhen: (s) => !s.government.publicWorksActive && s.government.taxRate < 0.12,
      },
      {
        text: '💡 觀察所有部門的產出——公共建設會同時提升食物、商品、服務的生產力。',
        textEn: '💡 Watch output across all sectors — Public Works boosts food, goods, AND services productivity.',
        showWhen: (s) => s.government.publicWorksActive && s.turn >= 3,
      },
      {
        text: '💡 比較有公共建設和沒有時的 GDP 差異。這就是公共投資的回報！',
        textEn: '💡 Compare GDP with and without Public Works. This is the return on public investment!',
        showWhen: (s) => s.turn >= 7,
      },
    ],
    summary:
      '公共建設是「正外部性」的典型例子——政府花錢投資，所有人受益。' +
      '但公共建設需要持續的稅收支撐，這就是為什麼「完全不收稅」行不通的原因。',
    summaryEn:
      'Public Works are a classic "positive externality" — the government invests and everyone benefits. ' +
      'But they require sustained tax revenue, which is why "no taxes at all" doesn\'t work.',
    maxTurns: 20,
    seed: 42,
  },

  // ─── Lesson 7: Inflation & Monetary Policy ────────────────────────────
  {
    id: 'monetary_policy',
    order: 6,
    emoji: '🏦',
    title: '通膨與利率：央行的工具',
    titleEn: 'Inflation & Interest Rates: The Central Bank\'s Tools',
    conceptIds: ['inflation', 'monetary_policy', 'phillips_curve'],
    intro: [
      '小島正在經歷通膨——所有東西都變貴了！居民的購買力大幅下降。',
      '央行的主要武器是「政策利率」：提高利率會抑制需求，讓價格上漲速度減慢。',
      '但利率太高也會傷害經濟（減少投資和消費）。這就是菲利浦曲線描述的取捨。',
      '試著調高利率來穩定物價，但別過頭了！',
    ],
    introEn: [
      'The island is experiencing inflation — everything is getting expensive! Purchasing power is dropping.',
      'The central bank\'s main weapon is the "policy rate": higher rates reduce demand and slow price increases.',
      'But rates that are too high also hurt the economy (less investment and spending). This is the Phillips Curve trade-off.',
      'Try raising the rate to stabilize prices, but don\'t overdo it!',
    ],
    enabledControls: new Set<PolicySection>(['taxRate', 'policyRate', 'liquiditySupport']),
    instruction: '調高政策利率到 4%+ 來壓制通膨。觀察價格走勢是否趨緩。',
    instructionEn: 'Raise the policy rate to 4%+ to control inflation. Watch if price trends slow down.',
    objectives: [
      {
        id: 'raise_rate',
        text: '將政策利率調到 4% 以上',
        textEn: 'Raise policy rate to 4% or higher',
        check: (s) => s.government.policyRate >= 0.04,
      },
      {
        id: 'advance_15',
        text: '推進到第 15 回合',
        textEn: 'Advance to turn 15',
        check: (s) => s.turn >= 15,
      },
    ],
    hints: [
      {
        text: '💡 在「貨幣政策」區域找到政策利率滑桿。',
        textEn: '💡 Find the policy rate slider in the "Monetary" section.',
        showWhen: (s) => s.government.policyRate < 0.04 && s.turn < 3,
      },
      {
        text: '💡 利率影響市場的價格調整速度。高利率讓價格「漲不動」，有效壓制通膨。',
        textEn: '💡 Interest rates affect price adjustment speed. Higher rates make it harder for prices to rise.',
        showWhen: (s) => s.government.policyRate >= 0.04 && s.turn < 8,
      },
      {
        text: '💡 觀察市場面板的價格曲線——利率提高後，價格上漲趨勢應該趨緩。',
        textEn: '💡 Watch price curves in the Market panel — after raising rates, price increases should slow down.',
        showWhen: (s) => s.turn >= 8,
      },
    ],
    summary:
      '貨幣政策是對抗通膨的核心工具。升息壓制需求、穩定物價，但也可能減緩經濟成長。' +
      '這就是「通膨 vs 失業」的取捨——菲利浦曲線告訴我們，很難兩全其美。',
    summaryEn:
      'Monetary policy is the core tool against inflation. Rate hikes suppress demand and stabilize prices, ' +
      'but may also slow growth. This is the "inflation vs. unemployment" trade-off described by the Phillips Curve.',
    maxTurns: 20,
    seed: 42,
    useInflationPrices: true,
  },

  // ─── Lesson 8: Comprehensive Governance ────────────────────────────────
  {
    id: 'comprehensive',
    order: 7,
    emoji: '🎓',
    title: '經濟治理大師：綜合運用',
    titleEn: 'Master Governance: Putting It All Together',
    conceptIds: ['fiscal_policy', 'monetary_policy', 'gdp', 'gini'],
    intro: [
      '恭喜你學會了所有政策工具！現在是期末考時間。',
      '所有工具都已解鎖：稅率、補貼、福利、公共建設、利率、流動性支持。',
      '你的目標是平衡成長（GDP）、公平（Gini）和民心（滿意度）。',
      '記住：每個政策都有取捨，沒有完美的解方——只有最適合當下的平衡。加油！',
    ],
    introEn: [
      'Congratulations — you\'ve learned all the policy tools! Now it\'s exam time.',
      'All tools are unlocked: tax, subsidies, welfare, public works, interest rate, and liquidity support.',
      'Your goal is to balance growth (GDP), fairness (Gini), and happiness (satisfaction).',
      'Remember: every policy has trade-offs. There\'s no perfect solution — only the best balance for the moment. Good luck!',
    ],
    enabledControls: new Set<PolicySection>([
      'taxRate', 'subsidy', 'welfare', 'publicWorks', 'policyRate', 'liquiditySupport',
    ]),
    instruction: '用所有工具讓滿意度 > 65、Gini < 0.40、國庫 > 0，推進到 20 回合。',
    instructionEn: 'Use all tools to achieve satisfaction > 65, Gini < 0.40, treasury > 0, and advance to turn 20.',
    objectives: [
      {
        id: 'satisfaction',
        text: '平均滿意度達到 65 以上',
        textEn: 'Average satisfaction reaches 65+',
        check: (s) => {
          const stats = s.statistics;
          return stats.length > 0 && stats[stats.length - 1].avgSatisfaction >= 65;
        },
      },
      {
        id: 'gini',
        text: '吉尼係數維持在 0.40 以下',
        textEn: 'Gini coefficient stays below 0.40',
        check: (s) => {
          const stats = s.statistics;
          return stats.length > 0 && stats[stats.length - 1].giniCoefficient < 0.40;
        },
      },
      {
        id: 'treasury',
        text: '國庫餘額大於 0',
        textEn: 'Treasury balance is positive',
        check: (s) => s.government.treasury > 0,
      },
      {
        id: 'advance_20',
        text: '推進到第 20 回合',
        textEn: 'Advance to turn 20',
        check: (s) => s.turn >= 20,
      },
    ],
    hints: [
      {
        text: '💡 先設定基礎：適度稅率（12-18%）+ 公共建設 + 福利。',
        textEn: '💡 Start with basics: moderate tax (12-18%) + Public Works + Welfare.',
        showWhen: (s) => s.turn < 3,
      },
      {
        text: '💡 如果國庫快見底了，考慮提高稅率或關閉花錢的政策。',
        textEn: '💡 If treasury is running low, consider raising taxes or disabling costly policies.',
        showWhen: (s) => s.government.treasury < 20 && s.government.treasury > -10,
      },
      {
        text: '💡 如果滿意度下降，檢查是否食物供給不足或不平等太嚴重。',
        textEn: '💡 If satisfaction drops, check if food supply is low or inequality is too high.',
        showWhen: (s) => {
          const stats = s.statistics;
          return stats.length > 1 &&
            stats[stats.length - 1].avgSatisfaction < stats[stats.length - 2].avgSatisfaction;
        },
      },
    ],
    summary:
      '🎓 你已經完成了所有教學課程！你學到了：供給與需求、價格機制、稅收、補貼、福利、' +
      '公共財、通膨與貨幣政策。記住，好的經濟治理不是追求單一目標的最大化，' +
      '而是在多個目標之間找到智慧的平衡。現在可以進入自由模式，挑戰真正的經濟治理了！',
    summaryEn:
      '🎓 You\'ve completed all tutorial lessons! You learned: supply & demand, pricing, taxation, subsidies, ' +
      'welfare, public goods, inflation & monetary policy. Remember, good governance isn\'t maximizing one goal — ' +
      'it\'s finding a wise balance among many. Now enter Free Play and tackle real economic governance!',
    maxTurns: 30,
    seed: 42,
  },
];

/** Look up a lesson by its id */
export function getTutorialLesson(id: string): TutorialLesson | undefined {
  return TUTORIAL_LESSONS.find(l => l.id === id);
}

/** Get lesson by order index (0-based) */
export function getTutorialLessonByOrder(order: number): TutorialLesson | undefined {
  return TUTORIAL_LESSONS.find(l => l.order === order);
}
