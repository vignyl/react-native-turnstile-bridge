// Components and hooks
export { Turnstile, type TurnstileProps } from './components/Turnstile';
export { TurnstileHeadless, type TurnstileHeadlessProps } from './components/TurnstileHeadless';
export { useTurnstileController, useTurnstileState } from './components/hooks';

// Controller
export {
  TurnstileController,
  type TurnstileControllerOptions,
  type WaitForTokenOptions,
} from './controller/TurnstileController';

// Values
export {
  TurnstileOptions,
  type TurnstileOptionsInit,
  type TurnstileDimensions,
  type TurnstileTheme,
  type TurnstileSize,
  type TurnstileAppearance,
  type TurnstileExecution,
  type TurnstileRetry,
  type TurnstileRefreshMode,
} from './core/options';
export {
  TurnstileError,
  TurnstileErrorClassifier,
  TurnstileException,
  type TurnstileErrorCategory,
} from './core/errors';
export type { TurnstileEvent, TurnstileEventType } from './core/events';
export type { TurnstileState, TurnstileStatus } from './core/status';

// Extension points
export type { TurnstileSession, TurnstileEventSource, TurnstileCommandExecutor, Unsubscribe } from './bridge/session';
export { commandScript, type TurnstileCommand } from './bridge/commands';
export { TurnstileJsApi } from './bridge/jsApi';
export { JsonTurnstileMessageDecoder, type TurnstileMessageDecoder } from './bridge/messageDecoder';
export type { TurnstileEngine, TurnstileHostConfig, TurnstileHostProps } from './engine/TurnstileEngine';
export {
  TurnstileHtmlDocumentBuilder,
  DEFAULT_TURNSTILE_SCRIPT_URL,
  type TurnstileDocumentBuilder,
} from './html/documentBuilder';
export {
  DefaultTurnstileNavigationPolicy,
  type TurnstileNavigationPolicy,
  type TurnstileNavigationDecision,
} from './navigation/navigationPolicy';
export { SystemBrowserLinkHandler, IgnoreLinkHandler, type TurnstileLinkHandler } from './navigation/linkHandler';

// Platform engine (react-native-webview on iOS/Android, the page on the web)
export * from './engine/defaultEngine';
