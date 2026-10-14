# ADR-001: Astro v5 + Tailwind Web Portal Architecture & Mascot Motion Port

- **Status**: Accepted
- **Date**: 2026-10-14
- **Author**: Antigravity (AI Co-Engineer) & kidthales
- **Issue**: [#1](https://github.com/agogpixel/agogpixel.github.io/issues/1)

## Context & Problem Statement
The Agogpixel studio web portal (`agogpixel.com`) previously existed as a legacy single-file static `index.html` featuring a custom CSS-animated mascot rocket with a cosine tilt and staggered thruster exhaust. The studio needed a modern, maintainable static architecture capable of hosting game showcases, public engineering devlogs (*Building an A- Studio in Public*), press assets, and automated GitHub Pages deployment while preserving the iconic mascot animations.

## Architectural Decisions

### 1. Static SSG via Astro v5 with Zero Client JS
- Selected Astro v5 with static output mode (`output: "static"`).
- Astro compiles zero client runtime JavaScript by default, resulting in optimal Lighthouse scores and sub-second load times.
- Tailwind CSS v3 integration with scoped theme extensions:
  - Void color space (`#030308`, `#070913`, `#0e1220`) for deep space aesthetic.
  - Cyber accents: `cyber-cyan` (`#00f0ff`), `cyber-flame` (`#c97320`), `cyber-purple` (`#a855f7`).

### 2. Encapsulated MascotRocket Component
- Encapsulated the legacy CSS $\pm 45^\circ$ cosine tilt and staggered 5-bar thruster flame animation into `src/components/MascotRocket.astro`.
- Added support for `size` (`sm` | `md` | `lg`) and `animated` (`boolean`) props with proportional scaling.

### 3. GitHub Pages & Custom Domain Persistence
- Static files placed in `public/` (specifically `public/CNAME` with `agogpixel.com`) are automatically copied to `dist/CNAME` during build.
- GitHub Pages custom domain routing and HTTPS enforcement remain active across static deployments.

### 4. Content Collections for Devlogs
- Configured `src/content/config.ts` with strict Zod schema enforcing frontmatter requirements: `title`, `pubDate`, `track`, `tags`, `author`, `summary`.
- Created dynamic route `src/pages/devlogs/[...slug].astro` for rendering MDX articles with `@tailwindcss/typography` styling.

### 5. Automated CI/CD Workflow
- Configured `.github/workflows/deploy.yml` using `actions/upload-pages-artifact@v3` and `actions/deploy-pages@v4` running on Node 24.
