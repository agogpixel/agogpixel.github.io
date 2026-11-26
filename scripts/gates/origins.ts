import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ITCH_EMBED_ORIGIN,
  STEAM_WIDGET_ORIGIN,
  buildItchEmbedUrl,
  buildSteamWidgetUrl,
  type GameCatalogEntry,
} from '../../src/lib/games-schema.ts';
import { getPublishedCatalogGames } from '../../src/data/games.ts';
import { routeFromHtmlPath } from './zero-js.ts';

export const SITE_ORIGIN = 'https://agogpixel.com';

export type ResourceKind = 'script' | 'link' | 'media' | 'iframe' | 'inline-style' | 'css';

export interface ScannedResource {
  url: string;
  kind: ResourceKind;
}

export interface IframeOriginGrant {
  route: string;
  origin: string;
  pathPrefix: string;
  exactUrl: string;
  gameSlug: string;
}

export interface OriginCheckResult {
  ok: boolean;
  errors: string[];
  resourcesChecked: number;
  externalIframesAllowed: number;
}

const APPROVED_EMBED_PATH_PATTERNS: ReadonlyMap<string, RegExp> = new Map([
  [ITCH_EMBED_ORIGIN, /^\/embed\/\d+\/?$/],
  [STEAM_WIDGET_ORIGIN, /^\/widget\/\d+\/?$/],
]);

/**
 * Determines whether a resource URL points outside siteOrigin.
 */
export function isNonSameOrigin(
  urlStr: string,
  siteOrigin: string = SITE_ORIGIN
): { isExternal: boolean; origin?: string } {
  const trimmed = urlStr.trim().replace(/^['"]|['"]$/g, '');

  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('javascript:')
  ) {
    return { isExternal: false };
  }

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return { isExternal: false };
  }

  if (trimmed.startsWith('//')) {
    try {
      const parsed = new URL('https:' + trimmed);
      if (parsed.origin === siteOrigin) {
        return { isExternal: false };
      }
      return { isExternal: true, origin: parsed.origin };
    } catch {
      return { isExternal: true, origin: trimmed };
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.origin === siteOrigin) {
      return { isExternal: false };
    }
    return { isExternal: true, origin: parsed.origin };
  } catch {
    return { isExternal: false };
  }
}

export function scanCssResources(cssContent: string): string[] {
  const urls: string[] = [];

  const urlRegex = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(cssContent)) !== null) {
    const val = match[1] ?? match[2] ?? match[3];
    if (val) urls.push(val.trim());
  }

  const importRegex = /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)|"([^"]*)"|'([^']*)');?/gi;
  while ((match = importRegex.exec(cssContent)) !== null) {
    const val = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
    if (val) urls.push(val.trim());
  }

  return urls;
}

function decodeHtmlAttributeEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&#x26;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Extracts resource-loading references from HTML (excluding outbound <a href> and <link rel="canonical">).
 */
export function scanHtmlResources(htmlContent: string): ScannedResource[] {
  const resources: ScannedResource[] = [];

  // 1. <script ... src="...">
  const scriptRegex = /<script\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    const val = match[1] ?? match[2] ?? match[3];
    if (val) resources.push({ url: decodeHtmlAttributeEntities(val), kind: 'script' });
  }

  // 2. <link ... href="..."> (excluding rel="canonical")
  const linkRegex = /<link\b([^>]*)>/gi;
  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const tag = match[1];
    if (/\brel\s*=\s*(?:"canonical"|'canonical'|canonical\b)/i.test(tag)) {
      continue;
    }
    const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (hrefMatch) {
      const val = hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3];
      if (val) resources.push({ url: decodeHtmlAttributeEntities(val), kind: 'link' });
    }
  }

  // 3. <img ... src/srcset> and <source ... src/srcset>
  const mediaTagRegex = /<(?:img|source)\b[^>]*>/gi;
  while ((match = mediaTagRegex.exec(htmlContent)) !== null) {
    const tag = match[0];
    const srcMatch = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (srcMatch) {
      const val = srcMatch[1] ?? srcMatch[2] ?? srcMatch[3];
      if (val) resources.push({ url: decodeHtmlAttributeEntities(val), kind: 'media' });
    }
    const srcsetMatch = /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (srcsetMatch) {
      const srcsetVal = srcsetMatch[1] ?? srcsetMatch[2] ?? srcsetMatch[3];
      if (srcsetVal) {
        const parts = srcsetVal.split(',').map((p) => p.trim().split(/\s+/)[0]);
        for (const p of parts) {
          if (p) resources.push({ url: decodeHtmlAttributeEntities(p), kind: 'media' });
        }
      }
    }
  }

  // 4. <iframe ... src="...">
  const iframeRegex = /<iframe\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
  while ((match = iframeRegex.exec(htmlContent)) !== null) {
    const val = match[1] ?? match[2] ?? match[3];
    if (val) resources.push({ url: decodeHtmlAttributeEntities(val), kind: 'iframe' });
  }

  // 5. <video> / <audio> ... src and poster
  const avRegex = /<(?:video|audio)\b[^>]*>/gi;
  while ((match = avRegex.exec(htmlContent)) !== null) {
    const tag = match[0];
    const srcMatch = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (srcMatch) {
      const val = srcMatch[1] ?? srcMatch[2] ?? srcMatch[3];
      if (val) resources.push({ url: decodeHtmlAttributeEntities(val), kind: 'media' });
    }
    const posterMatch = /\bposter\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (posterMatch) {
      const val = posterMatch[1] ?? posterMatch[2] ?? posterMatch[3];
      if (val) resources.push({ url: decodeHtmlAttributeEntities(val), kind: 'media' });
    }
  }

  // 6. <style> blocks and inline style="..." attributes
  const styleBlockRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  while ((match = styleBlockRegex.exec(htmlContent)) !== null) {
    for (const url of scanCssResources(match[1])) {
      resources.push({ url, kind: 'inline-style' });
    }
  }

  const styleAttrRegex = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  while ((match = styleAttrRegex.exec(htmlContent)) !== null) {
    const styleVal = match[1] ?? match[2] ?? '';
    for (const url of scanCssResources(styleVal)) {
      resources.push({ url, kind: 'inline-style' });
    }
  }

  return resources;
}

/**
 * Builds the manifest-scoped iframe origin allowlist from published catalog games.
 * Production builds with only draft games yield an empty allowlist (0 external origins permitted).
 */
export function buildCatalogIframeAllowlist(
  publishedGames: readonly GameCatalogEntry[]
): IframeOriginGrant[] {
  const grants: IframeOriginGrant[] = [];

  for (const game of publishedGames) {
    if (game.draft === true) {
      continue;
    }

    if (game.itchEmbedId !== undefined) {
      const exactUrl = buildItchEmbedUrl(game.itchEmbedId);
      const parsed = new URL(exactUrl);
      grants.push({
        route: '/',
        origin: parsed.origin,
        pathPrefix: '/embed/',
        exactUrl,
        gameSlug: game.slug,
      });
    }

    if (game.steamAppId !== undefined) {
      const exactUrl = buildSteamWidgetUrl(game.steamAppId);
      const parsed = new URL(exactUrl);
      grants.push({
        route: '/',
        origin: parsed.origin,
        pathPrefix: '/widget/',
        exactUrl,
        gameSlug: game.slug,
      });
    }
  }

  return grants;
}

export function isAllowedStorefrontIframe(
  urlStr: string,
  route: string,
  grants: readonly IframeOriginGrant[]
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }

  const pathPattern = APPROVED_EMBED_PATH_PATTERNS.get(parsed.origin);
  if (!pathPattern || !pathPattern.test(parsed.pathname)) {
    return false;
  }

  return grants.some(
    (grant) =>
      grant.route === route &&
      grant.origin === parsed.origin &&
      parsed.pathname.startsWith(grant.pathPrefix) &&
      parsed.href === grant.exactUrl
  );
}

/**
 * Audits dist/ HTML and CSS for unauthorized third-party resource origins.
 */
export function checkOrigins(
  distDir: string,
  grants: readonly IframeOriginGrant[] = [],
  siteOrigin: string = SITE_ORIGIN
): OriginCheckResult {
  const errors: string[] = [];
  let resourcesChecked = 0;
  let externalIframesAllowed = 0;

  if (!fs.existsSync(distDir)) {
    return {
      ok: false,
      errors: [`distDir does not exist: ${distDir}`],
      resourcesChecked: 0,
      externalIframesAllowed: 0,
    };
  }

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const relPath = path.relative(distDir, fullPath).replace(/\\/g, '/');

        if (relPath.endsWith('.html')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const route = routeFromHtmlPath(relPath);
          const resources = scanHtmlResources(content);

          for (const res of resources) {
            resourcesChecked++;
            const { isExternal, origin } = isNonSameOrigin(res.url, siteOrigin);
            if (!isExternal || !origin) {
              continue;
            }

            if (res.kind !== 'iframe') {
              errors.push(
                `Unauthorized third-party origin "${origin}" in <${res.kind}> resource "${res.url}" on route "${route}" (${relPath}). Only manifest-scoped storefront <iframe src> embeds may load external origins.`
              );
              continue;
            }

            if (isAllowedStorefrontIframe(res.url, route, grants)) {
              externalIframesAllowed++;
            } else {
              errors.push(
                `Unauthorized third-party <iframe> origin or URL "${res.url}" on route "${route}" (${relPath}). Must match a published game catalog itch.io/Steam widget embed on "/".`
              );
            }
          }
        } else if (relPath.endsWith('.css')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const urls = scanCssResources(content);
          for (const u of urls) {
            resourcesChecked++;
            const { isExternal, origin } = isNonSameOrigin(u, siteOrigin);
            if (isExternal && origin) {
              errors.push(
                `Unauthorized third-party origin "${origin}" in CSS resource "${u}" in file "${relPath}". Site CSS must have 0 external origins.`
              );
            }
          }
        }
      }
    }
  }

  walk(distDir);

  return {
    ok: errors.length === 0,
    errors,
    resourcesChecked,
    externalIframesAllowed,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const distDir = process.argv[2] || path.resolve(process.cwd(), 'dist');

  let grants: IframeOriginGrant[] = [];
  try {
    const published = getPublishedCatalogGames(process.env);
    grants = buildCatalogIframeAllowlist(published);
  } catch (err) {
    console.error('Origin Gate FAILED: Unable to load game catalog manifest (fail-closed):', err);
    process.exit(1);
  }

  const result = checkOrigins(distDir, grants);
  if (!result.ok) {
    console.error('Origin Gate FAILED:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log(
    `Origin Gate PASSED (${result.resourcesChecked} resource references checked, ${result.externalIframesAllowed} catalog iframe embed(s) allowlisted).`
  );
}
