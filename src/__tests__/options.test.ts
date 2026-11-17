import { TurnstileOptions } from '../core/options';

describe('TurnstileOptions', () => {
  it('maps every field to the render parameters', () => {
    const options = new TurnstileOptions({
      siteKey: 'key',
      action: 'login',
      cData: 'user_42',
      theme: 'dark',
      size: 'compact',
      language: 'fr',
      appearance: 'interaction-only',
      execution: 'execute',
      retry: 'never',
      retryIntervalMs: 2000,
      refreshExpired: 'manual',
      refreshTimeout: 'never',
      feedbackEnabled: false,
    });

    expect(options.toRenderParameters()).toEqual({
      sitekey: 'key',
      action: 'login',
      cData: 'user_42',
      theme: 'dark',
      size: 'compact',
      language: 'fr',
      appearance: 'interaction-only',
      execution: 'execute',
      retry: 'never',
      'retry-interval': 2000,
      'refresh-expired': 'manual',
      'refresh-timeout': 'never',
      'feedback-enabled': false,
    });
  });

  it('applies the Turnstile defaults and omits optional fields', () => {
    const params = new TurnstileOptions({ siteKey: 'k' }).toRenderParameters();
    expect(params.theme).toBe('auto');
    expect(params.size).toBe('normal');
    expect(params['retry-interval']).toBe(8000);
    expect(params).not.toHaveProperty('action');
    expect(params).not.toHaveProperty('cData');
  });

  it('accepts a valid default configuration', () => {
    expect(new TurnstileOptions({ siteKey: 'k' }).validate()).toEqual([]);
  });

  it('reports every invalid value', () => {
    const options = new TurnstileOptions({
      siteKey: ' ',
      action: 'a'.repeat(33),
      cData: 'not valid!',
      language: 'french',
      retryIntervalMs: 20 * 60 * 1000,
    });
    expect(options.validate()).toHaveLength(5);
    expect(() => options.ensureValid()).toThrow(RangeError);
  });

  it('compares by value and copies with changes', () => {
    const a = new TurnstileOptions({ siteKey: 'k' });
    const b = a.with({ theme: 'light' });
    expect(a.equals(new TurnstileOptions({ siteKey: 'k' }))).toBe(true);
    expect(a.equals(b)).toBe(false);
    expect(b.theme).toBe('light');
    expect(b.siteKey).toBe('k');
  });

  it('normalises plain objects with from()', () => {
    const options = new TurnstileOptions({ siteKey: 'k' });
    expect(TurnstileOptions.from(options)).toBe(options);
    expect(TurnstileOptions.from({ siteKey: 'k' }).equals(options)).toBe(true);
  });

  it('exposes the preferred size of each widget size', () => {
    expect(new TurnstileOptions({ siteKey: 'k' }).preferredSize).toEqual({ width: 300, height: 65 });
    expect(new TurnstileOptions({ siteKey: 'k', size: 'compact' }).preferredSize).toEqual({ width: 150, height: 140 });
  });

  it('is immutable', () => {
    const options = new TurnstileOptions({ siteKey: 'k' });
    expect(Object.isFrozen(options)).toBe(true);
  });
});
