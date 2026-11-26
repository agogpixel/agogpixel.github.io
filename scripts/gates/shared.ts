export const SITE_ORIGIN = 'https://agogpixel.com';

const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  tab: '\t',
  newline: '\n',
};

const EXECUTABLE_DATA_URI_REGEX =
  /^data:(?:text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/javascript|application\/javascript|text\/ecmascript|application\/ecmascript)(?:[;,]|$)/;

/**
 * Decodes HTML numeric character references and common named entities (including &colon;/&tab;/&newline;).
 */
export function decodeHtmlEntities(raw: string): string {
  return raw.replace(
    /&(?:#(\d+);?|#x([0-9a-fA-F]+);?|([a-zA-Z]+);)/g,
    (full, dec?: string, hex?: string, named?: string) => {
      if (dec !== undefined) {
        const code = Number.parseInt(dec, 10);
        return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : full;
      }
      if (hex !== undefined) {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : full;
      }
      if (named !== undefined) {
        const replacement = NAMED_HTML_ENTITIES[named.toLowerCase()];
        if (replacement !== undefined) {
          return replacement;
        }
      }
      return full;
    }
  );
}

/**
 * Detects executable/active URI schemes (javascript:, vbscript:, active data:* media types),
 * normalizing HTML character references and ASCII control characters/whitespace.
 */
export function detectForbiddenUriScheme(rawUrl: string): string | null {
  const decoded = decodeHtmlEntities(rawUrl).trim().replace(/^['"]|['"]$/g, '');
  const normalizedPrefix = decoded
    .split(',')[0]
    .replace(/[\u0000-\u0020]+/g, '')
    .toLowerCase();

  if (normalizedPrefix.startsWith('javascript:')) {
    return 'javascript:';
  }
  if (normalizedPrefix.startsWith('vbscript:')) {
    return 'vbscript:';
  }
  if (EXECUTABLE_DATA_URI_REGEX.test(normalizedPrefix)) {
    return normalizedPrefix.split(/[;,]/)[0];
  }
  return null;
}

/**
 * Detects if an HTML document is a meta-refresh redirect stub and extracts its target.
 */
export function parseMetaRefreshRedirect(content: string): { isRedirect: boolean; target: string | null } {
  const refreshRegex = /<meta\b[^>]*?\bhttp-equiv\s*=\s*(?:"refresh"|'refresh')[^>]*?\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/i;
  const reverseRefreshRegex = /<meta\b[^>]*?\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*?\bhttp-equiv\s*=\s*(?:"refresh"|'refresh')[^>]*>/i;

  const match = refreshRegex.exec(content) || reverseRefreshRegex.exec(content);
  if (!match) {
    return { isRedirect: false, target: null };
  }

  const contentVal = match[1] ?? match[2] ?? match[3];
  if (!contentVal) {
    return { isRedirect: true, target: null };
  }

  const urlMatch = /url\s*=\s*([^\s;]+)/i.exec(contentVal);
  if (!urlMatch) {
    return { isRedirect: true, target: null };
  }

  const target = urlMatch[1].replace(/['"]/g, '');
  return { isRedirect: true, target };
}
