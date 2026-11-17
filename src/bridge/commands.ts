import { TurnstileJsApi } from './jsApi';

/** Commands sent from React Native to the Turnstile page. */
export type TurnstileCommand = 'render' | 'reset' | 'remove' | 'execute' | 'getResponse' | 'isExpired';

/**
 * Builds the script injected into the WebView for `command`.
 *
 * `injectJavaScript` gives no return value, so the script posts the result
 * back as `{ type: 'result', id, value }` (or `error`). It ends with `true;`
 * as react-native-webview recommends for iOS.
 */
export function commandScript(command: TurnstileCommand, requestId: number): string {
  const bridge = `window.${TurnstileJsApi.globalObject}`;
  const post = `window.${TurnstileJsApi.postFunction}`;
  return [
    '(function () {',
    `  var post = ${post};`,
    '  if (!post) { return; }',
    '  try {',
    `    var value = ${bridge} ? ${bridge}.${command}() : null;`,
    `    post({ type: 'result', id: ${requestId}, value: value === undefined ? null : value });`,
    '  } catch (e) {',
    `    post({ type: 'result', id: ${requestId}, error: String((e && e.message) || e) });`,
    '  }',
    '})();',
    'true;',
  ].join('\n');
}
