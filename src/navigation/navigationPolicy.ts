/** What to do with a navigation started inside the Turnstile page. */
export type TurnstileNavigationDecision = 'allow' | 'openExternally' | 'block';

/** Decides which navigations the WebView may perform. */
export interface TurnstileNavigationPolicy {
  decide(url: string | undefined, isTopFrame: boolean): TurnstileNavigationDecision;
}

const INTERNAL_SCHEMES = new Set(['about', 'data', 'blob']);
const DEFAULT_PORTS: Record<string, string> = { http: '80', https: '443' };
const URL_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):(?:\/\/([^/?#]*))?/;

interface ParsedUrl {
  scheme: string;
  origin: string | null;
}

/**
 * React Native's `URL` is incomplete (several getters throw), so this reads
 * the scheme and the authority with a regular expression instead.
 */
export function parseUrl(url: string): ParsedUrl | null {
  const match = URL_PATTERN.exec(url.trim());
  if (!match) return null;
  const scheme = match[1]!.toLowerCase();
  const authority = match[2];
  if (authority === undefined || authority.length === 0) return { scheme, origin: null };
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1).toLowerCase();
  const portMatch = /:(\d+)$/.exec(hostPort);
  const host = portMatch ? hostPort.slice(0, portMatch.index) : hostPort;
  const port = portMatch ? portMatch[1]! : DEFAULT_PORTS[scheme] ?? '';
  return { scheme, origin: `${scheme}://${host}:${port}` };
}

/**
 * Keeps the top frame on the host page and sends other links (privacy
 * policy, terms) to the system browser. Sub-frames, which the Turnstile
 * iframe uses, are always allowed.
 */
export class DefaultTurnstileNavigationPolicy implements TurnstileNavigationPolicy {
  /** Cloudflare's challenge origin, always allowed (it runs in an iframe). */
  static readonly challengeOrigin = 'https://challenges.cloudflare.com:443';

  private readonly baseOrigin: string | null;

  constructor(baseUrl: string) {
    this.baseOrigin = parseUrl(baseUrl)?.origin ?? null;
  }

  decide(url: string | undefined, isTopFrame: boolean): TurnstileNavigationDecision {
    if (!url) return 'block';
    const target = parseUrl(url);
    if (target === null) return 'block';
    if (INTERNAL_SCHEMES.has(target.scheme)) return 'allow';
    if (target.scheme !== 'http' && target.scheme !== 'https') return 'block';
    // Android does not always tell iframe navigations apart from top-frame
    // ones, so the challenge origin is allowed explicitly.
    if (target.origin === DefaultTurnstileNavigationPolicy.challengeOrigin) return 'allow';
    if (!isTopFrame || (target.origin !== null && target.origin === this.baseOrigin)) return 'allow';
    return 'openExternally';
  }
}
