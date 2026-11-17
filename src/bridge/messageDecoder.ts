import { TurnstileError, TurnstileErrorClassifier } from '../core/errors';
import type { TurnstileEvent } from '../core/events';

/** Turns raw messages coming from the page into events. */
export interface TurnstileMessageDecoder {
  /** Returns `null` when the message is not a known event. */
  decode(message: unknown): TurnstileEvent | null;
}

/** Reads messages shaped like `{ "type": "...", ... }`, as objects or JSON strings. */
export class JsonTurnstileMessageDecoder implements TurnstileMessageDecoder {
  constructor(private readonly classifier: TurnstileErrorClassifier = new TurnstileErrorClassifier()) {}

  decode(message: unknown): TurnstileEvent | null {
    const data = JsonTurnstileMessageDecoder.asRecord(message);
    if (data === null) return null;

    switch (data.type) {
      case 'ready':
        return data.widgetId == null
          ? { type: 'loaded' }
          : { type: 'loaded', widgetId: String(data.widgetId) };
      case 'token':
        return typeof data.token === 'string' && data.token.length > 0
          ? { type: 'token', token: data.token }
          : null;
      case 'error':
        return {
          type: 'failed',
          error: TurnstileError.fromCode(
            data.code == null ? 'unknown' : String(data.code),
            data.message == null ? undefined : String(data.message),
            this.classifier,
          ),
        };
      case 'scriptError':
        return { type: 'failed', error: TurnstileError.scriptLoadFailed() };
      case 'expired':
        return { type: 'expired' };
      case 'timeout':
        return { type: 'timedOut' };
      case 'beforeInteractive':
        return { type: 'interactionRequired' };
      case 'afterInteractive':
        return { type: 'interactionCompleted' };
      case 'unsupported':
        return { type: 'unsupported' };
      case 'resize':
        return typeof data.width === 'number' && typeof data.height === 'number'
          ? { type: 'resized', width: data.width, height: data.height }
          : null;
      default:
        return null;
    }
  }

  /** Parses a JSON string or returns the object itself. */
  static asRecord(message: unknown): Record<string, unknown> | null {
    let value = message;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        return null;
      }
    }
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}
