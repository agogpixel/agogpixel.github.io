---
name: author-devlog
description: Procedure for authoring, formatting, and publishing devlog posts in the 'Building an A- Studio in Public' series.
---

# Devlog Authoring Playbook

Follow this workflow when writing a new devlog post:

1. **Create MDX File**:
   - File path: \src/content/devlog/YYYY-MM-DD-<slug>.mdx\.
2. **Frontmatter Setup**:
   \\\yaml
   title: "Devlog Title"
   pubDate: YYYY-MM-DD
   track: "Track 1: Web & Devlog"
   tags: ["devlog", "godot", "subagents"]
   author: "kidthales & Antigravity"
   summary: "Short punchy summary."
   \\\
3. **Image & Media Optimization**:
   - Use WebP or animated GIF/SVG for visuals.
   - Embed captions highlighting human + AI co-development milestones.
4. **Build Verification**:
   - Run \pnpm build\ to ensure zero MDX or asset compilation errors.