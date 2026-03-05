import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className={styles.container}>
          <div className={styles.title}>
            {this.props.fallbackLabel ?? '此區塊發生錯誤'}
          </div>
          <pre className={styles.detail}>{this.state.error.message}</pre>
          <button className={styles.retryBtn} onClick={this.handleRetry}>
            重試 Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
