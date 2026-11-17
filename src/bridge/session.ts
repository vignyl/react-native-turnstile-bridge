import type { TurnstileEvent } from '../core/events';
import type { TurnstileCommand } from './commands';

/** Removes a listener. */
export type Unsubscribe = () => void;

/** Events coming from a running Turnstile page. */
export interface TurnstileEventSource {
  /** Calls `listener` for each event until the returned function is called. */
  subscribe(listener: (event: TurnstileEvent) => void): Unsubscribe;
}

/** Runs commands inside a running Turnstile page. */
export interface TurnstileCommandExecutor {
  /** Resolves with the raw result. Rejects with a `TurnstileException`. */
  run(command: TurnstileCommand): Promise<unknown>;
}

/**
 * A live, two-way connection to one Turnstile widget. The controller only
 * knows this interface, so engines can change (or be faked in tests)
 * without touching it.
 */
export interface TurnstileSession extends TurnstileEventSource, TurnstileCommandExecutor {
  /** Whether `close()` or `destroy()` was called. */
  readonly isClosed: boolean;
  /** Reloads the whole page. */
  reload(): Promise<void>;
  /** Removes the widget and closes the session. */
  destroy(): Promise<void>;
  /** Releases listeners and pending commands. Safe to call twice. */
  close(): Promise<void>;
}
