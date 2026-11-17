import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { TurnstileSession } from '../bridge/session';
import type { TurnstileOptions } from '../core/options';
import type { TurnstileDocumentBuilder } from '../html/documentBuilder';
import type { TurnstileLinkHandler } from '../navigation/linkHandler';
import type { TurnstileNavigationPolicy } from '../navigation/navigationPolicy';

/**
 * Everything an engine needs to host one widget. The web engine renders in
 * the page and only uses `options` and `documentBuilder.scriptUrl`.
 */
export interface TurnstileHostConfig {
  readonly options: TurnstileOptions;
  /** Origin of the WebView page. Its host must be allowed for the site key. */
  readonly baseUrl: string;
  readonly documentBuilder: TurnstileDocumentBuilder;
  readonly navigationPolicy: TurnstileNavigationPolicy;
  readonly linkHandler: TurnstileLinkHandler;
  /** Extra props for react-native-webview, merged last. */
  readonly webViewProps?: Readonly<Record<string, unknown>>;
}

/** Props every engine host component receives. */
export interface TurnstileHostProps {
  readonly config: TurnstileHostConfig;
  /**
   * Called once the bridge is ready. The host owns the session and closes it
   * when it unmounts.
   */
  readonly onSessionCreated: (session: TurnstileSession) => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Hosts Turnstile on a family of platforms. `Turnstile` and
 * `TurnstileHeadless` only render `engine.Host`, so supporting a new
 * platform means writing an engine, without changing them.
 */
export interface TurnstileEngine {
  readonly Host: ComponentType<TurnstileHostProps>;
}
