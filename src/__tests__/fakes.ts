import type { TurnstileCommand } from '../bridge/commands';
import { Emitter } from '../bridge/emitter';
import type { TurnstileSession, Unsubscribe } from '../bridge/session';
import type { TurnstileEvent } from '../core/events';

/** In-memory session standing in for a WebView. */
export class FakeTurnstileSession implements TurnstileSession {
  readonly commands: TurnstileCommand[] = [];
  readonly results = new Map<TurnstileCommand, unknown>();
  reloads = 0;
  destroyed = false;
  private closed = false;
  private readonly emitter = new Emitter<TurnstileEvent>();

  get isClosed(): boolean {
    return this.closed;
  }

  get listenerCount(): number {
    return this.emitter.size;
  }

  emit(event: TurnstileEvent): void {
    if (!this.closed) this.emitter.emit(event);
  }

  subscribe(listener: (event: TurnstileEvent) => void): Unsubscribe {
    return this.emitter.add(listener);
  }

  async run(command: TurnstileCommand): Promise<unknown> {
    this.commands.push(command);
    return this.results.get(command) ?? null;
  }

  async reload(): Promise<void> {
    this.reloads += 1;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    await this.close();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.emitter.clear();
  }
}
