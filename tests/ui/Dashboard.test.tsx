import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from '../../src/components/Dashboard/Dashboard';
import { GameEngine } from '../../src/engine/GameEngine';

function getTestState() {
  const engine = new GameEngine(42, 'default');
  engine.advanceTurn();
  return engine.getState();
}

describe('Dashboard component', () => {
  it('renders turn number', () => {
    const state = getTestState();
    render(<Dashboard state={state} />);
    expect(screen.getAllByText(/回合/).length).toBeGreaterThan(0);
  });

  it('renders population count', () => {
    const state = getTestState();
    render(<Dashboard state={state} />);
    expect(screen.getAllByText(/人口/).length).toBeGreaterThan(0);
  });

  it('renders GDP indicator', () => {
    const state = getTestState();
    render(<Dashboard state={state} />);
    expect(screen.getAllByText(/GDP/).length).toBeGreaterThan(0);
  });

  it('renders Gini coefficient', () => {
    const state = getTestState();
    render(<Dashboard state={state} />);
    expect(screen.getAllByText(/Gini/i).length).toBeGreaterThan(0);
  });

  it('renders governor objectives section', () => {
    const state = getTestState();
    const { container } = render(<Dashboard state={state} />);
    // Check for objective-related content in the rendered output
    expect(container.textContent).toMatch(/目標|Objective|Governor|任務/i);
  });
});
