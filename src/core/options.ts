/** Visual theme of the widget. */
export type TurnstileTheme = 'auto' | 'light' | 'dark';

/** Widget size. `flexible` takes the full width (300 px minimum). */
export type TurnstileSize = 'normal' | 'flexible' | 'compact';

/** When the widget is visible. */
export type TurnstileAppearance = 'always' | 'execute' | 'interaction-only';

/** When the challenge runs. `execute` waits for `controller.execute()`. */
export type TurnstileExecution = 'render' | 'execute';

/** Automatic retry after a failure. */
export type TurnstileRetry = 'auto' | 'never';

/** What happens when a token expires or an interaction times out. */
export type TurnstileRefreshMode = 'auto' | 'manual' | 'never';

/** Width and height in density independent pixels. */
export interface TurnstileDimensions {
  width: number;
  height: number;
}

/**
 * Plain object form of the options, convenient in JSX:
 * `options={{ siteKey: '...', theme: 'dark' }}`.
 */
export interface TurnstileOptionsInit {
  /** Public site key from the Cloudflare dashboard. */
  siteKey: string;
  /** Up to 32 characters of `[A-Za-z0-9_-]`, returned by siteverify. */
  action?: string;
  /** Up to 255 characters of `[A-Za-z0-9_-]`, returned by siteverify. */
  cData?: string;
  theme?: TurnstileTheme;
  size?: TurnstileSize;
  /** ISO 639-1 code such as `fr` or `pt-BR`, or `auto`. */
  language?: string;
  appearance?: TurnstileAppearance;
  execution?: TurnstileExecution;
  retry?: TurnstileRetry;
  /** Delay between automatic retries, in milliseconds (below 15 minutes). */
  retryIntervalMs?: number;
  refreshExpired?: TurnstileRefreshMode;
  refreshTimeout?: TurnstileRefreshMode;
  /** Lets Cloudflare ask the visitor for feedback after a failure. */
  feedbackEnabled?: boolean;
}

const PREFERRED_SIZES: Record<TurnstileSize, TurnstileDimensions> = {
  normal: { width: 300, height: 65 },
  flexible: { width: 300, height: 65 },
  compact: { width: 150, height: 140 },
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]*$/;
const LANGUAGE_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$/;

/**
 * Immutable Turnstile configuration. Maps to the
 * [render parameters](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/#configurations).
 */
export class TurnstileOptions {
  readonly siteKey: string;
  readonly action: string | undefined;
  readonly cData: string | undefined;
  readonly theme: TurnstileTheme;
  readonly size: TurnstileSize;
  readonly language: string;
  readonly appearance: TurnstileAppearance;
  readonly execution: TurnstileExecution;
  readonly retry: TurnstileRetry;
  readonly retryIntervalMs: number;
  readonly refreshExpired: TurnstileRefreshMode;
  readonly refreshTimeout: TurnstileRefreshMode;
  readonly feedbackEnabled: boolean;

  constructor(init: TurnstileOptionsInit) {
    this.siteKey = init.siteKey;
    this.action = init.action;
    this.cData = init.cData;
    this.theme = init.theme ?? 'auto';
    this.size = init.size ?? 'normal';
    this.language = init.language ?? 'auto';
    this.appearance = init.appearance ?? 'always';
    this.execution = init.execution ?? 'render';
    this.retry = init.retry ?? 'auto';
    this.retryIntervalMs = init.retryIntervalMs ?? 8000;
    this.refreshExpired = init.refreshExpired ?? 'auto';
    this.refreshTimeout = init.refreshTimeout ?? 'auto';
    this.feedbackEnabled = init.feedbackEnabled ?? true;
    Object.freeze(this);
  }

  /** Returns `value` itself if it is already a `TurnstileOptions`. */
  static from(value: TurnstileOptions | TurnstileOptionsInit): TurnstileOptions {
    return value instanceof TurnstileOptions ? value : new TurnstileOptions(value);
  }

  /** Size used before Turnstile reports its real size. */
  get preferredSize(): TurnstileDimensions {
    return PREFERRED_SIZES[this.size];
  }

  /** Lists what is wrong with this configuration. Empty when valid. */
  validate(): string[] {
    const problems: string[] = [];
    if (this.siteKey.trim().length === 0) {
      problems.push('siteKey must not be empty.');
    }
    if (this.action !== undefined && (this.action.length > 32 || !TOKEN_PATTERN.test(this.action))) {
      problems.push('action must be at most 32 characters of [A-Za-z0-9_-].');
    }
    if (this.cData !== undefined && (this.cData.length > 255 || !TOKEN_PATTERN.test(this.cData))) {
      problems.push('cData must be at most 255 characters of [A-Za-z0-9_-].');
    }
    if (this.language !== 'auto' && !LANGUAGE_PATTERN.test(this.language)) {
      problems.push('language must be "auto" or an ISO 639-1 code like "fr".');
    }
    if (!(this.retryIntervalMs > 0 && this.retryIntervalMs < 900000)) {
      problems.push('retryIntervalMs must be between 1 ms and 15 minutes.');
    }
    return problems;
  }

  /** Throws a `RangeError` if `validate()` finds a problem. */
  ensureValid(): void {
    const problems = this.validate();
    if (problems.length > 0) {
      throw new RangeError(`Invalid Turnstile options: ${problems.join(' ')}`);
    }
  }

  /** Parameters for `turnstile.render`, callbacks excluded. */
  toRenderParameters(): Record<string, string | number | boolean> {
    const params: Record<string, string | number | boolean> = {
      sitekey: this.siteKey,
      theme: this.theme,
      size: this.size,
      language: this.language,
      appearance: this.appearance,
      execution: this.execution,
      retry: this.retry,
      'retry-interval': this.retryIntervalMs,
      'refresh-expired': this.refreshExpired,
      'refresh-timeout': this.refreshTimeout,
      'feedback-enabled': this.feedbackEnabled,
    };
    if (this.action !== undefined) params.action = this.action;
    if (this.cData !== undefined) params.cData = this.cData;
    return params;
  }

  /** Returns a copy with some fields replaced. */
  with(changes: Partial<TurnstileOptionsInit>): TurnstileOptions {
    return new TurnstileOptions({ ...this.toInit(), ...changes });
  }

  /** Stable string identifying this configuration (handy as a React key). */
  get key(): string {
    return JSON.stringify(this.toRenderParameters());
  }

  /** Value equality. */
  equals(other: TurnstileOptions): boolean {
    return this.key === other.key;
  }

  private toInit(): TurnstileOptionsInit {
    return {
      siteKey: this.siteKey,
      action: this.action,
      cData: this.cData,
      theme: this.theme,
      size: this.size,
      language: this.language,
      appearance: this.appearance,
      execution: this.execution,
      retry: this.retry,
      retryIntervalMs: this.retryIntervalMs,
      refreshExpired: this.refreshExpired,
      refreshTimeout: this.refreshTimeout,
      feedbackEnabled: this.feedbackEnabled,
    };
  }
}
