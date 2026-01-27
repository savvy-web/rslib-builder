---
"@savvy-web/rslib-builder": minor
---

Add `forgottenExports` option to `ApiModelOptions` for controlling how API
Extractor's `ae-forgotten-export` messages are handled. Supports `"include"`
(default — warn and include), `"error"` (fail the build), and `"ignore"`
(suppress silently).

Export `RslibConfigAsyncFn` type from public API to fix TypeScript portability
error when using `export default NodeLibraryBuilder.create(...)` in pnpm
workspaces.
