---
"@savvy-web/rslib-builder": patch
---

## Bug Fixes

- Multi-entry packages no longer emit invalid ESM where `__webpack_require__` is both imported from a sibling chunk and re-declared locally. Both `NodeLibraryBuilder` and `RSPressPluginBuilder` now disable rspack's runtime-chunk extraction and async chunk splitting on every emitted lib, so the duplicate-declaration `SyntaxError` that broke Node ESM loading on multi-entry libraries is gone. Modern-module's natural ESM-aware sibling chunk extraction is preserved — those chunks have valid `import` / `export` bindings and load correctly. See the new chunk splitting guide for the documented escape hatch. Fixes issue #158.
