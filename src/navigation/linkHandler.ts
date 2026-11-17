import { Linking } from 'react-native';

/** Opens links that must leave the Turnstile WebView. */
export interface TurnstileLinkHandler {
  open(url: string): Promise<void>;
}

/** Opens links with the system browser through `Linking`. */
export class SystemBrowserLinkHandler implements TurnstileLinkHandler {
  async open(url: string): Promise<void> {
    await Linking.openURL(url);
  }
}

/** Ignores every link. Useful in kiosks and tests. */
export class IgnoreLinkHandler implements TurnstileLinkHandler {
  async open(): Promise<void> {}
}
