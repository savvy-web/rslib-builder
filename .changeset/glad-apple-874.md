---
"@savvy-web/rslib-builder": patch
---

Fix path transformations for bin entries and nested public exports.

**Bin entries**: TypeScript bin entries are now correctly transformed to
`./bin/{command}.js` instead of stripping the `./src/` prefix. This matches
RSlib's actual output structure where `"test": "./src/cli/index.ts"` compiles
to `./bin/test.js`. Non-TypeScript entries are preserved as-is.

**Public exports**: Paths like `./src/public/tsconfig/root.json` now correctly
strip both `./src/` and `./public/` prefixes, resulting in `./tsconfig/root.json`
instead of `./public/tsconfig/root.json`.
