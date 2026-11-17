import type { TurnstileCommand } from '../../bridge/commands';
import { Emitter } from '../../bridge/emitter';
import { JsonTurnstileMessageDecoder, type TurnstileMessageDecoder } from '../../bridge/messageDecoder';
import type { TurnstileSession, Unsubscribe } from '../../bridge/session';
import { TurnstileError, TurnstileException } from '../../core/errors';
import type { TurnstileEvent } from '../../core/events';
import type { TurnstileOptions } from '../../core/options';

/** The part of the Turnstile JavaScript API this package uses. */
interface JsTurnstile {
  render(container: HTMLElement | string, params: Record<string, unknown>): string | null | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
  execute(container: HTMLElement | string): void;
  getResponse(widgetId: string): string | null | undefined;
  isExpired(widgetId: string): boolean;
}

function turnstileApi(): JsTurnstile | undefined {
  return (window as unknown as { turnstile?: JsTurnstile }).turnstile;
}

/** Injects `api.js` once per page. A failed load can be retried. */
export class TurnstileScriptLoader {
  private static loading: Promise<void> | null = null;
  private static readonly callbackName = '__turnstileBridgeOnLoad';

  static ensureLoaded(scriptUrl: string): Promise<void> {
    if (turnstileApi() !== undefined) return Promise.resolve();
    if (this.loading === null) {
      const pending = this.load(scriptUrl);
      this.loading = pending;
      pending.catch(() => {
        if (this.loading === pending) this.loading = null;
      });
    }
    return this.loading;
  }

  private static load(scriptUrl: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      (window as unknown as Record<string, unknown>)[this.callbackName] = () => resolve();
      const script = document.createElement('script');
      script.src = `${scriptUrl}?render=explicit&onload=${this.callbackName}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        script.remove();
        reject(new TurnstileException(TurnstileError.scriptLoadFailed()));
      };
      document.head.appendChild(script);
    });
  }
}

/**
 * `TurnstileSession` that renders Turnstile directly in the current page
 * (react-native-web). It produces the same messages as the WebView page and
 * runs them through the same decoder.
 */
export class WebTurnstileSession implements TurnstileSession {
  private readonly emitter = new Emitter<TurnstileEvent>();
  private readonly container: HTMLDivElement;
  private resizeObserver: ResizeObserver | null = null;
  private widgetId: string | null = null;
  private rendered = false;
  private lastSize: { width: number; height: number } | null = null;
  private closed = false;

  constructor(
    private readonly options: TurnstileOptions,
    host: HTMLElement,
    private readonly scriptUrl: string,
    private readonly decoder: TurnstileMessageDecoder = new JsonTurnstileMessageDecoder(),
  ) {
    this.container = document.createElement('div');
    this.container.style.display = options.size === 'flexible' ? 'block' : 'inline-block';
    host.appendChild(this.container);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  subscribe(listener: (event: TurnstileEvent) => void): Unsubscribe {
    return this.emitter.add(listener);
  }

  /** Waits for the element to be in the document, loads `api.js` and renders. */
  async start(): Promise<void> {
    this.observeSize();
    try {
      // React Native Web inserts views on its next commit, and browsers pause
      // rendering in background tabs, so wait as long as needed.
      while (!this.container.isConnected && !this.closed) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await TurnstileScriptLoader.ensureLoaded(this.scriptUrl);
    } catch (error) {
      const turnstileError =
        error instanceof TurnstileException ? error.error : TurnstileError.scriptLoadFailed();
      this.emit({ type: 'failed', error: turnstileError });
      return;
    }
    if (!this.closed) this.renderWidget();
  }

  async run(command: TurnstileCommand): Promise<unknown> {
    if (this.closed) throw new TurnstileException(TurnstileError.disposed());
    try {
      return this.execute(command);
    } catch (error) {
      throw new TurnstileException(TurnstileError.javascriptFailed(String(error)));
    }
  }

  async reload(): Promise<void> {
    await this.run('remove');
    if (turnstileApi() === undefined) await this.start();
    else this.renderWidget();
  }

  async destroy(): Promise<void> {
    if (this.closed) return;
    try {
      await this.run('remove');
    } catch {
      // Closing is what matters.
    }
    await this.close();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    const api = turnstileApi();
    if (api !== undefined && this.widgetId !== null) {
      try {
        api.remove(this.widgetId);
      } catch {
        // Already gone.
      }
    }
    this.widgetId = null;
    this.container.remove();
    this.emitter.clear();
  }

  // ---------------------------------------------------------------------------

  private execute(command: TurnstileCommand): unknown {
    const api = turnstileApi();
    const widgetId = this.widgetId;
    switch (command) {
      case 'render':
        return this.renderWidget();
      case 'reset':
        if (api !== undefined && widgetId !== null) {
          api.reset(widgetId);
          return true;
        }
        return this.renderWidget() !== null;
      case 'remove':
        if (api !== undefined && widgetId !== null) api.remove(widgetId);
        this.widgetId = null;
        this.reportSize();
        return true;
      case 'execute':
        if (api === undefined) return false;
        if (this.widgetId === null) this.renderWidget();
        if (this.widgetId === null) return false;
        api.execute(this.container);
        return true;
      case 'getResponse':
        return api !== undefined && widgetId !== null ? api.getResponse(widgetId) ?? null : null;
      case 'isExpired':
        return api !== undefined && widgetId !== null ? api.isExpired(widgetId) === true : false;
    }
  }

  private renderWidget(): string | null {
    const api = turnstileApi();
    if (api === undefined || this.closed) return null;
    if (this.widgetId !== null) return this.widgetId;

    const notify = (type: string) => () => this.post({ type });
    const params: Record<string, unknown> = {
      ...this.options.toRenderParameters(),
      callback: (token: string) => this.post({ type: 'token', token }),
      'error-callback': (code: unknown) => {
        this.post({ type: 'error', code: String(code) });
        return true;
      },
      'expired-callback': notify('expired'),
      'timeout-callback': notify('timeout'),
      'before-interactive-callback': notify('beforeInteractive'),
      'after-interactive-callback': notify('afterInteractive'),
      'unsupported-callback': notify('unsupported'),
    };
    try {
      const id = api.render(this.container, params);
      this.widgetId = id ?? null;
      if (this.widgetId !== null) {
        this.rendered = true;
        this.post({ type: 'ready', widgetId: this.widgetId });
        this.reportSize();
      }
    } catch (error) {
      this.post({ type: 'error', code: 'render_failed', message: String(error) });
    }
    return this.widgetId;
  }

  private post(message: Record<string, unknown>): void {
    const event = this.decoder.decode(message);
    if (event !== null) this.emit(event);
  }

  private emit(event: TurnstileEvent): void {
    if (!this.closed) this.emitter.emit(event);
  }

  private observeSize(): void {
    if (this.resizeObserver !== null || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => this.reportSize());
    this.resizeObserver.observe(this.container);
  }

  private reportSize(): void {
    // Same rules as the WebView page: nothing before the first render, nothing
    // while hidden, no empty size before a real one.
    if (this.closed || !this.rendered) return;
    if (this.container.getClientRects().length === 0) return;
    const rect = this.container.getBoundingClientRect();
    const size = { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
    if (this.lastSize === null && (size.width === 0 || size.height === 0)) return;
    if (this.lastSize !== null && this.lastSize.width === size.width && this.lastSize.height === size.height) {
      return;
    }
    this.lastSize = size;
    this.post({ type: 'resize', width: size.width, height: size.height });
  }
}
