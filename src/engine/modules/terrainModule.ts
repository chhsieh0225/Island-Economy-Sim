import type { SectorType, IslandTerrainState } from '../../types';
import { SECTORS } from '../../types';
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
  const highPools: Record<SectorType, string[]> = {
    food: ['沖積平原', '濕潤谷地', '黑土農帶'],
    goods: ['礦脈丘陵', '工業盆地', '石灰岩台地'],
    services: ['天然港灣', '觀光海岬', '交通樞紐'],
  };
  const midPools: Record<SectorType, string[]> = {
    food: ['一般農地', '混合地貌', '丘陵農區'],
    goods: ['一般工地', '混合地貌', '河港工區'],
    services: ['一般市鎮', '混合地貌', '商業聚落'],
  };
  const lowPools: Record<SectorType, string[]> = {
    food: ['鹽鹼薄土', '乾燥坡地', '碎石地'],
    goods: ['缺礦地帶', '鬆散砂地', '分散聚落'],
    services: ['內陸閉塞', '交通瓶頸', '低密度聚落'],
  };

  const pool = suitability >= 1.05
    ? highPools[sector]
    : suitability <= 0.95
      ? lowPools[sector]
      : midPools[sector];
  return rng.pick(pool);
}

const SECTOR_LABELS: Record<SectorType, string> = {
  food: '食物業',
  goods: '商品業',
  services: '服務業',
};

export function buildTerrainAnnouncement(terrain: IslandTerrainState): string {
  const labels = SECTORS.map(sector => {
    const pct = (terrain.sectorSuitability[sector] - 1) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${SECTOR_LABELS[sector]}${sign}${pct.toFixed(0)}%（${terrain.sectorFeatures[sector]}）`;
  });
  return `新地貌生成：${labels.join('、')}`;
}
