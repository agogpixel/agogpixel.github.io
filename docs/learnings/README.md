# Knowledge Base & Learnings Log

This directory serves as the persistent knowledge repository for Architecture Decision Records (ADRs), post-mortems, and tricky workarounds discovered during development.

## How Subagents Use This Directory
1. When you solve a difficult issue or establish a new architectural pattern, create a markdown note here (e.g. \docs/learnings/ADR-001-<slug>.md\).
2. Add an index entry below summarizing the insight.
3. If the learning is a concise constraint, also update \.agents/rules/\.

## Index of Learnings
<!-- Format: - [Title](path) - Brief summary (Date) -->
- [ADR-001: Astro v5 + Tailwind Web Portal Architecture & Mascot Motion Port](ADR-001-astro-tailwind-portal-architecture.md) - Architecture decision for Astro v5, Tailwind tokens, scoped MascotRocket motion, and GitHub Pages deployment (2026-10-14)