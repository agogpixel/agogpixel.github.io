# Agogpixel Studio Web Portal

[![Deploy to GitHub Pages](https://github.com/agogpixel/agogpixel.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/agogpixel/agogpixel.github.io/actions/workflows/deploy.yml)
[![Live Site](https://img.shields.io/badge/live-agogpixel.com-4CC9F0.svg)](https://agogpixel.com)
[![Engine](https://img.shields.io/badge/Astro-v5-bc52ee.svg)](https://astro.build)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v3-38bdf8.svg)](https://tailwindcss.com)

The official web portal and devlog hub for **Agogpixel Studio** ([agogpixel.com](https://agogpixel.com)), an independent game studio crafting retro sci-fi arcade action, tight mechanics, and curious software.

> *"AAA ambition. Indie grit. Minus the corporate bloat."*

---

## ⚡ Tech Stack & Features

- **Static Framework**: [Astro v5](https://astro.build) configured for pure static generation (`output: "static"`), delivering near-instant loading with zero unnecessary client JavaScript.
- **Styling**: [Tailwind CSS](https://tailwindcss.com) augmented with studio brand color tokens:
  - **Deep Cosmos Black**: `#030303` (Primary web canvas)
  - **Thruster Amber**: `#C97320` (Buttons, active highlights)
  - **Porthole Cyan**: `#4CC9F0` (Accents, links, glow effects)
  - **Rocket Scarlet**: `#E63946` (Badges, alert highlights)
  - **Starlight White**: `#EEEEEE` (Primary text and headings)
- **Mascot Animation**: Reusable `<MascotRocket />` component faithfully encapsulating the studio's legacy &plusmn;45&deg; cosine tilt and 5-stage staggered thruster exhaust animations.
- **Devlog Hub**: Built-in Astro Content Collections supporting MDX for the upcoming *"Building an A- Studio in Public"* engineering series.
- **CI/CD Deployment**: Automated GitHub Actions workflow (`deploy.yml`) deploying static builds directly to GitHub Pages with custom domain (`agogpixel.com`) and HTTPS enforcement.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: `v24.x` (or `>= 20.x`)
- **npm**: `v11.x` (or `>= 10.x`)

### Installation & Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/agogpixel/agogpixel.github.io.git
   cd agogpixel.github.io
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the local development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:4321](http://localhost:4321) in your browser to view the site.

---

## 🛠 Available NPM Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts local dev server at `http://localhost:4321` with instant HMR |
| `npm run build` | Runs TypeScript diagnostics (`astro check`) and compiles static output to `./dist` |
| `npm run preview` | Spins up a local static server to preview the contents of `./dist` |
| `npm run astro` | Runs Astro CLI commands directly |

---

## 📂 Project Architecture

```text
agogpixel.github.io/
├── .agents/                    # Subagent rules, guidelines, and skills
│   └── rules/                  # Studio alignment and git workflow standards
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deployment to GitHub Pages
├── docs/
│   └── learnings/              # Architecture Decision Records (ADRs) & learnings
├── public/                     # Static files copied as-is to dist/ root
│   ├── assets/                 # SVGs, PNGs, and GIFs for mascot and games
│   ├── favicon/                # Browser favicons and site.webmanifest
│   └── CNAME                   # Custom domain mapping (agogpixel.com)
├── src/
│   ├── assets/                 # Bundled branding assets for optimized images
│   ├── components/
│   │   ├── Footer.astro        # Global studio footer with social & repo links
│   │   ├── Header.astro        # Responsive navigation header with mobile toggle
│   │   └── MascotRocket.astro  # Scoped animated mascot with cosine tilt & flames
│   ├── content/
│   │   ├── config.ts           # Zod schema for devlog content collections
│   │   └── devlog/             # MDX devlog entries
│   ├── layouts/
│   │   └── Layout.astro        # Global HTML shell, SEO metadata, fonts & styles
│   ├── pages/
│   │   ├── index.astro         # Studio homepage with hero & debut game teaser
│   │   ├── about.astro         # Studio overview & The "A-" Manifesto
│   │   ├── games/              # Games showcase and coming soon hub
│   │   ├── devlogs/            # Devlog hub with coming soon status
│   │   └── presskit/           # Studio factsheet, color palettes & asset downloads
│   └── styles/
│       └── global.css          # Tailwind base/utilities and cyberpunk ambiance
├── astro.config.mjs            # Astro configuration (Tailwind & MDX integrations)
├── tailwind.config.mjs         # Theme color palette, fonts, and animation tokens
└── tsconfig.json               # TypeScript configuration extending astro/tsconfigs/strict
```

---

## 📝 Authoring Devlogs

To publish a new devlog in the *"Building an A- Studio in Public"* series:

1. Create a new `.mdx` file in `src/content/devlog/` (e.g., `002-inertial-drifts.mdx`).
2. Add the mandatory frontmatter schema:

```yaml
---
title: "Tuning Inertial Drifts and Precision Thrusters"
pubDate: 2026-10-20
track: "Building an A- Studio in Public"
tags: ["physics", "arcade", "gamedev"]
author: "Agogpixel Team"
summary: "Solving sub-pixel jitter in 2D retro arcade games and fine-tuning responsive vector propulsion."
---
```

3. Write content using standard Markdown or MDX. Astro will automatically compile the static routes and update the collections.

---

## 🎨 Mascot Rocket Component

The `<MascotRocket />` component can be embedded anywhere with configurable sizes and animation toggles:

```astro
---
import MascotRocket from '../components/MascotRocket.astro';
---

<!-- Large animated hero mascot -->
<MascotRocket size="lg" animated={true} />

<!-- Small static icon in navigation or headers -->
<MascotRocket size="sm" animated={false} />
```

- **Props**:
  - `size`: `'sm'` (75% scale), `'md'` (100% scale, default), `'lg'` (155% scale)
  - `animated`: `boolean` (default: `true`)
  - `class`: Optional utility classes

---

## 📜 Studio Philosophy: The "A-" Standard

1. **Minus the Corporate Bloat**: No endless steering committees or 60-page design docs. We iterate, build, and ship.
2. **Player-First Purity**: No predatory microtransactions, battle passes, or engagement traps. Pure arcade mechanics.
3. **Relentless Craft & Velocity**: High technical rigor, lightweight architecture, and pride in shipping real software.

---

## 📄 License & Copyright

&copy; 2026 Agogpixel Studio. All rights reserved.
