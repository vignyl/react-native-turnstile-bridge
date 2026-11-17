/** Families of failures, used to decide how to react. */
export type TurnstileErrorCategory =
  | 'initialization'
  | 'invalidConfiguration'
  | 'unsupportedEnvironment'
  | 'clockSkew'
  | 'challengeTimeout'
  | 'challengeFailed'
  | 'clientExecution'
  | 'network'
  | 'bridge'
  | 'unknown';

const RETRYABLE: Record<TurnstileErrorCategory, boolean> = {
  initialization: false,
  invalidConfiguration: false,
  unsupportedEnvironment: false,
  clockSkew: false,
  challengeTimeout: true,
  challengeFailed: true,
  clientExecution: true,
  network: true,
  bridge: false,
  unknown: true,
};

/**
 * Maps a Turnstile client-side error code to a category, following the
 * [error code reference](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/).
 * Extend it and override `classify` if you need another mapping.
 */
export class TurnstileErrorClassifier {
  private static readonly exact: Readonly<Record<string, TurnstileErrorCategory>> = {
    '110100': 'invalidConfiguration',
    '110110': 'invalidConfiguration',
    '110200': 'invalidConfiguration',
    '110420': 'invalidConfiguration',
    '110430': 'invalidConfiguration',
    '110500': 'unsupportedEnvironment',
    '110510': 'unsupportedEnvironment',
    '200010': 'initialization',
    '200100': 'clockSkew',
  };

  private static readonly prefixes: ReadonlyArray<readonly [string, TurnstileErrorCategory]> = [
    ['11060', 'challengeTimeout'],
    ['11062', 'challengeTimeout'],
    ['100', 'initialization'],
    ['105', 'initialization'],
    ['102', 'clientExecution'],
    ['103', 'clientExecution'],
    ['104', 'clientExecution'],
    ['106', 'clientExecution'],
    ['120', 'clientExecution'],
    ['300', 'clientExecution'],
    ['400', 'invalidConfiguration'],
    ['600', 'challengeFailed'],
  ];

  classify(code: string): TurnstileErrorCategory {
    const exact = TurnstileErrorClassifier.exact[code];
    if (exact !== undefined) return exact;
    for (const [prefix, category] of TurnstileErrorClassifier.prefixes) {
      if (code.startsWith(prefix)) return category;
    }
    return 'unknown';
  }
}

const defaultClassifier = new TurnstileErrorClassifier();

/** A failure reported by Turnstile or by this package. */
export class TurnstileError {
  static readonly scriptLoadFailedCode = 'script_load_failed';
  static readonly pageLoadFailedCode = 'page_load_failed';
  static readonly loadTimeoutCode = 'load_timeout';
  static readonly unsupportedCode = 'unsupported';
  static readonly interactionRequiredCode = 'interaction_required';
  static readonly tokenTimeoutCode = 'token_timeout';
  static readonly notAttachedCode = 'not_attached';
  static readonly disposedCode = 'disposed';
  static readonly javascriptFailedCode = 'javascript_failed';

  constructor(
    /** Turnstile code (`110200`, ...) or one of the static codes above. */
    readonly code: string,
    readonly category: TurnstileErrorCategory,
    readonly message?: string,
  ) {
    Object.freeze(this);
  }

  /** Whether a `reset()` has a reasonable chance to help. */
  get isRetryable(): boolean {
    return RETRYABLE[this.category];
  }

  static fromCode(
    code: string,
    message?: string,
    classifier: TurnstileErrorClassifier = defaultClassifier,
  ): TurnstileError {
    return new TurnstileError(code, classifier.classify(code), message);
  }

  static scriptLoadFailed(): TurnstileError {
    return new TurnstileError(this.scriptLoadFailedCode, 'network', 'The Turnstile script could not be loaded.');
  }

  static pageLoadFailed(message?: string): TurnstileError {
    return new TurnstileError(this.pageLoadFailedCode, 'network', message);
  }

  static loadTimeout(): TurnstileError {
    return new TurnstileError(this.loadTimeoutCode, 'network', 'Turnstile did not render within the load timeout.');
  }

  static unsupported(): TurnstileError {
    return new TurnstileError(this.unsupportedCode, 'unsupportedEnvironment', 'Turnstile does not support this WebView.');
  }

  static interactionRequired(): TurnstileError {
    return new TurnstileError(
      this.interactionRequiredCode,
      'bridge',
      'Cloudflare wants an interaction. Show a visible Turnstile widget instead of the headless one.',
    );
  }

  static tokenTimeout(): TurnstileError {
    return new TurnstileError(this.tokenTimeoutCode, 'challengeTimeout', 'No token was received in time.');
  }

  static notAttached(): TurnstileError {
    return new TurnstileError(this.notAttachedCode, 'bridge', 'The controller is not attached to a Turnstile widget.');
  }

  static disposed(): TurnstileError {
    return new TurnstileError(this.disposedCode, 'bridge', 'The controller or session has been disposed.');
  }

  static javascriptFailed(message?: string): TurnstileError {
    return new TurnstileError(this.javascriptFailedCode, 'bridge', message);
  }

  toString(): string {
    return `TurnstileError(${this.code}, ${this.category}${this.message ? `, ${this.message}` : ''})`;
  }
}

/** Thrown by the asynchronous controller methods. */
export class TurnstileException extends Error {
  constructor(readonly error: TurnstileError) {
    super(error.toString());
    this.name = 'TurnstileException';
    // Keeps `instanceof` working when classes are transpiled to ES5.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
