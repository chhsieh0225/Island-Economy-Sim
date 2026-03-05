import { describe, it, expect } from 'vitest';

import { getResidentialBlockCount } from '../../src/components/IslandMap/agentAnimator';

describe('islandLayout', () => {
  it('residential blocks expand as population grows', () => {
    expect(getResidentialBlockCount(100)).toBe(3);
    expect(getResidentialBlockCount(111)).toBe(4);
    expect(getResidentialBlockCount(139)).toBe(5);
    expect(getResidentialBlockCount(1000)).toBe(9);
  });
});
