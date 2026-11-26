import fs from 'node:fs';
import path from 'node:path';

export const SITE_ORIGIN = 'https://agogpixel.com';

export const APPROVED_FRAME_ORIGINS: readonly string[] = [
  'https://itch.io',
  'https://store.steampowered.com',
];

export const URL_BEARING_ATTRIBUTES: ReadonlySet<string> = new Set([
  'href',
  'xlink:href',
  'src',
  'action',
  'formaction',
  'data',
  'poster',
  'cite',
  'background',
  'codebase',
  'longdesc',
  'usemap',
  'profile',
]);

export const URL_LIST_ATTRIBUTES: ReadonlySet<string> = new Set([
  'srcset',
  'imagesrcset',
  'ping',
  'archive',
]);

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

export interface HtmlAttribute {
  name: string;
  rawName: string;
  value: string;
  hasValue: boolean;
}

export interface HtmlTag {
  tagName: string;
  attributes: HtmlAttribute[];
}

export interface CspValidationResult {
  present: boolean;
  errors: string[];
}

/**
 * Recursively collects file paths under `dir`, optionally filtered by file extension(s).
 */
export function walkFiles(dir: string, extensions?: string | readonly string[]): string[] {
  if (!fs.existsSync(dir)) return [];

  const extList =
    extensions === undefined
      ? null
      : typeof extensions === 'string'
        ? [extensions]
        : extensions;
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, extensions));
    } else if (entry.isFile()) {
      if (!extList || extList.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }

  return results.sort();
}

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
  // Split on the payload comma before stripping whitespace/lowercasing so only the scheme
  // and media-type header are checked: active data:text/html or data:image/svg+xml fail
  // while inert raster data:image/png payloads are unaffected by base64 body characters.
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
 * Tokenizes HTML opening tags and attributes outside comments and raw <style> bodies.
 */
export function scanHtmlTags(htmlContent: string): HtmlTag[] {
  const stripped = htmlContent.replace(/<!--[\s\S]*?-->/g, '');
  const tags: HtmlTag[] = [];
  const len = stripped.length;
  let i = 0;

  while (i < len) {
    const lt = stripped.indexOf('<', i);
    if (lt === -1) break;

    const next = stripped[lt + 1];
    if (!next || !/[a-zA-Z]/.test(next)) {
      i = lt + 1;
      continue;
    }

    let pos = lt + 1;
    while (pos < len && /[a-zA-Z0-9:-]/.test(stripped[pos])) {
      pos++;
    }
    const tagName = stripped.slice(lt + 1, pos).toLowerCase();
    const attributes: HtmlAttribute[] = [];

    while (pos < len) {
      while (pos < len && (/\s/.test(stripped[pos]) || stripped[pos] === '/')) {
        pos++;
      }
      if (pos >= len || stripped[pos] === '>') {
        pos++;
        break;
      }

      const nameStart = pos;
      while (pos < len && !/[\s=/>]/.test(stripped[pos])) {
        pos++;
      }
      const rawName = stripped.slice(nameStart, pos);
      if (!rawName) {
        pos++;
        continue;
      }

      while (pos < len && /\s/.test(stripped[pos])) {
        pos++;
      }

      let value = '';
      let hasValue = false;
      if (pos < len && stripped[pos] === '=') {
        hasValue = true;
        pos++;
        while (pos < len && /\s/.test(stripped[pos])) {
          pos++;
        }
        if (pos < len && (stripped[pos] === '"' || stripped[pos] === "'")) {
          const quote = stripped[pos];
          pos++;
          const valStart = pos;
          while (pos < len && stripped[pos] !== quote) {
            pos++;
          }
          value = stripped.slice(valStart, pos);
          if (pos < len && stripped[pos] === quote) {
            pos++;
          }
        } else {
          const valStart = pos;
          while (pos < len && !/[\s>]/.test(stripped[pos])) {
            pos++;
          }
          value = stripped.slice(valStart, pos);
        }
      }

      attributes.push({
        name: rawName.toLowerCase(),
        rawName,
        value,
        hasValue,
      });
    }

    tags.push({ tagName, attributes });

    if (tagName === 'style') {
      const closeIdx = stripped.slice(pos).search(/<\/style\b/i);
      if (closeIdx !== -1) {
        const closeEnd = stripped.indexOf('>', pos + closeIdx);
        pos = closeEnd !== -1 ? closeEnd + 1 : pos + closeIdx;
      }
    }

    i = pos;
  }

  return tags;
}

/**
 * Extracts URL candidates from a single-URL, srcset/imagesrcset, space-delimited list,
 * or meta-refresh content[url=] attribute value.
 */
export function extractAttributeUrls(attrName: string, rawVal: string, tagName?: string): string[] {
  const decoded = decodeHtmlEntities(rawVal);

  if (attrName === 'srcset' || attrName === 'imagesrcset') {
    return decoded
      .split(',')
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  if (URL_LIST_ATTRIBUTES.has(attrName)) {
    return decoded
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  if (attrName === 'content' && (!tagName || tagName === 'meta')) {
    const urls: string[] = [];
    const urlRegex = /\burl\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s;"']+))/gi;
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(decoded)) !== null) {
      const target = (match[1] ?? match[2] ?? match[3] ?? '').trim();
      if (target) urls.push(target);
    }
    return urls;
  }

  if (URL_BEARING_ATTRIBUTES.has(attrName)) {
    const trimmed = decoded.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

/**
 * Validates presence and strictness of <meta http-equiv="Content-Security-Policy"> on an HTML page.
 */
export function validateMetaCsp(
  htmlContent: string,
  allowedFrameOrigins: readonly string[] = APPROVED_FRAME_ORIGINS
): CspValidationResult {
  const errors: string[] = [];
  const tags = scanHtmlTags(htmlContent);
  const cspContents: string[] = [];

  for (const tag of tags) {
    if (tag.tagName !== 'meta') continue;
    const httpEquiv = tag.attributes.find((a) => a.name === 'http-equiv')?.value.trim().toLowerCase();
    if (httpEquiv !== 'content-security-policy') continue;
    const contentAttr = tag.attributes.find((a) => a.name === 'content');
    if (contentAttr) {
      cspContents.push(decodeHtmlEntities(contentAttr.value).trim());
    }
  }

  if (cspContents.length === 0) {
    return {
      present: false,
      errors: ['Missing <meta http-equiv="Content-Security-Policy"> defense-in-depth header.'],
    };
  }

  if (cspContents.length > 1) {
    errors.push(`Expected a single Content-Security-Policy meta tag, found ${cspContents.length}.`);
  }

  const directives = new Map<string, string[]>();
  for (const rawDirective of cspContents[0].split(';')) {
    const parts = rawDirective.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const name = parts[0].toLowerCase();
    if (!directives.has(name)) {
      directives.set(name, parts.slice(1));
    }
  }

  const requireSingleSource = (directive: string, expected: string) => {
    const sources = directives.get(directive);
    if (!sources || sources.length !== 1 || sources[0].toLowerCase() !== expected) {
      errors.push(
        `Content-Security-Policy must enforce "${directive} ${expected}". Found: "${sources?.join(' ') ?? '<missing>'}".`
      );
    }
  };

  requireSingleSource('default-src', "'none'");
  requireSingleSource('script-src', "'none'");
  requireSingleSource('object-src', "'none'");
  requireSingleSource('base-uri', "'none'");
  requireSingleSource('form-action', "'none'");
  requireSingleSource('connect-src', "'none'");

  const selfOnlyDirectives = ['img-src', 'font-src', 'manifest-src'] as const;
  for (const dir of selfOnlyDirectives) {
    const sources = directives.get(dir);
    if (!sources || sources.length === 0 || !sources.every((s) => s === "'self'" || s === "'none'")) {
      errors.push(
        `Content-Security-Policy "${dir}" may only permit 'self' or 'none'. Found: "${sources?.join(' ') ?? '<missing>'}".`
      );
    }
  }

  const styleSources = directives.get('style-src');
  if (
    !styleSources ||
    styleSources.length === 0 ||
    !styleSources.every((s) => s === "'self'" || s === "'unsafe-inline'" || s === "'none'")
  ) {
    errors.push(
      `Content-Security-Policy "style-src" may only permit 'self', 'unsafe-inline', or 'none'. Found: "${styleSources?.join(' ') ?? '<missing>'}".`
    );
  }

  const frameSources = directives.get('frame-src');
  if (frameSources) {
    const allowedSet = new Set(["'none'", ...allowedFrameOrigins]);
    for (const src of frameSources) {
      if (!allowedSet.has(src)) {
        errors.push(
          `Content-Security-Policy "frame-src" contains unapproved source "${src}". Allowed: ${Array.from(allowedSet).join(', ')}.`
        );
      }
    }
  }

  return {
    present: true,
    errors,
  };
}

/**
 * Detects if an HTML document is a meta-refresh redirect stub and extracts its target.
 */
export function parseMetaRefreshRedirect(content: string): { isRedirect: boolean; target: string | null } {
  const tags = scanHtmlTags(content);
  for (const tag of tags) {
    if (tag.tagName !== 'meta') continue;
    const httpEquiv = tag.attributes.find((a) => a.name === 'http-equiv')?.value.trim().toLowerCase();
    if (httpEquiv !== 'refresh') continue;
    const contentAttr = tag.attributes.find((a) => a.name === 'content');
    if (!contentAttr || !contentAttr.value) {
      return { isRedirect: true, target: null };
    }
    const urls = extractAttributeUrls('content', contentAttr.value, 'meta');
    return { isRedirect: true, target: urls[0] ?? null };
  }
  return { isRedirect: false, target: null };
}
