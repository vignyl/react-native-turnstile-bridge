import { DefaultTurnstileNavigationPolicy, parseUrl } from '../navigation/navigationPolicy';

describe('parseUrl', () => {
  it('normalises the origin', () => {
    expect(parseUrl('https://Example.com/path?x=1')?.origin).toBe('https://example.com:443');
    expect(parseUrl('http://example.com:8080/')?.origin).toBe('http://example.com:8080');
    expect(parseUrl('about:blank')).toEqual({ scheme: 'about', origin: null });
    expect(parseUrl('not a url')).toBeNull();
  });
});

describe('DefaultTurnstileNavigationPolicy', () => {
  const policy = new DefaultTurnstileNavigationPolicy('https://example.com');

  it('allows the host page and internal schemes', () => {
    expect(policy.decide('https://example.com/', true)).toBe('allow');
    expect(policy.decide('about:blank', true)).toBe('allow');
    expect(policy.decide('about:srcdoc', true)).toBe('allow');
  });

  it('allows the Turnstile iframe, even when reported as top frame', () => {
    expect(policy.decide('https://challenges.cloudflare.com/cdn-cgi/x', false)).toBe('allow');
    expect(policy.decide('https://challenges.cloudflare.com/cdn-cgi/x', true)).toBe('allow');
  });

  it('opens other top-frame links in the browser', () => {
    expect(policy.decide('https://www.cloudflare.com/privacypolicy/', true)).toBe('openExternally');
  });

  it('blocks other schemes and missing URLs', () => {
    expect(policy.decide('intent://foo', true)).toBe('block');
    expect(policy.decide('javascript:alert(1)', true)).toBe('block');
    expect(policy.decide(undefined, true)).toBe('block');
  });
});
