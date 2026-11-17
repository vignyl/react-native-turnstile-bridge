import { commandScript, type TurnstileCommand } from '../../bridge/commands';
import { Emitter } from '../../bridge/emitter';
import { JsonTurnstileMessageDecoder, type TurnstileMessageDecoder } from '../../bridge/messageDecoder';
import type { TurnstileSession, Unsubscribe } from '../../bridge/session';
import { TurnstileError, TurnstileException } from '../../core/errors';
import type { TurnstileEvent } from '../../core/events';

/** The part of a react-native-webview instance the session needs. */
export interface WebViewHandle {
  injectJavaScript(script: string): void;
  reload(): void;
}

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (reason: TurnstileException) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** `TurnstileSession` on top of a react-native-webview instance. */
export class WebViewTurnstileSession implements TurnstileSession {
  private readonly emitter = new Emitter<TurnstileEvent>();
  private readonly pending = new Map<number, PendingCommand>();
  private nextRequestId = 1;
  private closed = false;

  constructor(
    private readonly webView: WebViewHandle,
    private readonly decoder: TurnstileMessageDecoder = new JsonTurnstileMessageDecoder(),
    private readonly commandTimeoutMs = 10000,
  ) {}

  get isClosed(): boolean {
    return this.closed;
  }

  subscribe(listener: (event: TurnstileEvent) => void): Unsubscribe {
    return this.emitter.add(listener);
  }

  /** Feeds a message received through the WebView's `onMessage`. */
  handleMessage(data: string): void {
    if (this.closed) return;
    const record = JsonTurnstileMessageDecoder.asRecord(data);
    if (record?.type === 'result' && typeof record.id === 'number') {
      this.settle(record.id, record);
      return;
    }
    const event = this.decoder.decode(record);
    if (event !== null) this.emit(event);
  }

  /** Pushes an event produced on the native side (load failure, ...). */
  emit(event: TurnstileEvent): void {
    if (!this.closed) this.emitter.emit(event);
  }

  run(command: TurnstileCommand): Promise<unknown> {
    if (this.closed) return Promise.reject(new TurnstileException(TurnstileError.disposed()));
    const id = this.nextRequestId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new TurnstileException(TurnstileError.javascriptFailed(`No answer to "${command}".`)));
      }, this.commandTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.webView.injectJavaScript(commandScript(command, id));
      } catch (error) {
        this.settle(id, { error: String(error) });
      }
    });
  }

  async reload(): Promise<void> {
    if (this.closed) throw new TurnstileException(TurnstileError.disposed());
    this.webView.reload();
  }

  async destroy(): Promise<void> {
    if (this.closed) return;
    try {
      await this.run('remove');
    } catch {
      // The page may already be gone. Closing is what matters.
    }
    await this.close();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const [, command] of this.pending) {
      clearTimeout(command.timer);
      command.reject(new TurnstileException(TurnstileError.disposed()));
    }
    this.pending.clear();
    this.emitter.clear();
  }

  private settle(id: number, result: Record<string, unknown>): void {
    const command = this.pending.get(id);
    if (command === undefined) return;
    this.pending.delete(id);
    clearTimeout(command.timer);
    if (result.error != null) {
      command.reject(new TurnstileException(TurnstileError.javascriptFailed(String(result.error))));
    } else {
      command.resolve(result.value ?? null);
    }
  }
}
