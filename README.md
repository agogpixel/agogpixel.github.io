# Agogpixel Studio Web Portal

The official web portal for **Agogpixel Studio** ([agogpixel.com](https://agogpixel.com)), an independent game studio crafting retro sci-fi arcade action, tight mechanics, and curious software.

> *"AAA ambition. Indie grit. Minus the corporate bloat."*

---

## ⚡ Tech Stack & Features

- **Static Framework**: [Astro v5](https://astro.build) configured for pure static generation (`output: "static"`), delivering near-instant loading with zero unnecessary client JavaScript.
- **Styling**: [Tailwind CSS](https://tailwindcss.com) configured with official studio brand colors:
  - **Deep Cosmos Black**: `#030303` (Primary web canvas)
  - **Thruster Amber**: `#C97320` (Buttons, interactive elements)
  - **Porthole Cyan**: `#4CC9F0` (Glows, accents)
  - **Rocket Scarlet**: `#E63946` (Badges, highlights)
  - **Starlight White**: `#EEEEEE` (Headings, primary typography)
- **Mascot Animation**: Studio animated rocket guinea pig vector illustration (`rocket_guinea_pig_animated.svg`) with embedded cosine rocking and multi-stage exhaust flame animations.
- **CI/CD Deployment**: Automated GitHub Actions workflow (`deploy.yml`) deploying static builds to GitHub Pages with custom domain (`agogpixel.com`) and HTTPS enforcement.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: `v24.x` (or `>= 20.x`)
- **npm**: `v11.x` (or `>= 10.x`)

### Installation & Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the local development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:4321` in your browser to view the site.

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
├── public/                     # Static assets copied directly to dist/ root
│   ├── assets/                 # SVGs, PNGs, and GIFs for mascot and branding
│   ├── favicon/                # Browser favicons and site.webmanifest
│   └── CNAME                   # Custom domain mapping (agogpixel.com)
├── src/
│   ├── components/
│   │   ├── Footer.astro        # Minimal studio footer
│   │   ├── Header.astro        # Clean studio header with logo and status mark
│   │   └── MascotRocket.astro  # Reusable mascot component
│   ├── layouts/
│   │   └── Layout.astro        # Global HTML shell, SEO metadata, fonts & styles
│   ├── pages/
│   │   └── index.astro         # Focused jumbotron landing page with animated mascot
│   └── styles/
│       └── global.css          # Tailwind base/utilities and cosmos dark ambiance
├── astro.config.mjs            # Astro configuration
├── tailwind.config.mjs         # Theme color palette, fonts, and animation tokens
└── tsconfig.json               # TypeScript configuration extending astro/tsconfigs/strict
```

---

## 📜 Studio Philosophy: The "A-" Standard

1. **Minus the Corporate Bloat**: No endless steering committees or 60-page design docs. We iterate, build, and ship.
2. **Player-First Purity**: No predatory microtransactions, battle passes, or engagement traps. Pure arcade mechanics.
3. **Relentless Craft & Velocity**: High technical rigor, lightweight architecture, and pride in shipping real software.

---

## 📄 License & Copyright

&copy; 2026 Agogpixel Studio. All rights reserved.
