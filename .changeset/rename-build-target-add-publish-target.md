---
"@savvy-web/rslib-builder": minor
---

Rename BuildTarget to BuildMode, add PublishTarget support

- Rename `BuildTarget` type to `BuildMode` for API alignment with bun-builder
- Rename `createSingleTarget()` to `createSingleMode()`
- Update `TransformPackageJsonFn` context from `{ target, pkg }` to `{ mode, target, pkg }`
- Add `PublishProtocol` and `PublishTarget` types for multi-registry publishing
- Add `resolvePublishTargets()` function to resolve `publishConfig.targets`
- Add `targets` field to `PublishConfig` interface
- Rename plugin options: `buildTarget` → `buildMode`, `target` → `mode`
