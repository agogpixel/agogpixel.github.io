---
description: Git workflow, branch naming conventions, commit attribution, and PR rules
globs: ["**/*"]
---

# Git Workflow & Commit Attribution Rules

When developing features, creating branches, and committing code in this workspace:

## 1. Branch Naming Standard
- Branch from `main` using the studio issue-driven convention: `<type>/web-<issue#>-<short-slug>`
- Allowed `<type>` prefixes: `feat`, `fix`, `chore`, `docs`, `art`, `audio`, `refactor`
- Examples: `feat/web-5-thruster-particles`, `fix/web-12-viewport-bounds`
- *(Legacy note: The earlier `src-main/<feature-name>` convention is deprecated in favor of studio issue-driven naming).*

## 2. Commit Standards & Author Attribution
- **Conventional Commits**: Format commit titles as `<type>(<scope>): <summary>` and always link the issue (`Closes #<id>` or `Fixes #<id>`).
- **Author Attribution**: When commits are generated or pair-programmed by the AI assistant, set author attribution explicitly:
  ```bash
  git commit --author="Antigravity <antigravity@gemini.google.com>" -m "<title>" -m "<body>" -m "<trailers>"
  ```
- **Commit Metadata Trailers**: Include standard trailers in all agent commits:
  ```
  Generated-by: Antigravity (<Model Name>)
  Agent-Session: <conversation-id>
  Co-authored-by: Antigravity <antigravity@gemini.google.com>
  ```

## 3. Remote Push & PR Lifecycle
- **Remote Push**: Push feature branches to `origin` tracking the feature branch name:
  ```bash
  git push -u origin <type>/web-<issue#>-<short-slug>
  ```
- **Autonomous PR Creation**: Subagents create Pull Requests autonomously upon task completion via `gh pr create` (or `New-StudioPR.ps1`) targeting `main`.
- **Merge Strategy**: All issue PRs use **Squash and Merge** to maintain a clean linear history on `main`.