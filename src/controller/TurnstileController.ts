import { Emitter } from '../bridge/emitter';
import type { TurnstileSession, Unsubscribe } from '../bridge/session';
import { TurnstileError, TurnstileException } from '../core/errors';
import type { TurnstileEvent } from '../core/events';
import type { TurnstileState, TurnstileStatus } from '../core/status';

export interface TurnstileControllerOptions {
  /**
   * Longest time allowed between loading and the widget being rendered
   * before a `load_timeout` error is reported. `null` disables the check.
   * Defaults to 30 seconds.
   */
  loadTimeoutMs?: number | null;
}

export interface WaitForTokenOptions {
  /** Defaults to 2 minutes. */
  timeoutMs?: number;
  /** Fail with `interaction_required` instead of waiting for a click. */
  failOnInteraction?: boolean;
}

const STALE: ReadonlySet<TurnstileStatus> = new Set(['verified', 'failed', 'expired', 'timedOut']);

/**
 * Drives one Turnstile widget and exposes its state.
 *
 * It only knows the `TurnstileSession` interface. `Turnstile` and
 * `TurnstileHeadless` attach it to their WebView (or web page).
 */
export class TurnstileController {
  private readonly loadTimeoutMs: number | null;
  private readonly events = new Emitter<TurnstileEvent>();
  private readonly stateListeners = new Emitter<TurnstileState>();
  private session: TurnstileSession | null = null;
  private unsubscribeSession: Unsubscribe | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private state: TurnstileState = { status: 'idle', token: null, lastError: null };

  constructor(options: TurnstileControllerOptions = {}) {
    this.loadTimeoutMs = options.loadTimeoutMs === undefined ? 30000 : options.loadTimeoutMs;
  }

  // ---------------------------------------------------------------------------
  // State

  get status(): TurnstileStatus {
    return this.state.status;
  }

  get token(): string | null {
    return this.state.token;
  }

  get lastError(): TurnstileError | null {
    return this.state.lastError;
  }

  get hasToken(): boolean {
    return this.state.token !== null;
  }

  get isAttached(): boolean {
    return this.session !== null;
  }

  get isDisposed(): boolean {
    return this.state.status === 'disposed';
  }

  /** Current immutable snapshot (stable between changes). */
  getState = (): TurnstileState => this.state;

  /** Notifies on every state change. Compatible with `useSyncExternalStore`. */
  subscribe = (listener: () => void): Unsubscribe => this.stateListeners.add(listener);

  /** Calls `listener` for every Turnstile event. */
  addEventListener(listener: (event: TurnstileEvent) => void): Unsubscribe {
    return this.events.add(listener);
  }

  // ---------------------------------------------------------------------------
  // Binding, used by the components.

  /** @internal Connects a session. One session at a time. */
  attach(session: TurnstileSession): void {
    this.ensureNotDisposed();
    if (this.session === session) return;
    if (this.session !== null) {
      throw new Error(
        'This TurnstileController is already attached to another widget. Use one controller per widget.',
      );
    }
    this.session = session;
    this.unsubscribeSession = session.subscribe((event) => this.handle(event));
    this.setState({ status: 'loading', token: null, lastError: null });
    this.armWatchdog();
  }

  /** @internal Disconnects `session` if it is the attached one. */
  detach(session: TurnstileSession): void {
    if (this.session !== session) return;
    this.release();
    if (this.isDisposed) return;
    this.setState({
      status: this.state.status === 'destroyed' ? 'destroyed' : 'idle',
      token: null,
    });
  }

  // ---------------------------------------------------------------------------
  // Commands

  /** Drops the current token and starts a new challenge. */
  async reset(): Promise<void> {
    const session = this.requireSession();
    this.setState({ status: 'loading', token: null, lastError: null });
    this.armWatchdog();
    await session.run('reset');
  }

  /** Takes the widget off the page and keeps the WebView. */
  async remove(): Promise<void> {
    const session = this.requireSession();
    this.cancelWatchdog();
    await session.run('remove');
    this.setState({ status: 'idle', token: null });
  }

  /** Renders the widget again after `remove()`. */
  async render(): Promise<void> {
    const session = this.requireSession();
    this.setState({ status: 'loading' });
    this.armWatchdog();
    await session.run('render');
  }

  /** Starts the challenge when `execution` is `'execute'`. */
  async execute(): Promise<void> {
    await this.requireSession().run('execute');
  }

  /** Reloads the whole page. */
  async reload(): Promise<void> {
    const session = this.requireSession();
    this.setState({ status: 'loading', token: null, lastError: null });
    this.armWatchdog();
    await session.reload();
  }

  /** Reads the current token from the page. */
  async getResponse(): Promise<string | null> {
    const value = await this.requireSession().run('getResponse');
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  /** Asks the page whether the current token expired. */
  async isExpired(): Promise<boolean> {
    return (await this.requireSession().run('isExpired')) === true;
  }

  /**
   * Removes the widget and frees the WebView. The component renders nothing
   * until `recreate()`.
   */
  async destroy(): Promise<void> {
    this.ensureNotDisposed();
    const session = this.session;
    this.release();
    if (session !== null) await session.destroy();
    if (this.isDisposed) return;
    this.setState({ status: 'destroyed', token: null });
  }

  /** Asks the component to build a new WebView after `destroy()`. */
  recreate(): void {
    this.ensureNotDisposed();
    if (this.state.status === 'destroyed') this.setState({ status: 'idle' });
  }

  /**
   * Resolves with the next token, or the current one if there is one.
   * Rejects with a `TurnstileException` on failure, timeout or dispose.
   */
  waitForToken(options: WaitForTokenOptions = {}): Promise<string> {
    this.ensureNotDisposed();
    const current = this.state.token;
    if (current !== null) return Promise.resolve(current);

    const { timeoutMs = 120000, failOnInteraction = false } = options;
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        unsubscribeState();
        action();
      };
      const fail = (error: TurnstileError) => finish(() => reject(new TurnstileException(error)));

      const timer = setTimeout(() => fail(TurnstileError.tokenTimeout()), timeoutMs);
      const unsubscribe = this.events.add((event) => {
        switch (event.type) {
          case 'token':
            finish(() => resolve(event.token));
            break;
          case 'failed':
            fail(event.error);
            break;
          case 'unsupported':
            fail(TurnstileError.unsupported());
            break;
          case 'interactionRequired':
            if (failOnInteraction) fail(TurnstileError.interactionRequired());
            break;
          default:
            break;
        }
      });
      const unsubscribeState = this.stateListeners.add(() => {
        if (this.isDisposed) fail(TurnstileError.disposed());
      });
    });
  }

  /**
   * Returns a fresh, single-use token. If a token was already issued, or the
   * last attempt failed or expired, the widget is reset first.
   * Fails on `interaction_required`, which suits the headless widget.
   */
  async getToken(options: Omit<WaitForTokenOptions, 'failOnInteraction'> = {}): Promise<string> {
    this.ensureNotDisposed();
    if (this.isAttached && STALE.has(this.state.status)) {
      await this.reset();
    }
    return this.waitForToken({ timeoutMs: options.timeoutMs ?? 60000, failOnInteraction: true });
  }

  /** Detaches and stops notifying. The WebView itself belongs to the component. */
  dispose(): void {
    if (this.isDisposed) return;
    this.release();
    this.setState({ status: 'disposed', token: null });
    this.events.clear();
    this.stateListeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Internals

  private handle(event: TurnstileEvent): void {
    if (this.isDisposed) return;
    switch (event.type) {
      case 'loaded':
        this.cancelWatchdog();
        this.setState({ status: 'ready' });
        break;
      case 'token':
        this.cancelWatchdog();
        this.setState({ status: 'verified', token: event.token, lastError: null });
        break;
      case 'failed':
        this.cancelWatchdog();
        this.setState({ status: 'failed', token: null, lastError: event.error });
        break;
      case 'expired':
        this.setState({ status: 'expired', token: null });
        break;
      case 'timedOut':
        this.setState({ status: 'timedOut', token: null });
        break;
      case 'interactionRequired':
        this.cancelWatchdog();
        this.setState({ status: 'interactive' });
        break;
      case 'interactionCompleted':
        if (this.state.status === 'interactive') this.setState({ status: 'ready' });
        break;
      case 'unsupported':
        this.cancelWatchdog();
        this.setState({ status: 'unsupported', token: null, lastError: TurnstileError.unsupported() });
        break;
      case 'resized':
        break;
    }
    this.events.emit(event);
  }

  private setState(changes: Partial<TurnstileState>): void {
    this.state = { ...this.state, ...changes };
    this.stateListeners.emit(this.state);
  }

  private armWatchdog(): void {
    this.cancelWatchdog();
    if (this.loadTimeoutMs === null) return;
    this.watchdog = setTimeout(() => {
      this.watchdog = null;
      if (this.session !== null) {
        this.handle({ type: 'failed', error: TurnstileError.loadTimeout() });
      }
    }, this.loadTimeoutMs);
  }

  private cancelWatchdog(): void {
    if (this.watchdog !== null) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  private release(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.session = null;
    this.cancelWatchdog();
  }

  private requireSession(): TurnstileSession {
    this.ensureNotDisposed();
    if (this.session === null) throw new TurnstileException(TurnstileError.notAttached());
    return this.session;
  }

  private ensureNotDisposed(): void {
    if (this.isDisposed) throw new TurnstileException(TurnstileError.disposed());
  }
}
