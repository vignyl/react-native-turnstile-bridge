import { TurnstileError, TurnstileErrorClassifier, TurnstileException, type TurnstileErrorCategory } from '../core/errors';

describe('TurnstileErrorClassifier', () => {
  const classifier = new TurnstileErrorClassifier();
  const cases: Array<[string, TurnstileErrorCategory]> = [
    ['100001', 'initialization'],
    ['105001', 'initialization'],
    ['102004', 'clientExecution'],
    ['110100', 'invalidConfiguration'],
    ['110200', 'invalidConfiguration'],
    ['110500', 'unsupportedEnvironment'],
    ['110510', 'unsupportedEnvironment'],
    ['110600', 'challengeTimeout'],
    ['110620', 'challengeTimeout'],
    ['200100', 'clockSkew'],
    ['300030', 'clientExecution'],
    ['600010', 'challengeFailed'],
    ['xyz', 'unknown'],
  ];

  it.each(cases)('classifies %s as %s', (code, category) => {
    expect(classifier.classify(code)).toBe(category);
  });
});

describe('TurnstileError', () => {
  it('derives category and retryability from the code', () => {
    expect(TurnstileError.fromCode('600010').isRetryable).toBe(true);
    expect(TurnstileError.fromCode('110200').isRetryable).toBe(false);
  });

  it('uses stable codes for local errors', () => {
    expect(TurnstileError.loadTimeout().code).toBe('load_timeout');
    expect(TurnstileError.notAttached().category).toBe('bridge');
  });

  it('wraps errors in an Error subclass that keeps instanceof', () => {
    const exception = new TurnstileException(TurnstileError.disposed());
    expect(exception).toBeInstanceOf(TurnstileException);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.error.code).toBe(TurnstileError.disposedCode);
    expect(exception.message).toContain('disposed');
  });
});
