---
"@savvy-web/rslib-builder": minor
---

feat: Generate bundled TypeScript declarations for all entry points

- DtsPlugin now uses EntryExtractor to discover ALL TypeScript exports from package.json, not just the main export
- Packages with multiple exports (e.g., `.`, `./utils`, `./types`) now get individual bundled `.d.ts` files for each entry
- Bin entries are correctly skipped (CLI tools don't need bundled type declarations)
- Added E2E test infrastructure with fixture packages for integration testing
- Exported new public utilities: `TsconfigResolver`, `EntryExtractor`, and related types
- Added `engines.node` requirement (>=24.0.0) to package.json
