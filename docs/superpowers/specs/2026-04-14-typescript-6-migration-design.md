# TypeScript 6.0 Migration Design

Full migration of rslib-builder from TypeScript 5.x to TypeScript 6.0, including moving API Extractor to a direct dependency with CompilerState integration.

## Goals

- Drop TypeScript 5.x support, require TypeScript 6.0+
- Move API Extractor from peer dependency to direct dependency
- Use CompilerState to point API Extractor at TS v6 instead of its bundled TypeScript
- Clean up removed TS v6 enum values from tsconfig-resolver
- Gain a performance win by sharing CompilerState across entry points

## Non-Goals (Separate PRs)

- Updating pnpm-plugin-silk to bump silkPeers catalog
- Aligning shipped tsconfig presets with TS v6 new defaults (strict, module, target)
- Removing redundant allowSyntheticDefaultImports from presets
- Checking if Node18/Node20 module kinds are now properly exported enums in TS v6

## Section 1: Dependency Changes

- Add `catalogs.ts6` to `pnpm-workspace.yaml` with `typescript: ^6.0.0` for local testing (silkPeers is managed by pnpm-plugin-silk)
- Change TypeScript peer in `package/package.json` to `catalog:ts6` temporarily
- Move `@microsoft/api-extractor` from `peerDependencies` + `devDependencies` to `dependencies`
- Remove API Extractor from `peerDependenciesMeta`
- Replace dynamic `await import("@microsoft/api-extractor")` with static top-level import in dts-plugin.ts
- Remove `getApiExtractorPath()` validation call at line 1006 of dts-plugin.ts (always installed now). The function itself in file-utils.ts can also be removed since the path resolution for `typescriptCompilerFolder` uses a different mechanism (`createRequire` + `require.resolve`).

## Section 2: API Extractor CompilerState Integration

Current flow (per entry point in loop):

1. `ExtractorConfig.prepare(prepareOptions)` creates config with `compiler.tsconfigFilePath`
2. `Extractor.invoke(extractorConfig, { localBuild, messageCallback })` creates its own TS Program internally each time

New flow:

1. Resolve TS v6 folder path via `createRequire` + `require.resolve("typescript/package.json")`
2. Create `ExtractorConfig` for the first entry
3. `CompilerState.create(extractorConfig, { typescriptCompilerFolder })` builds the TS Program once using TS v6
4. For each entry point: `Extractor.invoke(extractorConfig, { compilerState, localBuild, messageCallback })` reuses the shared Program

Key considerations:

- This is both a correctness fix (API Extractor uses TS v6 instead of its bundled TS) and a perf win (one TS analysis pass instead of N per entry)
- `CompilerState.create()` takes an `extractorConfig` as first arg. Since each entry has a different `mainEntryPointFilePath`, the config changes per iteration. But the underlying TS Program is built from the tsconfig (shared across all entries), so the CompilerState should be reusable
- Fallback: if API Extractor rejects a CompilerState created with a different entry's config, pass `typescriptCompilerFolder` directly on each `invoke()` call instead
- TS version mismatch suppression (lines 1137-1143 of dts-plugin.ts) can likely be removed since API Extractor will use the project's TS directly. Keep as safety net initially.

## Section 3: tsconfig-resolver.ts Cleanup

Remove mappings for values removed in TS v6:

- `MODULE_KIND_MAP`: Remove `ModuleKind.AMD`, `ModuleKind.UMD`, `ModuleKind.System`, `ModuleKind.None`
- `MODULE_RESOLUTION_MAP`: Remove `ModuleResolutionKind.Classic`
- `SCRIPT_TARGET_MAP`: Remove `ScriptTarget.ES3` (removed in TS v6)
- `IMPORTS_NOT_USED_MAP`: Remove entirely (ImportsNotUsedAsValues enum gone in TS v6)

Import cleanup:

- Remove `ImportsNotUsedAsValues` from typescript import
- Remove `convertImportsNotUsedAsValues()` static method
- Remove `importsNotUsedAsValues` handling in resolve flow (around line 728-731)

Keep as-is:

- `ScriptTarget.ES5` (deprecated but still valid)
- `ModuleResolutionKind.Node10` (deprecated but still valid)
- CJS format override (`module: "commonjs"`, `moduleResolution: "node10"`, `esModuleInterop: true`)
- Hardcoded numeric values for Node18 (101) and Node20 (102)

## Section 4: writeBundleTempConfig and tsconfig Presets

No changes needed:

- `writeBundleTempConfig()` already sets `types: options?.types ?? ["node"]` explicitly
- `typeRoots` already set explicitly
- Shipped tsconfig presets already use valid TS v6 options (strict, nodenext, es2023)
- `allowSyntheticDefaultImports: true` in presets is redundant in TS v6 but harmless (cleanup deferred)

## Section 5: Test Updates

- tsconfig-resolver tests: Remove cases for removed enum values
- dts-plugin tests: Update for static imports and CompilerState flow
- file-utils tests: Update/remove `getApiExtractorPath()` tests if function is removed

## Risk Assessment

| Area | Risk | Mitigation |
| ---- | ---- | ---------- |
| CompilerState reuse across entries | Medium | Fall back to per-invoke typescriptCompilerFolder |
| Removed TS enum values | Low | Removing what TS v6 removes |
| API Extractor as direct dep | Low | Was already dynamically imported |
| Static import change | Low | Simplification |
