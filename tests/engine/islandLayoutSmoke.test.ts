import assert from 'node:assert/strict';
import test from 'node:test';

import { getResidentialBlockCount } from '../../src/components/IslandMap/agentAnimator';

test('island layout: residential blocks expand as population grows', () => {
  assert.equal(getResidentialBlockCount(100), 3);
  assert.equal(getResidentialBlockCount(111), 4);
  assert.equal(getResidentialBlockCount(139), 5);
  assert.equal(getResidentialBlockCount(1000), 9);
});
