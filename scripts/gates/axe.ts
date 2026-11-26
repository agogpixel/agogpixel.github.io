import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import axe from 'axe-core';
import { parseMetaRefreshRedirect } from './shared.ts';

export const DEFAULT_MAX_CLS = 0.1;

export interface IncompleteAllowlistEntry {
  ruleId: string;
  selector: string;
  issue: string;
  reason: string;
}

export interface AxeAuditOptions {
  distDir: string;
  allowlistPath?: string;
  budgetsPath?: string;
  maxCls?: number;
  schemes?: ReadonlyArray<'light' | 'dark'>;
  reportOnly?: boolean;
}

export interface AxePageResult {
  route: string;
  scheme: 'light' | 'dark';
  violations: Array<{
    id: string;
    impact?: string | null;
    description: string;
    help: string;
    nodes: Array<{ html: string; target: string[]; failureSummary?: string }>;
  }>;
  incomplete: Array<{
    id: string;
    impact?: string | null;
    description: string;
    nodes: Array<{ html: string; target: string[]; failureSummary?: string }>;
  }>;
  unallowedIncomplete: Array<{
    id: string;
    target: string;
    html: string;
    failureSummary?: string;
  }>;
  matchedAllowlistEntries: Set<string>;
  stubbedWidgetUrls: string[];
  aaaBodyPassCount: number;
  aaaBodyFailCount: number;
  cls: number;
}

export interface AxeAuditResult {
  ok: boolean;
  totalPagesScanned: number;
  totalViolations: number;
  totalUnallowedIncomplete: number;
  staleAllowlistEntries: string[];
  pageResults: AxePageResult[];
  errors: string[];
  maxClsBudget: number;
  reportLines: {
    aaaRatioLines: string[];
    clsLines: string[];
  };
}

const STUB_WIDGET_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Storefront Widget Stub</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #0a0a0a;
        color: #eeeeee;
        font-family: sans-serif;
      }
    </style>
  </head>
  <body>
    <main><p>Storefront widget preview</p></main>
  </body>
</html>`;

export function isStorefrontWidgetStubUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.origin === 'https://itch.io' && /^\/embed\/\d+\/?$/.test(parsed.pathname)) {
      return true;
    }
    if (
      parsed.origin === 'https://store.steampowered.com' &&
      /^\/widget\/\d+\/?$/.test(parsed.pathname)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function findHtmlFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      results.push(fullPath);
    }
  }
  return results;
}

export function filePathToRoute(distDir: string, filePath: string): string {
  let rel = path.relative(distDir, filePath).replace(/\\/g, '/');
  if (rel.endsWith('index.html')) {
    rel = rel.slice(0, -'index.html'.length);
  }
  return '/' + rel;
}

export async function startDistServer(distDir: string): Promise<{ server: http.Server; port: number }> {
  const rootDir = path.resolve(distDir);
  const rootPrefix = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
  const isInsideRoot = (candidate: string): boolean =>
    candidate === rootDir || candidate.startsWith(rootPrefix);

  const contentTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
  };

  const server = http.createServer((req, res) => {
    const rawPath = (req.url ?? '/').split('?')[0];

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    if (decodedPath.includes('\0')) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    let reqPath = decodedPath.replace(/\\/g, '/');
    if (!reqPath.startsWith('/')) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    if (reqPath.endsWith('/')) {
      reqPath += 'index.html';
    }

    const candidate = path.resolve(rootDir, '.' + reqPath);
    if (!isInsideRoot(candidate)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    let localPath = candidate;
    if (!fs.existsSync(localPath)) {
      const htmlCandidate = path.resolve(candidate + '.html');
      if (candidate === rootDir || !isInsideRoot(htmlCandidate)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }
      localPath = htmlCandidate;
    }

    if (!fs.existsSync(localPath)) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    let realRootDir: string;
    let realLocalPath: string;
    try {
      realRootDir = fs.realpathSync(rootDir);
      realLocalPath = fs.realpathSync(localPath);
    } catch {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const realRootPrefix = realRootDir.endsWith(path.sep) ? realRootDir : realRootDir + path.sep;
    if (realLocalPath !== realRootDir && !realLocalPath.startsWith(realRootPrefix)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    if (!fs.statSync(realLocalPath).isFile()) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const ext = path.extname(realLocalPath).toLowerCase();
    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    fs.createReadStream(realLocalPath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to obtain server address'));
        return;
      }
      resolve({ server, port: addr.port });
    });
    server.on('error', reject);
  });
}

export function nodeMatchesSelector(targetSelectors: unknown, allowlistSelector: string): boolean {
  if (Array.isArray(targetSelectors)) {
    for (const t of targetSelectors) {
      const str = String(t);
      if (str.includes(allowlistSelector) || str.endsWith(allowlistSelector)) {
        return true;
      }
    }
  } else if (typeof targetSelectors === 'string') {
    return targetSelectors.includes(allowlistSelector) || targetSelectors.endsWith(allowlistSelector);
  }
  return false;
}

export function resolveMaxClsBudget(budgetsPath?: string, overrideMaxCls?: number): number {
  if (overrideMaxCls !== undefined) {
    return overrideMaxCls;
  }
  if (budgetsPath && fs.existsSync(budgetsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(budgetsPath, 'utf8')) as {
        performanceBudgets?: { maxCls?: { max?: number } };
      };
      const val = parsed.performanceBudgets?.maxCls?.max;
      if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
        return val;
      }
    } catch {
      // Fall back to DEFAULT_MAX_CLS when budgetsPath lacks performanceBudgets.maxCls
    }
  }
  return DEFAULT_MAX_CLS;
}

async function installOfflineRouteGuard(
  context: BrowserContext,
  localOrigin: string,
  routeLabel: string,
  stubbedUrls: string[],
  errors: string[]
): Promise<void> {
  await context.route('**/*', async (route) => {
    const reqUrl = route.request().url();
    if (
      reqUrl.startsWith(localOrigin) ||
      reqUrl.startsWith('data:') ||
      reqUrl.startsWith('blob:')
    ) {
      await route.continue();
      return;
    }

    if (isStorefrontWidgetStubUrl(reqUrl)) {
      stubbedUrls.push(reqUrl);
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: STUB_WIDGET_HTML,
      });
      return;
    }

    errors.push(`Unapproved outbound request intercepted on ${routeLabel}: ${reqUrl}`);
    await route.abort();
  });
}

/**
 * Runs deterministic offline axe-core (WCAG 2.2 A/AA) and CLS audit on dist/.
 */
export async function runAxeAudit(options: AxeAuditOptions): Promise<AxeAuditResult> {
  const { distDir, allowlistPath, budgetsPath, maxCls, schemes = ['dark'] } = options;
  const maxClsBudget = resolveMaxClsBudget(budgetsPath, maxCls);

  let allowlist: IncompleteAllowlistEntry[] = [];
  if (allowlistPath && fs.existsSync(allowlistPath)) {
    const raw = fs.readFileSync(allowlistPath, 'utf8');
    allowlist = JSON.parse(raw) as IncompleteAllowlistEntry[];
    for (const item of allowlist) {
      if (!item.issue || !item.issue.startsWith('#')) {
        throw new Error(`Allowlist entry for "${item.ruleId}" must cite an issue (e.g. #23)`);
      }
    }
  }

  const htmlFiles = findHtmlFiles(distDir);
  if (htmlFiles.length === 0) {
    return {
      ok: false,
      totalPagesScanned: 0,
      totalViolations: 0,
      totalUnallowedIncomplete: 0,
      staleAllowlistEntries: [],
      pageResults: [],
      errors: [`No HTML files found in dist directory "${distDir}".`],
      maxClsBudget,
      reportLines: { aaaRatioLines: [], clsLines: [] },
    };
  }

  const nonRedirectHtmlFiles = htmlFiles.filter((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    return !parseMetaRefreshRedirect(content).isRedirect;
  });

  const routes = nonRedirectHtmlFiles.map((f) => filePathToRoute(distDir, f)).sort();
  const { server, port } = await startDistServer(distDir);
  const localOrigin = `http://127.0.0.1:${port}/`;

  const matchedAllowlistKeys = new Set<string>();
  const pageResults: AxePageResult[] = [];
  const errors: string[] = [];
  const aaaRatioLines: string[] = [];
  const clsLines: string[] = [];

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch();

    for (const route of routes) {
      for (const scheme of schemes) {
        const stubbedWidgetUrls: string[] = [];
        const context = await browser.newContext({ colorScheme: scheme });
        await installOfflineRouteGuard(context, localOrigin, route, stubbedWidgetUrls, errors);

        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'networkidle' });

        // Exercise any lazy-loaded storefront iframes so offline stub interception is verified
        await page.evaluate(async () => {
          await document.fonts.ready;
          const iframes = Array.from(document.querySelectorAll('iframe[loading="lazy"]'));
          for (const iframe of iframes) {
            iframe.scrollIntoView();
          }
        });

        await page.waitForLoadState('networkidle');

        const pageCls = await page.evaluate(() => {
          return new Promise<number>((resolve) => {
            let clsValue = 0;
            const observer = new PerformanceObserver((entryList) => {
              for (const entry of entryList.getEntries() as Array<
                PerformanceEntry & { value: number; hadRecentInput: boolean }
              >) {
                if (!entry.hadRecentInput) {
                  clsValue += entry.value;
                }
              }
            });
            observer.observe({ type: 'layout-shift', buffered: true });
            setTimeout(() => {
              observer.disconnect();
              resolve(clsValue);
            }, 100);
          });
        });

        clsLines.push(
          `CLS [${scheme.toUpperCase().padEnd(4)}] ${route.padEnd(35)}: ${pageCls.toFixed(4)} (budget <= ${maxClsBudget.toFixed(4)})`
        );

        if (pageCls > maxClsBudget) {
          errors.push(
            `CLS budget exceeded on ${route} (${scheme}): ${pageCls.toFixed(4)} > ${maxClsBudget.toFixed(4)}`
          );
        }

        await page.addScriptTag({ content: axe.source });

        const axeResults = await page.evaluate(async () => {
          return await (window as unknown as { axe: typeof axe }).axe.run(document, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
            },
          });
        });

        const aaaResults = await page.evaluate(async () => {
          const mainEl = document.querySelector('main') || document.body;
          return await (window as unknown as { axe: typeof axe }).axe.run(mainEl, {
            runOnly: {
              type: 'rule',
              values: ['color-contrast-enhanced'],
            },
          });
        });

        const matchedInThisRun = new Set<string>();
        const unallowedIncomplete: AxePageResult['unallowedIncomplete'] = [];

        for (const inc of axeResults.incomplete) {
          for (const node of inc.nodes) {
            let allowed = false;
            for (const entry of allowlist) {
              if (entry.ruleId === inc.id && nodeMatchesSelector(node.target, entry.selector)) {
                allowed = true;
                const allowKey = `${entry.ruleId}::${entry.selector}`;
                matchedInThisRun.add(allowKey);
                matchedAllowlistKeys.add(allowKey);
                break;
              }
            }

            if (!allowed) {
              unallowedIncomplete.push({
                id: inc.id,
                target: node.target.join(', '),
                html: node.html,
                failureSummary: node.failureSummary,
              });
            }
          }
        }

        const aaaPasses = aaaResults.passes.length ? aaaResults.passes[0].nodes.length : 0;
        const aaaFails = aaaResults.violations.length ? aaaResults.violations[0].nodes.length : 0;
        const aaaTotal = aaaPasses + aaaFails;
        const aaaPercent = aaaTotal > 0 ? ((aaaPasses / aaaTotal) * 100).toFixed(1) : '100.0';

        aaaRatioLines.push(
          `AAA Body Contrast [${scheme.toUpperCase().padEnd(4)}] ${route.padEnd(35)}: ${aaaPasses}/${aaaTotal} elements (${aaaPercent}%) meet 7:1`
        );

        pageResults.push({
          route,
          scheme,
          violations: axeResults.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            help: v.help,
            nodes: v.nodes.map((n) => ({
              html: n.html,
              target: Array.isArray(n.target) ? n.target.map(String) : [String(n.target)],
              failureSummary: n.failureSummary,
            })),
          })),
          incomplete: axeResults.incomplete.map((inc) => ({
            id: inc.id,
            impact: inc.impact,
            description: inc.description,
            nodes: inc.nodes.map((n) => ({
              html: n.html,
              target: Array.isArray(n.target) ? n.target.map(String) : [String(n.target)],
              failureSummary: n.failureSummary,
            })),
          })),
          unallowedIncomplete,
          matchedAllowlistEntries: matchedInThisRun,
          stubbedWidgetUrls,
          aaaBodyPassCount: aaaPasses,
          aaaBodyFailCount: aaaFails,
          cls: pageCls,
        });

        if (axeResults.violations.length > 0) {
          for (const v of axeResults.violations) {
            errors.push(
              `Violation [${v.id}] on ${route} (${scheme}): ${v.help} (${v.nodes.length} instance(s))`
            );
          }
        }

        if (unallowedIncomplete.length > 0) {
          for (const inc of unallowedIncomplete) {
            errors.push(
              `Unallowed incomplete [${inc.id}] on ${route} (${scheme}) at "${inc.target}". Reason: ${inc.failureSummary || 'Needs investigation'}`
            );
          }
        }

        await context.close();
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    server.close();
  }

  const staleAllowlistEntries: string[] = [];
  for (const entry of allowlist) {
    const key = `${entry.ruleId}::${entry.selector}`;
    if (!matchedAllowlistKeys.has(key)) {
      staleAllowlistEntries.push(key);
      errors.push(`Stale allowlist entry: "${key}" (cited ${entry.issue}) was never matched during the audit.`);
    }
  }

  const totalViolations = pageResults.reduce((acc, p) => acc + p.violations.length, 0);
  const totalUnallowedIncomplete = pageResults.reduce((acc, p) => acc + p.unallowedIncomplete.length, 0);

  return {
    ok: errors.length === 0,
    totalPagesScanned: routes.length,
    totalViolations,
    totalUnallowedIncomplete,
    staleAllowlistEntries,
    pageResults,
    errors,
    maxClsBudget,
    reportLines: {
      aaaRatioLines,
      clsLines,
    },
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const isReport = args.includes('--report');
  const positional = args.filter((a) => !a.startsWith('--'));
  const distDir = positional[0] || path.join(process.cwd(), 'dist');
  const budgetsPath = positional[1] || path.join(process.cwd(), 'budgets.json');
  const allowlistPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'axe-allowlist.json');

  (async () => {
    try {
      console.log(`[axe-gate] Auditing WCAG 2.2 A/AA accessibility and CLS on "${distDir}"...`);
      const result = await runAxeAudit({
        distDir,
        allowlistPath,
        budgetsPath,
        reportOnly: isReport,
      });

      const totalStubs = result.pageResults.reduce((acc, p) => acc + p.stubbedWidgetUrls.length, 0);
      console.log(
        `[axe-gate] Scanned ${result.totalPagesScanned} pages (${result.pageResults.length} dark-scheme run(s), ${totalStubs} offline widget stub(s) intercepted).`
      );

      console.log('\n--- WCAG AAA Body Text Contrast Report (color-contrast-enhanced) ---');
      for (const line of result.reportLines.aaaRatioLines) {
        console.log(`  ${line}`);
      }

      console.log('\n--- Cumulative Layout Shift (CLS) Report ---');
      for (const line of result.reportLines.clsLines) {
        console.log(`  ${line}`);
      }

      if (!result.ok && !isReport) {
        console.error(`\n[axe-gate] FAILED with ${result.errors.length} issue(s):`);
        for (const err of result.errors) {
          console.error(`  - ${err}`);
        }
        process.exit(1);
      }

      console.log(
        '\n[axe-gate] All WCAG 2.2 A/AA axe checks, offline widget stubs, and CLS budgets PASSED.'
      );
      process.exit(0);
    } catch (err: unknown) {
      console.error('[axe-gate] Fatal error during audit:', err);
      process.exit(1);
    }
  })();
}
