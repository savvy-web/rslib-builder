---
"@savvy-web/rslib-builder": patch
---

## Bug Fixes

Fix `bin` paths in built `package.json` dropping leading `./` for npm 11.x compatibility.

npm 10/11 silently drops bin entries whose values start with `./`, leaving packages with no executable after publish — no CI error, just a broken `npx` invocation discovered by users. The builder now emits `bin/cli.js` instead of `./bin/cli.js`. The new `normalizeBinPaths` helper is also exported for direct use in custom transforms.
