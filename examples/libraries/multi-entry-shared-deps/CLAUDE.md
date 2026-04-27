# multi-entry-shared-deps example

Library with two exports that share an internal module — reproduces the conditions that triggered issue #158 (rslib runtime-chunk extraction for ESM bundles with 2+ entries that share modules).

- Source: `src/`
- Depends on: `@savvy-web/rslib-builder` via `workspace:*`
- Build: `turbo run build:dev build:prod`
