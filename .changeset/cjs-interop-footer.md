---
"@savvy-web/rslib-builder": minor
---

Add `cjsInterop` option that injects a footer snippet into CJS output files so `require('module')` returns the default export directly instead of `{ default: value }`. Named exports are preserved as properties on the default value.
