import { Component, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  // Route-level recovery: when resetKey (the pathname) changes after a crash, clear the error so
  // the next screen renders — a crash in one page no longer strands the whole app. Navigating with
  // no error present does nothing here, so pages are NOT remounted on every navigation.
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error) {
    // best-effort client error log; RLS allows inserts tied to the current user
    supabase.auth.getUser().then(({ data }) => {
      supabase.from('error_logs').insert({
        user_id: data.user?.id ?? null,
        source: 'client',
        message: error.message,
        stack: error.stack?.slice(0, 4000) ?? null,
      }).then(() => {});
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
          <h1 className="font-display text-xl font-semibold">Something broke on this screen</h1>
          <p className="max-w-md text-sm text-forge-dim">
            The error has been logged. Reload to continue — your projects and files are safe in the database.
          </p>
          <pre className="max-w-lg overflow-auto rounded-lg border border-forge-border bg-forge-panel p-3 text-left font-mono text-xs text-forge-err">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-forge-ember px-4 py-2 text-sm font-medium text-[#1A0E04] hover:bg-forge-heat"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
