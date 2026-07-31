import { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorState } from './ErrorState';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// One error boundary for the whole app: an unexpected exception anywhere in the tree below
// this shows a consistent message and a reload option instead of a blank white screen.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error in LedgerLine', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 'var(--space-6)', maxWidth: 480, margin: '0 auto' }}>
          <ErrorState message="Something went wrong. Reloading the page usually fixes this." />
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 'var(--space-4)', padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)' }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
