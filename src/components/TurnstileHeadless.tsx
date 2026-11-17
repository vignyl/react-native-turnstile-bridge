import { StyleSheet, View } from 'react-native';

import { IgnoreLinkHandler } from '../navigation/linkHandler';
import { Turnstile, type TurnstileProps } from './Turnstile';

export type TurnstileHeadlessProps = Omit<TurnstileProps, 'style'>;

const ignoreLinks = new IgnoreLinkHandler();

/**
 * Runs Turnstile in an invisible, non interactive box, for invisible site
 * keys. Get tokens through the controller:
 *
 * ```tsx
 * const controller = useTurnstileController();
 * <TurnstileHeadless controller={controller} baseUrl="https://example.com" options={{ siteKey }} />
 * const token = await controller.getToken();
 * ```
 *
 * If Cloudflare asks for an interaction, `getToken()` rejects with
 * `interaction_required`: show a visible `Turnstile` instead.
 */
export function TurnstileHeadless(props: TurnstileHeadlessProps) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.hidden}
    >
      <Turnstile linkHandler={ignoreLinks} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', top: 0, left: 0, opacity: 0, zIndex: -1 },
});
