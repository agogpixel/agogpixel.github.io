---
name: author-devlog
description: Procedure for authoring, formatting, and publishing devlog posts in the 'Building an A- Studio in Public' series.
---

# Devlog Authoring Playbook

Follow this workflow when writing a new devlog post:

1. **Create MDX File**:
   - File path: `src/content/devlog/<NNN>-<slug>.mdx` (e.g., `001-scaffold-astro-portal.mdx`).
2. **Frontmatter Setup**:
   ```yaml
   ---
   title: "Devlog Title"
   pubDate: YYYY-MM-DD
   track: "Building an A- Studio in Public"
   tags: ["web", "astro", "engineering"]
   author: "Agogpixel Team"
   summary: "Short punchy summary for catalog cards, SEO meta, and RSS description."
   ---
   ```
   - *Guardrail*: Adhere to `studio_alignment.md` public copy rules (no public AI labeling in `author` or body copy).
3. **Image & Media Optimization**:
   - Place static media in `public/assets/` and reference via `/assets/<filename>`.
   - Use WebP or animated SVG/GIF for visuals.
4. **Build & RSS Verification**:
   - Run `npm run build` (`astro check && astro build`) to verify zero TypeScript/MDX errors and confirm `/devlogs/<slug>/index.html` and `/rss.xml` generate cleanly.