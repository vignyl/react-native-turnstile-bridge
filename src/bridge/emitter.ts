import type { Unsubscribe } from './session';

/** Minimal synchronous event emitter, so the package needs no dependency for it. */
export class Emitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  add(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(value: T): void {
    // Copy first: a listener may unsubscribe while we iterate.
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  get size(): number {
    return this.listeners.size;
  }
}
