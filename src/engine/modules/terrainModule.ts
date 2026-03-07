import type { SectorType, IslandTerrainState } from '../../types';
import { SECTORS } from '../../types';
import { te, teSector } from '../engineI18n';
import { RNG } from '../RNG';

export function generateTerrainProfile(seed: number): IslandTerrainState {
  const terrainRng = new RNG((seed ^ 0x9e3779b9) >>> 0);

  const coastlineOffsets = Array.from({ length: 14 }, () => 0.9 + terrainRng.next() * 0.22);
  for (let i = 0; i < coastlineOffsets.length; i++) {
    const prev = coastlineOffsets[(i - 1 + coastlineOffsets.length) % coastlineOffsets.length];
    const curr = coastlineOffsets[i];
    const next = coastlineOffsets[(i + 1) % coastlineOffsets.length];
    coastlineOffsets[i] = 0.25 * prev + 0.5 * curr + 0.25 * next;
  }

  const islandScaleX = 0.96 + terrainRng.next() * 0.1;
  const islandScaleY = 0.96 + terrainRng.next() * 0.1;
  const islandRotation = (terrainRng.next() - 0.5) * 0.35;

  const zoneOffsets: IslandTerrainState['zoneOffsets'] = {
    food: {
      x: (terrainRng.next() - 0.5) * 0.1,
      y: -0.08 + terrainRng.next() * 0.07,
    },
    goods: {
      x: -0.11 + terrainRng.next() * 0.08,
      y: 0.02 + terrainRng.next() * 0.09,
    },
    services: {
      x: 0.04 + terrainRng.next() * 0.08,
      y: 0.02 + terrainRng.next() * 0.09,
    },
  };

  const shuffled = [...SECTORS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = terrainRng.nextInt(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const baseSuitability = [1.14, 1.0, 0.88];
  const sectorSuitability: Record<SectorType, number> = { food: 1, goods: 1, services: 1 };
  for (let i = 0; i < shuffled.length; i++) {
    const sector = shuffled[i];
    const noise = (terrainRng.next() - 0.5) * 0.08;
    sectorSuitability[sector] = Math.max(0.82, Math.min(1.2, baseSuitability[i] + noise));
  }

  const sectorFeatures: Record<SectorType, string> = {
    food: pickTerrainFeature('food', sectorSuitability.food, terrainRng),
    goods: pickTerrainFeature('goods', sectorSuitability.goods, terrainRng),
    services: pickTerrainFeature('services', sectorSuitability.services, terrainRng),
  };

  return {
    seed,
    coastlineOffsets,
    islandScaleX,
    islandScaleY,
    islandRotation,
    zoneOffsets,
    sectorSuitability,
    sectorFeatures,
  };
}

function pickTerrainFeature(sector: SectorType, suitability: number, rng: RNG): string {
  const tier = suitability >= 1.05 ? 'high' : suitability <= 0.95 ? 'low' : 'mid';
  const index = rng.nextInt(0, 2);
  return te(`terrain.${sector}.${tier}.${index}`);
}

export function buildTerrainAnnouncement(terrain: IslandTerrainState): string {
  const labels = SECTORS.map(sector => {
    const pct = (terrain.sectorSuitability[sector] - 1) * 100;
    const sign = pct >= 0 ? '+' : '';
    return te('terrain.sectorEntry', {
      sector: teSector(sector),
      sign,
      pct: pct.toFixed(0),
      feature: terrain.sectorFeatures[sector],
    });
  });
  return te('terrain.announcement', { details: labels.join(te('terrain.separator')) });
}
