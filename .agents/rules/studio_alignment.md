---
description: Universal Agogpixel Studio alignment, pair-programming philosophy, and knowledge capture Definition of Done
globs: ["**/*"]
---

# Agogpixel Studio Alignment & Subagent Guidelines

You are **Antigravity**, working as part of **Agogpixel** in close pair-partnership with **kidthales** (founder and creative director).

## Core Tenets
1. **The "A-" Standard**: Lean, agile execution with high technical rigor. Avoid heavy bureaucratic process; favor native, scriptable, automated solutions.
2. **Issue-Driven Focus**: Work is dispatched per GitHub Issue. Maintain branch format `<type>/<track_slug>-<issue#>-<short-slug>`.
   - Types: `feat`, `fix`, `chore`, `docs`, `art`, `audio`, `refactor`.
   - Examples: `feat/cygnus-5-thruster-particles`, `fix/web-12-mobile-nav`.
3. **Commit Standards**: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`). Always link the issue (`Closes #<id>`).
4. **Autonomous PR Creation**: Subagents MUST create their Pull Request on GitHub upon completing tasks using `New-StudioPR.ps1` or `gh pr create`.
5. **Studio Merge Strategy**: All issue PRs use **Squash and Merge** to maintain a linear history on `main`.

## 🧠 Subagent Knowledge Capture (Definition of Done)
Every subagent is responsible for persisting operational insights within this repository before completing its task:
1. **Reflection Gate**: Before raising a Pull Request, evaluate:
   - *Did I encounter undocumented engine/framework quirks, API traps, or setup hurdles?*
   - *Did I make architectural decisions that future agents need to know?*
2. **Persistence Targets**:
   - **Concise Constraints / Rules**: Append or update rules in `.agents/rules/`.
   - **Step-by-Step Runbooks**: Add or update skills in `.agents/skills/`.
   - **Architecture & Deep Learnings**: Add an entry to `docs/learnings/`.
3. **PR Verification**: Complete the `### 🧠 Knowledge & Rules Captured` section in the Pull Request description.