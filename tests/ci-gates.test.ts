import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkContrastPairs, calculateContrastRatio } from '../scripts/gates/contrast-pairs.ts';
import { checkZeroJs } from '../scripts/gates/zero-js.ts';
import {
  buildCatalogIframeAllowlist,
  checkOrigins,
  isAllowedStorefrontIframe,
  isNonSameOrigin,
} from '../scripts/gates/origins.ts';
import { checkLinksAndAnchors } from '../scripts/gates/links.ts';
import { checkCanonicalAndSitemap } from '../scripts/gates/canonical-sitemap.ts';
import { checkBudgets, getPageType } from '../scripts/gates/budgets.ts';
import { validateDiagnosticsLogs } from '../scripts/gates/diagnostics.ts';
import {
  isStorefrontWidgetStubUrl,
  resolveMaxClsBudget,
  runAxeAudit,
  startDistServer,
} from '../scripts/gates/axe.ts';
import { lintColourLiterals, lintSiteCss, lintThemeCss, runCssLints } from '../scripts/gates/css-lint.ts';
import {
  lintCreditsCompleteness,
  lintExactDependencyPins,
  lintOflAndFontParity,
  runIntegrityLints,
} from '../scripts/gates/integrity-lint.ts';
import { getPublishedCatalogGames } from '../src/data/games.ts';

function makeTempDir(t: test.TestContext, prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function sendRawHttpRequest(
  port: number,
  rawTarget: string
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.write(`GET ${rawTarget} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
    });
    const chunks: Buffer[] = [];
    socket.on('data', (chunk) => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    socket.on('error', reject);
    socket.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const sepIdx = raw.indexOf('\r\n\r\n');
      const head = sepIdx === -1 ? raw : raw.slice(0, sepIdx);
      const body = sepIdx === -1 ? '' : raw.slice(sepIdx + 4);
      const statusLine = head.split('\r\n')[0] || '';
      const statusCode = Number.parseInt(statusLine.split(' ')[1] || '0', 10);
      resolve({ statusCode, body });
    });
  });
}

test('contrast-pairs: passes all --ap-* dark tokens and flags substandard contrast', () => {
  const themePath = path.join(process.cwd(), 'src', 'styles', 'theme.css');
  const res = checkContrastPairs(themePath);
  assert.equal(res.ok, true);
  assert.equal(res.errors.length, 0);
  assert.ok(res.results.every((r) => r.scheme === 'dark' && r.ratio >= 4.5));

  const bad = checkContrastPairs(themePath, [
    { name: 'Substandard Surface', fgToken: '--ap-border-subtle', bgToken: '--ap-bg', minRatio: 4.5 },
  ]);
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /Contrast failure/);
  assert.ok(calculateContrastRatio('#eeeeee', '#030303') > 17);
});

test('zero-js: rejects <script> tags and .js files in dist', (t) => {
  const tmpDir = makeTempDir(t, 'ap-zero-js-');
  fs.writeFileSync(path.join(tmpDir, 'index.html'), '<!doctype html><html><body>OK</body></html>');
  assert.equal(checkZeroJs(tmpDir).ok, true);

  fs.writeFileSync(
    path.join(tmpDir, 'index.html'),
    '<!doctype html><html><head><script>alert(1)</script></head><body></body></html>'
  );
  const scriptRes = checkZeroJs(tmpDir);
  assert.equal(scriptRes.ok, false);
  assert.match(scriptRes.errors[0], /Forbidden <script> tag/);

  fs.writeFileSync(path.join(tmpDir, 'index.html'), '<!doctype html><html><body>OK</body></html>');
  fs.writeFileSync(path.join(tmpDir, 'bundle.js'), 'console.log(1);');
  const fileRes = checkZeroJs(tmpDir);
  assert.equal(fileRes.ok, false);
  assert.match(fileRes.errors[0], /Forbidden client JavaScript file/);
});

test('origins: enforces 0 external origins in prod and manifest-scoped widget iframes in fixture mode', (t) => {
  const tmpDir = makeTempDir(t, 'ap-origins-');
  const prodGrants = buildCatalogIframeAllowlist(getPublishedCatalogGames({}));
  assert.equal(prodGrants.length, 0);

  const fixtureGrants = buildCatalogIframeAllowlist(getPublishedCatalogGames({ SITE_FIXTURES: '1' }));
  assert.equal(fixtureGrants.length, 2);

  // Fixture HTML matching GameEmbedCard output (including &amp; HTML entity encoding)
  fs.writeFileSync(
    path.join(tmpDir, 'index.html'),
    `<!doctype html><html><body>
      <iframe src="https://itch.io/embed/9999001?bg_color=0a0a0a&amp;fg_color=eeeeee&amp;link_color=4cc9f0&amp;border_color=2b2b2b"></iframe>
      <iframe src="https://store.steampowered.com/widget/9999002/"></iframe>
      <a href="https://example.com" rel="external">Outbound link ignored</a>
    </body></html>`
  );

  // Prod grants (0 published) must reject the iframes
  const prodCheck = checkOrigins(tmpDir, prodGrants);
  assert.equal(prodCheck.ok, false);
  assert.equal(prodCheck.errors.length, 2);

  // Fixture grants must allow the exact two storefront iframes on /
  const fixCheck = checkOrigins(tmpDir, fixtureGrants);
  assert.equal(fixCheck.ok, true);
  assert.equal(fixCheck.externalIframesAllowed, 2);

  // Unauthorized origin or non-iframe tag fails even with fixture grants
  assert.equal(isNonSameOrigin('https://agogpixel.com/assets/logo.png').isExternal, false);
  assert.equal(isAllowedStorefrontIframe('https://itch.io/games/foo', '/', fixtureGrants), false);
  assert.equal(isAllowedStorefrontIframe('https://itch.io/embed/9999001?bg_color=0a0a0a&fg_color=eeeeee&link_color=4cc9f0&border_color=2b2b2b', '/credits/', fixtureGrants), false);

  fs.writeFileSync(
    path.join(tmpDir, 'index.html'),
    '<!doctype html><html><body><img src="https://itch.io/embed/9999001" alt=""></body></html>'
  );
  const nonIframeCheck = checkOrigins(tmpDir, fixtureGrants);
  assert.equal(nonIframeCheck.ok, false);
  assert.match(nonIframeCheck.errors[0], /Unauthorized third-party origin/);
});

test('links & canonical-sitemap & budgets: validate agogpixel.com structure and fail on violations', (t) => {
  const tmpDir = makeTempDir(t, 'ap-dist-');
  fs.mkdirSync(path.join(tmpDir, 'credits'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'fonts'), { recursive: true });

  fs.writeFileSync(
    path.join(tmpDir, 'index.html'),
    '<!doctype html><html><head><link rel="canonical" href="https://agogpixel.com/"></head><body><main id="main"><a href="/credits/">Credits</a><a href="#main">Top</a></main></body></html>'
  );
  fs.writeFileSync(
    path.join(tmpDir, 'credits', 'index.html'),
    '<!doctype html><html><head><link rel="canonical" href="https://agogpixel.com/credits/"></head><body><a href="/">Home</a></body></html>'
  );
  fs.writeFileSync(
    path.join(tmpDir, '404.html'),
    '<!doctype html><html><head><meta name="robots" content="noindex"></head><body><a href="/">Home</a></body></html>'
  );
  fs.writeFileSync(
    path.join(tmpDir, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://agogpixel.com/</loc></url><url><loc>https://agogpixel.com/credits/</loc></url></urlset>'
  );
  fs.writeFileSync(path.join(tmpDir, 'fonts', 'test.woff2'), Buffer.alloc(100));

  const budgetsFile = path.join(tmpDir, 'budgets.json');
  fs.writeFileSync(
    budgetsFile,
    JSON.stringify({
      pageBudgets: {
        index: { measuredCompressedBytes: 100, maxCompressedBytes: 2000 },
        credits: { measuredCompressedBytes: 100, maxCompressedBytes: 2000 },
        notFound: { measuredCompressedBytes: 100, maxCompressedBytes: 2000 },
      },
      assetBudgets: {
        totalWoff2Bytes: { measuredBytes: 100, maxBytes: 1000 },
        totalJsGzipBytes: { measuredBytes: 0, maxBytes: 0 },
      },
    })
  );

  assert.equal(checkLinksAndAnchors(tmpDir).ok, true);
  assert.equal(checkCanonicalAndSitemap(tmpDir).ok, true);
  assert.equal(checkBudgets(tmpDir, budgetsFile).ok, true);
  assert.equal(getPageType('index.html'), 'index');
  assert.equal(getPageType('credits/index.html'), 'credits');
  assert.equal(getPageType('404.html'), 'notFound');

  // Unbudgeted HTML page fails fail-closed
  fs.writeFileSync(path.join(tmpDir, 'extra.html'), '<!doctype html><html><body>Extra</body></html>');
  assert.equal(checkBudgets(tmpDir, budgetsFile).ok, false);
});

test('diagnostics: rejects [ERROR], unallowlisted [WARN], and stale entries', () => {
  assert.equal(validateDiagnosticsLogs(['11:24:37 [build] Complete!'], []).ok, true);
  assert.equal(validateDiagnosticsLogs(['[ERROR] build crashed'], []).ok, false);
  assert.equal(validateDiagnosticsLogs(['[WARN] unexpected warning'], []).ok, false);
  assert.equal(
    validateDiagnosticsLogs(['[build] Complete!'], [{ pattern: 'never-fires', issue: '#23' }]).ok,
    false
  );
});

test('axe: widget stub matcher, CLS budget resolver, and offline stubbing audit work without network', async (t) => {
  assert.equal(isStorefrontWidgetStubUrl('https://itch.io/embed/9999001?bg_color=0a0a0a'), true);
  assert.equal(isStorefrontWidgetStubUrl('https://store.steampowered.com/widget/9999002/'), true);
  assert.equal(isStorefrontWidgetStubUrl('https://example.com/script.js'), false);

  const tmpDir = makeTempDir(t, 'ap-axe-');
  fs.writeFileSync(
    path.join(tmpDir, 'index.html'),
    `<!doctype html><html lang="en"><head><title>Test</title><style>html,body{background:#030303;color:#eeeeee;}</style></head><body><main><h1>Agogpixel</h1><iframe title="Itch Embed" width="552" height="167" src="https://itch.io/embed/9999001?bg_color=0a0a0a"></iframe></main></body></html>`
  );

  const budgetsFile = path.join(tmpDir, 'budgets.json');
  fs.writeFileSync(budgetsFile, JSON.stringify({ performanceBudgets: { maxCls: { max: 0.05 } } }));
  assert.equal(resolveMaxClsBudget(budgetsFile), 0.05);

  const res = await runAxeAudit({ distDir: tmpDir, budgetsPath: budgetsFile });
  assert.equal(res.ok, true, `Axe errors: ${res.errors.join('; ')}`);
  assert.equal(res.pageResults.length, 1);
  assert.equal(res.pageResults[0].stubbedWidgetUrls.length, 1);
});

test('css-lint: passes live styles, allows @media print :root overrides, and rejects raw colors elsewhere', () => {
  const stylesDir = path.join(process.cwd(), 'src', 'styles');
  const liveRes = runCssLints(stylesDir);
  assert.equal(liveRes.ok, true, `Live CSS lint errors: ${liveRes.errors.join('; ')}`);

  const validPrintSite = `
    .card { color: var(--ap-color); }
    @media print {
      :root {
        color-scheme: light;
        --ap-bg: #ffffff;
        --ap-color: #000000;
      }
    }
  `;
  assert.deepEqual(lintSiteCss(validPrintSite), []);

  const invalidPrintSite = `
    @media print {
      .card { color: #000000; }
    }
    .badge { background: rgb(1, 2, 3); color: crimson; font-size: 14px; }
    button:focus { outline: none; }
  `;
  const errs = lintSiteCss(invalidPrintSite);
  assert.equal(errs.length, 5);
  assert.equal(lintThemeCss('.bad { color: red; }').length > 0, true);
  assert.equal(lintColourLiterals('.x { color: var(--ap-color); }', 'x.css').length, 0);
});

test('integrity-lint: passes repo checks and rejects unpinned deps or missing OFL attribution', (t) => {
  const live = runIntegrityLints(process.cwd());
  assert.equal(live.ok, true, `Integrity errors: ${live.errors.join('; ')}`);

  const tmpDir = makeTempDir(t, 'ap-integrity-');
  const badPkg = path.join(tmpDir, 'package.json');
  fs.writeFileSync(
    badPkg,
    JSON.stringify({
      dependencies: { '@fontsource-variable/inter': '^5.3.0' },
      devDependencies: { yaml: '2.9.1' },
    })
  );
  const pinErrs = lintExactDependencyPins(badPkg);
  assert.equal(pinErrs.length, 1);
  assert.match(pinErrs[0], /exact semver pin/);

  const badCredits = path.join(tmpDir, 'credits.astro');
  fs.writeFileSync(badCredits, '<p>Nothing here</p>');
  const creditErrs = lintCreditsCompleteness(badPkg, badCredits);
  assert.equal(creditErrs.length, 4);

  assert.equal(lintOflAndFontParity(tmpDir).length > 0, true);
});

test('ci-local.ps1: passes AST parse and enforces fail-closed -CI flag validation', () => {
  const scriptPath = path.join(process.cwd(), 'scripts', 'ci-local.ps1');
  const content = fs.readFileSync(scriptPath, 'utf8');
  for (const key of [
    'gate0_workflow_contract',
    'gate1_action_pins_and_leaks',
    'gate2_pwsh_ast',
    'gate3_typecheck_contrast_and_unit',
    'gate4_prod_build_and_structural',
    'gate5_fixture_axe_and_budgets',
    'gate6_lints_and_negative',
  ]) {
    assert.match(content, new RegExp(`["']${key}["']\\s*=`));
  }

  assert.match(content, /Set-StrictMode\s+-Version\s+Latest/);

  const pwshCheck = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-CI', '-Quick'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (!pwshCheck.error) {
    assert.equal(pwshCheck.status, 1);
    assert.match(`${pwshCheck.stdout}\n${pwshCheck.stderr}`, /CI mode is fail-closed/);
  }

  const ghEnvCheck = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Quick'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: 'true' },
  });
  if (!ghEnvCheck.error) {
    assert.equal(ghEnvCheck.status, 1);
    assert.match(`${ghEnvCheck.stdout}\n${ghEnvCheck.stderr}`, /CI mode is fail-closed/);
  }
});

test('axe server: enforces strict directory jail and rejects path traversal and malformed percent encoding', async (t) => {
  const rootParent = makeTempDir(t, 'ap-server-jail-');
  const distDir = path.join(rootParent, 'dist');
  const siblingDir = path.join(rootParent, 'dist-sibling');
  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(siblingDir, { recursive: true });

  fs.writeFileSync(path.join(rootParent, '.env'), 'SECRET_TOKEN=do-not-leak');
  fs.writeFileSync(path.join(siblingDir, 'leak.txt'), 'sibling-secret');
  fs.writeFileSync(path.join(distDir, 'index.html'), '<h1>OK</h1>');
  fs.writeFileSync(path.join(distDir, 'about.html'), '<h1>About</h1>');

  const { server, port } = await startDistServer(distDir);
  try {
    const okRes = await sendRawHttpRequest(port, '/');
    assert.equal(okRes.statusCode, 200);
    assert.match(okRes.body, /<h1>OK<\/h1>/);

    const htmlFallbackRes = await sendRawHttpRequest(port, '/about');
    assert.equal(htmlFallbackRes.statusCode, 200);
    assert.match(htmlFallbackRes.body, /<h1>About<\/h1>/);

    for (const traversalTarget of [
      '/../.env',
      '/..%5c.env',
      '/%2e%2e/.env',
      '/../dist-sibling/leak.txt',
      '/..',
    ]) {
      const res = await sendRawHttpRequest(port, traversalTarget);
      assert.equal(res.statusCode, 403, `Expected 403 for traversal target "${traversalTarget}", got ${res.statusCode}`);
    }

    for (const badEncodingTarget of ['/%ZZ', '/%E0%A4%A', '/.%00.html']) {
      const res = await sendRawHttpRequest(port, badEncodingTarget);
      assert.equal(res.statusCode, 400, `Expected 400 for malformed target "${badEncodingTarget}", got ${res.statusCode}`);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('zero-js, links, and origins: reject javascript:, vbscript:, and active data: URI payloads', (t) => {
  const tmpDir = makeTempDir(t, 'ap-xss-schemes-');
  const prodGrants = buildCatalogIframeAllowlist(getPublishedCatalogGames({}));

  // 1. <a href="javascript:..."> and entity-obfuscated / vbscript: / data:text/html links
  fs.writeFileSync(
    path.join(tmpDir, 'index.html'),
    `<!doctype html><html><body>
      <a href="javascript:alert(1)">Play</a>
      <a href="&#106;avascript:alert(2)">Obfuscated</a>
      <a href="vbscript:msgbox(1)">VB</a>
      <a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgzKTwvc2NyaXB0Pg==">DataHTML</a>
    </body></html>`
  );

  const zeroJsLinkRes = checkZeroJs(tmpDir);
  assert.equal(zeroJsLinkRes.ok, false);
  assert.equal(zeroJsLinkRes.errors.length, 4);
  assert.ok(zeroJsLinkRes.errors.some((e) => e.includes('"javascript:"')));
  assert.ok(zeroJsLinkRes.errors.some((e) => e.includes('"vbscript:"')));
  assert.ok(zeroJsLinkRes.errors.some((e) => e.includes('"data:text/html"')));

  const linkRes = checkLinksAndAnchors(tmpDir);
  assert.equal(linkRes.ok, false);
  assert.equal(linkRes.errors.length, 4);
  assert.match(linkRes.errors[0], /Forbidden executable URI scheme/);

  // 2. <iframe src="javascript:..."> and <iframe src="data:text/html;base64,...">
  fs.writeFileSync(
    path.join(tmpDir, 'index.html'),
    `<!doctype html><html><body>
      <iframe src="javascript:alert(1)"></iframe>
      <iframe src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="></iframe>
    </body></html>`
  );

  const zeroJsIframeRes = checkZeroJs(tmpDir);
  assert.equal(zeroJsIframeRes.ok, false);
  assert.equal(zeroJsIframeRes.errors.length, 2);
  assert.ok(zeroJsIframeRes.errors.some((e) => e.includes('"javascript:"')));
  assert.ok(zeroJsIframeRes.errors.some((e) => e.includes('"data:text/html"')));

  const originIframeRes = checkOrigins(tmpDir, prodGrants);
  assert.equal(originIframeRes.ok, false);
  assert.equal(originIframeRes.errors.length, 2);
  assert.match(originIframeRes.errors[0], /Forbidden URI scheme/);

  // 3. Direct isNonSameOrigin unit assertions and benign data:image/png allowance
  assert.deepEqual(isNonSameOrigin('javascript:alert(1)'), { isExternal: true, origin: 'javascript:' });
  assert.deepEqual(isNonSameOrigin('vbscript:msgbox(1)'), { isExternal: true, origin: 'vbscript:' });
  assert.deepEqual(isNonSameOrigin('data:text/html,<script>alert(1)</script>'), {
    isExternal: true,
    origin: 'data:text/html',
  });
  assert.deepEqual(isNonSameOrigin('data:image/png;base64,iVBORw0KGgo='), { isExternal: false });

  fs.writeFileSync(
    path.join(tmpDir, 'index.html'),
    '<!doctype html><html><body><img src="data:image/png;base64,iVBORw0KGgo=" alt=""></body></html>'
  );
  assert.equal(checkZeroJs(tmpDir).ok, true);
  assert.equal(checkOrigins(tmpDir, prodGrants).ok, true);
});
