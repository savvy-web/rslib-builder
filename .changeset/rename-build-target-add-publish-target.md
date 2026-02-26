---
"@savvy-web/rslib-builder": minor
---

## Features

- Add `PublishTargetPlugin` for per-target output directories in multi-registry builds
- Add `PublishProtocol` and `PublishTarget` types for multi-registry publishing
- Add `resolvePublishTargets()` function to resolve `publishConfig.targets`
- Wire publish target resolution into build pipeline: primary target passed to `transform` and `transformFiles`
- `PackageJsonTransformPlugin` now exposes `base-package-json` state for per-target copies
- `FilesArrayPlugin` now accepts and passes `target` to `transformFiles` callback
- Add `targets` field to `PublishConfig` interface

## Refactoring

- Rename `BuildTarget` type to `BuildMode` for API alignment with bun-builder
- Rename `createSingleTarget()` to `createSingleMode()`
- Update `TransformPackageJsonFn` context from `{ target, pkg }` to `{ mode, target, pkg }`
- Rename plugin options: `buildTarget` → `buildMode`, `target` → `mode`
