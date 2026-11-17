import { useCallback, useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import type {
  ShouldStartLoadRequest,
  WebViewErrorEvent,
  WebViewOpenWindowEvent,
} from 'react-native-webview/lib/WebViewTypes';

import { TurnstileError } from '../../core/errors';
import type { TurnstileEngine, TurnstileHostProps } from '../TurnstileEngine';
import { WebViewTurnstileSession, type WebViewHandle } from './WebViewTurnstileSession';

/**
 * Hosts Turnstile in a react-native-webview (iOS and Android).
 *
 * Cookies and storage stay persistent (no incognito, third-party cookies on
 * Android, shared cookie store on iOS) so clearance survives app restarts.
 */
export function WebViewTurnstileHost({ config, onSessionCreated, style }: TurnstileHostProps) {
  const webViewRef = useRef<ComponentRef<typeof WebView>>(null);
  const sessionRef = useRef<WebViewTurnstileSession | null>(null);
  const onSessionCreatedRef = useRef(onSessionCreated);
  onSessionCreatedRef.current = onSessionCreated;

  const html = useMemo(() => config.documentBuilder.build(config.options), [config]);

  useEffect(() => {
    const handle: WebViewHandle = {
      injectJavaScript: (script) => webViewRef.current?.injectJavaScript(script),
      reload: () => webViewRef.current?.reload(),
    };
    const session = new WebViewTurnstileSession(handle);
    sessionRef.current = session;
    onSessionCreatedRef.current(session);
    return () => {
      sessionRef.current = null;
      void session.close();
    };
  }, []);

  const openExternally = useCallback(
    (url: string) => {
      config.linkHandler.open(url).catch(() => {
        // Opening a link must never break the challenge.
      });
    },
    [config],
  );

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      const decision = config.navigationPolicy.decide(request.url, request.isTopFrame ?? true);
      if (decision === 'openExternally') openExternally(request.url);
      return decision === 'allow';
    },
    [config, openExternally],
  );

  const onOpenWindow = useCallback(
    (event: WebViewOpenWindowEvent) => {
      const url = event.nativeEvent.targetUrl;
      if (/^https?:/i.test(url)) openExternally(url);
    },
    [openExternally],
  );

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    sessionRef.current?.handleMessage(event.nativeEvent.data);
  }, []);

  const onError = useCallback((event: WebViewErrorEvent) => {
    sessionRef.current?.emit({
      type: 'failed',
      error: TurnstileError.pageLoadFailed(event.nativeEvent.description),
    });
  }, []);

  return (
    <WebView
      ref={webViewRef}
      source={{ html, baseUrl: config.baseUrl }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      thirdPartyCookiesEnabled
      sharedCookiesEnabled
      incognito={false}
      cacheEnabled
      setSupportMultipleWindows
      onOpenWindow={onOpenWindow}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      onMessage={onMessage}
      onError={onError}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      automaticallyAdjustContentInsets={false}
      webviewDebuggingEnabled={__DEV__}
      style={styles.webView}
      containerStyle={style}
      {...(config.webViewProps as Partial<WebViewProps> | undefined)}
    />
  );
}

const styles = StyleSheet.create({
  webView: { flex: 1, backgroundColor: 'transparent' },
});

/** Engine for iOS and Android, based on react-native-webview. */
export class WebViewTurnstileEngine implements TurnstileEngine {
  readonly Host = WebViewTurnstileHost;
}
