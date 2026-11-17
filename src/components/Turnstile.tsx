import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { TurnstileSession } from '../bridge/session';
import { TurnstileController } from '../controller/TurnstileController';
import type { TurnstileError } from '../core/errors';
import type { TurnstileEvent } from '../core/events';
import { TurnstileOptions, type TurnstileDimensions, type TurnstileOptionsInit } from '../core/options';
import { createDefaultTurnstileEngine } from '../engine/defaultEngine';
import type { TurnstileEngine, TurnstileHostConfig } from '../engine/TurnstileEngine';
import { TurnstileHtmlDocumentBuilder, type TurnstileDocumentBuilder } from '../html/documentBuilder';
import { SystemBrowserLinkHandler, type TurnstileLinkHandler } from '../navigation/linkHandler';
import { DefaultTurnstileNavigationPolicy, type TurnstileNavigationPolicy } from '../navigation/navigationPolicy';
import { useTurnstileState } from './hooks';

export interface TurnstileProps {
  /** Site key and render options. */
  options: TurnstileOptions | TurnstileOptionsInit;
  /**
   * Origin of the WebView page on iOS and Android. Its host must be in the
   * widget's allowed hostnames. Ignored on the web.
   */
  baseUrl: string;
  /** Optional controller. The component creates its own when omitted. */
  controller?: TurnstileController;
  /** Hosting engine. Defaults to the one for the current platform. */
  engine?: TurnstileEngine;
  documentBuilder?: TurnstileDocumentBuilder;
  navigationPolicy?: TurnstileNavigationPolicy;
  linkHandler?: TurnstileLinkHandler;
  /** Extra props passed to react-native-webview. */
  webViewProps?: Record<string, unknown>;
  onToken?: (token: string) => void;
  onError?: (error: TurnstileError) => void;
  onExpired?: () => void;
  /** Called for every event, including the three above. */
  onEvent?: (event: TurnstileEvent) => void;
  style?: StyleProp<ViewStyle>;
}

const defaultDocumentBuilder = new TurnstileHtmlDocumentBuilder();
const defaultLinkHandler = new SystemBrowserLinkHandler();

/** A zero-height native view may be throttled, so keep one point. */
const MIN_HEIGHT = 1;

/**
 * Cloudflare Turnstile widget.
 *
 * ```tsx
 * <Turnstile
 *   baseUrl="https://example.com"
 *   options={{ siteKey: '0x4AAAAAAA...' }}
 *   onToken={(token) => api.login({ captchaToken: token })}
 * />
 * ```
 *
 * The WebView is created on mount and released on unmount. Use a
 * controller to reset it or free it earlier with `destroy()`.
 */
export function Turnstile(props: TurnstileProps) {
  // Cheap to create, used only when no controller is passed.
  const [ownController] = useState(() => new TurnstileController());
  const controller = props.controller ?? ownController;

  // Rebuilt only when the options actually change, not on every render.
  const optionsKey = TurnstileOptions.from(props.options).key;
  const options = useMemo(() => TurnstileOptions.from(props.options), [optionsKey]);

  const engine = useMemo(() => props.engine ?? createDefaultTurnstileEngine(), [props.engine]);
  const config = useMemo<TurnstileHostConfig>(
    () => ({
      options,
      baseUrl: props.baseUrl,
      documentBuilder: props.documentBuilder ?? defaultDocumentBuilder,
      navigationPolicy: props.navigationPolicy ?? new DefaultTurnstileNavigationPolicy(props.baseUrl),
      linkHandler: props.linkHandler ?? defaultLinkHandler,
      webViewProps: props.webViewProps,
    }),
    [options, props.baseUrl, props.documentBuilder, props.navigationPolicy, props.linkHandler, props.webViewProps],
  );

  const { status } = useTurnstileState(controller);
  const [contentSize, setContentSize] = useState<TurnstileDimensions | null>(null);
  const [generation, setGeneration] = useState(0);
  const sessionRef = useRef<TurnstileSession | null>(null);

  // Latest callbacks, without re-subscribing on every render.
  const callbacksRef = useRef(props);
  callbacksRef.current = props;

  useEffect(
    () =>
      controller.addEventListener((event) => {
        const callbacks = callbacksRef.current;
        callbacks.onEvent?.(event);
        switch (event.type) {
          case 'token':
            callbacks.onToken?.(event.token);
            break;
          case 'failed':
            callbacks.onError?.(event.error);
            break;
          case 'expired':
            callbacks.onExpired?.();
            break;
          case 'resized':
            setContentSize((previous) =>
              previous?.width === event.width && previous.height === event.height
                ? previous
                : { width: event.width, height: event.height },
            );
            break;
          default:
            break;
        }
      }),
    [controller],
  );

  // Moves the current session when the controller prop changes, and
  // detaches on unmount.
  useEffect(() => {
    const session = sessionRef.current;
    if (session !== null && !session.isClosed && !controller.isDisposed) controller.attach(session);
    return () => {
      const current = sessionRef.current;
      if (current !== null) controller.detach(current);
    };
  }, [controller]);

  const onSessionCreated = useCallback(
    (session: TurnstileSession) => {
      const previous = sessionRef.current;
      if (previous !== null && previous !== session) controller.detach(previous);
      sessionRef.current = session;
      if (!controller.isDisposed) controller.attach(session);
    },
    [controller],
  );

  // A new configuration or engine means a new host, hence a new key.
  const hostVersion = useRef(0);
  const hostKey = useMemo(() => `turnstile-host-${++hostVersion.current}`, [config, engine, generation]);
  useEffect(() => setContentSize(null), [hostKey]);

  // destroy() frees the host, recreate() asks for a new one.
  const previousStatus = useRef(status);
  useEffect(() => {
    if (status === 'destroyed') sessionRef.current = null;
    if (previousStatus.current === 'destroyed' && status !== 'destroyed') {
      setGeneration((value) => value + 1);
    }
    previousStatus.current = status;
  }, [status]);

  if (status === 'destroyed') return null;

  const preferred = options.preferredSize;
  const hiddenUntilNeeded = options.appearance !== 'always';
  const height = Math.max(contentSize?.height ?? (hiddenUntilNeeded ? 0 : preferred.height), MIN_HEIGHT);
  const width = Math.max(contentSize?.width ?? preferred.width, preferred.width);
  const Host = engine.Host;

  return (
    <View style={[{ width: options.size === 'flexible' ? '100%' : width, height }, styles.frame, props.style]}>
      <Host key={hostKey} config={config} onSessionCreated={onSessionCreated} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
});
