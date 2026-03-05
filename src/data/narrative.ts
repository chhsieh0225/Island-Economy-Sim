// ── Narrative Progression System ──────────────────────────────────────
// Story-driven triggers that fire once based on game state conditions.

export interface NarrativeTrigger {
  id: string;
  /** Check function receives game state summary */
  check: (ctx: NarrativeContext) => boolean;
  /** Can only fire once */
  oneShot: boolean;
  /** Narrative content */
  narrative: NarrativeContent;
}

export interface NarrativeContext {
  turn: number;
  population: number;
  gdp: number;
  avgSatisfaction: number;
  giniCoefficient: number;
  economyStage: string;
  treasury: number;
  hasRandomShock: boolean;
  foodCoverage: number;
  hasPolicyApplied: boolean;
  totalDeaths: number;
  totalBirths: number;
}

export interface NarrativeContent {
  title: string;
  pages: NarrativePage[];
}

export interface NarrativePage {
  text: string;
  /** Optional CSS class for character portrait styling */
  portrait?: 'mayor' | 'elder' | 'farmer' | 'merchant' | 'scholar';
}

// ── Narrative Triggers ───────────────────────────────────────────────

export const NARRATIVE_TRIGGERS: NarrativeTrigger[] = [
  // ─ 1. first_dawn ─────────────────────────────────────────────────
  {
    id: 'first_dawn',
    oneShot: true,
    check: (ctx) => ctx.turn === 1,
    narrative: {
      title: '黎明初曉',
      pages: [
        {
          text: '晨霧散去，海風拂過港口的旗幟。你站在山丘上的市政廳前，俯瞰這座寧靜的小島——一百位居民的家園，也是你即將治理的土地。',
          portrait: 'mayor',
        },
        {
          text: '「歡迎您，新任島長。」一位白髮老者拄著拐杖走上前來，他是島上最年長的居民。「這座島不大，但她養活了一代又一代人。農田是我們的根，漁港是我們的脈。希望在您的帶領下，小島能走向更好的明天。」',
          portrait: 'elder',
        },
        {
          text: '遠處的農田裡，農夫們已經開始了一天的勞作。市場的鐘聲剛剛敲響，商人們正擺出今天的貨物。你深吸一口氣，感受到肩上的重量——也感受到可能性。一切，從現在開始。',
          portrait: 'mayor',
        },
      ],
    },
  },

  // ─ 2. first_crisis ───────────────────────────────────────────────
  {
    id: 'first_crisis',
    oneShot: true,
    check: (ctx) => ctx.avgSatisfaction < 50 && ctx.turn > 1,
    narrative: {
      title: '民怨沸騰',
      pages: [
        {
          text: '市政廳門口聚集了一群情緒激動的居民。他們的臉上寫滿了疲憊與不滿——有人抱怨吃不飽，有人抱怨物價太高，有人只是站在那裡沉默地搖頭。',
          portrait: 'mayor',
        },
        {
          text: '「島長！你看看這日子怎麼過！」一位農婦擠到最前面，聲音沙啞：「我們從早做到晚，連一頓像樣的飯都吃不上。孩子們問我明天會不會好起來，我不知道怎麼回答他們。」',
          portrait: 'farmer',
        },
        {
          text: '你站在人群面前，心沉了下去。這是你第一次面對如此直接的質疑。島上的經濟出了問題，而解決的責任落在你肩上。你必須做出改變——調整政策、分配資源，在居民的信任徹底崩潰之前。',
          portrait: 'mayor',
        },
      ],
    },
  },

  // ─ 3. first_prosperity ───────────────────────────────────────────
  {
    id: 'first_prosperity',
    oneShot: true,
    check: (ctx) => ctx.gdp > 0 && ctx.turn > 3,
    narrative: {
      title: '經濟起飛',
      pages: [
        {
          text: '市場裡傳來久違的笑聲。攤位上的商品琳瑯滿目，買賣雙方都帶著笑容。你注意到幾個月前還在抱怨的居民們，現在聊天的語氣輕快了許多。',
          portrait: 'mayor',
        },
        {
          text: '「島長，生意真的好多了！」一位商人笑著向你打招呼，手裡還忙著整理帳本。「以前一天賣不出幾件東西，現在大家口袋裡有錢了，消費明顯增加。您的政策見效了啊。」',
          portrait: 'merchant',
        },
        {
          text: '你看著這座活力重現的市場，心中湧起一陣暖意。但你也知道，繁榮從來不會自動持續——它需要悉心照料，就像農田需要灌溉一樣。這只是開始。',
          portrait: 'elder',
        },
      ],
    },
  },

  // ─ 4. population_milestone_120 ───────────────────────────────────
  {
    id: 'population_milestone_120',
    oneShot: true,
    check: (ctx) => ctx.population >= 120,
    narrative: {
      title: '人口興旺',
      pages: [
        {
          text: '島上第 120 位居民誕生了！接生婆從小屋裡走出來，笑容滿面地向圍觀的鄰居們宣布喜訊。嬰兒的哭聲在晨風中迴盪，清脆而響亮。',
          portrait: 'elder',
        },
        {
          text: '「人口增長是好事，」老人在市政廳的走廊上對你說，「但也意味著更多張嘴要餵、更多雙手需要工作。我們的農田和工坊夠用嗎？住房會不會不足？這些都需要提前考慮。」',
          portrait: 'elder',
        },
        {
          text: '你翻開人口統計冊，數字確實令人振奮。但你也在心中默默盤算——糧食產量、就業崗位、公共支出。成長帶來機遇，也帶來挑戰。你需要確保這座島嶼的基礎設施跟得上人口的步伐。',
          portrait: 'mayor',
        },
      ],
    },
  },

  // ─ 5. population_decline_80 ──────────────────────────────────────
  {
    id: 'population_decline_80',
    oneShot: true,
    check: (ctx) => ctx.population < 80 && ctx.turn > 5,
    narrative: {
      title: '人口衰退',
      pages: [
        {
          text: '你走在島上的小路上，忽然意識到周圍比以前安靜了許多。曾經熙攘的市場裡，好幾個攤位空無一人。學校裡的笑鬧聲也稀薄了。',
          portrait: 'mayor',
        },
        {
          text: '「走了好幾戶人家了……」一位老農坐在田埂上，望著遠方的海平線。「年輕人覺得這裡沒有前途。留下來的，大多是像我這樣走不動的老骨頭。」他嘆了口氣：「島長啊，再這樣下去，這個島就要空了。」',
          portrait: 'farmer',
        },
        {
          text: '人口跌破 80 人。你感受到一種無形的壓力——每一個離開的居民都帶走了一部分島嶼的活力。你必須找到方法讓人們看到希望，願意留下，願意生養下一代。',
          portrait: 'mayor',
        },
      ],
    },
  },

  // ─ 6. industrial_revolution ──────────────────────────────────────
  {
    id: 'industrial_revolution',
    oneShot: true,
    check: (ctx) => ctx.economyStage === 'industrial',
    narrative: {
      title: '工業革命',
      pages: [
        {
          text: '島上第一座工坊的煙囪冒出了煙。那不是炊煙，而是生產的訊號——鐵錘敲擊的聲音從工坊裡傳出，節奏穩定而有力。圍觀的居民們又驚又喜。',
          portrait: 'mayor',
        },
        {
          text: '「了不起！」一位學者激動地推了推眼鏡，「我研讀了大陸上工業化的文獻，沒想到我們的小島也跨出了這一步！農業已經穩固，現在商品生產開始成形。這意味著更豐富的物資、更多的就業機會。」',
          portrait: 'scholar',
        },
        {
          text: '你走進工坊，看到嶄新的工具和忙碌的工人。從純粹的農業社會到工業化，這是一個歷史性的跨越。但你也知道，工業化帶來效率的同時也帶來新的問題——汙染、勞動條件、貧富差距。你準備好面對了嗎？',
          portrait: 'mayor',
        },
      ],
    },
  },

  // ─ 7. service_economy_dawn ───────────────────────────────────────
  {
    id: 'service_economy_dawn',
    oneShot: true,
    check: (ctx) => ctx.economyStage === 'service',
    narrative: {
      title: '服務經濟曙光',
      pages: [
        {
          text: '島上開了第一家咖啡館。門口掛著手寫的招牌，木桌上鋪著格子布。幾位居民坐在裡面，悠閒地聊著天。隔壁新開的診所裡，掛號的人排起了隊。再過去一點，一間私塾正在招生。',
          portrait: 'mayor',
        },
        {
          text: '「島長，您看到了嗎？」學者興奮地攤開筆記，「當農業和工業的基礎夠穩固，人們開始追求更高層次的需求——醫療、教育、休閒、文化。這就是服務經濟。我們的島嶼正在蛻變。」',
          portrait: 'scholar',
        },
        {
          text: '你環顧四周，這座曾經只有農田和漁港的小島，如今有了工坊、商鋪、咖啡館和學堂。經濟的三根支柱都已建立。但真正的考驗在於如何平衡——讓三個產業共榮，而不是此消彼長。',
          portrait: 'elder',
        },
      ],
    },
  },

  // ─ 8. first_drought ──────────────────────────────────────────────
  {
    id: 'first_drought',
    oneShot: true,
    check: (ctx) => ctx.hasRandomShock && ctx.foodCoverage < 0.8 && ctx.turn > 2,
    narrative: {
      title: '天災降臨',
      pages: [
        {
          text: '天空已經好幾天沒有下雨了。田裡的作物開始枯黃，井水的水位也在下降。你站在乾裂的農田前，泥土在腳下碎裂，發出令人不安的聲響。',
          portrait: 'mayor',
        },
        {
          text: '「這是我見過最嚴重的一次……」老農蹲在田邊，用粗糙的手捧起一把乾燥的泥土。「莊稼撐不了幾天了。島長，我們需要水，需要救濟糧，不然大家都要餓肚子了。」',
          portrait: 'farmer',
        },
        {
          text: '這是你作為島長面對的第一場天災。大自然不講道理，不看你的政績。你能做的是盡快動員資源，穩住糧食供應，安撫人心。在困難面前，領導者的價值才真正被檢驗。',
          portrait: 'elder',
        },
      ],
    },
  },

  // ─ 9. treasury_empty ─────────────────────────────────────────────
  {
    id: 'treasury_empty',
    oneShot: true,
    check: (ctx) => ctx.treasury < 0 && ctx.turn > 3,
    narrative: {
      title: '國庫見底',
      pages: [
        {
          text: '你打開國庫的帳冊，數字刺眼地顯示著一個負數。支出超過了收入，儲備金已經用完。你想起老人曾說過的話：「錢不是萬能的，但沒有錢是萬萬不能的。」',
          portrait: 'mayor',
        },
        {
          text: '「島長，公共工程的款項已經付不出來了。」財務官焦急地說。「市場裡的商人們也在觀望——如果政府連薪水都發不出，他們怎麼敢擴大經營？信心一旦崩潰，要重建就難了。」',
          portrait: 'merchant',
        },
        {
          text: '財政赤字是一個危險的信號。你需要開源節流——增加稅收？削減支出？刺激經濟成長？每一條路都有代價。但什麼都不做的代價更大。',
          portrait: 'mayor',
        },
      ],
    },
  },

  // ─ 10. treasury_rich ─────────────────────────────────────────────
  {
    id: 'treasury_rich',
    oneShot: true,
    check: (ctx) => ctx.treasury > 1000 && ctx.turn > 5,
    narrative: {
      title: '國庫充盈',
      pages: [
        {
          text: '財務官走進辦公室時，臉上帶著少見的微笑。「島長，我剛結算了這季的帳目——國庫餘額突破一千元了。稅收穩定增長，支出也控制得當。」',
          portrait: 'merchant',
        },
        {
          text: '「有錢是好事，但更重要的是怎麼花。」老人在一旁插嘴。「我見過太多島嶼因為突然的富裕而迷失方向。投資基礎建設？充實教育？還是存起來以備不時之需？每一筆錢都應該花在刀口上。」',
          portrait: 'elder',
        },
        {
          text: '你看著帳冊上的數字，心中既欣慰又謹慎。豐厚的國庫給了你更多選擇——但選擇越多，決策越難。不過有一件事是確定的：你的治理走在正確的軌道上。',
          portrait: 'mayor',
        },
      ],
    },
  },

  // ─ 11. inequality_crisis ─────────────────────────────────────────
  {
    id: 'inequality_crisis',
    oneShot: true,
    check: (ctx) => ctx.giniCoefficient > 0.48 && ctx.turn > 5,
    narrative: {
      title: '貧富鴻溝',
      pages: [
        {
          text: '島上出現了一道看不見的牆。港口那邊，少數富商住進了新蓋的大宅子，院子裡種著進口的花草。而山腳下的棚屋區，幾十戶人家擠在簡陋的住所裡，為每天的三餐發愁。',
          portrait: 'mayor',
        },
        {
          text: '「島長，你知道嗎？我們這一區十幾個家庭的全部家當加起來，還不如港口那位商人一天賺的多。」一位學者遞過來一份他私下做的調查報告，語氣沉重：「基尼係數已經超過危險線了。如果不採取行動，社會裂痕只會越來越深。」',
          portrait: 'scholar',
        },
        {
          text: '你站在島的高處，同時看得到富人區的燈火與窮人區的昏暗。這座島上每個人都是你的居民。你知道適度的差距是動力，但過度的不平等是毒藥。是時候做出選擇了。',
          portrait: 'mayor',
        },
      ],
    },
  },

  // ─ 12. golden_age ────────────────────────────────────────────────
  {
    id: 'golden_age',
    oneShot: true,
    check: (ctx) =>
      ctx.avgSatisfaction > 75 &&
      ctx.giniCoefficient < 0.35 &&
      ctx.gdp > 0 &&
      ctx.turn > 10,
    narrative: {
      title: '黃金時代',
      pages: [
        {
          text: '有些日子你會記住一輩子。今天就是這樣的日子。你站在市政廳的陽台上，看著底下繁忙而有序的街道——市場熱鬧但不混亂，孩子們在廣場上奔跑，老人們在樹蔭下下棋。',
          portrait: 'mayor',
        },
        {
          text: '「島長！」農夫、商人、學者——他們不約而同地向你揮手致意。老人走到你身邊，眼中帶著少見的光亮：「經濟繁榮，人民滿足，貧富差距也在合理範圍內……我活了這麼久，第一次在這座島上看到這樣的景象。您做到了。」',
          portrait: 'elder',
        },
        {
          text: '你微微笑了。你知道黃金時代不會永遠持續——總有新的挑戰在前方等待。但此刻，你允許自己享受這份成就感。這是所有正確決策、無數個不眠之夜的回報。而你的任務，是讓這份繁榮盡可能持久。',
          portrait: 'mayor',
        },
      ],
    },
  },

  // ─ 13. elder_wisdom ──────────────────────────────────────────────
  {
    id: 'elder_wisdom',
    oneShot: true,
    check: (ctx) => ctx.turn >= 30,
    narrative: {
      title: '長者的智慧',
      pages: [
        {
          text: '三十個回合過去了。你在島上已經不再是「新來的島長」——人們改口叫你「島長大人」，語氣裡帶著敬意。你的書桌上堆滿了報告和數據，每一份都記錄著你做過的選擇。',
          portrait: 'mayor',
        },
        {
          text: '傍晚，老人像往常一樣來到市政廳，帶了一壺自釀的茶。「三十個回合了，」他慢慢地說：「短期的政策誰都會做。真正考驗領導者的，是長期規劃。你有沒有想過——十個回合之後，這座島會是什麼樣子？」',
          portrait: 'elder',
        },
        {
          text: '他呷了一口茶，接著說：「人口結構在變化，資源在消耗，技術在演進。好的治理不是救火——而是在火還沒燒起來的時候，就把水準備好。」你默默記下這番話。窗外的夕陽把海面染成了金色。',
          portrait: 'elder',
        },
      ],
    },
  },

  // ─ 14. trade_winds ───────────────────────────────────────────────
  {
    id: 'trade_winds',
    oneShot: true,
    check: (ctx) => ctx.turn >= 15 && ctx.population >= 90,
    narrative: {
      title: '貿易之風',
      pages: [
        {
          text: '一艘陌生的帆船出現在地平線上。它不是島上漁民的船——船帆上繡著異國的紋章，船身比你見過的任何船都大。港口的居民們紛紛放下手中的活，湧到碼頭觀看。',
          portrait: 'mayor',
        },
        {
          text: '「那是鄰島的探險船！」一位見多識廣的商人叫道，「我聽說他們一直在尋找新的貿易夥伴。如果我們能建立航線，就可以把多餘的產品賣到外面去，也能買到島上沒有的東西！」',
          portrait: 'merchant',
        },
        {
          text: '老人站在碼頭上，望著那艘漸漸靠近的帆船，喃喃自語：「大海連接著千百座島嶼。我們不必永遠孤立——但打開門的同時，也要準備好迎接門外的風雨。」貿易的時代或許即將來臨。',
          portrait: 'elder',
        },
      ],
    },
  },

  // ─ 15. demographic_warning ───────────────────────────────────────
  {
    id: 'demographic_warning',
    oneShot: true,
    check: (ctx) => ctx.turn > 20 && ctx.totalDeaths > ctx.totalBirths && ctx.totalDeaths > 0,
    narrative: {
      title: '人口警訊',
      pages: [
        {
          text: '學者敲門走進你的辦公室，手裡拿著一疊圖表，臉色凝重。「島長，我整理了這段時間的人口數據。結果……不太樂觀。」他將圖表攤在你的桌上——死亡曲線在出生曲線之上，而且差距還在擴大。',
          portrait: 'scholar',
        },
        {
          text: '「如果這個趨勢繼續下去，」學者用筆指著圖表上的交叉點，「島上的人口會持續萎縮。勞動力不足會導致產能下降，產能下降又會降低生活品質，形成惡性循環。我們需要鼓勵生育，改善居民健康，或者……考慮接納外來移民。」',
          portrait: 'scholar',
        },
        {
          text: '你盯著那些冰冷的數字，感受到一種深層的焦慮。人口是經濟的根本——沒有人，就沒有一切。你必須在問題惡化之前採取行動，無論是改善醫療、調整政策，還是創造讓年輕人願意留下來的環境。',
          portrait: 'mayor',
        },
      ],
    },
  },

  // ─ 16. food_crisis ───────────────────────────────────────────────
  {
    id: 'food_crisis',
    oneShot: true,
    check: (ctx) => ctx.foodCoverage < 0.5 && ctx.turn > 3,
    narrative: {
      title: '糧荒',
      pages: [
        {
          text: '市場上的糧食攤位前排起了長長的隊伍。你走過去查看，發現架子上幾乎空空如也——只剩下幾顆乾癟的蔬果和半袋糙米。攤主搖著頭，無奈地攤開雙手。',
          portrait: 'mayor',
        },
        {
          text: '「農田的產出根本不夠所有人吃的，」農夫的聲音裡帶著憤怒和無力。「我已經加班加點了，但土地就這麼大，產量就這麼多。有人開始囤糧了，價格被炒得越來越高。窮人家的孩子連一頓飽飯都吃不上。」',
          portrait: 'farmer',
        },
        {
          text: '糧食覆蓋率跌破了危險線。這不僅是經濟問題——這是生存問題。你需要立刻行動：增加農業投入？實施配給制？調整產業結構讓更多人投入食物生產？每一刻的猶豫都可能意味著更多人挨餓。',
          portrait: 'mayor',
        },
      ],
    },
  },

  // ─ 17. policy_first_step ─────────────────────────────────────────
  {
    id: 'policy_first_step',
    oneShot: true,
    check: (ctx) => ctx.hasPolicyApplied && ctx.turn > 1,
    narrative: {
      title: '初試啼聲',
      pages: [
        {
          text: '你簽署了上任以來的第一道政策命令。墨跡未乾的文件被助手小心翼翼地收好。這一刻感覺既莊嚴又沉重——你的每一個決定都會影響島上每一個人的生活。',
          portrait: 'mayor',
        },
        {
          text: '「做了就對了！」老人在旁邊點點頭。「治理一座島嶼，最怕的不是做錯決定，而是什麼決定都不做。政策就像播下的種子，有些會開花，有些可能枯萎，但不播種就永遠不會有收穫。」',
          portrait: 'elder',
        },
      ],
    },
  },

  // ─ 18. resilience ────────────────────────────────────────────────
  {
    id: 'resilience',
    oneShot: true,
    check: (ctx) =>
      ctx.hasRandomShock &&
      ctx.avgSatisfaction > 60 &&
      ctx.population >= 95 &&
      ctx.turn > 10,
    narrative: {
      title: '風雨中屹立',
      pages: [
        {
          text: '天災過後，你走在修復中的街道上。牆壁上還有風雨留下的痕跡，但工人們已經在忙著修補。市場重新開張了，雖然攤位比平時少，但買賣照常進行。',
          portrait: 'mayor',
        },
        {
          text: '「你知道嗎，島長？」老人坐在修好的長凳上，看著忙碌的居民們微微笑了。「一座島嶼的真正實力，不是看它在順境中能飛多高，而是看它在逆境中能站多穩。我們的居民沒有恐慌，沒有逃離——他們團結在一起，共同面對。」',
          portrait: 'elder',
        },
        {
          text: '你回頭看了看身後重建中的小島。人口穩定，滿意度依然不低。這座島嶼經受住了考驗。而你，作為它的治理者，也在這場風雨中成長了。',
          portrait: 'mayor',
        },
      ],
    },
  },
];

// ── Helper Function ──────────────────────────────────────────────────

/**
 * Check all narrative triggers against the current context.
 * Returns the first matching unfired trigger's content, or null.
 */
export function checkNarrativeTriggers(
  ctx: NarrativeContext,
  firedIds: Set<string>,
): NarrativeContent | null {
  for (const trigger of NARRATIVE_TRIGGERS) {
    if (trigger.oneShot && firedIds.has(trigger.id)) continue;
    if (trigger.check(ctx)) {
      if (trigger.oneShot) firedIds.add(trigger.id);
      return trigger.narrative;
    }
  }
  return null;
}
