---
"@savvy-web/rslib-builder": patch
---

Fix catalog resolution for named catalogs from pnpm configDependencies

Reads catalogs from `node_modules/.pnpm-workspace-state-v1.json` as the primary source, with lockfile and workspace manifest as fallbacks. The workspace state file contains all resolved catalogs including those from `configDependencies` plugins that may not appear in the lockfile (e.g., catalogs used only in `peerDependencies`).
