import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectForbiddenUriScheme } from './shared.ts';

export interface ZeroJsResult {
  ok: boolean;
  errors: string[];
  htmlFilesChecked: number;
}

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
 * Enforces zero client-side JavaScript across all built HTML routes and zero .js/.mjs assets in dist/.
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

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const relPath = path.relative(distDir, fullPath).replace(/\\/g, '/');

        if (relPath.endsWith('.js') || relPath.endsWith('.mjs')) {
          if (!relPath.startsWith('.prerender/')) {
            allJsFiles.push(relPath);
          }
        }

        if (relPath.endsWith('.html')) {
          htmlFilesChecked++;
          const route = routeFromHtmlPath(relPath);
          const content = fs.readFileSync(fullPath, 'utf8');

          if (!allowedJsRoutes.has(route)) {
            if (/<script\b/i.test(content)) {
              errors.push(
                `Forbidden <script> tag found in HTML route "${route}" (${relPath}). Site enforces zero client-side JavaScript.`
              );
            }

            const htmlWithoutComments = content.replace(/<!--[\s\S]*?-->/g, '');
            const tagRegex = /<[a-zA-Z][a-zA-Z0-9:-]*\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
            let tagMatch: RegExpExecArray | null;
            while ((tagMatch = tagRegex.exec(htmlWithoutComments)) !== null) {
              const attrs = tagMatch[1];
              const attrRegex =
                /\b(href|src|action|formaction|data|poster|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
              let attrMatch: RegExpExecArray | null;
              while ((attrMatch = attrRegex.exec(attrs)) !== null) {
                const attrName = attrMatch[1].toLowerCase();
                const rawVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
                const candidates =
                  attrName === 'srcset'
                    ? rawVal.split(',').map((part) => part.trim().split(/\s+/)[0])
                    : [rawVal];

                for (const candidate of candidates) {
                  if (!candidate) continue;
                  const forbiddenScheme = detectForbiddenUriScheme(candidate);
                  if (forbiddenScheme) {
                    errors.push(
                      `Forbidden executable URI scheme "${forbiddenScheme}" in ${attrName} on HTML route "${route}" (${relPath}). Site enforces zero client-side JavaScript.`
                    );
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  walk(distDir);

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
