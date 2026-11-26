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
import {
  SITE_ORIGIN,
  decodeHtmlEntities,
  detectForbiddenUriScheme,
  extractAttributeUrls,
  scanHtmlTags,
  walkFiles,
} from './shared.ts';

export type ResourceKind =
  | 'script'
  | 'link'
  | 'media'
  | 'iframe'
  | 'iframe-srcdoc'
  | 'inline-style'
  | 'css'
  | (string & {});

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

const MEDIA_RESOURCE_TAGS = new Set(['img', 'source', 'video', 'audio', 'picture', 'track']);

/**
 * Determines whether a resource URL points outside siteOrigin.
 */
export function isNonSameOrigin(
  urlStr: string,
  siteOrigin: string = SITE_ORIGIN
): { isExternal: boolean; origin?: string } {
  const trimmed = urlStr.trim().replace(/^['"]|['"]$/g, '');

  const forbiddenScheme = detectForbiddenUriScheme(trimmed);
  if (forbiddenScheme) {
    return { isExternal: true, origin: forbiddenScheme };
  }

  const lower = trimmed.toLowerCase();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    lower.startsWith('data:') ||
    lower.startsWith('mailto:')
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

function classifyHtmlResourceKind(tagName: string, attrName: string): ResourceKind {
  if (tagName === 'iframe') {
    return attrName === 'src' ? 'iframe' : 'iframe-attr';
  }
  if (tagName === 'script') return 'script';
  if (tagName === 'link') return 'link';
  if (MEDIA_RESOURCE_TAGS.has(tagName)) return 'media';
  return tagName;
}

/**
 * Deny-by-default scan of all URL-bearing attributes and CSS resource references in HTML
 * (excluding only outbound <a href> and strict <link rel="canonical" href>).
 */
export function scanHtmlResources(htmlContent: string): ScannedResource[] {
  const resources: ScannedResource[] = [];
  const tags = scanHtmlTags(htmlContent);

  for (const tag of tags) {
    const relAttr = tag.attributes.find((a) => a.name === 'rel');
    const relTokens = relAttr
      ? decodeHtmlEntities(relAttr.value)
          .trim()
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean)
      : [];
    const isStrictCanonicalLink =
      tag.tagName === 'link' && relTokens.length === 1 && relTokens[0] === 'canonical';

    for (const attr of tag.attributes) {
      if (tag.tagName === 'a' && attr.name === 'href') {
        continue;
      }
      if (isStrictCanonicalLink && attr.name === 'href') {
        continue;
      }

      if (attr.name === 'srcdoc') {
        resources.push({ url: decodeHtmlEntities(attr.value), kind: 'iframe-srcdoc' });
        continue;
      }

      if (attr.name === 'style') {
        for (const cssUrl of scanCssResources(decodeHtmlEntities(attr.value))) {
          resources.push({ url: cssUrl, kind: 'inline-style' });
        }
        continue;
      }

      const urls = extractAttributeUrls(attr.name, attr.value, tag.tagName);
      if (urls.length === 0) continue;

      const kind = classifyHtmlResourceKind(tag.tagName, attr.name);
      for (const u of urls) {
        resources.push({ url: u, kind });
      }
    }
  }

  const htmlWithoutComments = htmlContent.replace(/<!--[\s\S]*?-->/g, '');
  const styleBlockRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleBlockRegex.exec(htmlWithoutComments)) !== null) {
    for (const url of scanCssResources(match[1])) {
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

  for (const fullPath of walkFiles(distDir, ['.html', '.css'])) {
    const relPath = path.relative(distDir, fullPath).replace(/\\/g, '/');

    if (relPath.endsWith('.html')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const route = routeFromHtmlPath(relPath);
      const resources = scanHtmlResources(content);

      for (const res of resources) {
        resourcesChecked++;

        if (res.kind === 'iframe-srcdoc') {
          errors.push(
            `Forbidden srcdoc attribute detected on route "${route}" (${relPath}). Inline srcdoc documents are disallowed.`
          );
          continue;
        }

        const forbiddenScheme = detectForbiddenUriScheme(res.url);
        if (forbiddenScheme) {
          errors.push(
            `Forbidden URI scheme "${forbiddenScheme}" in <${res.kind}> resource "${res.url}" on route "${route}" (${relPath}).`
          );
          continue;
        }

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
        const forbiddenScheme = detectForbiddenUriScheme(u);
        if (forbiddenScheme) {
          errors.push(
            `Forbidden URI scheme "${forbiddenScheme}" in CSS resource "${u}" in file "${relPath}".`
          );
          continue;
        }

        const { isExternal, origin } = isNonSameOrigin(u, siteOrigin);
        if (isExternal && origin) {
          errors.push(
            `Unauthorized third-party origin "${origin}" in CSS resource "${u}" in file "${relPath}". Site CSS must have 0 external origins.`
          );
        }
      }
    }
  }

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
