import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function readProjectFile(relativePath: string): string {
  const root = resolve(__dirname, '../../..');
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('ui smoke: heavy right-column panels are lazy-loaded', () => {
  const appTsx = readProjectFile('src/App.tsx');

  const lazyPanels = [
    'MarketPanel',
    'TerrainPanel',
    'EventLog',
    'MilestonePanel',
  ] as const;

  for (const panel of lazyPanels) {
    assert.match(
      appTsx,
      new RegExp(`const\\s+${panel}\\s*=\\s*lazy\\(`),
      `${panel} should be loaded through React.lazy`,
    );
    assert.match(
      appTsx,
      new RegExp(`import\\('\\./components/${panel}/${panel}'\\)`),
      `${panel} should use dynamic import`,
    );
    assert.doesNotMatch(
      appTsx,
      new RegExp(`^import\\s+\\{\\s*${panel}\\s*\\}\\s+from\\s+'\\./components/${panel}/${panel}';`, 'm'),
      `${panel} should not be statically imported`,
    );
  }
});

test('ui smoke: responsive breakpoints and mobile-safe overflow are present', () => {
  const appCss = readProjectFile('src/App.module.css');
  const marketCss = readProjectFile('src/components/MarketPanel/MarketPanel.module.css');

  assert.match(appCss, /@media\s*\(max-width:\s*980px\)/);
  assert.match(appCss, /\.rightTabs\s*\{[^}]*overflow-x:\s*auto;/s);
  assert.match(appCss, /\.columns\s*\{[^}]*grid-template-columns:\s*1fr;/s);

  assert.match(marketCss, /\.tableWrap\s*\{[^}]*overflow-x:\s*auto;/s);
  assert.match(marketCss, /\.table\s*\{[^}]*min-width:\s*620px;/s);
});

test('ui smoke: policy recommendation filters no-op actions', () => {
  const policyPanel = readProjectFile('src/components/PolicyPanel/PolicyPanel.tsx');

  assert.match(policyPanel, /function isRecommendationRedundant\(/);
  assert.match(policyPanel, /isRecommendationRedundant\(recommendation\.action,\s*effectivePolicyState\)/);
});

test('ui smoke: island map feature union includes full industry set', () => {
  const islandMap = readProjectFile('src/components/IslandMap/IslandMap.tsx');
  assert.match(islandMap, /MapFeatureType = 'bank' \| 'residential' \| 'farm' \| 'goods' \| 'services'/);
});

test('ui smoke: island renderer shows clickable markers for all sectors', () => {
  const islandRenderer = readProjectFile('src/components/IslandMap/islandRenderer.ts');
  assert.match(islandRenderer, /drawClickableNode\(/);
  assert.match(islandRenderer, /'🌾'/);
  assert.match(islandRenderer, /'🏭'/);
  assert.match(islandRenderer, /'🏢'/);
  assert.match(islandRenderer, /'點擊'/);
});

test('ui smoke: feature clicks trigger transient highlight pulse', () => {
  const appTsx = readProjectFile('src/App.tsx');
  const islandMap = readProjectFile('src/components/IslandMap/IslandMap.tsx');

  assert.match(appTsx, /FEATURE_HIGHLIGHT_MS = 1700/);
  assert.match(appTsx, /highlightFeature=\{featureHighlight\?\.feature \?\? null\}/);
  assert.match(appTsx, /highlightUntilMs=\{featureHighlight\?\.untilMs \?\? null\}/);
  assert.match(islandMap, /FEATURE_HIGHLIGHT_MS = 1700/);
  assert.match(islandMap, /drawFeatureHighlight\(/);
});
