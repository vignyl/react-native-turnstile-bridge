import { JsonTurnstileMessageDecoder } from '../bridge/messageDecoder';
import { TurnstileError } from '../core/errors';

describe('JsonTurnstileMessageDecoder', () => {
  const decoder = new JsonTurnstileMessageDecoder();

  it('reads JSON strings and objects', () => {
    expect(decoder.decode('{"type":"expired"}')).toEqual({ type: 'expired' });
    expect(decoder.decode({ type: 'token', token: 'abc' })).toEqual({ type: 'token', token: 'abc' });
  });

  it('decodes every message type', () => {
    expect(decoder.decode({ type: 'ready', widgetId: 'w1' })).toEqual({ type: 'loaded', widgetId: 'w1' });
    expect(decoder.decode({ type: 'timeout' })).toEqual({ type: 'timedOut' });
    expect(decoder.decode({ type: 'beforeInteractive' })).toEqual({ type: 'interactionRequired' });
    expect(decoder.decode({ type: 'afterInteractive' })).toEqual({ type: 'interactionCompleted' });
    expect(decoder.decode({ type: 'unsupported' })).toEqual({ type: 'unsupported' });
    expect(decoder.decode({ type: 'resize', width: 300, height: 65 })).toEqual({
      type: 'resized',
      width: 300,
      height: 65,
    });
    expect(decoder.decode({ type: 'scriptError' })).toEqual({
      type: 'failed',
      error: TurnstileError.scriptLoadFailed(),
    });
  });

  it('classifies error codes', () => {
    const event = decoder.decode({ type: 'error', code: '110200' });
    expect(event?.type).toBe('failed');
    if (event?.type === 'failed') {
      expect(event.error.code).toBe('110200');
      expect(event.error.category).toBe('invalidConfiguration');
    }
  });

  it('ignores malformed and unknown messages', () => {
    expect(decoder.decode(null)).toBeNull();
    expect(decoder.decode([])).toBeNull();
    expect(decoder.decode('not json')).toBeNull();
    expect(decoder.decode({ type: 'nope' })).toBeNull();
    expect(decoder.decode({ type: 'token', token: '' })).toBeNull();
    expect(decoder.decode({ type: 'resize', width: 'a' })).toBeNull();
  });
});
