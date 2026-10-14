# Agogpixel Studio Web Portal

[![Deploy to GitHub Pages](https://github.com/agogpixel/agogpixel.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/agogpixel/agogpixel.github.io/actions/workflows/deploy.yml)
[![Live Site](https://img.shields.io/badge/live-agogpixel.com-00f0ff.svg)](https://agogpixel.com)
[![Engine](https://img.shields.io/badge/Astro-v5-bc52ee.svg)](https://astro.build)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v3-38bdf8.svg)](https://tailwindcss.com)

The official web portal and devlog hub for **Agogpixel Studio** ([agogpixel.com](https://agogpixel.com)), an independent indie game studio pair-founded by human creative director **kidthales** and autonomous AI engineering agent **Antigravity**.

---

## ⚡ Tech Stack & Features

- **Static Framework**: [Astro v5](https://astro.build) configured for pure static generation (`output: "static"`), delivering near-instant loading with zero unnecessary client JavaScript.
- **Styling**: [Tailwind CSS](https://tailwindcss.com) augmented with custom dark cyberpunk aesthetic tokens (deep space voids `#030308`, electric cyber cyan `#00f0ff`, and thruster flame `#c97320`).
- **Mascot Animation**: Reusable `<MascotRocket />` component faithfully encapsulating the studio's legacy $\pm 45^\circ$ cosine tilt and 5-stage staggered thruster exhaust animations.
- **Devlog Hub**: Built-in Astro Content Collections supporting MDX for the *"Building an A- Studio in Public"* engineering series.
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
│   │   ├── index.astro         # Studio homepage with hero & flagship game preview
│   │   ├── about.astro         # Studio philosophy & The "A-" Manifesto
│   │   ├── games/              # Flagship & prototype games showcase
│   │   ├── devlogs/            # Devlog index and dynamic [...slug].astro reader
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

1. Create a new `.mdx` file in `src/content/devlog/` (e.g., `002-godot-pixel-snap.mdx`).
2. Add the mandatory frontmatter schema:

```yaml
---
title: "Pixel Snap & Inertial Drifts in Godot 4.4"
pubDate: 2026-10-20
track: "Building an A- Studio in Public"
tags: ["godot", "physics", "pixelart", "gamedev"]
author: "kidthales & Antigravity"
summary: "Solving sub-pixel jitter in 2D retro space games and fine-tuning responsive vector thrusters."
---
```

3. Write content using standard Markdown or MDX. Astro will automatically generate the static route at `/devlogs/<slug>/` and update the devlog index.

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

## 📜 Studio Philosophy & Guidelines

- **The "A-" Manifesto**: High technical rigor combined with rapid shipping velocity. Favor native, scriptable, automated workflows over bureaucratic drag.
- **Git Branching Standard**: Work is issue-driven using `<type>/web-<issue#>-<short-slug>`.
- **Commit Format**: Conventional Commits (`feat:`, `fix:`, `chore:`) with AI co-authorship trailers.
- **Merge Strategy**: PRs target `main` and use **Squash and Merge**.

---

## 📄 License & Copyright

&copy; 2026 Agogpixel Studio. All rights reserved.
