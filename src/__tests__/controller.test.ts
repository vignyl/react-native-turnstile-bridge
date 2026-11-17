import { TurnstileController } from '../controller/TurnstileController';
import { TurnstileError, TurnstileException } from '../core/errors';
import type { TurnstileEvent } from '../core/events';
import { FakeTurnstileSession } from './fakes';

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof TurnstileException ? error.error.code : 'other'),
  );

describe('TurnstileController', () => {
  let controller: TurnstileController;
  let session: FakeTurnstileSession;

  beforeEach(() => {
    controller = new TurnstileController({ loadTimeoutMs: null });
    session = new FakeTurnstileSession();
  });

  afterEach(() => controller.dispose());

  it('becomes loading when attached', () => {
    expect(controller.status).toBe('idle');
    controller.attach(session);
    expect(controller.isAttached).toBe(true);
    expect(controller.status).toBe('loading');
  });

  it('follows the lifecycle through events', () => {
    controller.attach(session);
    session.emit({ type: 'loaded', widgetId: 'w' });
    expect(controller.status).toBe('ready');
    session.emit({ type: 'interactionRequired' });
    expect(controller.status).toBe('interactive');
    session.emit({ type: 'interactionCompleted' });
    expect(controller.status).toBe('ready');
    session.emit({ type: 'token', token: 'tok' });
    expect(controller.status).toBe('verified');
    expect(controller.token).toBe('tok');
    session.emit({ type: 'expired' });
    expect(controller.status).toBe('expired');
    expect(controller.token).toBeNull();
    session.emit({ type: 'failed', error: TurnstileError.fromCode('600010') });
    expect(controller.status).toBe('failed');
    expect(controller.lastError?.code).toBe('600010');
    session.emit({ type: 'unsupported' });
    expect(controller.status).toBe('unsupported');
  });

  it('forwards every event to listeners', () => {
    controller.attach(session);
    const received: TurnstileEvent[] = [];
    controller.addEventListener((event) => received.push(event));
    session.emit({ type: 'loaded' });
    session.emit({ type: 'resized', width: 300, height: 65 });
    session.emit({ type: 'token', token: 't' });
    expect(received.map((event) => event.type)).toEqual(['loaded', 'resized', 'token']);
  });

  it('notifies state subscribers with a new snapshot', () => {
    controller.attach(session);
    const before = controller.getState();
    let notifications = 0;
    controller.subscribe(() => notifications++);
    session.emit({ type: 'token', token: 't' });
    expect(notifications).toBe(1);
    expect(controller.getState()).not.toBe(before);
    expect(controller.getState().token).toBe('t');
  });

  it('sends commands to the session', async () => {
    controller.attach(session);
    session.results.set('getResponse', 'tok');
    session.results.set('isExpired', true);

    await controller.reset();
    await controller.execute();
    await controller.remove();
    await controller.render();
    expect(await controller.getResponse()).toBe('tok');
    expect(await controller.isExpired()).toBe(true);
    await controller.reload();

    expect(session.commands).toEqual(['reset', 'execute', 'remove', 'render', 'getResponse', 'isExpired']);
    expect(session.reloads).toBe(1);
  });

  it('clears the token and the error on reset', async () => {
    controller.attach(session);
    session.emit({ type: 'token', token: 't' });
    await controller.reset();
    expect(controller.token).toBeNull();
    expect(controller.lastError).toBeNull();
    expect(controller.status).toBe('loading');
  });

  it('rejects commands when not attached', async () => {
    expect(await codeOf(controller.reset())).toBe(TurnstileError.notAttachedCode);
  });

  it('drives one session at a time', () => {
    controller.attach(session);
    expect(() => controller.attach(new FakeTurnstileSession())).toThrow();
  });

  it('detaches cleanly', () => {
    controller.attach(session);
    session.emit({ type: 'token', token: 't' });
    controller.detach(session);
    expect(controller.isAttached).toBe(false);
    expect(controller.status).toBe('idle');
    expect(controller.token).toBeNull();
    expect(session.listenerCount).toBe(0);
  });

  it('destroys the session and recreates on demand', async () => {
    controller.attach(session);
    await controller.destroy();
    expect(session.destroyed).toBe(true);
    expect(controller.isAttached).toBe(false);
    expect(controller.status).toBe('destroyed');
    controller.recreate();
    expect(controller.status).toBe('idle');
  });

  describe('waitForToken', () => {
    it('returns the current token right away', async () => {
      controller.attach(session);
      session.emit({ type: 'token', token: 'now' });
      await expect(controller.waitForToken()).resolves.toBe('now');
    });

    it('resolves with the next token', async () => {
      controller.attach(session);
      const promise = controller.waitForToken();
      session.emit({ type: 'token', token: 'next' });
      await expect(promise).resolves.toBe('next');
    });

    it('rejects on failure', async () => {
      controller.attach(session);
      const promise = codeOf(controller.waitForToken());
      session.emit({ type: 'failed', error: TurnstileError.fromCode('110200') });
      expect(await promise).toBe('110200');
    });

    it('rejects when an interaction is required and not allowed', async () => {
      controller.attach(session);
      const promise = codeOf(controller.waitForToken({ failOnInteraction: true }));
      session.emit({ type: 'interactionRequired' });
      expect(await promise).toBe(TurnstileError.interactionRequiredCode);
    });

    it('rejects after the timeout', async () => {
      controller.attach(session);
      expect(await codeOf(controller.waitForToken({ timeoutMs: 10 }))).toBe(TurnstileError.tokenTimeoutCode);
    });

    it('rejects when the controller is disposed', async () => {
      controller.attach(session);
      const promise = codeOf(controller.waitForToken());
      controller.dispose();
      expect(await promise).toBe(TurnstileError.disposedCode);
    });
  });

  describe('getToken', () => {
    it('resets before handing out a second token', async () => {
      controller.attach(session);
      session.emit({ type: 'token', token: 'one' });
      const second = controller.getToken();
      await Promise.resolve();
      expect(session.commands).toContain('reset');
      session.emit({ type: 'token', token: 'two' });
      await expect(second).resolves.toBe('two');
    });
  });

  it('reports a load timeout', async () => {
    const guarded = new TurnstileController({ loadTimeoutMs: 10 });
    guarded.attach(session);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(guarded.status).toBe('failed');
    expect(guarded.lastError?.code).toBe(TurnstileError.loadTimeoutCode);
    guarded.dispose();
  });

  it('cancels the load timeout once rendered', async () => {
    const guarded = new TurnstileController({ loadTimeoutMs: 10 });
    guarded.attach(session);
    session.emit({ type: 'loaded' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(guarded.status).toBe('ready');
    guarded.dispose();
  });

  it('refuses to work once disposed', async () => {
    controller.dispose();
    expect(controller.status).toBe('disposed');
    expect(await codeOf(controller.reset())).toBe(TurnstileError.disposedCode);
    expect(() => controller.dispose()).not.toThrow();
  });
});
