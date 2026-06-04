---
"@savvy-web/rslib-builder": patch
---

## Bug Fixes

Adds `@pnpm/logger` as an explicit runtime dependency to satisfy the peer requirement of `@pnpm/lockfile.fs`. Consumer projects no longer encounter a missing-module error at runtime when the builder reads the pnpm lockfile during catalog resolution.
