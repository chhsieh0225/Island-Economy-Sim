import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readProjectFile(relativePath: string): string {
  const root = resolve(process.cwd());
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('uiLayoutSmoke', () => {
  it('heavy right-column panels are lazy-loaded', () => {
    // Game UI lives in GameView.tsx (lazy-loaded from App.tsx)
    const gameViewTsx = readProjectFile('src/GameView.tsx');

    const lazyPanels = [
      'MarketPanel',
      'TerrainPanel',
      'EventLog',
      'MilestonePanel',
    ] as const;

    for (const panel of lazyPanels) {
      expect(gameViewTsx).toMatch(
        new RegExp(`const\\s+${panel}\\s*=\\s*lazy\\(`),
      );
      expect(gameViewTsx).toMatch(
        new RegExp(`import\\('\\./components/${panel}/${panel}'\\)`),
      );
      expect(gameViewTsx).not.toMatch(
        new RegExp(`^import\\s+\\{\\s*${panel}\\s*\\}\\s+from\\s+'\\./components/${panel}/${panel}';`, 'm'),
      );
    }

    // GameView itself is lazy-loaded from App.tsx
    const appTsx = readProjectFile('src/App.tsx');
    expect(appTsx).toMatch(/const\s+GameView\s*=\s*lazy\(/);
    expect(appTsx).toMatch(/import\('\.\/GameView'\)/);
  });

  it('responsive breakpoints and mobile-safe overflow are present', () => {
    const appCss = readProjectFile('src/App.module.css');
    const marketCss = readProjectFile('src/components/MarketPanel/MarketPanel.module.css');

    expect(appCss).toMatch(/@media\s*\(max-width:\s*980px\)/);
    expect(appCss).toMatch(/\.rightTabs\s*\{[^}]*overflow-x:\s*auto;/s);
    expect(appCss).toMatch(/\.columns\s*\{[^}]*grid-template-columns:\s*1fr;/s);

    expect(marketCss).toMatch(/\.tableWrap\s*\{[^}]*overflow-x:\s*auto;/s);
    expect(marketCss).toMatch(/\.table\s*\{[^}]*min-width:\s*620px;/s);
  });

  it('policy recommendation filters no-op actions', () => {
    const policyPanel = readProjectFile('src/components/PolicyPanel/PolicyPanel.tsx');

    expect(policyPanel).toMatch(/function isRecommendationRedundant\(/);
    expect(policyPanel).toMatch(/isRecommendationRedundant\(recommendation\.action,\s*effectivePolicyState\)/);
  });

  it('island map feature union includes full industry set', () => {
    const islandMap = readProjectFile('src/components/IslandMap/IslandMap.tsx');
    expect(islandMap).toMatch(/MapFeatureType = 'bank' \| 'residential' \| 'farm' \| 'goods' \| 'services'/);
  });

  it('island renderer shows clickable markers for all sectors', () => {
    const zoneLayer = readProjectFile('src/components/IslandMap/layers/zoneLayer.ts');
    expect(zoneLayer).toMatch(/drawClickableNode\(/);
    expect(zoneLayer).toMatch(/'🌾'/);
    expect(zoneLayer).toMatch(/'🏭'/);
    expect(zoneLayer).toMatch(/'🏢'/);
    expect(zoneLayer).toMatch(/'點擊'/);
  });

  it('feature clicks trigger transient highlight pulse', () => {
    const gameViewTsx = readProjectFile('src/GameView.tsx');
    const islandMap = readProjectFile('src/components/IslandMap/IslandMap.tsx');
    const uiStore = readProjectFile('src/stores/uiStore.ts');

    expect(uiStore).toMatch(/FEATURE_HIGHLIGHT_MS = 1700/);
    expect(gameViewTsx).toMatch(/highlightFeature=\{featureHighlight\?\.feature \?\? null\}/);
    expect(gameViewTsx).toMatch(/highlightUntilMs=\{featureHighlight\?\.untilMs \?\? null\}/);
    expect(islandMap).toMatch(/FEATURE_HIGHLIGHT_MS = 1700/);
    expect(islandMap).toMatch(/drawFeatureHighlight\(/);
  });

  it('learning journey includes coach guidance scaffolding', () => {
    const panel = readProjectFile('src/components/LearningJourneyPanel/LearningJourneyPanel.tsx');
    const journey = readProjectFile('src/learning/journey.ts');

    expect(panel).toMatch(/經濟教練 Coach/);
    expect(panel).toMatch(/下一步操作（建議順序）/);
    expect(panel).toMatch(/coach\.actions\.map/);

    expect(journey).toMatch(/interface LearningCoachBrief/);
    expect(journey).toMatch(/phaseLabel:/);
    expect(journey).toMatch(/keywords:/);
  });
});
