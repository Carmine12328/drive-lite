# Repowise MCP Codebase Intelligence Rules

When analyzing the codebase, searching for symbols, exploring dependencies, evaluating dead code, or auditing architectural risk in this workspace:

1. **Prefer Repowise MCP Tools**: Before conducting extensive line-by-line file scans or multi-step grep searches, use the Repowise MCP tools:
   - `get_overview` / `get_context` to understand module hierarchy and architectural layer boundaries.
   - `get_symbol` to locate symbol definitions and usage across the monorepo.
   - `get_dead_code` to identify unreachable files and unused exports.
   - `get_risk` / `get_change_risk` when evaluating code changes in git hotspots.
   - `search_codebase` for structural codebase queries.

2. **Index Refreshing**: If significant file additions or architectural refactors occur, run `repowise init` or `repowise update` to keep the local Repowise index synced.
