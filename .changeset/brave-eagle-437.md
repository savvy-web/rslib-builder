---
"@savvy-web/rslib-builder": patch
---

## Bug Fixes

Forward `compilerOptions.types` from project tsconfig to temp tsconfig for tsgo declaration generation. Defaults to `["node"]` when not set, fixing tsgo failures resolving `@types/node` with pnpm's symlinked `node_modules`. Fixes #114.
