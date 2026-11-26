# Agogpixel

The official website for **Agogpixel** ([agogpixel.com](https://agogpixel.com)) — an A- Studio dedicated to curious software development.

## Tech Stack

- **Static Framework**: [Astro 7](https://astro.build) (`trailingSlash: 'always'`, `build.format: 'directory'`, `inlineStylesheets: 'always'`) generating static HTML with zero client-side JavaScript.
- **Styling**: Vanilla CSS (`src/styles/theme.css`, `src/styles/site.css`) built on semantic `--ap-*` tokens with a Deep Cosmos (`#030303`) surface and Paul Tol accessible high-contrast accents.
- **Self-Hosted Typography**: Local variable `.woff2` subsets (`Inter` and `JetBrains Mono`) under `public/fonts/` with metric-matched fallback `@font-face` declarations and SIL OFL 1.1 attribution at `/credits/` (`public/credits/OFL.txt`).
- **CI & Deployment**: GitHub Actions (`.github/workflows/ci.yml`) running zizmor workflow security audits, the 7-gate `scripts/ci-local.ps1` verification suite, GitHub Pages deployment, and Discord CI notifications.

## Quick Start

### Prerequisites

- **Node.js**: `24.21.0` (pinned in `.nvmrc`; `engines.node`: `>=24.21.0 <25`)
- **npm**: `>=11`

### Local Development

1. **Install dependencies**:
   ```bash
   npm ci
   ```
2. **Start the development server**:
   ```bash
   npm run dev
   ```
3. **Run type checks and build**:
   ```bash
   npm run check && npm run build
   ```

## Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts local Astro dev server (`astro dev`) |
| `npm run check` | Runs Astro and TypeScript diagnostics (`astro check`) |
| `npm test` | Runs unit and CI gate tests (`node --test`) |
| `npm run build` | Builds static output into `./dist` (`astro build`) |
| `npm run preview` | Serves `./dist` locally for verification (`astro preview`) |
| `npm run astro` | Runs Astro CLI commands directly |
| `pwsh ./scripts/ci-local.ps1` | Runs Gates 0–6 verification locally |

## Project Structure

```text
agogpixel.github.io/
├── .github/workflows/
│   └── ci.yml                  # Security, Gates 0-6 verify, Pages deploy, and notify workflow
├── public/                     # Static assets copied verbatim to dist/
│   ├── assets/                 # Mascot artwork and brand assets
│   ├── credits/OFL.txt         # SIL Open Font License 1.1 text
│   ├── fonts/                  # Self-hosted Inter & JetBrains Mono woff2 subsets
│   ├── CNAME                   # Custom domain mapping (agogpixel.com)
│   ├── site.webmanifest        # Web app manifest
│   └── favicon* / *.png        # Root favicons and touch/app icons
├── scripts/
│   ├── ci-local.ps1            # 7-gate local and CI verification orchestrator
│   └── gates/                  # AST, contrast, zero-JS, origin, link, budget, axe, and lint gates
├── src/
│   ├── components/
│   │   ├── Footer.astro        # Site footer
│   │   ├── GameEmbedCard.astro # Zero-JS itch.io & Steam widget embed card
│   │   └── Header.astro        # Primary navigation header
│   ├── data/
│   │   └── games.ts            # Typed game catalog and SITE_FIXTURES=1 staging
│   ├── layouts/
│   │   └── Layout.astro        # Base HTML document shell & metadata
│   ├── lib/
│   │   └── games-schema.ts     # Zod game catalog schema and storefront URL builders
│   ├── pages/
│   │   ├── 404.astro           # Custom 404 page (/404.html)
│   │   ├── credits.astro       # Font and palette attributions (/credits/)
│   │   ├── index.astro         # Studio landing page (/)
│   │   └── sitemap.xml.ts      # Static XML sitemap (/sitemap.xml)
│   └── styles/
│       ├── site.css            # Layout, typography, and component styles
│       └── theme.css           # @font-face rules and --ap-* design tokens
├── tests/                      # Unit, schema, workflow-contract, and gate tests
├── .nvmrc                      # Pinned Node.js version (24.21.0)
├── astro.config.mjs            # Astro configuration
├── budgets.json                # Page weight, asset, and CLS budgets
├── package.json                # Dependencies and scripts
└── tsconfig.json               # Strict Astro TypeScript configuration
```

## Licensing & Credits

- **Typography & Color Schemes**: Third-party attributions and licenses are listed at [`/credits/`](https://agogpixel.com/credits/) (`public/credits/OFL.txt`).
- **Copyright**: &copy; 2026 Agogpixel. All rights reserved.
