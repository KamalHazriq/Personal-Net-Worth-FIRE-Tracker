import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  resetKey?: string; // change this (e.g. route path) to clear the error
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('Page error:', error);
  }
  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-lg mx-auto mt-12">
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center gap-2 text-loss mb-2">
              <AlertTriangle size={18} />
              <h2 className="font-semibold">This page hit an error</h2>
            </div>
            <p className="text-sm text-muted">
              The rest of the app still works — switch pages from the sidebar. If it persists, reload.
            </p>
            <pre className="mt-3 text-xs bg-surface-2 rounded-lg p-3 overflow-auto max-h-40 text-muted">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 px-3 py-1.5 rounded-lg bg-accent text-white text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
