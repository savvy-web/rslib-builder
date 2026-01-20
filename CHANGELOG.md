# @savvy-web/rslib-builder

## 0.2.0

### Minor Changes

- 9d4a183: Add TSDoc configuration support for API Extractor integration.

  - New `TsDocConfigBuilder` class for managing TSDoc configuration
  - Tag group support: core, extended, and discretionary tag categories
  - Custom tag definitions and `supportForTags` auto-derivation
  - `tsdoc.json` persistence with CI-aware defaults (persist locally, skip in CI)
  - `tsdoc-metadata.json` generation for downstream tooling
  - Prettified TSDoc warnings with file:line:column location and color output
  - Configurable warning behavior: "log", "fail", or "ignore" (defaults to "fail" in CI)

## 0.1.2

### Patch Changes

- 2c67617: Fix API model being incorrectly included in npm package. The file is now excluded via negation pattern (`!<filename>`) in the `files` array while still being emitted to dist for local tooling. Also renamed default filename to `<unscopedPackageName>.api.json` following API Extractor convention.

## 0.1.1

### Patch Changes

- 6f503aa: Fix ReDoS vulnerability in `stripSourceMapComment` regex (CWE-1333).

## 0.1.0

### Minor Changes

- ce4d70e: Initial release of RSlib Builder - a streamlined build system for modern
  ECMAScript libraries.

  Build TypeScript packages effortlessly with:

  - **Zero-config bundling** - Automatic entry point detection from package.json
  - **Rolled-up type declarations** - API Extractor integration bundles your
    .d.ts files for clean public APIs
  - **Multi-target builds** - Dev builds with source maps, optimized npm builds
  - **PNPM workspace support** - Resolves catalog: and workspace: references
  - **Self-building** - This package builds itself using NodeLibraryBuilder

  Get started with a simple config:

  ```typescript
  import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

  export default NodeLibraryBuilder.create({
    externals: ["@rslib/core"],
  });
  ```
