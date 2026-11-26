import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface IntegrityLintResult {
  ok: boolean;
  errors: string[];
}

const EXACT_SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function getFontsourcePackages(pkg: Record<string, unknown>): string[] {
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  const allDeps = { ...deps, ...devDeps };
  return Object.keys(allDeps).filter((dep) => dep.startsWith('@fontsource'));
}

/**
 * Verifies every dependency and devDependency uses an exact semver pin (no ^, ~, ranges, git URIs).
 */
export function lintExactDependencyPins(packageJsonPath: string): string[] {
  const errors: string[] = [];
  if (!fs.existsSync(packageJsonPath)) {
    return [`package.json not found at ${packageJsonPath}`];
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  for (const section of ['dependencies', 'devDependencies'] as const) {
    const entries = pkg[section] ?? {};
    for (const [name, spec] of Object.entries(entries)) {
      if (typeof spec !== 'string' || !EXACT_SEMVER_REGEX.test(spec)) {
        errors.push(
          `Dependency "${name}" in ${section} must use an exact semver pin (no ^, ~, ranges, or URIs). Found: "${String(spec)}".`
        );
      }
    }
  }

  return errors;
}

/**
 * Verifies every @fontsource* package, OFL license link, and Paul Tol scheme is attributed on /credits/.
 */
export function lintCreditsCompleteness(
  packageJsonPath: string,
  creditsAstroPath: string
): string[] {
  const errors: string[] = [];

  if (!fs.existsSync(packageJsonPath)) {
    return [`package.json not found at ${packageJsonPath}`];
  }
  if (!fs.existsSync(creditsAstroPath)) {
    return [`credits.astro not found at ${creditsAstroPath}`];
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>;
  const creditsContent = fs.readFileSync(creditsAstroPath, 'utf8');
  const lowerCredits = creditsContent.toLowerCase();

  const fontsourceDeps = getFontsourcePackages(pkg);
  if (fontsourceDeps.length === 0) {
    errors.push('No @fontsource* font packages declared in package.json.');
  }

  for (const dep of fontsourceDeps) {
    const pkgSlug = dep.replace(/^@fontsource(-variable)?\//, '');
    const cleanFontName = pkgSlug.replace(/-/g, ' ');

    const mentionsSlug = lowerCredits.includes(pkgSlug.toLowerCase());
    const mentionsName = lowerCredits.includes(cleanFontName.toLowerCase());

    if (!mentionsSlug && !mentionsName) {
      errors.push(
        `Font dependency "${dep}" is not attributed in ${creditsAstroPath}. Every @fontsource* package must appear in /credits/.`
      );
    }
  }

  if (!creditsContent.includes('/credits/OFL.txt')) {
    errors.push(`${creditsAstroPath} must link to local /credits/OFL.txt.`);
  }

  if (!lowerCredits.includes('sil open font license') && !lowerCredits.includes('ofl-1.1')) {
    errors.push(`${creditsAstroPath} must state SIL Open Font License (OFL-1.1).`);
  }

  if (!lowerCredits.includes('paul tol')) {
    errors.push(`${creditsAstroPath} must credit Paul Tol's color schemes.`);
  }

  return errors;
}

/**
 * Verifies public/credits/OFL.txt attribution and 1:1 parity between theme.css @font-face URLs
 * and public/fonts/*.woff2 files.
 */
export function lintOflAndFontParity(rootDir: string): string[] {
  const errors: string[] = [];
  const packageJsonPath = path.join(rootDir, 'package.json');
  const oflPath = path.join(rootDir, 'public/credits/OFL.txt');
  const fontsDir = path.join(rootDir, 'public/fonts');
  const themeCssPath = path.join(rootDir, 'src/styles/theme.css');

  if (!fs.existsSync(oflPath)) {
    errors.push(`OFL license file missing at ${oflPath}.`);
  } else {
    const oflContent = fs.readFileSync(oflPath, 'utf8');
    const lowerOfl = oflContent.toLowerCase();
    if (!oflContent.includes('SIL OPEN FONT LICENSE Version 1.1')) {
      errors.push(`${oflPath} does not contain the SIL OPEN FONT LICENSE Version 1.1 text.`);
    }

    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>;
      for (const dep of getFontsourcePackages(pkg)) {
        const pkgSlug = dep.replace(/^@fontsource(-variable)?\//, '');
        const cleanFontName = pkgSlug.replace(/-/g, ' ').toLowerCase();
        if (!lowerOfl.includes(pkgSlug.toLowerCase()) && !lowerOfl.includes(cleanFontName)) {
          errors.push(
            `${oflPath} is missing copyright attribution for font dependency "${dep}".`
          );
        }
      }
    }
  }

  if (!fs.existsSync(fontsDir)) {
    errors.push(`Self-hosted fonts directory missing at ${fontsDir}.`);
    return errors;
  }

  const diskWoff2 = new Set(
    fs
      .readdirSync(fontsDir)
      .filter((f) => f.endsWith('.woff2'))
      .sort()
  );

  if (diskWoff2.size === 0) {
    errors.push(`No .woff2 font files found in ${fontsDir}.`);
  }

  if (!fs.existsSync(themeCssPath)) {
    errors.push(`Theme stylesheet missing at ${themeCssPath}.`);
    return errors;
  }

  const themeCss = fs.readFileSync(themeCssPath, 'utf8');
  const referencedWoff2 = new Set<string>();
  const fontUrlRegex = /url\(\s*['"]?\/fonts\/([^)'"\s]+\.woff2)['"]?\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = fontUrlRegex.exec(themeCss)) !== null) {
    const fileName = match[1];
    referencedWoff2.add(fileName);
    if (!diskWoff2.has(fileName)) {
      errors.push(
        `theme.css references "/fonts/${fileName}", which does not exist in ${fontsDir}.`
      );
    }
  }

  for (const fileName of diskWoff2) {
    if (!referencedWoff2.has(fileName)) {
      errors.push(
        `Font file "${fileName}" in ${fontsDir} is not referenced by any @font-face in theme.css (orphaned font asset).`
      );
    }
  }

  return errors;
}

export function runIntegrityLints(rootDir: string): IntegrityLintResult {
  const errors: string[] = [];
  const packageJsonPath = path.join(rootDir, 'package.json');
  const creditsPath = path.join(rootDir, 'src/pages/credits.astro');

  errors.push(...lintExactDependencyPins(packageJsonPath));
  errors.push(...lintCreditsCompleteness(packageJsonPath, creditsPath));
  errors.push(...lintOflAndFontParity(rootDir));

  return {
    ok: errors.length === 0,
    errors,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const rootDir = process.argv[2] || process.cwd();
  const result = runIntegrityLints(rootDir);
  if (!result.ok) {
    console.error('Integrity Lints FAILED:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log('Integrity Lints PASSED (dependency pins, OFL attribution, font parity, and credits verified).');
}
