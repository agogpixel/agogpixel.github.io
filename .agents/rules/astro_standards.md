---
description: Astro v5, Tailwind CSS, and MDX development standards for Agogpixel Web & Devlog Hub
globs: ["**/*"]
---

# Web & Devlog Hub Standards

## Tech Stack
- **Framework**: Astro v5 (Content Collections, static output).
- **Styling**: Tailwind CSS with dark-mode cosmos aesthetic tokens.
- **Content**: MDX devlogs for *"Building an A- Studio in Public"*.

## Studio Brand Color Palette (Option A Calibrated Ramp)
All web styles and Tailwind tokens must conform strictly to Option A specifications (calibrated per Paul Tol color science and `kidthales.com` minimalist architecture):
- **Deep Cosmos Black**: `#030303` (Primary web canvas `--ap-bg`)
- **Cosmos Surfaces**: `#0A0A0A` (`cosmos-900`), `#141414` (`cosmos-800`), `#1F1F1F` (`cosmos-700`), `#2B2B2B` (`cosmos-600` structural dividers)
- **Hull Charcoal**: `#4E4E4E` (`brand.charcoal`, interactive rules, `<hr>`, `<blockquote>` border)
- **Lunar Grey**: `#A6A6A6` (`brand.lunar`, muted metadata, subtitles, dates, AAA `8.47:1`)
- **Starlight White**: `#EEEEEE` (`brand.starlight`, body copy, headings, AAA `17.78:1`)
- **Porthole Cyan**: `#4CC9F0` (`brand.cyan`, primary links, active navigation, AAA `10.72:1`) / `#163A47` (`brand.cyan-dark`, selection & subtle border)
- **Thruster Amber**: `#C97320` (`brand.amber`, outer plume, button borders)
- **Ignition Amber (UI)**: `#F09235` (`brand.amber-ui`, calibrated AAA `8.71:1` text & secondary links, $\Delta L^* = 16.9$ deuteranopia separation vs. Scarlet) / `#3D240C` (`brand.amber-dark`, callout background)
- **Rocket Scarlet**: `#E63946` (`brand.scarlet`, fins/combat badges) / `#EE5566` (`brand.scarlet-ui`, calibrated alert text) / `#421419` (`brand.scarlet-dark`, alert surface)

## Anti-Trope & Web UI Guardrails
1. **Zero Cool-Grey (`slate-*`) Contamination**: Never mix Tailwind's blue-tinted `slate-*` utility classes with `#030303` Cosmos Black. Secondary text and structural borders must use `brand-lunar` (`#A6A6A6`), `brand-charcoal` (`#4E4E4E`), and `cosmos-600` (`#2B2B2B`).
2. **No Ambient Blur Blobs or Radial Glow Hazes**: Do not place `blur-[100px]` neon orbs or fixed radial-gradient color hazes over `#030303` Cosmos Black.
3. **No Pulsing Status Pills for Static Copy**: Do not wrap static headlines or studio mottos in rounded-full pill badges with `animate-pulse` dots. Use semantic `<hgroup>` elements with uppercase monospace eyebrow labels (`[ An A- Studio ]`).
4. **No Glassmorphism or Neon Drop-Shadow Buttons**: Avoid `backdrop-blur-md` sticky navbars, `shadow-brand-cyan/*` glowing icon boxes, and `hover:-translate-y-0.5` card lifts. Separate landmarks with crisp `1px solid` (`0.0625rem`) borders, `0.25rem` (`4px`) border-radius, and zero box-shadow buttons.
5. **Bracketed Terminal Navigation (`[Link]`)**: Frame header navigation items with monospace square brackets (`[Devlogs]`) via CSS pseudo-elements (`header nav ul li:not(.brand-item)::before { content: '['; }`).
6. **Mascot Asset Usage**: Use `rocket_guinea_pig_animated.svg` for hero focal points (`>=160px`), and `pixel/rocket_guinea_pig_pixel.svg` or `favicon.svg` (never downscaled raster PNGs) for `20px`–`32px` header/footer emblems.

## Viewport & Layout Scrolling Standards
- **Single-Viewport Fit (Landing Hero)**: For hero/jumbotron landing pages (`src/pages/index.astro`), the full layout (Header + Hero + Footer) must fit within `100vh` / `100dvh` without vertical scrolling on desktop (`scrollable={false}` default on `Layout.astro`, which applies `h-screen min-h-[100dvh]` with `md:overflow-y-hidden`).
- **Scrollable Content Pages**: Long-form and multi-card routes (`/devlogs`, `/devlogs/[...slug]`) MUST pass `scrollable={true}` to `<Layout scrollable={true}>` so `body` switches to `min-h-screen min-h-[100dvh] overflow-y-auto` and allows vertical scrolling on desktop.
- Keep footer padding compact (`py-4` max) and scale vector mascots proportionally.

## Mascot & Asset Synchronization
- Always use the latest vector animated mascot (`rocket_guinea_pig_animated.svg`) synced directly from `agogpixel-studio/docs/branding/assets/`.

## Content Collections, MDX Typography & RSS Pipeline
- Devlogs live in `src/content/devlog/` and are validated by `src/content/config.ts`.
- Mandatory frontmatter: `title`, `pubDate`, `track`, `tags`, `author`, `summary`.
- **UTC-Safe Date Formatting**: YAML `YYYY-MM-DD` dates parse as `00:00:00 UTC`. Always format `pubDate` with `timeZone: 'UTC'` in `toLocaleDateString()` so local/CI timezone offsets never shift displayed publication dates backward by one day.
- **Tailwind Typography**: `@tailwindcss/typography` must be registered in `tailwind.config.mjs` (`plugins: [typography]`) and styled on `<Content />` wrappers via `prose prose-invert`.
- **RSS 2.0 Feed**: `src/pages/rss.xml.ts` uses `@astrojs/rss` and `site: 'https://agogpixel.com'` in `astro.config.mjs` to pre-render `/rss.xml` with canonical `/devlogs/${post.slug}/` links.
- **Empty Collection & Astro 5 Data Store Cache**: In Astro 5, deleting the last `.md`/`.mdx` file in a collection causes `glob-loader` to return early before purging `node_modules/.astro/data-store.json`, resulting in `UnknownContentCollectionError` during `astro build`. Clear `node_modules/.astro` whenever emptying a collection locally.
- Static and public media assets must be placed in `public/assets/`. Do NOT store redundant copies in `src/assets/`.

## GitHub Pages Deployment Standard
- **Disable Legacy Jekyll**: GitHub Pages defaults to legacy branch builds which fail on `.astro` frontmatter (`YAML Exception: mapping values are not allowed in this context`).
- Always configure the repository with `build_type: "workflow"` via GitHub API:
  ```bash
  gh api -X PUT repos/agogpixel/agogpixel.github.io/pages -F build_type=workflow
  ```
- Deployment must run via `.github/workflows/deploy.yml` utilizing `actions/upload-pages-artifact@v3` and `actions/deploy-pages@v4`.

## Performance & Quality
- Target 100 Lighthouse score on desktop and mobile.
- Build test: Always run `npm run build` before opening a Pull Request.