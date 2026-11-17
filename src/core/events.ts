import type { TurnstileError } from './errors';

/**
 * Everything Turnstile reports. The `type` field makes `switch` statements
 * exhaustive:
 *
 * ```ts
 * switch (event.type) {
 *   case 'token': send(event.token); break;
 *   case 'failed': log(event.error); break;
 * }
 * ```
 */
export type TurnstileEvent =
  /** The widget is rendered and the challenge starts. */
  | { readonly type: 'loaded'; readonly widgetId?: string }
  /** The challenge succeeded. The token is single use and valid 300 s. */
  | { readonly type: 'token'; readonly token: string }
  /** Turnstile or the bridge reported an error. */
  | { readonly type: 'failed'; readonly error: TurnstileError }
  /** The previous token expired. */
  | { readonly type: 'expired' }
  /** The interactive challenge was not solved in time. */
  | { readonly type: 'timedOut' }
  /** The visitor has to interact with the widget. */
  | { readonly type: 'interactionRequired' }
  /** The visitor finished the interaction. */
  | { readonly type: 'interactionCompleted' }
  /** Turnstile does not support this environment. */
  | { readonly type: 'unsupported' }
  /** The widget changed size. */
  | { readonly type: 'resized'; readonly width: number; readonly height: number };

/** Union of the `type` values. */
export type TurnstileEventType = TurnstileEvent['type'];
