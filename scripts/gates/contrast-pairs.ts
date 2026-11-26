import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TokenPair {
  name: string;
  fgToken: string;
  bgToken: string;
  minRatio: number;
}

export interface ResolvedPairResult {
  name: string;
  fgToken: string;
  bgToken: string;
  fgColor: string;
  bgColor: string;
  ratio: number;
  scheme: 'light' | 'dark';
  pass: boolean;
  minRatio: number;
}

export interface ContrastPairsGateResult {
  ok: boolean;
  results: ResolvedPairResult[];
  errors: string[];
}

/**
 * Standard Deep Cosmos --ap-* token pairs audited against WCAG 2.2 AA contrast thresholds.
 */
export const TOKEN_PAIRS: TokenPair[] = [
  { name: 'Default Body Text', fgToken: '--ap-color', bgToken: '--ap-bg', minRatio: 4.5 },
  { name: 'Muted Secondary Text', fgToken: '--ap-muted-color', bgToken: '--ap-bg', minRatio: 4.5 },
  { name: 'Card Body Text', fgToken: '--ap-color', bgToken: '--ap-surface', minRatio: 4.5 },
  { name: 'Card Muted Text', fgToken: '--ap-muted-color', bgToken: '--ap-surface', minRatio: 4.5 },
  { name: 'Subtle Surface Text', fgToken: '--ap-color', bgToken: '--ap-surface-subtle', minRatio: 4.5 },
  { name: 'Primary Link / Accent Text', fgToken: '--ap-primary', bgToken: '--ap-bg', minRatio: 4.5 },
  { name: 'Primary Link Hover', fgToken: '--ap-primary-hover', bgToken: '--ap-bg', minRatio: 4.5 },
  { name: 'Game Link Button Text', fgToken: '--ap-primary', bgToken: '--ap-surface-subtle', minRatio: 4.5 },
  { name: 'Game Link Button Hover', fgToken: '--ap-primary-hover', bgToken: '--ap-primary-bg', minRatio: 4.5 },
  { name: 'Selection Highlight Text', fgToken: '--ap-color', bgToken: '--ap-primary-bg', minRatio: 4.5 },
  { name: 'Secondary Motto / Heading', fgToken: '--ap-secondary', bgToken: '--ap-bg', minRatio: 4.5 },
  { name: 'Alert Text on Cosmos Bg', fgToken: '--ap-alert', bgToken: '--ap-bg', minRatio: 4.5 },
  { name: 'Alert Text on Alert Bg', fgToken: '--ap-color', bgToken: '--ap-alert-bg', minRatio: 4.5 },
];

/**
 * Parses hex colour into [r, g, b] (0..255). Supports #rgb and #rrggbb.
 */
export function parseHex(hex: string): [number, number, number] {
  let clean = hex.replace(/^#/, '').trim();
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Invalid hex color string: "${hex}"`);
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Calculates relative luminance according to WCAG 2.1/2.2 specification.
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const srgbToLinear = (c: number) => {
    const val = c / 255;
    return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  };
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/**
 * Calculates WCAG contrast ratio between two hex colours.
 */
export function calculateContrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = parseHex(hex1);
  const [r2, g2, b2] = parseHex(hex2);
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Resolves CSS custom property values (supporting both single-theme values and light-dark(...)).
 */
export function extractCssTokens(cssContent: string): Map<string, { light: string; dark: string }> {
  const tokens = new Map<string, { light: string; dark: string }>();
  const cleanCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');
  const propRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;

  while ((match = propRegex.exec(cleanCss)) !== null) {
    const name = match[1].trim();
    const value = match[2].trim();
    const ldMatch = /^light-dark\(\s*(.*?)\s*,\s*(.*?)\s*\)$/.exec(value);
    if (ldMatch) {
      tokens.set(name, { light: ldMatch[1].trim(), dark: ldMatch[2].trim() });
    } else {
      tokens.set(name, { light: value, dark: value });
    }
  }

  return tokens;
}

/**
 * Recursively resolves a token in a given color scheme to a raw hex color.
 */
export function resolveTokenHex(
  tokenOrValue: string,
  scheme: 'light' | 'dark',
  tokenMap: Map<string, { light: string; dark: string }>,
  depth = 0
): string {
  if (depth > 20) {
    throw new Error(`Circular or overly deep token reference while resolving "${tokenOrValue}"`);
  }

  let trimmed = tokenOrValue.trim();

  const varMatch = /^var\(\s*(--[a-zA-Z0-9_-]+)\s*\)$/.exec(trimmed);
  if (varMatch) {
    trimmed = varMatch[1];
  }

  if (trimmed.startsWith('--')) {
    const entry = tokenMap.get(trimmed);
    if (!entry) {
      throw new Error(`Token "${trimmed}" not found in token definitions`);
    }
    const target = scheme === 'light' ? entry.light : entry.dark;
    return resolveTokenHex(target, scheme, tokenMap, depth + 1);
  }

  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed;
  }

  throw new Error(`Unable to resolve "${trimmed}" to a hex color in ${scheme} scheme`);
}

/**
 * Audits --ap-* token pairs against src/styles/theme.css.
 * Defaults to single-scheme 'dark' because agogpixel.com is single-theme Deep Cosmos.
 */
export function checkContrastPairs(
  themeCssPath: string,
  pairs: TokenPair[] = TOKEN_PAIRS,
  schemes: readonly ('light' | 'dark')[] = ['dark']
): ContrastPairsGateResult {
  const results: ResolvedPairResult[] = [];
  const errors: string[] = [];

  if (!fs.existsSync(themeCssPath)) {
    return {
      ok: false,
      results,
      errors: [`Theme stylesheet not found: ${themeCssPath}`],
    };
  }

  const tokenMap = extractCssTokens(fs.readFileSync(themeCssPath, 'utf8'));

  for (const pair of pairs) {
    for (const scheme of schemes) {
      try {
        const fgHex = resolveTokenHex(pair.fgToken, scheme, tokenMap);
        const bgHex = resolveTokenHex(pair.bgToken, scheme, tokenMap);
        const ratio = calculateContrastRatio(fgHex, bgHex);
        const pass = ratio >= pair.minRatio;

        results.push({
          name: pair.name,
          fgToken: pair.fgToken,
          bgToken: pair.bgToken,
          fgColor: fgHex,
          bgColor: bgHex,
          ratio,
          scheme,
          pass,
          minRatio: pair.minRatio,
        });

        if (!pass) {
          errors.push(
            `Contrast failure: "${pair.name}" in ${scheme} scheme (${pair.fgToken} [${fgHex}] on ${pair.bgToken} [${bgHex}]) ratio ${ratio.toFixed(2)}:1 < ${pair.minRatio}:1 minimum.`
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Error evaluating "${pair.name}" in ${scheme} scheme: ${msg}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    results,
    errors,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const themePath = process.argv[2] || path.join(process.cwd(), 'src', 'styles', 'theme.css');

  console.log(`[contrast-pairs] Auditing ${TOKEN_PAIRS.length} --ap-* token pairs in dark cosmos scheme...`);
  const gateResult = checkContrastPairs(themePath);

  for (const res of gateResult.results) {
    const mark = res.pass ? '✓' : '✗';
    console.log(
      `  ${mark} [${res.scheme.toUpperCase()}] ${res.name.padEnd(28)}: ${res.fgColor} on ${res.bgColor} => ${res.ratio.toFixed(2)}:1 (min ${res.minRatio}:1)`
    );
  }

  if (!gateResult.ok) {
    console.error(`\n[contrast-pairs] FAILED with ${gateResult.errors.length} error(s):`);
    for (const err of gateResult.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`\n[contrast-pairs] All ${gateResult.results.length} token-pair checks PASSED.`);
}
