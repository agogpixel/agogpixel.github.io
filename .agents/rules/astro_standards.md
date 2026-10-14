---
description: Astro v5, Tailwind CSS, and MDX development standards for Agogpixel Web & Devlog Hub
globs: ["**/*"]
---

# Web & Devlog Hub Standards

## Tech Stack
- **Framework**: Astro v5 (Content Collections, static output).
- **Styling**: Tailwind CSS with dark-mode cosmos aesthetic tokens.
- **Content**: MDX devlogs for *"Building an A- Studio in Public"*.

## Studio Brand Color Palette
All web styles and Tailwind tokens must conform strictly to the studio brand specifications:
- **Deep Cosmos Black**: `#030303` (Primary web canvas)
- **Thruster Amber**: `#C97320` (Buttons, interactive highlights)
- **Porthole Cyan**: `#4CC9F0` (Glows, accents, active marks)
- **Rocket Scarlet**: `#E63946` (Alerts, combat highlights, badges)
- **Starlight White**: `#EEEEEE` (Body typography, primary headings)
- **Neutral Ramp & Perceptual Accessibility Reference**: Avoid arbitrary blue-tinted Tailwind `slate-*` grays and generic AI-template tropes (radial blur blobs, pulsing status pills). See [`docs/design/portal_visual_identity_and_color_science_audit.md`](../../docs/design/portal_visual_identity_and_color_science_audit.md) for the `kidthales.com` minimalist landmark patterns, **Lunar Grey** (`#A6A6A6`) / **Hull Charcoal** (`#4E4E4E`) neutral ramp, and Paul Tol deuteranopia/luminance calibration options (`#C97320` vs `#E63946` $\Delta L^* = 4.8$ collision analysis).

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