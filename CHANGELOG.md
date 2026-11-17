# Changelog

## 0.1.0

First release.

- `<Turnstile />` shows the widget and follows its size changes.
- `<TurnstileHeadless />` and `controller.getToken()` get tokens from invisible site keys without any UI.
- `TurnstileController` exposes `reset`, `remove`, `render`, `execute`, `reload`, `destroy`, `recreate`, `getResponse`, `isExpired`, `waitForToken` and `getToken`, plus its state and an event stream. `useTurnstileController` and `useTurnstileState` wrap it for components.
- Runs on iOS and Android through react-native-webview, and directly in the page on the web.
- Turnstile error codes are grouped into categories with an `isRetryable` flag.
- Cookies and storage persist between launches.
- The engine, the HTML page, the navigation rules and link handling can each be replaced.
