---
"@savvy-web/rslib-builder": patch
---

## Bug Fixes

- Preserve `workspace:` and `catalog:` dependency specifiers in dual-format dev builds. The package.json transform treated any rsbuild environment not named exactly `dev` as a production build, but dual-format builds name their dev environments `dev-esm` and `dev-cjs`. Their `dist/dev` manifests therefore had specifiers resolved to fixed versions, which broke pnpm `linkDirectory` resolution of the local dev output. The build mode is now derived from the explicit mode option with an environment-name prefix fallback.
