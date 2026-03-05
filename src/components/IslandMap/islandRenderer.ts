// Barrel re-export — implementation split into layers/ and renderConfig.ts
export { drawWater } from './layers/waterLayer';
export { clearTileCache, drawIsland } from './layers/islandLayer';
export { computeZoneReveal, drawZones, drawZoneLabels, drawMarket } from './layers/zoneLayer';
export { drawAgent, drawWorkParticle, drawTooltip } from './layers/agentLayer';
export { drawEventOverlays } from './layers/eventOverlayLayer';
