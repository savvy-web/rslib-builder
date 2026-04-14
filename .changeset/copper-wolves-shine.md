---
"@savvy-web/rslib-builder": minor
---

## Features

- TypeScript 6.0 is now supported. The `typescript` peer dependency requires `^6.0.0`.
- `@microsoft/api-extractor` is now a direct dependency. Consumers no longer need to install it as a peer dependency — it ships with `rslib-builder`.
- API Extractor now uses the project's own TypeScript installation rather than its bundled copy. This ensures correct type analysis when building with TypeScript 6.

## Breaking Changes

- TypeScript 5.x is no longer supported. Upgrade your project to TypeScript 6.0 before upgrading to this version.
- The `@microsoft/api-extractor` peer dependency has been removed. If you pinned a specific version of API Extractor in your own `package.json`, that entry can be removed.
- The following TypeScript compiler options are no longer recognized in `tsconfig.json` files processed by the builder, as TypeScript 6 removes them:
  - `module`: `AMD`, `UMD`, `System`, `None`
  - `moduleResolution`: `Classic`
  - `target`: `ES3`
  - `importsNotUsedAsValues` (replaced by `verbatimModuleSyntax` in TS 5.0+)
