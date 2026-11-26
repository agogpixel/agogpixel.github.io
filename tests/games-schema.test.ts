import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_SLUG_REGEX,
  ITCH_EMBED_HEIGHT,
  ITCH_EMBED_ORIGIN,
  ITCH_EMBED_WIDTH,
  MAX_GAME_SLUG_LENGTH,
  STEAM_WIDGET_HEIGHT,
  STEAM_WIDGET_ORIGIN,
  STEAM_WIDGET_WIDTH,
  buildItchEmbedUrl,
  buildSteamStoreUrl,
  buildSteamWidgetUrl,
  createGameSchema,
  filterPublishedGames,
  gameSchema,
  validateGameCatalog,
} from '../src/lib/games-schema.ts';
import {
  fixtureGames,
  getCatalogGames,
  getPublishedCatalogGames,
  isFixturesEnabled,
  productionGames,
} from '../src/data/games.ts';

test('widget dimension and origin constants match storefront embed specs', () => {
  assert.equal(ITCH_EMBED_ORIGIN, 'https://itch.io');
  assert.equal(STEAM_WIDGET_ORIGIN, 'https://store.steampowered.com');
  assert.equal(ITCH_EMBED_WIDTH, 552);
  assert.equal(ITCH_EMBED_HEIGHT, 167);
  assert.equal(STEAM_WIDGET_WIDTH, 646);
  assert.equal(STEAM_WIDGET_HEIGHT, 190);
  assert.match('escape-from-cygnus-x-1', GAME_SLUG_REGEX);
});

test('gameSchema accepts valid kebab-case slugs and rejects malformed or oversized slugs', () => {
  assert.doesNotThrow(() =>
    gameSchema.parse({
      slug: 'escape-from-cygnus-x-1',
      title: 'Escape From Cygnus X-1',
      description: 'Valid slug.',
      draft: true,
    })
  );
  assert.doesNotThrow(() =>
    gameSchema.parse({
      slug: 'demo-2',
      title: 'Demo 2',
      description: 'Valid alphanumeric slug.',
      draft: true,
    })
  );

  const invalid = [
    '',
    'Escape-From-Cygnus',
    'escape_from_cygnus',
    'escape--cygnus',
    '-escape',
    'escape-',
    'escape!',
    'a'.repeat(MAX_GAME_SLUG_LENGTH + 1),
  ];

  for (const bad of invalid) {
    assert.throws(
      () =>
        gameSchema.parse({
          slug: bad,
          title: 'Test Game',
          description: 'Invalid slug test.',
          draft: true,
        }),
      (err: unknown) => err instanceof Error && err.name === 'ZodError'
    );
  }
});

test('validateGameCatalog accepts distinct slugs and rejects duplicate slugs', () => {
  const valid = validateGameCatalog([
    {
      slug: 'escape-from-cygnus-x-1',
      title: 'Game One',
      description: 'First.',
      draft: true,
    },
    {
      slug: 'second-game',
      title: 'Game Two',
      description: 'Second.',
      draft: true,
    },
  ]);
  assert.equal(valid.length, 2);

  assert.throws(
    () =>
      validateGameCatalog([
        {
          slug: 'escape-from-cygnus-x-1',
          title: 'Game One',
          description: 'First.',
          draft: true,
        },
        {
          slug: 'escape-from-cygnus-x-1',
          title: 'Game Two',
          description: 'Duplicate.',
          draft: true,
        },
      ]),
    (err: unknown) =>
      err instanceof Error &&
      err.name === 'ZodError' &&
      err.message.includes("Duplicate game slug 'escape-from-cygnus-x-1'")
  );
});

test('gameSchema accepts draft entries without embed IDs and published entries with itch or steam IDs', () => {
  const draftGame = gameSchema.parse({
    slug: 'escape-from-cygnus-x-1',
    title: 'Escape From Cygnus X-1',
    description: 'Upcoming space-arcade action shooter.',
    draft: true,
  });
  assert.equal(draftGame.draft, true);
  assert.equal(draftGame.itchEmbedId, undefined);
  assert.equal(draftGame.steamAppId, undefined);

  const itchOnly = gameSchema.parse({
    slug: 'itch-only-game',
    title: 'Itch Only Game',
    description: 'Published on itch.io.',
    itchEmbedId: 123456,
  });
  assert.equal(itchOnly.draft, false);
  assert.equal(itchOnly.itchEmbedId, 123456);

  const steamOnly = gameSchema.parse({
    slug: 'steam-only-game',
    title: 'Steam Only Game',
    description: 'Published on Steam.',
    draft: false,
    steamAppId: 654321,
  });
  assert.equal(steamOnly.draft, false);
  assert.equal(steamOnly.steamAppId, 654321);

  const dualStore = gameSchema.parse({
    slug: 'dual-store-game',
    title: 'Dual Store Game',
    description: 'Published on itch.io and Steam.',
    draft: false,
    itchEmbedId: 123456,
    steamAppId: 654321,
    itchUrl: 'https://agogpixel.itch.io/dual-store-game',
  });
  assert.equal(dualStore.itchEmbedId, 123456);
  assert.equal(dualStore.steamAppId, 654321);
  assert.equal(dualStore.itchUrl, 'https://agogpixel.itch.io/dual-store-game');
});

test('gameSchema enforces published entries require numeric itchEmbedId or steamAppId', () => {
  const schema = createGameSchema();

  assert.throws(
    () =>
      schema.parse({
        slug: 'published-without-embed',
        title: 'Published Without Embed',
        description: 'Missing storefront ID.',
        draft: false,
      }),
    (err: unknown) =>
      err instanceof Error &&
      err.name === 'ZodError' &&
      err.message.includes('Published games require at least one numeric itchEmbedId or steamAppId')
  );

  // Also fails when draft is omitted (defaults to false)
  assert.throws(
    () =>
      schema.parse({
        slug: 'default-published-without-embed',
        title: 'Default Published',
        description: 'Missing storefront ID when draft omitted.',
      }),
    (err: unknown) =>
      err instanceof Error &&
      err.name === 'ZodError' &&
      err.message.includes('Published games require at least one numeric itchEmbedId or steamAppId')
  );
});

test('gameSchema rejects non-numeric, non-positive, or float storefront IDs', () => {
  const badIds: unknown[] = [0, -10, 12.5, Number.NaN, '12345', 'https://itch.io/embed/123'];

  for (const badId of badIds) {
    assert.throws(
      () =>
        gameSchema.parse({
          slug: 'bad-itch-id',
          title: 'Bad Itch ID',
          description: 'Invalid itchEmbedId test.',
          draft: false,
          itchEmbedId: badId,
        }),
      (err: unknown) => err instanceof Error && err.name === 'ZodError'
    );

    assert.throws(
      () =>
        gameSchema.parse({
          slug: 'bad-steam-id',
          title: 'Bad Steam ID',
          description: 'Invalid steamAppId test.',
          draft: false,
          steamAppId: badId,
        }),
      (err: unknown) => err instanceof Error && err.name === 'ZodError'
    );
  }
});

test('gameSchema rejects empty fields, non-https itchUrl, and extraneous keys', () => {
  assert.throws(
    () =>
      gameSchema.parse({
        slug: 'empty-title',
        title: '   ',
        description: 'Valid description.',
        draft: true,
      }),
    (err: unknown) =>
      err instanceof Error &&
      err.name === 'ZodError' &&
      err.message.includes('Title cannot be empty')
  );

  assert.throws(
    () =>
      gameSchema.parse({
        slug: 'empty-description',
        title: 'Valid Title',
        description: '   ',
        draft: true,
      }),
    (err: unknown) =>
      err instanceof Error &&
      err.name === 'ZodError' &&
      err.message.includes('Description cannot be empty')
  );

  assert.throws(
    () =>
      gameSchema.parse({
        slug: 'http-itch-url',
        title: 'HTTP URL',
        description: 'Should require https.',
        draft: false,
        itchEmbedId: 100,
        itchUrl: 'http://agogpixel.itch.io/demo',
      }),
    (err: unknown) =>
      err instanceof Error &&
      err.name === 'ZodError' &&
      err.message.includes('URL must be a valid https:// URL')
  );

  assert.throws(
    () =>
      gameSchema.parse({
        slug: 'invalid-itch-url',
        title: 'Invalid URL',
        description: 'Should reject malformed URL.',
        draft: false,
        itchEmbedId: 100,
        itchUrl: 'not-a-url',
      }),
    (err: unknown) =>
      err instanceof Error &&
      err.name === 'ZodError' &&
      err.message.includes('URL must be a valid https:// URL')
  );

  for (const nonItchUrl of [
    'https://evil.com/game',
    'https://itch.io/embed/100',
    'https://itch.io.evil.com/game',
    'https://evil-itch.io/game',
    'https://user:pass@agogpixel.itch.io/game',
    'https://agogpixel.itch.io:8443/game',
  ]) {
    assert.throws(
      () =>
        gameSchema.parse({
          slug: 'non-itch-host',
          title: 'Non-Itch Host',
          description: 'Should pin itchUrl to https://*.itch.io/.',
          draft: false,
          itchEmbedId: 100,
          itchUrl: nonItchUrl,
        }),
      (err: unknown) =>
        err instanceof Error &&
        err.name === 'ZodError' &&
        err.message.includes('itchUrl must be an https://*.itch.io/ URL')
    );
  }

  assert.throws(
    () =>
      gameSchema.parse({
        slug: 'extra-field',
        title: 'Extra Field',
        description: 'Should fail .strict().',
        draft: true,
        unexpectedKey: 'forbidden',
      }),
    (err: unknown) =>
      err instanceof Error &&
      err.name === 'ZodError' &&
      err.message.includes('Unrecognized key')
  );
});

test('validateGameCatalog rejects duplicate slugs and invalid entries', () => {
  assert.throws(
    () =>
      validateGameCatalog([
        {
          slug: 'escape-from-cygnus-x-1',
          title: 'Game One',
          description: 'First.',
          draft: true,
        },
        {
          slug: 'escape-from-cygnus-x-1',
          title: 'Game Two',
          description: 'Duplicate slug.',
          draft: true,
        },
      ]),
    (err: unknown) =>
      err instanceof Error &&
      err.name === 'ZodError' &&
      err.message.includes("Duplicate game slug 'escape-from-cygnus-x-1'")
  );
});

test('storefront URL builders produce canonical HTTPS URLs and reject invalid IDs', () => {
  const itchUrl = new URL(buildItchEmbedUrl(9999001));
  assert.equal(itchUrl.origin, ITCH_EMBED_ORIGIN);
  assert.equal(itchUrl.pathname, '/embed/9999001');

  const steamWidgetUrl = new URL(buildSteamWidgetUrl(9999002));
  assert.equal(steamWidgetUrl.origin, STEAM_WIDGET_ORIGIN);
  assert.equal(steamWidgetUrl.pathname, '/widget/9999002/');

  const steamStoreUrl = new URL(buildSteamStoreUrl(9999002));
  assert.equal(steamStoreUrl.origin, STEAM_WIDGET_ORIGIN);
  assert.equal(steamStoreUrl.pathname, '/app/9999002/');

  assert.throws(() => buildItchEmbedUrl(0), (err: unknown) => err instanceof Error && err.name === 'ZodError');
  assert.throws(() => buildSteamWidgetUrl(-1), (err: unknown) => err instanceof Error && err.name === 'ZodError');
  assert.throws(() => buildSteamStoreUrl(1.5), (err: unknown) => err instanceof Error && err.name === 'ZodError');
});

test('production catalog stages Escape From Cygnus X-1 as draft and renders 0 live cards', () => {
  assert.equal(isFixturesEnabled({}), false);
  assert.equal(isFixturesEnabled({ SITE_FIXTURES: '0' }), false);
  assert.equal(isFixturesEnabled({ SITE_FIXTURES: '1' }), true);

  const prodAll = getCatalogGames({});
  assert.equal(prodAll.length, 1);
  assert.equal(prodAll[0].slug, 'escape-from-cygnus-x-1');
  assert.equal(prodAll[0].title, 'Escape From Cygnus X-1');
  assert.equal(prodAll[0].draft, true);

  const prodPublished = getPublishedCatalogGames({});
  assert.deepEqual(prodPublished, []);

  // Validate both raw catalog arrays cleanly
  const validatedProd = validateGameCatalog(productionGames);
  const validatedFixtures = validateGameCatalog(fixtureGames);
  assert.equal(filterPublishedGames(validatedProd).length, 0);
  assert.equal(filterPublishedGames(validatedFixtures).length, 1);
});

test('SITE_FIXTURES=1 injects a published fixture entry with both itch.io and Steam IDs', () => {
  const fixtureAll = getCatalogGames({ SITE_FIXTURES: '1' });
  assert.equal(fixtureAll.length, 2);

  const fixturePublished = getPublishedCatalogGames({ SITE_FIXTURES: '1' });
  assert.equal(fixturePublished.length, 1);
  assert.equal(fixturePublished[0].draft, false);
  assert.equal(typeof fixturePublished[0].itchEmbedId, 'number');
  assert.equal(typeof fixturePublished[0].steamAppId, 'number');
  assert.ok(fixturePublished[0].itchEmbedId! > 0);
  assert.ok(fixturePublished[0].steamAppId! > 0);
});
