import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkFiles } from './shared.ts';

export { walkFiles };

export interface CssLintResult {
  ok: boolean;
  errors: string[];
  themeChecksPassed: boolean;
  siteCssChecksPassed: boolean;
}

export interface CssDeclarationContext {
  line: number;
  mediaContext: string[];
  selector: string;
  prop: string;
  value: string;
}

const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/i;
const FUNCTIONAL_COLOR_REGEX = /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\s*\(/i;

export const CSS_NAMED_COLORS_LIST = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure',
  'beige', 'bisque', 'black', 'blanchedalmond', 'blue',
  'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson',
  'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray',
  'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen',
  'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet',
  'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue',
  'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
  'ghostwhite', 'gold', 'goldenrod', 'gray', 'green',
  'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred',
  'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush',
  'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink',
  'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey',
  'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen',
  'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid',
  'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
  'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin',
  'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab',
  'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen',
  'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru',
  'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
  'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon',
  'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver',
  'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow',
  'springgreen', 'steelblue', 'tan', 'teal', 'thistle',
  'tomato', 'turquoise', 'violet', 'wheat', 'white',
  'whitesmoke', 'yellow', 'yellowgreen',
] as const;

const NAMED_COLOR_REGEX = new RegExp('\\b(?:' + CSS_NAMED_COLORS_LIST.join('|') + ')\\b', 'i');

/**
 * Strips CSS comments while preserving newline counts so line numbers remain exact.
 */
function stripCssCommentsPreserveLines(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (match) => '\n'.repeat(match.split('\n').length - 1));
}

/**
 * Parses declarations from CSS text while preserving block selector and @media context.
 */
export function parseCssDeclarations(cssContent: string): CssDeclarationContext[] {
  const clean = stripCssCommentsPreserveLines(cssContent);
  const results: CssDeclarationContext[] = [];
  const stack: string[] = [];

  let buf = '';
  let bufStartLine = 1;
  let currentLine = 1;
  let inSingle = false;
  let inDouble = false;
  let parenDepth = 0;

  const flushDeclaration = (rawDecl: string, lineNum: number) => {
    const trimmed = rawDecl.trim();
    if (!trimmed) return;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) return;

    const prop = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const value = trimmed.slice(colonIdx + 1).trim();
    const selector = stack.length > 0 ? stack[stack.length - 1] : '';
    const mediaContext = stack.filter((s) => s.startsWith('@media'));

    results.push({
      line: lineNum,
      mediaContext,
      selector,
      prop,
      value,
    });
  };

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const prev = i > 0 ? clean[i - 1] : '';

    if (ch === '\n') {
      currentLine++;
    }

    if (inSingle) {
      buf += ch;
      if (ch === "'" && prev !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      buf += ch;
      if (ch === '"' && prev !== '\\') inDouble = false;
      continue;
    }

    if (ch === "'") {
      if (!buf.trim()) bufStartLine = currentLine;
      inSingle = true;
      buf += ch;
      continue;
    }
    if (ch === '"') {
      if (!buf.trim()) bufStartLine = currentLine;
      inDouble = true;
      buf += ch;
      continue;
    }

    if (ch === '(') {
      if (!buf.trim()) bufStartLine = currentLine;
      parenDepth++;
      buf += ch;
      continue;
    }
    if (ch === ')' && parenDepth > 0) {
      parenDepth--;
      buf += ch;
      continue;
    }

    if (parenDepth === 0 && ch === '{') {
      stack.push(buf.trim());
      buf = '';
      bufStartLine = currentLine;
      continue;
    }

    if (parenDepth === 0 && ch === '}') {
      flushDeclaration(buf, bufStartLine);
      stack.pop();
      buf = '';
      bufStartLine = currentLine;
      continue;
    }

    if (parenDepth === 0 && ch === ';') {
      flushDeclaration(buf, bufStartLine);
      buf = '';
      bufStartLine = currentLine;
      continue;
    }

    if (!buf.trim() && ch.trim()) {
      bufStartLine = currentLine;
    }
    buf += ch;
  }

  return results;
}

function lintDeclaration(
  decl: CssDeclarationContext,
  fileName: string,
  options: { allowPrintRootOverrides?: boolean; allowRootTokenDefinitions?: boolean } = {}
): string[] {
  const errors: string[] = [];
  const { prop, value, selector, mediaContext, line } = decl;

  // Always check focus outline suppression unless targeting non-focus-visible programmatic target
  if (prop === 'outline' || prop === 'outline-style' || prop === 'outline-width') {
    if (/\b(?:none|0)\b/i.test(value)) {
      const isPermittedProgrammaticFocusReset =
        prop === 'outline-width' &&
        value === '0' &&
        selector.includes(':not(:focus-visible)');
      if (!isPermittedProgrammaticFocusReset) {
        errors.push(
          `${fileName}:${line} contains forbidden focus outline suppression "${prop}: ${value}". Do not suppress focus outlines.`
        );
      }
    }
  }

  // Always check fixed px font-size
  if (prop === 'font-size' && /\b\d+(?:\.\d+)?px\b/i.test(value)) {
    errors.push(
      `${fileName}:${line} contains fixed px font-size "${prop}: ${value}". Must use scalable units (rem, em, %, clamp).`
    );
  }

  // Font-family and font-face descriptors are not color properties
  if (
    prop === 'font-family' ||
    prop === 'font' ||
    selector === '@font-face' ||
    prop === 'color-scheme'
  ) {
    return errors;
  }

  // Allow :root/--ap-* token definitions in theme.css
  const isRootSelector = selector === ':root' || selector === 'html';
  if (options.allowRootTokenDefinitions && isRootSelector && prop.startsWith('--ap-')) {
    return errors;
  }

  // Allow @media print :root --ap-* high-contrast print token overrides in site.css
  const isPrintMedia = mediaContext.some((m) => /^@media\b[\s\S]*\bprint\b/i.test(m));
  if (options.allowPrintRootOverrides && isPrintMedia && isRootSelector && prop.startsWith('--ap-')) {
    return errors;
  }

  const hexMatch = HEX_COLOR_REGEX.exec(value);
  if (hexMatch) {
    errors.push(
      `${fileName}:${line} contains raw hex color literal "${hexMatch[0]}". Must use --ap-* tokens.`
    );
  }

  const funcMatch = FUNCTIONAL_COLOR_REGEX.exec(value);
  if (funcMatch) {
    errors.push(
      `${fileName}:${line} contains raw functional color "${funcMatch[0]}". Must use --ap-* tokens.`
    );
  }

  const valueWithoutTokens = value.replace(/var\(--ap-[^)]+\)/g, '').replace(/"[^"]*"|'[^']*'/g, '');
  const namedMatch = NAMED_COLOR_REGEX.exec(valueWithoutTokens);
  if (namedMatch) {
    errors.push(
      `${fileName}:${line} contains raw named color "${namedMatch[0]}". Must use --ap-* tokens.`
    );
  }

  return errors;
}

/**
 * Lints arbitrary CSS (e.g. Astro <style> blocks or inline fragments) for raw color literals,
 * focus outline suppression, and fixed px font-size.
 */
export function lintColourLiterals(cssContent: string, fileName: string): string[] {
  const errors: string[] = [];
  const wrapped = cssContent.includes('{') ? cssContent : `:root { ${cssContent} }`;
  const declarations = parseCssDeclarations(wrapped);

  for (const decl of declarations) {
    errors.push(...lintDeclaration(decl, fileName));
  }

  return errors;
}

/**
 * Lints site.css permitting @media print :root --ap-* overrides while disallowing
 * raw colors everywhere else (and on non-token properties inside @media print).
 */
export function lintSiteCss(siteCssContent: string, fileName = 'site.css'): string[] {
  const errors: string[] = [];
  const declarations = parseCssDeclarations(siteCssContent);

  for (const decl of declarations) {
    errors.push(
      ...lintDeclaration(decl, fileName, {
        allowPrintRootOverrides: true,
      })
    );
  }

  return errors;
}

/**
 * Lints theme.css ensuring only @font-face (local fallback or /fonts/*.woff2), @import,
 * and :root/html declarations restricted to color-scheme and --ap-* tokens.
 */
export function lintThemeCss(themeCssContent: string): string[] {
  const errors: string[] = [];
  const clean = stripCssCommentsPreserveLines(themeCssContent).trim();

  const blockRegex = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(clean)) !== null) {
    const selector = match[1].trim();
    const body = match[2].trim();

    if (selector === '@font-face') {
      const isMetricFallback =
        /ascent-override|descent-override|line-gap-override|size-adjust/i.test(body) &&
        /src\s*:\s*local\(/i.test(body);
      const isLocalFontFace = /src\s*:\s*url\(['"]?\/fonts\/[a-z0-9_-]+\.woff2['"]?\)/i.test(body);

      if (!isMetricFallback && !isLocalFontFace) {
        errors.push(
          `Invalid @font-face in theme.css: must reference local /fonts/*.woff2 or metric-override fallback with src: local(...). Body: ${body}`
        );
      }
    } else if (selector === ':root' || selector === 'html') {
      const declarations = body
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean);
      for (const decl of declarations) {
        const colonIdx = decl.indexOf(':');
        if (colonIdx === -1) {
          errors.push(`Invalid CSS declaration in ${selector}: "${decl}"`);
          continue;
        }
        const prop = decl.slice(0, colonIdx).trim();
        if (!prop.startsWith('--ap-') && prop !== 'color-scheme') {
          errors.push(
            `Forbidden property "${prop}" in theme.css ${selector}. Only "--ap-*" tokens and "color-scheme" are permitted.`
          );
        }
      }
    } else {
      errors.push(
        `Forbidden selector "${selector}" in theme.css. theme.css must only contain @font-face, @import, or :root/html --ap-* token definitions.`
      );
    }
  }

  const nonBlock = clean.replace(blockRegex, '').trim();
  if (nonBlock) {
    const statements = nonBlock
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      if (!stmt.startsWith('@import')) {
        errors.push(`Forbidden top-level statement in theme.css: "${stmt}"`);
      }
    }
  }

  const decls = parseCssDeclarations(themeCssContent);
  for (const decl of decls) {
    errors.push(
      ...lintDeclaration(decl, 'theme.css', {
        allowRootTokenDefinitions: true,
      })
    );
  }

  return errors;
}

export function extractAstroStyles(astroContent: string): { css: string; startLine: number }[] {
  const blocks: { css: string; startLine: number }[] = [];
  const styleRegex = /<style(?:\s+[^>]*)?>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;

  while ((match = styleRegex.exec(astroContent)) !== null) {
    const preMatch = astroContent.slice(0, match.index);
    const startLine = preMatch.split('\n').length;
    blocks.push({
      css: match[1],
      startLine,
    });
  }

  return blocks;
}

export function lintAstroContent(astroContent: string, fileName: string): string[] {
  const errors: string[] = [];
  const blocks = extractAstroStyles(astroContent);

  for (const block of blocks) {
    errors.push(...lintColourLiterals(block.css, `${fileName} (style line ${block.startLine})`));
  }

  const styleAttrRegex = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = styleAttrRegex.exec(astroContent)) !== null) {
    const val = match[1] ?? match[2] ?? '';
    const lineNum = astroContent.slice(0, match.index).split('\n').length;
    errors.push(...lintColourLiterals(val, `${fileName} (inline style line ${lineNum})`));
  }

  return errors;
}

export function extractTsCssLiterals(tsContent: string): { content: string; startLine: number }[] {
  const literals: { content: string; startLine: number }[] = [];
  const CSS_PROPERTY_OR_ATTR_PATTERN = /\b(?:color|background|background-color|fill|stroke|border|border-color)\s*[:=]/i;

  const templateRegex = /`([\s\S]*?)`/g;
  let match: RegExpExecArray | null;
  while ((match = templateRegex.exec(tsContent)) !== null) {
    const raw = match[1];
    if (CSS_PROPERTY_OR_ATTR_PATTERN.test(raw)) {
      const startLine = tsContent.slice(0, match.index).split('\n').length;
      literals.push({ content: raw, startLine });
    }
  }

  const stringRegex = /(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)')/g;
  while ((match = stringRegex.exec(tsContent)) !== null) {
    const raw = match[1] ?? match[2] ?? '';
    if (CSS_PROPERTY_OR_ATTR_PATTERN.test(raw)) {
      const startLine = tsContent.slice(0, match.index).split('\n').length;
      literals.push({ content: raw, startLine });
    }
  }

  return literals;
}

export function lintTsScriptContent(tsContent: string, fileName: string): string[] {
  const errors: string[] = [];
  const literals = extractTsCssLiterals(tsContent);

  for (const lit of literals) {
    const normalized = lit.content
      .replace(/\b([a-zA-Z-]+)\s*=\s*(["'])(.*?)\2/g, '\n$1: $3;\n')
      .replace(/;/g, ';\n');
    errors.push(...lintColourLiterals(normalized, `${fileName} (line ${lit.startLine})`));
  }

  return errors;
}

export function lintAstroFiles(srcDir: string): string[] {
  const errors: string[] = [];
  for (const file of walkFiles(srcDir, '.astro')) {
    const content = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(process.cwd(), file);
    errors.push(...lintAstroContent(content, relPath));
  }
  return errors;
}

export function lintTsScriptFiles(scriptsDir: string): string[] {
  const errors: string[] = [];
  for (const file of walkFiles(scriptsDir, '.ts')) {
    const content = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(process.cwd(), file);
    errors.push(...lintTsScriptContent(content, relPath));
  }
  return errors;
}

export function runCssLints(srcStylesDir: string, projectRoot?: string): CssLintResult {
  const errors: string[] = [];

  const themeCssPath = path.join(srcStylesDir, 'theme.css');
  const siteCssPath = path.join(srcStylesDir, 'site.css');

  let themeChecksPassed = false;
  if (fs.existsSync(themeCssPath)) {
    const themeContent = fs.readFileSync(themeCssPath, 'utf8');
    const themeErrors = lintThemeCss(themeContent);
    errors.push(...themeErrors);
    themeChecksPassed = themeErrors.length === 0;
  } else {
    errors.push(`File not found: ${themeCssPath}`);
  }

  let siteCssChecksPassed = false;
  if (fs.existsSync(siteCssPath)) {
    const siteContent = fs.readFileSync(siteCssPath, 'utf8');
    const siteErrors = lintSiteCss(siteContent, 'site.css');
    errors.push(...siteErrors);
    siteCssChecksPassed = siteErrors.length === 0;
  } else {
    errors.push(`File not found: ${siteCssPath}`);
  }

  // Any other .css files under srcStylesDir must pass strict raw-color lints
  if (fs.existsSync(srcStylesDir)) {
    for (const cssFile of walkFiles(srcStylesDir, '.css')) {
      const base = path.basename(cssFile);
      if (base === 'theme.css' || base === 'site.css') continue;
      const rel = path.relative(process.cwd(), cssFile);
      errors.push(...lintColourLiterals(fs.readFileSync(cssFile, 'utf8'), rel));
    }
  }

  const resolvedSrcDir = projectRoot
    ? path.join(projectRoot, 'src')
    : path.resolve(srcStylesDir, '..');

  if (fs.existsSync(resolvedSrcDir)) {
    errors.push(...lintAstroFiles(resolvedSrcDir));
    const scriptsDir = path.join(resolvedSrcDir, 'scripts');
    if (fs.existsSync(scriptsDir)) {
      errors.push(...lintTsScriptFiles(scriptsDir));
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    themeChecksPassed,
    siteCssChecksPassed,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const stylesDir = process.argv[2] || path.resolve(process.cwd(), 'src/styles');
  const result = runCssLints(stylesDir);
  if (!result.ok) {
    console.error('CSS Lints FAILED:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log('CSS Lints PASSED (theme.css, site.css, and .astro styles verified).');
}
