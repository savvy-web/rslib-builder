---
"@savvy-web/rslib-builder": minor
---

Refactor catalog resolution to support multiple package managers

- Rename `PnpmCatalog` to `WorkspaceCatalog` with multi-package-manager support
- Add yarn 4 workspace catalog support via `workspace-tools` package
- Replace singleton pattern with factory function `createWorkspaceCatalog()`
- Add dependency injection support to `applyPnpmTransformations()` for plugin reuse
- Remove dead code: unused `bundle()` method, cache functionality
- Streamline README documentation
