import type { TurnstileError } from './errors';

/** Lifecycle state of a `TurnstileController`. */
export type TurnstileStatus =
  /** Not attached, or the widget was removed. */
  | 'idle'
  /** The page or the challenge is loading. */
  | 'loading'
  /** Rendered. The challenge runs or waits for `execute()`. */
  | 'ready'
  /** The visitor has to interact. */
  | 'interactive'
  /** A valid token is available. */
  | 'verified'
  /** The token expired. */
  | 'expired'
  /** The interactive challenge timed out. */
  | 'timedOut'
  /** Something failed, see `lastError`. */
  | 'failed'
  /** Turnstile does not support this environment. */
  | 'unsupported'
  /** The host was freed with `destroy()`. `recreate()` brings it back. */
  | 'destroyed'
  /** The controller was disposed and cannot be used anymore. */
  | 'disposed';

/** Immutable snapshot of a controller, suitable for `useSyncExternalStore`. */
export interface TurnstileState {
  readonly status: TurnstileStatus;
  readonly token: string | null;
  readonly lastError: TurnstileError | null;
}
