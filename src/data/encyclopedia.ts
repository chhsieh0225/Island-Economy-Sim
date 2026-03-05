export interface EncyclopediaEntry {
  id: string;
  title: string;
  titleEn: string;
  category: 'model' | 'concept' | 'indicator' | 'policy';
  intuition: string;
  formula?: string;
  gameConnection: string;
  realWorldExample: string;
  relatedIds: string[];
}

export const ENCYCLOPEDIA: EncyclopediaEntry[] = [
  // ─── Models (5) ───────────────────────────────────────────────────────

  {
    id: 'cobb_douglas',
    title: 'Cobb-Douglas 生產函數',
    titleEn: 'Cobb-Douglas Production Function',
    category: 'model',
    intuition:
      '想像一座工廠：你同時需要機器（資本 K）和工人（勞動 L）才能生產東西。' +
      'Cobb-Douglas 告訴我們，產出取決於兩者的「搭配比例」。' +
      '如果 α 比較大，代表資本（機器、土地）的影響力較大；' +
      '如果 β 比較大，代表勞動力的影響力較大。' +
      '把指數加起來等於 1 時，表示規模報酬恆定——工人和機器同時加倍，產出也恰好加倍。',
    formula: 'Y = A \\cdot K^{\\alpha} \\cdot L^{\\beta}',
    gameConnection:
      '在遊戲中，每位島民每回合的產出由 baseProductivity × effectiveProductivity × subsidyMultiplier × laborScale 決定。' +
      '其中 laborScale 來自 L^{α-1}，α 就是各部門的勞動彈性（食物 ≈ 0.95、商品 ≈ 0.88、服務 ≈ 0.82），' +
      '直接對應 Cobb-Douglas 的勞動指數。當某部門工人越多，每人邊際產出遞減，體現報酬遞減效果。',
    realWorldExample:
      '經濟學家 Solow 用 Cobb-Douglas 分析美國 1909-1949 年資料，發現勞動份額約佔 0.7、資本佔 0.3，' +
      '至今仍是各國央行與國際貨幣基金組織估算潛在產出時的核心工具。',
    relatedIds: ['solow_growth', 'supply_demand', 'employment_rate'],
  },

  {
    id: 'les_demand',
    title: '線性支出系統（Stone-Geary 需求）',
    titleEn: 'Linear Expenditure System (Stone-Geary Demand)',
    category: 'model',
    intuition:
      '每個人都有「最低生活需要」——必須吃飽、有衣服穿——這些是沒辦法省的錢。' +
      '扣掉這些「基本開銷」後，剩下的錢才是真正可以自由花用的。' +
      '線性支出系統就是把消費分成兩塊：必需品支出 + 剩餘所得按比例分配，' +
      '讓窮人花更多比例在吃飯，富人則把更多比例花在娛樂上。',
    formula:
      'p_i \\cdot x_i = p_i \\cdot \\gamma_i + \\beta_i \\left( M - \\sum_j p_j \\gamma_j \\right)',
    gameConnection:
      '在遊戲中，每位島民先計算「最低需求」（lesSubsistenceMultiplier × 每回合基本消耗量），' +
      '扣除此部分花費後，剩餘預算再按 Marshallian 預算份額（budgetShares）分配到食物、商品、服務三類。' +
      '健康低或滿意度低的島民會把更多預算壓在食物或服務上，正是 Stone-Geary 結構的效果。',
    realWorldExample:
      '世界銀行估算開發中國家的恩格爾係數（食物佔總支出比例）時，常用 LES 模型。' +
      '例如印度家庭平均把近 45% 所得花在食物上，而美國家庭僅約 10%——正是必需品支出門檻造成的差距。',
    relatedIds: ['marginal_utility', 'elasticity', 'cpi'],
  },

  {
    id: 'walrasian',
    title: '瓦爾拉斯試探調價機制',
    titleEn: 'Walrasian Tatonnement Pricing',
    category: 'model',
    intuition:
      '想像市場裡有一個「拍賣官」：他先喊一個價格，看看想買和想賣的人各有多少。' +
      '如果想買的人比想賣的人多（需求 > 供給），他就把價格往上調；反過來就往下調。' +
      '一直重複這個過程，直到供需剛好平衡——這就是「試探」（tatonnement）的意思。',
    formula:
      '\\ln p_{t+1} = \\ln p_t + k \\cdot \\frac{D - S}{D + S + \\varepsilon}',
    gameConnection:
      '遊戲的市場模組（Market.ts）每回合結束後會執行 adjustPrices()，' +
      '計算每個部門的超額需求比率 (D-S)/(D+S)，乘以 tatonnementGain（學術模式 k ≈ 0.035），' +
      '再對 log 價格做增量調整，最後用 priceSmoothing 平滑，防止價格暴漲暴跌。' +
      '你會在市場面板看到價格曲線隨供需慢慢收斂——這就是瓦爾拉斯試探的視覺化。',
    realWorldExample:
      '紐約證券交易所的開盤集合競價（Opening Auction）與此概念類似：' +
      '開市前收集買賣委託，找出讓最多單能成交的價格，再以該價一次清算。',
    relatedIds: ['market_equilibrium', 'supply_demand', 'inflation'],
  },

  {
    id: 'solow_growth',
    title: 'Solow 經濟成長模型',
    titleEn: 'Solow Growth Model',
    category: 'model',
    intuition:
      '一個國家的經濟能成長多快？Solow 模型說，短期內靠投入更多工人和機器，' +
      '但長期來看，真正讓生活水準不斷提升的是「技術進步」（A 的成長）。' +
      '如果只是增加資本卻沒有新技術，每多一台機器帶來的增加量會越來越少（報酬遞減），' +
      '經濟最終會停在一個穩定狀態。只有持續創新，才能打破這個天花板。',
    formula:
      '\\Delta k = s \\cdot f(k) - (n + \\delta) \\cdot k',
    gameConnection:
      '在遊戲中，島嶼的人口會出生和死亡（人口成長率 n），公共建設投資相當於儲蓄/資本累積（s），' +
      '而島民的生產力（productivity）與智力（intelligence）扮演技術水準 A 的角色。' +
      '你會發現只增加人口並不能永遠提升 GDP——這就是 Solow 模型所預測的報酬遞減現象。',
    realWorldExample:
      '戰後日本與韓國在 1960-1990 年間經歷高速成長，一部分是靠大量資本投入，' +
      '但後期成長放緩正好符合 Solow 的預測。Robert Solow 因此模型獲得 1987 年諾貝爾經濟學獎。',
    relatedIds: ['cobb_douglas', 'gdp', 'fiscal_policy'],
  },

  {
    id: 'phillips_curve',
    title: '菲利浦曲線',
    titleEn: 'Phillips Curve',
    category: 'model',
    intuition:
      '失業率低的時候，工人不好找，老闆得加薪搶人，物價也跟著上漲（通膨升高）。' +
      '反過來，失業率高的時候，大家搶著找工作，薪水不容易漲，物價也比較穩定。' +
      '菲利浦曲線描述的就是這種通膨和失業之間的「蹺蹺板」關係——' +
      '但要注意，長期來看這個關係未必穩定，尤其當人們對通膨有了預期之後。',
    formula:
      '\\pi = \\pi^e - \\beta (u - u^*)',
    gameConnection:
      '在遊戲中，當就業率很高時，多數島民都在生產並賺取收入，市場需求旺盛，' +
      '瓦爾拉斯調價機制會推升三個部門的價格。反之，若大量島民失業或離島，' +
      '需求萎縮，價格會回落。你可以同時觀察就業率指標和市場價格走勢，體會這種取捨關係。',
    realWorldExample:
      '1970 年代石油危機時，美國同時出現高通膨和高失業（stagflation），' +
      '打破了原本簡單的菲利浦曲線關係，促使經濟學家加入「預期」因素來修正模型。',
    relatedIds: ['inflation', 'employment_rate', 'monetary_policy'],
  },

  // ─── Concepts (10) ────────────────────────────────────────────────────

  {
    id: 'supply_demand',
    title: '供給與需求',
    titleEn: 'Supply and Demand',
    category: 'concept',
    intuition:
      '供給是賣家想賣的量，需求是買家想買的量。' +
      '價格太高，買的人少、賣的人多（供過於求）；價格太低，買的人多、賣的人少（供不應求）。' +
      '市場價格會自動往「兩邊剛好平衡」的方向移動——這個平衡點就是均衡價格。',
    gameConnection:
      '每回合，島民會根據自己的存貨和預算，向市場提交買單和賣單。' +
      '市場面板（MarketPanel）會顯示各部門的供給量（Supply）和需求量（Demand），' +
      '你可以觀察它們的差距如何驅動下一回合的價格變動。',
    realWorldExample:
      '2020 年新冠疫情初期，口罩需求暴增但供給跟不上，價格飆漲。' +
      '隨著各國工廠增產，供給追上需求後，價格便逐漸回落。',
    relatedIds: ['market_equilibrium', 'walrasian', 'elasticity'],
  },

  {
    id: 'inflation',
    title: '通貨膨脹',
    titleEn: 'Inflation',
    category: 'concept',
    intuition:
      '通膨就是「東西整體變貴了」。不是某一樣東西漲價，而是幾乎所有東西都在漲。' +
      '溫和的通膨（每年 2-3%）被認為是正常的，但如果漲太快，' +
      '大家手上的錢就越來越不值錢，存款的購買力會被侵蝕。',
    gameConnection:
      '你可以在市場面板觀察三個部門的價格趨勢。如果所有部門價格同時持續上升，' +
      '代表島上正在發生通膨。貨幣政策利率（policyRate）是你對抗通膨的主要工具——' +
      '提高利率會抑制價格上漲速度，降低利率則刺激需求但可能加劇通膨。',
    realWorldExample:
      '2022 年全球通膨升溫，美國 CPI 年增率一度超過 9%，聯準會連續升息試圖壓制物價。' +
      '辛巴威在 2008 年更曾出現天文數字的超級通膨，鈔票面額高達一百兆。',
    relatedIds: ['cpi', 'monetary_policy', 'phillips_curve'],
  },

  {
    id: 'comparative_advantage',
    title: '比較利益',
    titleEn: 'Comparative Advantage',
    category: 'concept',
    intuition:
      '就算你什麼都比別人做得好，也不代表你應該什麼都自己做。' +
      '重點是「機會成本」——你花時間做 A 就沒時間做 B。' +
      '每個人應該專注在自己「相對」最擅長的事情上，然後透過交易互通有無，' +
      '這樣整體效率最高，大家都能過得更好。',
    gameConnection:
      '島上的工人各有不同的生產力（productivity）與智力（intelligence），' +
      '加上地形（terrain）對不同部門有加成或懲罰。例如丘陵地形適合放牧但不利農耕。' +
      '島民會根據收入情況考慮轉行（evaluateJobSwitch），專注在自己相對優勢的部門，' +
      '再透過市場交換取得其他必需品。',
    realWorldExample:
      '大衛·李嘉圖在 1817 年以英國的布和葡萄牙的酒為例，說明即使葡萄牙兩樣都做得比英國好，' +
      '雙方專注生產各自機會成本較低的商品再貿易，仍然雙贏。',
    relatedIds: ['opportunity_cost', 'supply_demand', 'gdp'],
  },

  {
    id: 'market_equilibrium',
    title: '市場均衡',
    titleEn: 'Market Equilibrium',
    category: 'concept',
    intuition:
      '市場均衡就是供給和需求剛好相等的那個點。' +
      '在均衡時，想買的人都買到了，想賣的人也都賣出了，價格不再有上漲或下跌的壓力。' +
      '不過現實中均衡會不斷被打破——天災、政策、新科技都可能讓供需移動，' +
      '市場就會朝新的均衡去調整。',
    gameConnection:
      '遊戲的市場清算（clearMarket）每回合會撮合買單和賣單：' +
      '出價最高的買家和要價最低的賣家先成交，成交價取兩者均值。' +
      '當所有可配對的單子都撮合完畢後，就達到了該回合的短期均衡。' +
      '剩餘的超額供給或需求則透過 tatonnement 驅動下回合價格調整。',
    realWorldExample:
      '農產品批發市場每天早上開市，蔬菜價格會根據前一天的剩貨量和今天的進貨量快速調整，' +
      '直到攤販願意賣的價格與餐廳願意買的價格相符——這就是均衡的日常體現。',
    relatedIds: ['walrasian', 'supply_demand', 'elasticity'],
  },

  {
    id: 'elasticity',
    title: '價格彈性',
    titleEn: 'Price Elasticity',
    category: 'concept',
    intuition:
      '彈性衡量的是「價格變動 1% 時，需求量會變多少 %」。' +
      '生活必需品（如米飯）的彈性很低——漲價了你還是得買；' +
      '奢侈品（如名牌包）的彈性很高——稍微漲價，很多人就不買了。' +
      '彈性越大，消費者對價格越敏感。',
    formula:
      'E_d = \\frac{\\%\\Delta Q_d}{\\%\\Delta P}',
    gameConnection:
      '在遊戲中，食物的優先級最高（priority ≈ 1 + survival 權重），即使價格漲了島民也必須購買，' +
      '因此食物需求彈性較低。服務的優先級較低且受滿意度驅動，' +
      '價格上漲時島民會優先削減服務支出——體現了較高的需求彈性。',
    realWorldExample:
      '汽油是典型的低彈性商品：油價漲 10%，開車的人可能只少加 2-3% 的油。' +
      '相反，串流影音平台訂閱的彈性較高——漲價時退訂率明顯上升。',
    relatedIds: ['supply_demand', 'les_demand', 'cpi'],
  },

  {
    id: 'opportunity_cost',
    title: '機會成本',
    titleEn: 'Opportunity Cost',
    category: 'concept',
    intuition:
      '做一個選擇的「機會成本」就是你因此放棄的最好替代方案的價值。' +
      '例如你花一小時打電動，機會成本不是電費，而是那一小時你本來可以打工賺到的薪水。' +
      '每個決定都有看不見的代價——真正的成本永遠包含你放棄的東西。',
    gameConnection:
      '島民在考慮轉職（evaluateJobSwitch）時，會比較留在目前部門的預期收入和轉去其他部門的預期收入。' +
      '轉職有直接成本（JOB_SWITCH_COST）和短期生產力懲罰（JOB_SWITCH_PRODUCTIVITY_PENALTY），' +
      '這些都是決策時需要權衡的機會成本。留在不適合的行業，機會成本可能更高。',
    realWorldExample:
      '比爾蓋茲從哈佛輟學創辦微軟。他的機會成本是一張哈佛文憑和可能的穩定工作，' +
      '但他判斷創業的預期回報遠高於繼續讀書。',
    relatedIds: ['comparative_advantage', 'marginal_utility', 'employment_rate'],
  },

  {
    id: 'marginal_utility',
    title: '邊際效用',
    titleEn: 'Marginal Utility',
    category: 'concept',
    intuition:
      '吃第一塊披薩時超開心，第二塊還不錯，第三塊普普，第四塊可能已經吃不下了。' +
      '每多消費一單位帶來的額外滿足感就是「邊際效用」，而且通常是遞減的。' +
      '這解釋了為什麼人不會把所有錢都花在同一種東西上——' +
      '分散消費才能讓總滿足感最大化。',
    gameConnection:
      '島民的預算分配邏輯正是邊際效用遞減的體現：即使食物最重要，' +
      '當食物庫存已經充足時（超過 targetStock），島民不會繼續狂買食物，' +
      '而是把預算轉向商品和服務，追求整體滿意度最大化。',
    realWorldExample:
      '自助餐定價就利用了邊際效用遞減：餐廳知道你吃到後面會越吃越少，' +
      '所以敢用固定價格讓你「吃到飽」，因為多數人的實際食量有限。',
    relatedIds: ['les_demand', 'elasticity', 'opportunity_cost'],
  },

  {
    id: 'externality',
    title: '外部性',
    titleEn: 'Externalities',
    category: 'concept',
    intuition:
      '外部性是指一個人的行為影響到其他不相關的人，而且這些影響沒有反映在價格裡。' +
      '工廠排放廢氣讓附近居民生病——這是「負外部性」；' +
      '你家養蜜蜂幫鄰居的果園授粉——這是「正外部性」。' +
      '外部性的存在代表市場自己無法達到最佳效率，需要政府介入。',
    gameConnection:
      '遊戲中的隨機事件（如瘟疫、暴風雨）對全體島民造成健康傷害或生產力下降，' +
      '模擬了負外部性的效果。公共建設（publicWorks）則是正外部性的例子——' +
      '政府花錢投資，所有部門的生產力都會提升，受益者不只是出錢的人。',
    realWorldExample:
      '碳排放是典型的負外部性：你開車排放的 CO2 加劇全球暖化，但油價並沒有包含這個社會成本。' +
      '歐盟推行碳排放交易制度（ETS），就是試圖把外部性「內部化」。',
    relatedIds: ['public_goods', 'fiscal_policy', 'subsidy_policy'],
  },

  {
    id: 'public_goods',
    title: '公共財',
    titleEn: 'Public Goods',
    category: 'concept',
    intuition:
      '公共財有兩個特徵：用了不會少（非競爭性）、沒辦法排除別人用（非排他性）。' +
      '國防、路燈、公共公園都是典型例子。問題是，如果大家都想「搭便車」——' +
      '讓別人出錢自己享用——那就沒人願意主動提供，所以通常需要政府來出面。',
    gameConnection:
      '遊戲中的「公共建設」（Public Works）就是公共財的設計：' +
      '政府每回合從國庫支出固定成本（PUBLIC_WORKS_COST_PER_TURN），' +
      '為全島所有部門提供生產力加成（PUBLIC_WORKS_PRODUCTIVITY_BOOST）。' +
      '沒有任何單一島民會自願出這筆錢，必須透過稅收集體負擔。',
    realWorldExample:
      'GPS 衛星導航系統由美國政府花費數十億美元建置和維護，全球任何人都可以免費使用，' +
      '是現代公共財的經典案例。',
    relatedIds: ['externality', 'fiscal_policy', 'tax_policy'],
  },

  {
    id: 'moral_hazard',
    title: '道德風險',
    titleEn: 'Moral Hazard',
    category: 'concept',
    intuition:
      '當有人幫你「兜底」的時候，你可能就不會那麼小心了。' +
      '買了保險之後開車更大膽、知道政府會紓困就冒更大的風險——' +
      '這就是道德風險。問題的根源是：承擔後果的人和做決定的人不是同一個。',
    gameConnection:
      '當你開啟福利政策（welfare）後，最窮的島民會收到補助金。' +
      '但仔細觀察，部分島民可能因為有補助保底而不積極工作或轉行，' +
      '持續待在低收入狀態（lowIncomeTurns 累積）。這就是遊戲中的道德風險——' +
      '安全網太舒適可能降低個人的努力動機。',
    realWorldExample:
      '2008 年金融海嘯後，美國政府紓困大型銀行（Too Big to Fail），' +
      '引發廣泛批評：銀行知道政府會救，所以敢冒更大風險，形成「賺錢歸自己、虧損歸全民」的道德風險。',
    relatedIds: ['welfare_policy', 'public_goods', 'fiscal_policy'],
  },

  // ─── Indicators (5) ───────────────────────────────────────────────────

  {
    id: 'gdp',
    title: '國內生產毛額',
    titleEn: 'Gross Domestic Product (GDP)',
    category: 'indicator',
    intuition:
      'GDP 就是一個國家（或一座島）在一段時間內生產的所有商品和服務的總市場價值。' +
      '它是衡量經濟規模最常用的指標。GDP 成長代表經濟在擴張，' +
      '但 GDP 不能告訴你財富分配是否公平、環境是否被破壞。',
    formula:
      'GDP = \\sum_{i} P_i \\times Q_i',
    gameConnection:
      '遊戲中的 GDP 在 Statistics.ts 的 computeGDP() 計算：' +
      '每回合把三個部門的「市場價格 × 成交量」加總就得到 GDP。' +
      '你可以在儀表板（Dashboard）看到 GDP 的歷史走勢圖，' +
      '它會隨著人口、價格和交易量的變化而波動。',
    realWorldExample:
      '美國 2023 年 GDP 約 27.4 兆美元，是全球最大經濟體。' +
      '中國以約 17.8 兆美元排名第二。台灣人均 GDP 約 33,000 美元。',
    relatedIds: ['cpi', 'employment_rate', 'solow_growth'],
  },

  {
    id: 'gini',
    title: '吉尼係數',
    titleEn: 'Gini Coefficient',
    category: 'indicator',
    intuition:
      '吉尼係數衡量一個社會的貧富差距，數值在 0 到 1 之間。' +
      '0 表示完全平等（每個人擁有一樣多的財富），1 表示極端不平等（一個人擁有所有財富）。' +
      '一般來說，0.3 以下算比較平等，0.4 以上就算差距偏大。',
    formula:
      'G = \\frac{2 \\sum_{i=1}^{n} i \\cdot x_i}{n \\sum_{i=1}^{n} x_i} - \\frac{n+1}{n}',
    gameConnection:
      '遊戲每回合會用 computeGini() 計算全島的吉尼係數，' +
      '以每位島民的現金加存款（money + savings）排序後套用公式。' +
      '你可以在儀表板追蹤吉尼係數——開啟福利或調高稅率通常會讓它下降，' +
      '放任自由市場運作則可能讓它上升。',
    realWorldExample:
      '北歐國家（如瑞典、丹麥）的吉尼係數約 0.25-0.28，屬全球最平等。' +
      '南非的吉尼係數約 0.63，是全球最不平等的國家之一。',
    relatedIds: ['welfare_policy', 'tax_policy', 'gdp'],
  },

  {
    id: 'employment_rate',
    title: '就業率',
    titleEn: 'Employment Rate',
    category: 'indicator',
    intuition:
      '就業率是「有工作的人」佔「想工作且能工作的人」的比例。' +
      '高就業率通常代表經濟狀況好，大家都有收入可以消費。' +
      '但如果就業率太高（接近 100%），代表勞動力很緊繃，企業可能找不到人。',
    formula:
      '\\text{就業率} = \\frac{\\text{就業人數}}{\\text{勞動力}} \\times 100\\%',
    gameConnection:
      '遊戲中，「勞動力」是達到工作年齡且健康值達標（≥ LABOR_FORCE_HEALTH_THRESHOLD）的島民。' +
      '其中本回合產出 > 0.01 的才算「就業」。Statistics 每回合計算就業率和失業率，' +
      '你可以在儀表板和工作面板（JobsPanel）追蹤各部門的勞動力分布。',
    realWorldExample:
      '台灣的失業率長期維持在 3.5-4% 左右，算是相當穩定。' +
      '而西班牙 2013 年的失業率曾高達 26%，青年失業率更超過 55%。',
    relatedIds: ['phillips_curve', 'gdp', 'dependency_ratio'],
  },

  {
    id: 'dependency_ratio',
    title: '扶養比',
    titleEn: 'Dependency Ratio',
    category: 'indicator',
    intuition:
      '扶養比就是「需要被照顧的人」對「正在工作養家的人」的比例。' +
      '需要被照顧的人包括小孩和老人。如果扶養比太高，' +
      '代表每個工作的人要養更多人，壓力就更大，經濟負擔也更重。',
    formula:
      '\\text{扶養比} = \\frac{\\text{兒童人數} + \\text{老年人數}}{\\text{青壯年工作人口}}',
    gameConnection:
      '遊戲每回合計算扶養比（dependencyRatio），分子是未達工作年齡的兒童加上超過 SENIOR_DEPENDENCY_AGE 的長者，' +
      '分母是介於之間的青壯年人口。育兒還會降低父母的生產力（caregiverPenalty），' +
      '模擬真實世界中照顧小孩對工作效率的影響。',
    realWorldExample:
      '日本是全球老齡化最嚴重的國家之一，扶養比持續攀升，每 2.1 個工作人口就要養一個退休老人。' +
      '這也是日本推動延後退休年齡與自動化的重要原因。',
    relatedIds: ['employment_rate', 'gdp', 'welfare_policy'],
  },

  {
    id: 'cpi',
    title: '消費者物價指數',
    titleEn: 'Consumer Price Index (CPI)',
    category: 'indicator',
    intuition:
      'CPI 追蹤一籃子日常消費品（食物、交通、房租等）的平均價格變化。' +
      '如果 CPI 上升，代表生活成本增加了，你的錢能買到的東西變少了。' +
      '每月公布的 CPI 年增率就是大家常說的「通膨率」。',
    formula:
      'CPI_t = \\frac{\\sum P_t^i \\cdot Q_0^i}{\\sum P_0^i \\cdot Q_0^i} \\times 100',
    gameConnection:
      '遊戲中雖然沒有明確的 CPI 指標，但你可以透過市場面板的「價格歷史」觀察三種商品的價格走勢。' +
      '三個部門的加權平均價格變化趨勢就是島上的「物價水準」。' +
      '當你調整貨幣政策利率時，價格調整速度（tatonnement gain）會受到影響，' +
      '這就是央行透過利率控制通膨的機制在遊戲中的對應。',
    realWorldExample:
      '台灣的 CPI 由主計總處每月公布。2022 年台灣 CPI 年增率約 2.95%，' +
      '創下 14 年新高，主要受能源和食物價格推動。',
    relatedIds: ['inflation', 'monetary_policy', 'gdp'],
  },

  // ─── Policy (5) ───────────────────────────────────────────────────────

  {
    id: 'fiscal_policy',
    title: '財政政策',
    titleEn: 'Fiscal Policy',
    category: 'policy',
    intuition:
      '財政政策就是政府透過「收稅」和「花錢」來影響經濟的方式。' +
      '經濟不景氣時，政府可以減稅或增加支出來刺激消費和投資（擴張性財政）；' +
      '經濟過熱時，政府可以加稅或減少支出來降溫（緊縮性財政）。' +
      '這就像調節水龍頭——控制流進經濟裡的錢多還是少。',
    gameConnection:
      '你身為島長，可以設定稅率（setTaxRate）、開啟公共建設（publicWorks）、' +
      '啟用福利政策（welfare）和部門補貼（subsidies）。' +
      '稅收會進入國庫（treasury），再用來支付各項公共支出。' +
      '如果支出超過收入，國庫就會見底，公共建設會被迫關閉。',
    realWorldExample:
      '2020 年疫情期間，美國政府推出超過 5 兆美元的財政刺激方案，' +
      '包括直接發放現金支票和企業紓困貸款，是史上最大規模的財政政策之一。',
    relatedIds: ['tax_policy', 'subsidy_policy', 'welfare_policy', 'gdp'],
  },

  {
    id: 'monetary_policy',
    title: '貨幣政策',
    titleEn: 'Monetary Policy',
    category: 'policy',
    intuition:
      '貨幣政策是中央銀行透過調整利率或控制貨幣供給量來影響經濟的工具。' +
      '利率降低→借錢更便宜→消費和投資增加→經濟加速；' +
      '利率提高→借錢更貴→消費和投資減少→經濟降溫。' +
      '央行的主要目標通常是穩定物價和促進就業。',
    formula:
      '\\text{有效調價幅度} = k \\times \\max(0.55,\\; 1 - \\Delta r \\cdot \\text{sensitivity})',
    gameConnection:
      '你可以在政策面板調整「政策利率」（policyRate）和「流動性支持」（liquiditySupport）。' +
      '利率影響市場的 tatonnement 增益倍數（gainMultiplier）：升息讓價格調整更慢，壓抑通膨；' +
      '降息加速價格調整並搭配流動性支持可以擴大價格波動範圍，刺激經濟活動。',
    realWorldExample:
      '台灣央行每季召開理事會決議政策利率。2022-2023 年為抑制通膨，' +
      '連續多次升息。美國聯準會（Fed）的利率決策更是全球矚目。',
    relatedIds: ['inflation', 'phillips_curve', 'cpi', 'fiscal_policy'],
  },

  {
    id: 'subsidy_policy',
    title: '補貼政策',
    titleEn: 'Subsidy Policy',
    category: 'policy',
    intuition:
      '補貼就是政府給生產者或消費者的「額外補助」，讓某樣東西變得更便宜或更容易生產。' +
      '目的通常是鼓勵特定行為（如推廣綠能）或保護弱勢產業（如農業）。' +
      '但補貼也有缺點：花的是納稅人的錢，而且可能扭曲市場，讓效率降低。',
    gameConnection:
      '你可以對食物、商品、服務三個部門分別設定補貼百分比（0-100%）。' +
      '補貼會直接提高該部門的生產力倍數（getSubsidyMultiplier），' +
      '例如補貼 50% 就等於產量變 1.5 倍。但補貼不會從國庫扣款（簡化設計），' +
      '所以你可以觀察純粹的供給面效果。',
    realWorldExample:
      '歐盟每年花超過 550 億歐元補貼農業（共同農業政策 CAP），' +
      '確保糧食自給率並維持農村經濟。但批評者認為這讓歐洲農產品在國際市場上不公平競爭。',
    relatedIds: ['fiscal_policy', 'supply_demand', 'externality'],
  },

  {
    id: 'welfare_policy',
    title: '社會福利政策',
    titleEn: 'Welfare Policy',
    category: 'policy',
    intuition:
      '社會福利是政府為保障弱勢群體基本生活所提供的援助，' +
      '例如低收入補助、失業救濟、健保等。目標是確保每個人都有最低限度的生活品質。' +
      '但福利要花錢，錢從稅收來，所以常有「公平 vs 效率」的辯論。',
    gameConnection:
      '開啟福利政策後，政府每回合會找出最窮的一群島民（WELFARE_THRESHOLD_PERCENTILE），' +
      '從國庫發放定額補助金（WELFARE_AMOUNT）。這會降低吉尼係數，' +
      '但也消耗國庫資金。如果國庫不夠，福利就發不出去——你需要搭配稅收來維持。',
    realWorldExample:
      '北歐國家以「從搖籃到墳墓」的高福利聞名：免費教育、全民健保、慷慨的產假和失業救濟。' +
      '代價是高稅率——瑞典的最高邊際稅率超過 50%。',
    relatedIds: ['gini', 'fiscal_policy', 'tax_policy', 'moral_hazard'],
  },

  {
    id: 'tax_policy',
    title: '稅制政策',
    titleEn: 'Tax Policy',
    category: 'policy',
    intuition:
      '稅是政府的主要收入來源，用來支付公共服務和基礎建設。' +
      '稅率太低，政府沒錢做事；稅率太高，人民工作動力下降，經濟可能萎縮。' +
      '找到「最佳稅率」是每個政府的難題——經濟學上的拉弗曲線就描述了這個取捨。',
    formula:
      '\\text{稅額} = \\text{本回合收入} \\times \\text{稅率}',
    gameConnection:
      '每回合結束時，政府會對每位島民的「本回合收入」（incomeThisTurn）課稅（payTax）。' +
      '稅收進入國庫，你可以在政策面板調整稅率（0% 到 MAX_TAX_RATE）。' +
      '稅率過高會讓島民可支配所得減少，消費力下降，進而影響市場需求和 GDP。',
    realWorldExample:
      '愛爾蘭以 12.5% 的低企業稅率吸引了 Google、Apple 等跨國企業將歐洲總部設在當地，' +
      '帶動經濟高速成長。但也引發其他歐盟國家對「稅務競爭」的批評。',
    relatedIds: ['fiscal_policy', 'welfare_policy', 'gdp', 'gini'],
  },
];

/**
 * Look up a single encyclopedia entry by id.
 * Returns undefined if the id does not exist.
 */
export function getEncyclopediaEntry(id: string): EncyclopediaEntry | undefined {
  return ENCYCLOPEDIA.find((entry) => entry.id === id);
}
