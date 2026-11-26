import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeFromHtmlPath } from './zero-js.ts';
import { SITE_ORIGIN, parseMetaRefreshRedirect, walkFiles } from './shared.ts';

export interface CanonicalSitemapResult {
  ok: boolean;
  errors: string[];
  pagesChecked: number;
  sitemapUrlsChecked: number;
}

export function checkCanonicalAndSitemap(
  distDir: string,
  siteOrigin: string = SITE_ORIGIN
): CanonicalSitemapResult {
  const errors: string[] = [];
  let pagesChecked = 0;
  let sitemapUrlsChecked = 0;

  if (!fs.existsSync(distDir)) {
    return {
      ok: false,
      errors: [`distDir does not exist: ${distDir}`],
      pagesChecked: 0,
      sitemapUrlsChecked: 0,
    };
  }

  const htmlRoutes = new Map<string, { hasNoindex: boolean; isRedirect: boolean; file: string }>();

  for (const fullPath of walkFiles(distDir, '.html')) {
    const relPath = path.relative(distDir, fullPath).replace(/\\/g, '/');
    pagesChecked++;
    const route = routeFromHtmlPath(relPath);
    const content = fs.readFileSync(fullPath, 'utf8');

    const hasNoindex =
      /<meta\b[^>]*?\bname\s*=\s*(?:"robots"|'robots')[^>]*?\bcontent\s*=\s*(?:"[^"]*noindex[^"]*"|'[^']*noindex[^']*')[^>]*>/i.test(
        content
      ) ||
      /<meta\b[^>]*?\bcontent\s*=\s*(?:"[^"]*noindex[^"]*"|'[^']*noindex[^']*')[^>]*?\bname\s*=\s*(?:"robots"|'robots')[^>]*>/i.test(
        content
      );

    const { isRedirect, target: redirectTarget } = parseMetaRefreshRedirect(content);

    if (isRedirect && !hasNoindex) {
      errors.push(
        `Redirect page "${relPath}" (route "${route}") must have <meta name="robots" content="noindex">.`
      );
    }

    htmlRoutes.set(route, { hasNoindex, isRedirect, file: relPath });

    const canonicalMatches: string[] = [];
    const canonicalRegex = /<link\b[^>]*?\brel\s*=\s*(?:"canonical"|'canonical')[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = canonicalRegex.exec(content)) !== null) {
      const href = match[1] ?? match[2] ?? match[3];
      if (href) canonicalMatches.push(href);
    }
    const reverseCanonicalRegex = /<link\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*?\brel\s*=\s*(?:"canonical"|'canonical')[^>]*>/gi;
    while ((match = reverseCanonicalRegex.exec(content)) !== null) {
      const href = match[1] ?? match[2] ?? match[3];
      if (href && !canonicalMatches.includes(href)) {
        canonicalMatches.push(href);
      }
    }

    // Non-redirect noindex pages (e.g. 404.html) omit canonical intentionally.
    if (canonicalMatches.length === 0) {
      if (!hasNoindex || isRedirect) {
        errors.push(`Missing canonical tag in "${relPath}" (route "${route}")`);
      }
    } else if (canonicalMatches.length > 1) {
      errors.push(
        `Multiple canonical tags found in "${relPath}": ${canonicalMatches.join(', ')}`
      );
    } else {
      const href = canonicalMatches[0];
      if (!href.startsWith('http://') && !href.startsWith('https://')) {
        errors.push(`Canonical URL "${href}" in "${relPath}" is not absolute.`);
      } else if (isRedirect && redirectTarget) {
        const selfCanonical = `${siteOrigin}${route}`;
        const targetCanonical =
          redirectTarget.startsWith('http://') || redirectTarget.startsWith('https://')
            ? redirectTarget
            : `${siteOrigin}${redirectTarget.startsWith('/') ? redirectTarget : `/${redirectTarget}`}`;

        if (href !== selfCanonical && href !== targetCanonical) {
          errors.push(
            `Canonical URL mismatch in redirect "${relPath}": got "${href}", expected self-canonical "${selfCanonical}" or target "${targetCanonical}".`
          );
        } else if (href.startsWith(siteOrigin) && !href.endsWith('/')) {
          errors.push(
            `Canonical URL "${href}" in "${relPath}" violates trailing-slash requirement.`
          );
        }
      } else {
        if (!href.startsWith(siteOrigin)) {
          errors.push(
            `Canonical URL "${href}" in "${relPath}" origin does not match expected "${siteOrigin}".`
          );
        }
        if (!href.endsWith('/')) {
          errors.push(
            `Canonical URL "${href}" in "${relPath}" violates trailing-slash requirement.`
          );
        }
        const expectedHref = `${siteOrigin}${route}`;
        if (href !== expectedHref) {
          errors.push(
            `Canonical URL mismatch in "${relPath}": got "${href}", expected "${expectedHref}".`
          );
        }
      }
    }
  }

  const sitemapPath = path.join(distDir, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    errors.push('sitemap.xml not found in dist');
    return {
      ok: false,
      errors,
      pagesChecked,
      sitemapUrlsChecked,
    };
  }

  const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
  const locRegex = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let locMatch: RegExpExecArray | null;
  const sitemapUrls: string[] = [];
  while ((locMatch = locRegex.exec(sitemapContent)) !== null) {
    sitemapUrls.push(locMatch[1]);
  }

  sitemapUrlsChecked = sitemapUrls.length;

  for (const urlStr of sitemapUrls) {
    if (!urlStr.startsWith(siteOrigin)) {
      errors.push(`Sitemap URL "${urlStr}" does not match site origin "${siteOrigin}".`);
      continue;
    }
    if (!urlStr.endsWith('/')) {
      errors.push(`Sitemap URL "${urlStr}" is missing trailing slash.`);
      continue;
    }

    const route = urlStr.slice(siteOrigin.length);
    const pageInfo = htmlRoutes.get(route);

    if (!pageInfo) {
      errors.push(
        `Sitemap URL "${urlStr}" (route "${route}") does not correspond to any generated HTML file in dist.`
      );
    } else if (pageInfo.hasNoindex) {
      errors.push(
        `Sitemap URL "${urlStr}" points to a page marked with noindex (file: "${pageInfo.file}"). Pages with noindex must not be in sitemap.`
      );
    } else if (pageInfo.isRedirect) {
      errors.push(
        `Sitemap URL "${urlStr}" points to a redirect page (file: "${pageInfo.file}"). Redirect pages must not be in sitemap.`
      );
    }
  }

  const sitemapUrlSet = new Set(sitemapUrls);
  for (const [route, pageInfo] of htmlRoutes.entries()) {
    if (!pageInfo.hasNoindex && !pageInfo.isRedirect) {
      const expectedUrl = `${siteOrigin}${route}`;
      if (!sitemapUrlSet.has(expectedUrl)) {
        errors.push(
          `Indexable HTML route "${route}" (file: "${pageInfo.file}") is missing from sitemap.xml (expected "${expectedUrl}").`
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    pagesChecked,
    sitemapUrlsChecked,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const distDir = process.argv[2] || path.resolve(process.cwd(), 'dist');
  const result = checkCanonicalAndSitemap(distDir);
  if (!result.ok) {
    console.error('Canonical & Sitemap Gate FAILED:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log(
    `Canonical & Sitemap Gate PASSED (${result.pagesChecked} HTML pages and ${result.sitemapUrlsChecked} sitemap URLs checked).`
  );
}
