import process from 'node:process';
import {
  filterPublishedGames,
  validateGameCatalog,
  type GameCatalogEntry,
  type GameCatalogInput,
} from '../lib/games-schema.ts';

/**
 * Production game catalog.
 *
 * Flagship title *Escape From Cygnus X-1* is staged as `draft: true` until
 * its public storefront embed ID is issued.
 */
export const productionGames: readonly GameCatalogInput[] = [
  {
    slug: 'escape-from-cygnus-x-1',
    title: 'Escape From Cygnus X-1',
    description:
      'High-intensity 2D space-arcade action shooter forged in the event horizon of Cygnus X-1. Web demo launching soon.',
    draft: true,
  },
];

/**
 * Deterministic storefront fixture entry injected only when SITE_FIXTURES=1
 * to exercise itch.io and Steam widget rendering in offline CI gates.
 */
export const fixtureGames: readonly GameCatalogInput[] = [
  {
    slug: 'fixture-cygnus-x-1-showcase',
    title: 'Escape From Cygnus X-1 (Fixture Preview)',
    description:
      'Fixture storefront entry exercising lazy-loaded itch.io and Steam embed frames for offline verification.',
    draft: false,
    itchEmbedId: 9999001,
    steamAppId: 9999002,
    itchUrl: 'https://agogpixel.itch.io/escape-from-cygnus-x-1',
  },
];

export function isFixturesEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return env.SITE_FIXTURES === '1';
}

/**
 * Returns the Zod-validated game catalog for the active build environment.
 */
export function getCatalogGames(
  env: Readonly<Record<string, string | undefined>> = process.env
): GameCatalogEntry[] {
  const entries = isFixturesEnabled(env)
    ? [...productionGames, ...fixtureGames]
    : [...productionGames];

  return validateGameCatalog(entries);
}

/**
 * Returns validated, non-draft games eligible to render on the landing page.
 */
export function getPublishedCatalogGames(
  env: Readonly<Record<string, string | undefined>> = process.env
): GameCatalogEntry[] {
  return filterPublishedGames(getCatalogGames(env));
}
