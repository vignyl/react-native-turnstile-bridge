import { TurnstileJsApi } from '../bridge/jsApi';
import type { TurnstileOptions } from '../core/options';

/** Official Turnstile script URL. */
export const DEFAULT_TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/** Produces the HTML page hosting the widget inside a WebView. */
export interface TurnstileDocumentBuilder {
  /** URL of `api.js`, also used by the web engine. */
  readonly scriptUrl: string;
  /** Returns a complete HTML document for `options`. */
  build(options: TurnstileOptions): string;
}

// <, >, &, U+2028 and U+2029 must not appear verbatim inside an inline script.
const UNSAFE_IN_SCRIPT = new RegExp(`[<>&${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, 'g');

/** JSON that can be inlined in a `<script>` element. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(UNSAFE_IN_SCRIPT, (char) => {
    const hex = char.charCodeAt(0).toString(16).padStart(4, '0');
    return '\\u' + hex;
  });
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Default page: transparent, loads `api.js`, renders the widget explicitly
 * and forwards every Turnstile callback to React Native as JSON.
 */
export class TurnstileHtmlDocumentBuilder implements TurnstileDocumentBuilder {
  constructor(readonly scriptUrl: string = DEFAULT_TURNSTILE_SCRIPT_URL) {}

  build(options: TurnstileOptions): string {
    options.ensureValid();
    const replacements: Array<[string, string]> = [
      ['{{LANG}}', options.language === 'auto' ? '' : ` lang="${options.language}"`],
      ['{{DISPLAY}}', options.size === 'flexible' ? 'block' : 'inline-block'],
      ['{{CONTAINER}}', TurnstileJsApi.containerId],
      ['{{GLOBAL}}', TurnstileJsApi.globalObject],
      ['{{POST}}', TurnstileJsApi.postFunction],
      ['{{SCRIPT_URL}}', escapeAttribute(this.scriptUrl)],
      // Last, so values coming from the options cannot inject placeholders.
      ['{{PARAMS}}', jsonForScript(options.toRenderParameters())],
    ];
    return replacements.reduce((html, [placeholder, value]) => html.split(placeholder).join(value), TEMPLATE);
  }
}

const TEMPLATE = `<!DOCTYPE html>
<html{{LANG}}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
  #{{CONTAINER}} { display: {{DISPLAY}}; }
</style>
<script>
(function () {
  'use strict';
  var params = {{PARAMS}};
  var selector = '#{{CONTAINER}}';
  var widgetId = null;
  var rendered = false;
  var lastSize = null;
  var queue = [];
  var flushScheduled = false;

  function bridgeAvailable() {
    return !!(window.ReactNativeWebView && window.ReactNativeWebView.postMessage);
  }
  function flush() {
    flushScheduled = false;
    while (queue.length && bridgeAvailable()) {
      window.ReactNativeWebView.postMessage(JSON.stringify(queue.shift()));
    }
    if (queue.length && !flushScheduled) {
      flushScheduled = true;
      setTimeout(flush, 50);
    }
  }
  function post(message) { queue.push(message); flush(); }
  window['{{POST}}'] = post;

  function apiLoaded() { return typeof window.turnstile !== 'undefined'; }
  function hasWidget() { return widgetId !== null && apiLoaded(); }

  function reportSize() {
    // Nothing to report before the first render or while the layout is hidden.
    if (!rendered) { return; }
    var el = document.getElementById('{{CONTAINER}}');
    if (!el || el.getClientRects().length === 0) { return; }
    var rect = el.getBoundingClientRect();
    var w = Math.ceil(rect.width), h = Math.ceil(rect.height);
    // Turnstile inserts its iframe asynchronously: ignore empty sizes until a
    // real one has been seen. Later zero heights (remove, interaction-only)
    // are meaningful.
    if (!lastSize && (w === 0 || h === 0)) { return; }
    if (lastSize && lastSize.w === w && lastSize.h === h) { return; }
    lastSize = { w: w, h: h };
    post({ type: 'resize', width: w, height: h });
  }
  function observeSize() {
    var el = document.getElementById('{{CONTAINER}}');
    if (!el) { return; }
    if (window.ResizeObserver) { new window.ResizeObserver(reportSize).observe(el); }
    else { window.setInterval(reportSize, 500); }
  }

  function render() {
    if (!apiLoaded()) { return null; }
    if (widgetId !== null) { return widgetId; }
    var options = Object.assign({}, params, {
      'callback': function (token) { post({ type: 'token', token: token }); },
      'error-callback': function (code) { post({ type: 'error', code: String(code) }); return true; },
      'expired-callback': function () { post({ type: 'expired' }); },
      'timeout-callback': function () { post({ type: 'timeout' }); },
      'before-interactive-callback': function () { post({ type: 'beforeInteractive' }); },
      'after-interactive-callback': function () { post({ type: 'afterInteractive' }); },
      'unsupported-callback': function () { post({ type: 'unsupported' }); }
    });
    try {
      var id = window.turnstile.render(selector, options);
      widgetId = (id === undefined || id === null) ? null : id;
      if (widgetId !== null) {
        rendered = true;
        post({ type: 'ready', widgetId: String(widgetId) });
        reportSize();
      }
    } catch (e) {
      post({ type: 'error', code: 'render_failed', message: String((e && e.message) || e) });
    }
    return widgetId;
  }
  function reset() {
    if (hasWidget()) { window.turnstile.reset(widgetId); return true; }
    return render() !== null;
  }
  function remove() {
    if (hasWidget()) { window.turnstile.remove(widgetId); }
    widgetId = null;
    reportSize();
    return true;
  }
  function execute() {
    if (!apiLoaded()) { return false; }
    if (widgetId === null) { render(); }
    if (widgetId === null) { return false; }
    window.turnstile.execute(selector);
    return true;
  }
  function getResponse() { return hasWidget() ? (window.turnstile.getResponse(widgetId) || null) : null; }
  function isExpired() { return hasWidget() ? !!window.turnstile.isExpired(widgetId) : false; }

  window['{{GLOBAL}}'] = {
    render: render, reset: reset, remove: remove, execute: execute,
    getResponse: getResponse, isExpired: isExpired
  };

  function whenDomReady(fn) {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', fn); }
    else { fn(); }
  }
  window.__onTurnstileLoaded = function () { whenDomReady(render); };
  window.__onTurnstileScriptError = function () { post({ type: 'scriptError' }); };
  whenDomReady(observeSize);
})();
</script>
<script src="{{SCRIPT_URL}}?render=explicit&amp;onload=__onTurnstileLoaded" async defer onerror="__onTurnstileScriptError()"></script>
</head>
<body><div id="{{CONTAINER}}"></div></body>
</html>
`;
