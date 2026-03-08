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

    // These panels are lazy-loaded directly in GameView
    const lazyPanels = [
      'MarketPanel',
      'AgentInspector',
      'GameOver',
      'DecisionPanel',
      'EncyclopediaPanel',
    ] as const;

    for (const panel of lazyPanels) {
      expect(gameViewTsx).toMatch(
        new RegExp(`const\\s+${panel}\\s*=\\s*lazy\\(`),
      );
    }

    // EventLog and MilestonePanel are lazy-loaded inside EventsDrawer
    const eventsDrawer = readProjectFile('src/components/EventsDrawer/EventsDrawer.tsx');
    expect(eventsDrawer).toMatch(/const\s+EventLog\s*=\s*lazy\(/);
    expect(eventsDrawer).toMatch(/const\s+MilestonePanel\s*=\s*lazy\(/);

    // GameView itself is lazy-loaded from App.tsx
    const appTsx = readProjectFile('src/App.tsx');
    expect(appTsx).toMatch(/const\s+GameView\s*=\s*lazy\(/);
    expect(appTsx).toMatch(/import\('\.\/GameView'\)/);
  });

  it('responsive breakpoints and mobile-safe overflow are present', () => {
    // New map-centered layout uses full-viewport and drawer system
    const appCss = readProjectFile('src/App.module.css');
    const marketCss = readProjectFile('src/components/MarketPanel/MarketPanel.module.css');

    // App layout uses full viewport
    expect(appCss).toMatch(/\.app\s*\{[^}]*100vw/s);
    expect(appCss).toMatch(/\.mapLayer\s*\{[^}]*position:\s*absolute/s);

    // Drawer panel has responsive breakpoints
    const drawerCss = readProjectFile('src/components/DrawerPanel/DrawerPanel.module.css');
    expect(drawerCss).toMatch(/@media\s*\(max-width:\s*640px\)/);

    // Market table still has mobile-safe overflow
    expect(marketCss).toMatch(/\.tableWrap\s*\{[^}]*overflow-x:\s*auto;/s);
    expect(marketCss).toMatch(/\.table\s*\{[^}]*min-width:\s*620px;/s);
  });

  it('policy recommendation filters no-op actions', () => {
    const policyPanel = readProjectFile('src/components/PolicyPanel/PolicyPanel.tsx');

    expect(policyPanel).toMatch(/function isRecommendationRedundant\(/);
    expect(policyPanel).toMatch(/isRecommendationRedundant\(recommendation\.action,\s*effectivePolicyState\)/);
  });

  it('island map feature union includes full industry set', () => {
    // MapFeatureType was extracted to mapHitTest.ts for maintainability
    const mapHitTest = readProjectFile('src/components/IslandMap/mapHitTest.ts');
    expect(mapHitTest).toMatch(/MapFeatureType = 'bank' \| 'residential' \| 'farm' \| 'goods' \| 'services'/);
  });

  it('island renderer shows clickable markers for all sectors', () => {
    const zoneLayer = readProjectFile('src/components/IslandMap/layers/zoneLayer.ts');
    expect(zoneLayer).toMatch(/drawClickableNode\(/);
    expect(zoneLayer).toMatch(/'🌾'/);
    expect(zoneLayer).toMatch(/'🏭'/);
    expect(zoneLayer).toMatch(/'🏢'/);
    expect(zoneLayer).toMatch(/island\.click/);
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

    expect(panel).toMatch(/t\('learning\.coach'\)/);
    expect(panel).toMatch(/t\('learning\.nextSteps'\)/);
    expect(panel).toMatch(/coach\.actions\.map/);

    expect(journey).toMatch(/interface LearningCoachBrief/);
    expect(journey).toMatch(/phaseLabel:/);
    expect(journey).toMatch(/keywords:/);
  });
});
