---
"@savvy-web/rslib-builder": patch
---

## Bug Fixes

Fix `suppressWarnings` and `forgottenExports` options not being applied in dev mode builds. Previously, the `apiModel` config was only passed to `DtsPlugin` in npm mode, causing warning suppression rules to be ignored in dev builds. In CI environments (where `forgottenExports` defaults to `"error"`), this caused dev builds to fail on warnings that were correctly suppressed in npm builds.
