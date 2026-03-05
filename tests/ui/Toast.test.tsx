import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from '../../src/components/Toast/Toast';
import type { ToastNotification } from '../../src/types';

describe('Toast component', () => {
  it('renders nothing when toasts array is empty', () => {
    const { container } = render(<Toast toasts={[]} onDismiss={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders visible toasts with title and message', () => {
    const toasts: ToastNotification[] = [
      {
        id: 't1',
        type: 'info',
        title: 'Test Title',
        message: 'Test message body',
        duration: 5000,
        createdAt: Date.now(),
      },
    ];
    render(<Toast toasts={toasts} onDismiss={() => {}} />);
    expect(screen.getByText('Test Title')).toBeTruthy();
    expect(screen.getByText('Test message body')).toBeTruthy();
  });

  it('shows at most 3 toasts', () => {
    const toasts: ToastNotification[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      type: 'info' as const,
      title: `Toast ${i}`,
      message: `Msg ${i}`,
      duration: 10000,
      createdAt: Date.now(),
    }));
    render(<Toast toasts={toasts} onDismiss={() => {}} />);
    // Should only show last 3
    expect(screen.queryByText('Toast 0')).toBeNull();
    expect(screen.queryByText('Toast 1')).toBeNull();
    expect(screen.getByText('Toast 2')).toBeTruthy();
    expect(screen.getByText('Toast 3')).toBeTruthy();
    expect(screen.getByText('Toast 4')).toBeTruthy();
  });

  it('calls onDismiss when dismiss button is clicked', async () => {
    const onDismiss = vi.fn();
    const toasts: ToastNotification[] = [
      {
        id: 't1',
        type: 'info',
        title: 'Dismissable',
        message: 'Click to dismiss',
        duration: 10000,
        createdAt: Date.now(),
      },
    ];
    const { container } = render(<Toast toasts={toasts} onDismiss={onDismiss} />);
    const dismissBtn = container.querySelector('button[aria-label="Dismiss"]')!;
    expect(dismissBtn).toBeTruthy();
    dismissBtn.click();
    // onDismiss is called after a setTimeout(300)
    await vi.waitFor(() => {
      expect(onDismiss).toHaveBeenCalledWith('t1');
    });
  });
});
