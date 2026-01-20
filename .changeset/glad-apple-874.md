---
"@savvy-web/rslib-builder": patch
---

Fix bin field transformation to output correct paths.

TypeScript bin entries are now correctly transformed to `./bin/{command}.js`
instead of stripping the `./src/` prefix. This matches RSlib's actual output
structure where bin entries like `"test": "./src/cli/index.ts"` compile to
`./bin/test.js`.

Non-TypeScript bin entries (shell scripts, pre-compiled JS) are preserved as-is.
