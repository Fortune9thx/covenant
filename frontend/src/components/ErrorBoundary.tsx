import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

/**
 * A render crash must never blank the page.
 *
 * This is a class because React error boundaries cannot be hooks. The reset
 * reloads the route rather than pretending the failure did not happen.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface it in the console; the UI below is the user-facing part.
    console.error("COVENANT render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-screen max-w-lg items-center px-5">
        <div className="card w-full p-8 text-center">
          <p className="eyebrow">Interface error</p>
          <h1 className="h-display mt-2 text-2xl">Something broke while rendering</h1>
          <p className="mt-3 break-words text-sm text-mute">{this.state.error.message}</p>
          <button className="btn-primary mt-6" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
