export const DASHBOARD_TOOLTIPS = {
  turn: {
    content: '回合數，每回合代表 1 個月。',
    detail: 'Turn count. Each turn = 1 month of simulation.',
  },
  population: {
    content: '存活居民數，包含青年、成人、老年三個年齡層。',
    detail: 'Living residents across three age groups.',
  },
  gdp: {
    content: '本回合所有市場交易總額，反映經濟活躍度。',
    detail: 'GDP = \u03A3(price \u00D7 volume) per sector.',
    realWorldRef: 'GDP 不代表人民幸福，只衡量經濟活動量。',
  },
  satisfaction: {
    content: '居民平均滿意度。低於 30 會導致居民離島。',
    detail: 'Average satisfaction. Below 30 triggers emigration.',
  },
  health: {
    content: '居民平均健康值。降至 0 會死亡。',
    detail: 'Average health. Reaches 0 = death.',
  },
  gini: {
    content: '基尼係數衡量財富不平等程度。0=完全平等, 1=完全不平等。',
    detail: 'Gini coefficient measures wealth inequality.',
    realWorldRef: '台灣\u22480.34, 美國\u22480.39, 北歐\u22480.27, 巴西\u22480.48',
  },
  treasury: {
    content: '政府國庫餘額。來自稅收，用於福利和公共建設支出。',
    detail: 'Government funds from taxation.',
  },
  avgAge: {
    content: '所有存活居民的平均年齡（歲）。',
    detail: 'Average age of all living residents in years.',
  },
  birthDeath: {
    content: '本回合出生與死亡人數。',
    detail: 'Births and deaths this turn.',
  },
} as const;

export const POLICY_TOOLTIPS = {
  taxRate: {
    content: '稅率越高，國庫收入越多，但居民滿意度和消費力下降。',
    detail: 'Higher tax = more revenue but lower satisfaction and spending.',
  },
  subsidyFood: {
    content: '食物補貼提升農業產量，有助穩定食物供應。',
    detail: 'Boosts food sector productivity.',
  },
  subsidyGoods: {
    content: '商品補貼提升工坊產量，促進商品交易。',
    detail: 'Boosts goods sector productivity.',
  },
  subsidyServices: {
    content: '服務補貼提升服務業產量，滿足居民需求。',
    detail: 'Boosts services sector productivity.',
  },
  welfare: {
    content: '底層 25% 居民每回合獲得 $5 現金補助，有助減少不平等。',
    detail: 'Cash transfers to bottom 25%. Costs treasury.',
  },
  publicWorks: {
    content: '每回合花費 $50 國庫支出，換取全體生產力提升 10%。',
    detail: '$50/turn for +10% global productivity boost.',
  },
} as const;
