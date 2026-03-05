import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PolicyPanel } from '../../src/components/PolicyPanel/PolicyPanel';
import { GameEngine } from '../../src/engine/GameEngine';

function getTestProps() {
  const engine = new GameEngine(42, 'default');
  engine.advanceTurn();
  const state = engine.getState();
  return {
    turn: state.turn,
    government: state.government,
    statistics: state.statistics,
    activeRandomEvents: state.activeRandomEvents,
    pendingPolicies: state.pendingPolicies,
    policyTimeline: state.policyTimeline,
    onSetTaxRate: vi.fn(),
    onSetSubsidy: vi.fn(),
    onSetWelfare: vi.fn(),
    onSetPublicWorks: vi.fn(),
    onSetPolicyRate: vi.fn(),
    onSetLiquiditySupport: vi.fn(),
  };
}

describe('PolicyPanel component', () => {
  it('renders the panel with policy content', () => {
    const { container } = render(<PolicyPanel {...getTestProps()} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/政策/);
  });

  it('renders tax rate section', () => {
    const { container } = render(<PolicyPanel {...getTestProps()} />);
    expect(container.textContent).toMatch(/稅率/);
  });

  it('renders subsidy section', () => {
    const { container } = render(<PolicyPanel {...getTestProps()} />);
    expect(container.textContent).toMatch(/補貼/);
  });

  it('renders welfare toggle', () => {
    const { container } = render(<PolicyPanel {...getTestProps()} />);
    expect(container.textContent).toMatch(/福利/);
  });
});
