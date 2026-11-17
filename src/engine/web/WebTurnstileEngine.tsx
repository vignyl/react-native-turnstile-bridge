import { useEffect, useRef, type ComponentRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { TurnstileEngine, TurnstileHostProps } from '../TurnstileEngine';
import { WebTurnstileSession } from './WebTurnstileSession';

/**
 * Hosts Turnstile directly in the page on react-native-web, without any
 * iframe of ours, so Cloudflare checks the site's real domain.
 */
export function WebTurnstileHost({ config, onSessionCreated, style }: TurnstileHostProps) {
  const viewRef = useRef<ComponentRef<typeof View>>(null);
  const onSessionCreatedRef = useRef(onSessionCreated);
  onSessionCreatedRef.current = onSessionCreated;

  useEffect(() => {
    // On react-native-web, a View ref is the underlying DOM element.
    const element = viewRef.current as unknown as HTMLElement | null;
    if (element === null) return undefined;
    const session = new WebTurnstileSession(config.options, element, config.documentBuilder.scriptUrl);
    onSessionCreatedRef.current(session);
    void session.start();
    return () => {
      void session.close();
    };
    // Runs once: the parent gives the host a new key when the config changes.
  }, []);

  return <View ref={viewRef} style={[styles.host, style]} />;
}

const styles = StyleSheet.create({
  host: { flex: 1, overflow: 'hidden' },
});

/** Engine for react-native-web. */
export class WebTurnstileEngine implements TurnstileEngine {
  readonly Host = WebTurnstileHost;
}
