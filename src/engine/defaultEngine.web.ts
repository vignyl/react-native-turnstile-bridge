import type { TurnstileEngine } from './TurnstileEngine';
import { WebTurnstileEngine } from './web/WebTurnstileEngine';

/** Engine for the current platform: rendering in the page on the web. */
export function createDefaultTurnstileEngine(): TurnstileEngine {
  return new WebTurnstileEngine();
}

export { WebTurnstileEngine, WebTurnstileHost } from './web/WebTurnstileEngine';
export { WebTurnstileSession, TurnstileScriptLoader } from './web/WebTurnstileSession';
