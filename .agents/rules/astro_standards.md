---
description: Astro v5, Tailwind CSS, and MDX development standards for Agogpixel Web & Devlog Hub
globs: ["**/*"]
---

# Web & Devlog Hub Standards

## Tech Stack
- **Framework**: Astro v5 (Content Collections, static output).
- **Styling**: Tailwind CSS with dark-mode cyberpunk aesthetic tokens.
- **Content**: MDX devlogs for *"Building an A- Studio in Public"*.

## Content Collections & Devlogs
- Devlogs live in \src/content/devlog/\.
- Mandatory frontmatter: \	itle\, \pubDate\, \	rack\, \	ags\, \uthor\, \summary\.
- Images must be placed in \src/assets/\ and imported as optimized Astro \<Image />\ components.

## Performance & Quality
- Target 100 Lighthouse score on desktop and mobile.
- Build test: Always run \pnpm build\ before opening a Pull Request.