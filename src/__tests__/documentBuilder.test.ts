import vm from 'node:vm';

import { commandScript, type TurnstileCommand } from '../bridge/commands';
import { TurnstileJsApi } from '../bridge/jsApi';
import { TurnstileOptions } from '../core/options';
import { DEFAULT_TURNSTILE_SCRIPT_URL, TurnstileHtmlDocumentBuilder, jsonForScript } from '../html/documentBuilder';

const builder = new TurnstileHtmlDocumentBuilder();
const testKey = '1x00000000000000000000AA';

describe('TurnstileHtmlDocumentBuilder', () => {
  it('embeds the site key, the bridge names and the official script', () => {
    const html = builder.build(new TurnstileOptions({ siteKey: testKey }));
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain(`"sitekey":"${testKey}"`);
    expect(html).toContain(`window['${TurnstileJsApi.globalObject}']`);
    expect(html).toContain(`window['${TurnstileJsApi.postFunction}']`);
    expect(html).toContain(`id="${TurnstileJsApi.containerId}"`);
    expect(html).toContain(`${DEFAULT_TURNSTILE_SCRIPT_URL}?render=explicit&amp;onload=__onTurnstileLoaded`);
    expect(html).not.toContain('{{');
  });

  it('sets the lang attribute and the flexible layout', () => {
    const html = builder.build(new TurnstileOptions({ siteKey: 'k', language: 'fr', size: 'flexible' }));
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('display: block;');
  });

  it('rejects invalid options', () => {
    expect(() => builder.build(new TurnstileOptions({ siteKey: '' }))).toThrow(RangeError);
  });

  it('escapes values that could close the script element', () => {
    const json = jsonForScript({ v: '</script><script>alert(1)</script>&' });
    expect(json).not.toContain('</script>');
    expect(json).not.toContain('&');
    expect(JSON.parse(json)).toEqual({ v: '</script><script>alert(1)</script>&' });
  });
});

/** Runs the page's inline script against fake browser and Turnstile objects. */
function loadPage(options: TurnstileOptions) {
  const html = builder.build(options);
  const inline = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;

  const posted: Array<Record<string, unknown>> = [];
  let rect = { width: 300, height: 65 };
  let clientRects = 1;
  let observer: (() => void) | null = null;
  const calls: string[] = [];
  let renderParams: Record<string, (...args: unknown[]) => unknown> = {};

  const container = {
    getBoundingClientRect: () => rect,
    getClientRects: () => ({ length: clientRects }),
  };
  const window: Record<string, unknown> = {
    ResizeObserver: class {
      constructor(callback: () => void) {
        observer = callback;
      }
      observe() {}
    },
  };
  const document = {
    readyState: 'complete',
    getElementById: (id: string) => (id === TurnstileJsApi.containerId ? container : null),
    addEventListener: () => {},
  };
  const turnstile = {
    render: (selector: string, params: typeof renderParams) => {
      calls.push(`render ${selector}`);
      renderParams = params;
      return 'w-1';
    },
    reset: () => calls.push('reset'),
    remove: () => calls.push('remove'),
    execute: () => calls.push('execute'),
    getResponse: () => 'TOKEN-XYZ',
    isExpired: () => false,
  };

  const context = vm.createContext({ window, document, setTimeout, JSON, Object, String, Math });
  vm.runInContext(inline, context);

  return {
    posted,
    calls,
    get params() {
      return renderParams;
    },
    connectBridge() {
      window.ReactNativeWebView = { postMessage: (data: string) => posted.push(JSON.parse(data)) };
    },
    loadApi() {
      window.turnstile = turnstile;
      (window.__onTurnstileLoaded as () => void)();
    },
    command(name: TurnstileCommand, id: number) {
      vm.runInContext(commandScript(name, id), context);
      return posted.pop();
    },
    setSize(width: number, height: number) {
      rect = { width, height };
    },
    hide() {
      clientRects = 0;
    },
    show() {
      clientRects = 1;
    },
    observe() {
      observer?.();
    },
    scriptError() {
      (window.__onTurnstileScriptError as () => void)();
    },
  };
}

describe('generated page', () => {
  it('queues messages until the React Native bridge exists', async () => {
    const page = loadPage(new TurnstileOptions({ siteKey: testKey }));
    page.scriptError();
    expect(page.posted).toHaveLength(0);
    page.connectBridge();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(page.posted).toEqual([{ type: 'scriptError' }]);
  });

  it('renders on load and forwards every Turnstile callback', () => {
    const page = loadPage(new TurnstileOptions({ siteKey: testKey, action: 'login' }));
    page.connectBridge();
    page.loadApi();

    expect(page.params.sitekey).toBe(testKey);
    expect(page.params.action).toBe('login');
    expect(page.posted.splice(0)).toEqual([
      { type: 'ready', widgetId: 'w-1' },
      { type: 'resize', width: 300, height: 65 },
    ]);

    page.params.callback!('tok');
    expect(page.params['error-callback']!(110200)).toBe(true);
    page.params['expired-callback']!();
    page.params['timeout-callback']!();
    page.params['before-interactive-callback']!();
    page.params['after-interactive-callback']!();
    page.params['unsupported-callback']!();

    expect(page.posted.map((m) => m.type)).toEqual([
      'token',
      'error',
      'expired',
      'timeout',
      'beforeInteractive',
      'afterInteractive',
      'unsupported',
    ]);
    expect(page.posted[1]).toEqual({ type: 'error', code: '110200' });
  });

  it('answers commands with result messages', () => {
    const page = loadPage(new TurnstileOptions({ siteKey: testKey }));
    page.connectBridge();

    // Before api.js is loaded, commands are harmless.
    expect(page.command('getResponse', 1)).toEqual({ type: 'result', id: 1, value: null });
    expect(page.command('execute', 2)).toEqual({ type: 'result', id: 2, value: false });

    page.loadApi();
    page.posted.length = 0;

    expect(page.command('getResponse', 3)).toEqual({ type: 'result', id: 3, value: 'TOKEN-XYZ' });
    expect(page.command('isExpired', 4)).toEqual({ type: 'result', id: 4, value: false });
    expect(page.command('reset', 5)).toEqual({ type: 'result', id: 5, value: true });
    expect(page.command('execute', 6)).toEqual({ type: 'result', id: 6, value: true });
    expect(page.command('render', 7)).toEqual({ type: 'result', id: 7, value: 'w-1' });
    expect(page.calls).toEqual(['render #turnstile-container', 'reset', 'execute']);
  });

  it('reports sizes without misleading zeros', () => {
    const page = loadPage(new TurnstileOptions({ siteKey: testKey }));
    page.connectBridge();
    page.setSize(0, 0);
    page.observe();
    expect(page.posted).toHaveLength(0); // nothing before the first render

    page.loadApi();
    expect(page.posted.splice(0)).toEqual([{ type: 'ready', widgetId: 'w-1' }]); // empty size ignored

    page.setSize(300, 65);
    page.observe();
    page.observe(); // same size twice: one message
    expect(page.posted.splice(0)).toEqual([{ type: 'resize', width: 300, height: 65 }]);

    page.hide();
    page.setSize(0, 0);
    page.observe();
    expect(page.posted).toHaveLength(0); // hidden layout ignored

    page.show();
    page.command('remove', 9);
    expect(page.posted).toEqual([{ type: 'resize', width: 0, height: 0 }]); // collapse after remove is real
  });
});
