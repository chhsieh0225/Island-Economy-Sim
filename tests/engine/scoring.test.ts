import { describe, it, expect } from 'vitest';
import { computeScore, getGrade } from '../../src/engine/Scoring';
import { makeSnapshot } from './_testHelpers';

describe('Scoring', () => {
  describe('computeScore', () => {
    it('returns all zeros for empty history', () => {
      const result = computeScore([]);
      expect(result.totalScore).toBe(0);
      expect(result.populationScore).toBe(0);
      expect(result.prosperityScore).toBe(0);
      expect(result.equalityScore).toBe(0);
      expect(result.wellbeingScore).toBe(0);
      expect(result.stabilityScore).toBe(0);
      expect(result.longevityScore).toBe(0);
    });

    it('population score caps at 200', () => {
      const history = [makeSnapshot({ population: 200 })];
      const result = computeScore(history);
      // avgPop=200, score=min(200, 200*2)=200
      expect(result.populationScore).toBe(200);
    });

    it('prosperity score caps at 250', () => {
      // GDP/capita = 100, score = min(250, 100*5) = 250
      const history = [makeSnapshot({ population: 50, gdp: 5000 })];
      const result = computeScore(history);
      expect(result.prosperityScore).toBe(250);
    });

    it('equality score is 150 for perfect equality (Gini=0)', () => {
      const history = [makeSnapshot({ giniCoefficient: 0 })];
      const result = computeScore(history);
      expect(result.equalityScore).toBe(150);
    });

    it('equality score approaches 0 for max inequality (Gini=1)', () => {
      const history = [makeSnapshot({ giniCoefficient: 1 })];
      const result = computeScore(history);
      expect(result.equalityScore).toBe(0);
    });

    it('wellbeing score reflects average health and satisfaction', () => {
      const history = [makeSnapshot({ avgHealth: 80, avgSatisfaction: 80 })];
      const result = computeScore(history);
      // avgWellbeing = (80+80)/2 = 80, score = min(200, 80*2) = 160
      expect(result.wellbeingScore).toBe(160);
    });

    it('wellbeing score caps at 200', () => {
      const history = [makeSnapshot({ avgHealth: 100, avgSatisfaction: 100 })];
      const result = computeScore(history);
      expect(result.wellbeingScore).toBe(200);
    });

    it('stability score is 100 for constant GDP', () => {
      const history = [
        makeSnapshot({ gdp: 5000 }),
        makeSnapshot({ gdp: 5000 }),
        makeSnapshot({ gdp: 5000 }),
      ];
      const result = computeScore(history);
      expect(result.stabilityScore).toBe(100);
    });

    it('stability score drops for volatile GDP', () => {
      const history = [
        makeSnapshot({ gdp: 1000 }),
        makeSnapshot({ gdp: 5000 }),
        makeSnapshot({ gdp: 1000 }),
        makeSnapshot({ gdp: 5000 }),
      ];
      const result = computeScore(history);
      expect(result.stabilityScore).toBeLessThan(50);
    });

    it('longevity score equals number of turns up to 100', () => {
      const history = Array.from({ length: 42 }, (_, i) => makeSnapshot({ turn: i + 1 }));
      const result = computeScore(history);
      expect(result.longevityScore).toBe(42);
    });

    it('longevity score caps at 100', () => {
      const history = Array.from({ length: 150 }, (_, i) => makeSnapshot({ turn: i + 1 }));
      const result = computeScore(history);
      expect(result.longevityScore).toBe(100);
    });

    it('total score is sum of all components', () => {
      const history = [makeSnapshot()];
      const result = computeScore(history);
      expect(result.totalScore).toBe(
        result.populationScore + result.prosperityScore + result.equalityScore +
        result.wellbeingScore + result.stabilityScore + result.longevityScore
      );
    });
  });

  describe('getGrade', () => {
    it('S grade for 800+', () => {
      expect(getGrade(800)).toBe('S');
      expect(getGrade(1000)).toBe('S');
    });
    it('A grade for 650-799', () => {
      expect(getGrade(650)).toBe('A');
      expect(getGrade(799)).toBe('A');
    });
    it('B grade for 500-649', () => {
      expect(getGrade(500)).toBe('B');
      expect(getGrade(649)).toBe('B');
    });
    it('C grade for 350-499', () => {
      expect(getGrade(350)).toBe('C');
      expect(getGrade(499)).toBe('C');
    });
    it('D grade for 200-349', () => {
      expect(getGrade(200)).toBe('D');
      expect(getGrade(349)).toBe('D');
    });
    it('F grade for below 200', () => {
      expect(getGrade(199)).toBe('F');
      expect(getGrade(0)).toBe('F');
    });
  });
});
