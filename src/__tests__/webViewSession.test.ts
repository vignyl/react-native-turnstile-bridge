import { TurnstileError, TurnstileException } from '../core/errors';
import type { TurnstileEvent } from '../core/events';
import { WebViewTurnstileSession, type WebViewHandle } from '../engine/webview/WebViewTurnstileSession';

class FakeWebView implements WebViewHandle {
  readonly scripts: string[] = [];
  reloads = 0;

  injectJavaScript(script: string): void {
    this.scripts.push(script);
  }

  reload(): void {
    this.reloads += 1;
  }

  /** Request id of the last injected command. */
  get lastId(): number {
    return Number(/id: (\d+)/.exec(this.scripts.at(-1) ?? '')?.[1]);
  }
}

describe('WebViewTurnstileSession', () => {
  it('turns page messages into events', () => {
    const session = new WebViewTurnstileSession(new FakeWebView());
    const events: TurnstileEvent[] = [];
    session.subscribe((event) => events.push(event));
    session.handleMessage('{"type":"ready","widgetId":"w"}');
    session.handleMessage('{"type":"token","token":"t"}');
    session.handleMessage('garbage');
    expect(events).toEqual([
      { type: 'loaded', widgetId: 'w' },
      { type: 'token', token: 't' },
    ]);
  });

  it('resolves commands with the matching result message', async () => {
    const webView = new FakeWebView();
    const session = new WebViewTurnstileSession(webView);
    const first = session.run('getResponse');
    const firstId = webView.lastId;
    const second = session.run('isExpired');
    const secondId = webView.lastId;

    session.handleMessage(JSON.stringify({ type: 'result', id: secondId, value: false }));
    session.handleMessage(JSON.stringify({ type: 'result', id: firstId, value: 'tok' }));

    await expect(first).resolves.toBe('tok');
    await expect(second).resolves.toBe(false);
    expect(webView.scripts[0]).toContain('.getResponse()');
  });

  it('rejects a command that fails in the page', async () => {
    const webView = new FakeWebView();
    const session = new WebViewTurnstileSession(webView);
    const promise = session.run('reset');
    session.handleMessage(JSON.stringify({ type: 'result', id: webView.lastId, error: 'boom' }));
    await expect(promise).rejects.toBeInstanceOf(TurnstileException);
  });

  it('rejects a command nobody answers', async () => {
    const session = new WebViewTurnstileSession(new FakeWebView(), undefined, 10);
    await expect(session.run('reset')).rejects.toMatchObject({
      error: { code: TurnstileError.javascriptFailedCode },
    });
  });

  it('closes pending commands and listeners', async () => {
    const session = new WebViewTurnstileSession(new FakeWebView());
    const events: TurnstileEvent[] = [];
    session.subscribe((event) => events.push(event));
    const pending = session.run('getResponse');
    await session.close();
    await expect(pending).rejects.toMatchObject({ error: { code: TurnstileError.disposedCode } });
    session.handleMessage('{"type":"expired"}');
    expect(events).toEqual([]);
    expect(session.isClosed).toBe(true);
    await expect(session.run('reset')).rejects.toBeInstanceOf(TurnstileException);
  });

  it('reloads through the WebView', async () => {
    const webView = new FakeWebView();
    await new WebViewTurnstileSession(webView).reload();
    expect(webView.reloads).toBe(1);
  });
});
