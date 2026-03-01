import type { TurnSnapshot, ScoreBreakdown } from '../types';

export function computeScore(history: TurnSnapshot[]): ScoreBreakdown {
  const empty: ScoreBreakdown = {
    totalScore: 0, populationScore: 0, prosperityScore: 0,
    equalityScore: 0, wellbeingScore: 0, stabilityScore: 0, longevityScore: 0,
  };
  if (history.length === 0) return empty;

  const n = history.length;

  // 1. Population (0-200): reward sustaining population
  const avgPop = history.reduce((s, h) => s + h.population, 0) / n;
  const populationScore = Math.min(200, avgPop * 2);

  // 2. Prosperity (0-250): GDP per capita averaged over game
  const avgGdpPerCapita = history.reduce(
    (s, h) => s + (h.population > 0 ? h.gdp / h.population : 0), 0
  ) / n;
  const prosperityScore = Math.min(250, avgGdpPerCapita * 5);

  // 3. Equality (0-150): lower Gini = higher score
  const avgGini = history.reduce((s, h) => s + h.giniCoefficient, 0) / n;
  const equalityScore = Math.min(150, (1 - avgGini) * 150);

  // 4. Wellbeing (0-200): avg health + satisfaction over time
  const avgWellbeing = history.reduce(
    (s, h) => s + (h.avgHealth + h.avgSatisfaction) / 2, 0
  ) / n;
  const wellbeingScore = Math.min(200, avgWellbeing * 2);

  // 5. Stability (0-100): low GDP volatility
  const gdps = history.map(h => h.gdp);
  const gdpMean = gdps.reduce((s, v) => s + v, 0) / n;
  const gdpVariance = gdps.reduce((s, v) => s + (v - gdpMean) ** 2, 0) / n;
  const gdpCV = gdpMean > 0 ? Math.sqrt(gdpVariance) / gdpMean : 1;
  const stabilityScore = Math.min(100, Math.max(0, (1 - gdpCV) * 100));

  // 6. Longevity (0-100): bonus for lasting many turns
  const longevityScore = Math.min(100, n);

  const totalScore = Math.round(
    populationScore + prosperityScore + equalityScore +
    wellbeingScore + stabilityScore + longevityScore
  );

  return {
    totalScore,
    populationScore: Math.round(populationScore),
    prosperityScore: Math.round(prosperityScore),
    equalityScore: Math.round(equalityScore),
    wellbeingScore: Math.round(wellbeingScore),
    stabilityScore: Math.round(stabilityScore),
    longevityScore: Math.round(longevityScore),
  };
}

export function getGrade(totalScore: number): string {
  if (totalScore >= 800) return 'S';
  if (totalScore >= 650) return 'A';
  if (totalScore >= 500) return 'B';
  if (totalScore >= 350) return 'C';
  if (totalScore >= 200) return 'D';
  return 'F';
}
