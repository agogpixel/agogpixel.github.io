import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { walkFiles } from './shared.ts';

export interface BudgetConfig {
  pageBudgets: {
    [key: string]: {
      measuredCompressedBytes: number;
      maxCompressedBytes: number;
      description?: string;
    };
  };
  assetBudgets: {
    totalWoff2Bytes: {
      measuredBytes: number;
      maxBytes: number;
      description?: string;
    };
    totalJsGzipBytes?: {
      measuredBytes: number;
      maxBytes: number;
      description?: string;
    };
  };
  performanceBudgets?: {
    maxCls?: {
      measured: number;
      max: number;
      description?: string;
    };
  };
}

export interface BudgetCheckResult {
  ok: boolean;
  errors: string[];
  metrics: Record<string, { measured: number; max: number }>;
}

/**
 * Extracts linked CSS stylesheets and JS script assets from an HTML document.
 */
export function extractPageAssets(htmlContent: string): { cssAssets: string[]; jsAssets: string[] } {
  const cssAssets: string[] = [];
  const jsAssets: string[] = [];

  const linkRegex = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const tag = match[0];
    if (/\brel\s*=\s*(?:"stylesheet"|'stylesheet')/i.test(tag)) {
      const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
      if (hrefMatch) {
        const href = hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3];
        if (href && !cssAssets.includes(href)) {
          cssAssets.push(href);
        }
      }
    }
  }

  const scriptRegex = /<script\b[^>]*>/gi;
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    const tag = match[0];
    const srcMatch = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (srcMatch) {
      const src = srcMatch[1] ?? srcMatch[2] ?? srcMatch[3];
      if (src && !jsAssets.includes(src)) {
        jsAssets.push(src);
      }
    }
  }

  return { cssAssets, jsAssets };
}

/**
 * Categorizes an HTML page path into its agogpixel.com page budget bucket.
 */
export function getPageType(relHtmlPath: string): 'index' | 'credits' | 'notFound' | null {
  const normalized = relHtmlPath.replace(/\\/g, '/');
  if (normalized === 'index.html') return 'index';
  if (normalized === 'credits/index.html') return 'credits';
  if (normalized === '404.html') return 'notFound';
  return null;
}

export function checkBudgets(
  distDir: string,
  budgetsConfigPath: string
): BudgetCheckResult {
  const errors: string[] = [];
  const metrics: Record<string, { measured: number; max: number }> = {};

  if (!fs.existsSync(distDir)) {
    return {
      ok: false,
      errors: [`distDir does not exist: ${distDir}`],
      metrics,
    };
  }

  if (!fs.existsSync(budgetsConfigPath)) {
    return {
      ok: false,
      errors: [`budgets.json not found at ${budgetsConfigPath}`],
      metrics,
    };
  }

  const budgetConfig: BudgetConfig = JSON.parse(
    fs.readFileSync(budgetsConfigPath, 'utf8')
  ) as BudgetConfig;

  const assetGzipCache = new Map<string, number>();
  function getAssetGzipSize(assetRef: string): number {
    const cleanRef = assetRef.split('?')[0].split('#')[0];
    if (assetGzipCache.has(cleanRef)) {
      return assetGzipCache.get(cleanRef)!;
    }
    const diskPath = path.join(distDir, cleanRef.replace(/^\/+/, ''));
    if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
      const raw = fs.readFileSync(diskPath);
      const size = zlib.gzipSync(raw).length;
      assetGzipCache.set(cleanRef, size);
      return size;
    }
    return 0;
  }

  const fontsDir = path.join(distDir, 'fonts');
  let totalWoff2Bytes = 0;
  for (const fontFile of walkFiles(fontsDir, '.woff2')) {
    totalWoff2Bytes += fs.statSync(fontFile).size;
  }

  const woff2Budget = budgetConfig.assetBudgets?.totalWoff2Bytes;
  if (woff2Budget) {
    metrics['asset:totalWoff2Bytes'] = {
      measured: totalWoff2Bytes,
      max: woff2Budget.maxBytes,
    };
    if (totalWoff2Bytes > woff2Budget.maxBytes) {
      errors.push(
        `Total WOFF2 font size exceeded budget: ${totalWoff2Bytes} B > ${woff2Budget.maxBytes} B limit.`
      );
    }
  }

  let totalJsGzipBytes = 0;
  const astroDir = path.join(distDir, '_astro');
  for (const jsFile of walkFiles(astroDir, ['.js', '.mjs'])) {
    const raw = fs.readFileSync(jsFile);
    totalJsGzipBytes += zlib.gzipSync(raw).length;
  }

  const jsBudget = budgetConfig.assetBudgets?.totalJsGzipBytes;
  if (jsBudget) {
    metrics['asset:totalJsGzipBytes'] = {
      measured: totalJsGzipBytes,
      max: jsBudget.maxBytes,
    };
    if (totalJsGzipBytes > jsBudget.maxBytes) {
      errors.push(
        `Total client JS size exceeded budget: ${totalJsGzipBytes} B > ${jsBudget.maxBytes} B limit.`
      );
    }
  }

  for (const fullPath of walkFiles(distDir, '.html')) {
    const relPath = path.relative(distDir, fullPath).replace(/\\/g, '/');
    const raw = fs.readFileSync(fullPath);
    const htmlContent = raw.toString('utf8');
    const { cssAssets, jsAssets } = extractPageAssets(htmlContent);
    const pageType = getPageType(relPath);

    if (!pageType || !budgetConfig.pageBudgets?.[pageType]) {
      errors.push(`Unbudgeted HTML route "${relPath}" has no matching entry in budgets.json.`);
      continue;
    }

    const budget = budgetConfig.pageBudgets[pageType];
    const htmlGzipBytes = zlib.gzipSync(raw).length;

    let pageCssGzipBytes = 0;
    for (const cssRef of cssAssets) {
      pageCssGzipBytes += getAssetGzipSize(cssRef);
    }

    let pageJsGzipBytes = 0;
    for (const jsRef of jsAssets) {
      pageJsGzipBytes += getAssetGzipSize(jsRef);
    }

    const combinedCompressed = htmlGzipBytes + pageCssGzipBytes + pageJsGzipBytes;

    const metricKey = `page:${pageType}:${relPath}`;
    metrics[metricKey] = {
      measured: combinedCompressed,
      max: budget.maxCompressedBytes,
    };

    if (combinedCompressed > budget.maxCompressedBytes) {
      errors.push(
        `Page "${relPath}" (${pageType}) exceeded weight budget: ${combinedCompressed} B (HTML ${htmlGzipBytes} B + CSS ${pageCssGzipBytes} B + JS ${pageJsGzipBytes} B) > ${budget.maxCompressedBytes} B limit.`
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    metrics,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const distDir = process.argv[2] || path.resolve(process.cwd(), 'dist');
  const budgetsJson = process.argv[3] || path.resolve(process.cwd(), 'budgets.json');

  const result = checkBudgets(distDir, budgetsJson);
  if (!result.ok) {
    console.error('Weight Budgets Gate FAILED:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log('Weight Budgets Gate PASSED (all page types and woff2 assets within budget limits).');
}
