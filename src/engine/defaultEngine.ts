import type { TurnstileEngine } from './TurnstileEngine';
import { WebViewTurnstileEngine } from './webview/WebViewTurnstileEngine';

// The bundler picks defaultEngine.web.ts on the web, so react-native-webview
// is never imported there.

/** Engine for the current platform: react-native-webview on iOS and Android. */
export function createDefaultTurnstileEngine(): TurnstileEngine {
  return new WebViewTurnstileEngine();
}

export { WebViewTurnstileEngine, WebViewTurnstileHost } from './webview/WebViewTurnstileEngine';
export { WebViewTurnstileSession, type WebViewHandle } from './webview/WebViewTurnstileSession';
