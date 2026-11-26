import { z } from 'astro/zod';

export const GAME_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_GAME_SLUG_LENGTH = 60;

export const ITCH_EMBED_ORIGIN = 'https://itch.io';
export const STEAM_WIDGET_ORIGIN = 'https://store.steampowered.com';

export const ITCH_EMBED_WIDTH = 552;
export const ITCH_EMBED_HEIGHT = 167;
export const STEAM_WIDGET_WIDTH = 646;
export const STEAM_WIDGET_HEIGHT = 190;

export const positiveIntIdSchema = z
  .number({ message: 'Storefront ID must be a positive integer' })
  .int('Storefront ID must be an integer')
  .positive('Storefront ID must be a positive integer')
  .refine((val) => Number.isSafeInteger(val), 'Storefront ID must be a safe integer');

export const httpsUrlSchema = z
  .string()
  .trim()
  .refine((val) => {
    try {
      const parsed = new URL(val);
      return parsed.protocol === 'https:' && parsed.hostname.length > 0;
    } catch {
      return false;
    }
  }, 'URL must be a valid https:// URL');

export const gameBaseSchema = z
  .object({
    slug: z
      .string()
      .min(1, 'Slug cannot be empty')
      .max(MAX_GAME_SLUG_LENGTH, `Slug cannot exceed ${MAX_GAME_SLUG_LENGTH} characters`)
      .regex(
        GAME_SLUG_REGEX,
        'Slug must be kebab-case matching ^[a-z0-9]+(-[a-z0-9]+)*$'
      ),
    title: z.string().trim().min(1, 'Title cannot be empty'),
    description: z.string().trim().min(1, 'Description cannot be empty'),
    draft: z.boolean().default(false),
    itchEmbedId: positiveIntIdSchema.optional(),
    steamAppId: positiveIntIdSchema.optional(),
    itchUrl: httpsUrlSchema.optional(),
  })
  .strict();

/**
 * Enforces that published (draft !== true) entries carry at least one numeric storefront embed ID.
 */
export function refineGame(
  data: {
    draft?: boolean;
    itchEmbedId?: number;
    steamAppId?: number;
  },
  ctx: z.RefinementCtx
): void {
  const isDraft = data.draft === true;

  if (!isDraft && data.itchEmbedId === undefined && data.steamAppId === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'Published games require at least one numeric itchEmbedId or steamAppId',
      path: ['itchEmbedId'],
    });
  }
}

export function createGameSchema() {
  return gameBaseSchema.superRefine(refineGame);
}

export const gameSchema = createGameSchema();

export type GameCatalogInput = z.input<typeof gameSchema>;
export type GameCatalogEntry = z.infer<typeof gameSchema>;

export const gameCatalogSchema = z.array(gameSchema).superRefine((entries, ctx) => {
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (seen.has(entry.slug)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate game slug '${entry.slug}'`,
        path: [index, 'slug'],
      });
    }
    seen.add(entry.slug);
  });
});

/**
 * Validates an array of raw game catalog entries, enforcing per-entry schema and unique slugs.
 */
export function validateGameCatalog(entries: readonly unknown[]): GameCatalogEntry[] {
  return gameCatalogSchema.parse(entries);
}

/**
 * Filters validated catalog entries down to published titles (draft !== true).
 */
export function filterPublishedGames(
  entries: readonly GameCatalogEntry[]
): GameCatalogEntry[] {
  return entries.filter((entry) => entry.draft !== true);
}

/**
 * Builds an itch.io embed iframe URL themed to match Deep Cosmos tokens.
 */
export function buildItchEmbedUrl(itchEmbedId: number): string {
  const id = positiveIntIdSchema.parse(itchEmbedId);
  return `${ITCH_EMBED_ORIGIN}/embed/${id}?bg_color=0a0a0a&fg_color=eeeeee&link_color=4cc9f0&border_color=2b2b2b`;
}

/**
 * Builds a Steam store widget iframe URL for a numeric Steam App ID.
 */
export function buildSteamWidgetUrl(steamAppId: number): string {
  const id = positiveIntIdSchema.parse(steamAppId);
  return `${STEAM_WIDGET_ORIGIN}/widget/${id}/`;
}

/**
 * Builds a canonical Steam storefront page URL for a numeric Steam App ID.
 */
export function buildSteamStoreUrl(steamAppId: number): string {
  const id = positiveIntIdSchema.parse(steamAppId);
  return `${STEAM_WIDGET_ORIGIN}/app/${id}/`;
}
