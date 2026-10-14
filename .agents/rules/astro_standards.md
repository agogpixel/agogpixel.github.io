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

## Viewport & Single-Page Layout Standards
- **Single-Viewport Fit**: For hero/jumbotron landing pages, the full layout (Header + Hero + Footer) must fit within `100vh` / `100dvh` without vertical scrolling on desktop.
- Use `h-screen min-h-[100dvh]` with `md:overflow-y-hidden` on the layout body.
- Keep footer padding compact (`py-4` max) and scale vector mascots proportionally.

## Mascot & Asset Synchronization
- Always use the latest vector animated mascot (`rocket_guinea_pig_animated.svg`) synced directly from `agogpixel-studio/docs/branding/assets/`.

## Content Collections & Devlogs
- Devlogs live in `src/content/devlog/`.
- Mandatory frontmatter: `title`, `pubDate`, `track`, `tags`, `author`, `summary`.
- Images must be placed in `src/assets/` and imported as optimized Astro `<Image />` components.

## Performance & Quality
- Target 100 Lighthouse score on desktop and mobile.
- Build test: Always run `npm run build` before opening a Pull Request.