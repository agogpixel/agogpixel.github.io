import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectForbiddenUriScheme,
  extractAttributeUrls,
  scanHtmlTags,
  validateMetaCsp,
  walkFiles,
} from './shared.ts';

export interface ZeroJsResult {
  ok: boolean;
  errors: string[];
  htmlFilesChecked: number;
}

const EVENT_HANDLER_ATTR_REGEX = /^on[a-z]+$/i;

export function routeFromHtmlPath(htmlRelativePath: string): string {
  let normalized = htmlRelativePath.replace(/\\/g, '/');
  if (normalized.endsWith('index.html')) {
    normalized = normalized.slice(0, -'index.html'.length);
  } else if (normalized.endsWith('.html')) {
    normalized = normalized.slice(0, -'.html'.length);
  }
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  if (!normalized.endsWith('/') && !normalized.includes('.')) {
    normalized = normalized + '/';
  }
  return normalized;
}

/**
 * Enforces zero client-side JavaScript (no <script>, no on*= handlers, no srcdoc,
 * no executable URI schemes, strict meta CSP) across built HTML routes and zero .js/.mjs assets in dist/.
 */
export function checkZeroJs(
  distDir: string,
  allowedJsRoutes: ReadonlySet<string> = new Set()
): ZeroJsResult {
  const errors: string[] = [];
  let htmlFilesChecked = 0;

  if (!fs.existsSync(distDir)) {
    return {
      ok: false,
      errors: [`distDir does not exist: ${distDir}`],
      htmlFilesChecked: 0,
    };
  }

  const allJsFiles: string[] = [];

  for (const fullPath of walkFiles(distDir)) {
    const relPath = path.relative(distDir, fullPath).replace(/\\/g, '/');

    if (relPath.endsWith('.js') || relPath.endsWith('.mjs')) {
      if (!relPath.startsWith('.prerender/')) {
        allJsFiles.push(relPath);
      }
      continue;
    }

    if (!relPath.endsWith('.html')) {
      continue;
    }

    htmlFilesChecked++;
    const route = routeFromHtmlPath(relPath);
    const content = fs.readFileSync(fullPath, 'utf8');

    if (allowedJsRoutes.has(route)) {
      continue;
    }

    if (/<script\b/i.test(content)) {
      errors.push(
        `Forbidden <script> tag found in HTML route "${route}" (${relPath}). Site enforces zero client-side JavaScript.`
      );
    }

    const tags = scanHtmlTags(content);
    for (const tag of tags) {
      for (const attr of tag.attributes) {
        if (EVENT_HANDLER_ATTR_REGEX.test(attr.name)) {
          errors.push(
            `Forbidden inline event handler attribute "${attr.rawName}" on <${tag.tagName}> in HTML route "${route}" (${relPath}). Site enforces zero client-side JavaScript.`
          );
          continue;
        }

        if (attr.name === 'srcdoc') {
          errors.push(
            `Forbidden "srcdoc" attribute on <${tag.tagName}> in HTML route "${route}" (${relPath}). Site enforces zero client-side JavaScript.`
          );
          continue;
        }

        const urls = extractAttributeUrls(attr.name, attr.value, tag.tagName);
        for (const candidate of urls) {
          const forbiddenScheme = detectForbiddenUriScheme(candidate);
          if (forbiddenScheme) {
            errors.push(
              `Forbidden executable URI scheme "${forbiddenScheme}" in ${attr.name} on HTML route "${route}" (${relPath}). Site enforces zero client-side JavaScript.`
            );
          }
        }
      }
    }

    const cspResult = validateMetaCsp(content);
    for (const cspErr of cspResult.errors) {
      errors.push(`${cspErr} Route "${route}" (${relPath}).`);
    }
  }

  for (const jsFile of allJsFiles) {
    errors.push(`Forbidden client JavaScript file in dist: ${jsFile}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    htmlFilesChecked,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const distDir = process.argv[2] || path.resolve(process.cwd(), 'dist');
  const result = checkZeroJs(distDir);
  if (!result.ok) {
    console.error('Zero-JS Gate FAILED:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log(`Zero-JS Gate PASSED (${result.htmlFilesChecked} HTML files checked).`);
}
