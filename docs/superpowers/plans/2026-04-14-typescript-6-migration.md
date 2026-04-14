# TypeScript 6.0 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate rslib-builder from TypeScript 5.x to TypeScript 6.0, move API Extractor to a direct dependency with CompilerState integration, and clean up removed TS v6 enum values.

**Architecture:** API Extractor becomes a direct dependency with static imports. A shared CompilerState points API Extractor at the project's TS v6 installation and is reused across all entry points for a perf win. The tsconfig-resolver drops mappings for enum values removed in TS v6.

**Tech Stack:** TypeScript 6.0, @microsoft/api-extractor ^7.57.7, vitest

---

## File Map

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `pnpm-workspace.yaml` | Modify | Add ts6 catalog |
| `package/package.json` | Modify | Move API Extractor to deps, TS peer to catalog:ts6 |
| `package/src/rslib/plugins/dts-plugin.ts` | Modify | Static imports, CompilerState, remove getApiExtractorPath call |
| `package/src/rslib/plugins/utils/file-utils.ts` | Modify | Remove getApiExtractorPath function |
| `package/src/rslib/plugins/utils/tsconfig-resolver.ts` | Modify | Remove dead enum mappings and ImportsNotUsedAsValues |
| `package/src/rslib/plugins/utils/tsconfig-resolver.test.ts` | Modify | Remove tests for removed enums |
| `package/src/rslib/plugins/utils/dependency-path-utils.test.ts` | Modify | Remove getApiExtractorPath tests |
| `package/src/rslib/plugins/dts-plugin.test.ts` | Modify | Update if API Extractor imports are tested |

---

### Task 1: Add ts6 Catalog and Update Dependencies

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `package/package.json:54-120`

- [ ] **Step 1: Add ts6 catalog to pnpm-workspace.yaml**

Add a `catalogs` section with a `ts6` catalog. The file currently has no catalogs section (catalogs are managed by `pnpm-plugin-silk` at install time):

```yaml
packages:
  - examples/libraries/*
  - examples/rspress-plugin/*
  - package
catalogs:
  ts6:
    typescript: ^6.0.0
autoInstallPeers: true
configDependencies:
  "@savvy-web/pnpm-plugin-silk": 0.11.0+sha512-uvL2j/021Je7LsgFjTdO7kGkeE2uFUSWJFtIQJciESAIGXHlKxvFrVQ+PhQ4ScGGeTXfUyoTqHFKTM2UrgpRZA==
loglevel: info
```

- [ ] **Step 2: Update package.json dependencies**

In `package/package.json`, make these changes:

1. Move `@microsoft/api-extractor` from `devDependencies` to `dependencies`:

```json
"dependencies": {
    "@microsoft/api-extractor": "^7.57.7",
    "@microsoft/tsdoc": "^0.16.0",
```

1. Remove `@microsoft/api-extractor` from `devDependencies` (line 73).

2. Remove `@microsoft/api-extractor` from `peerDependencies` (line 82).

3. Remove `@microsoft/api-extractor` from `peerDependenciesMeta` (lines 93-95).

4. Change TypeScript peer to `catalog:ts6`:

```json
"peerDependencies": {
    "typescript": "catalog:ts6"
}
```

- [ ] **Step 3: Install dependencies**

Run: `pnpm install`

Expected: lockfile updates, TypeScript 6.0.x installed.

- [ ] **Step 4: Verify TypeScript version**

Run: `pnpm exec tsc --version`

Expected: `Version 6.0.x`

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml package/package.json pnpm-lock.yaml
git commit -m "build: add ts6 catalog, move api-extractor to direct dependency

Move @microsoft/api-extractor from peerDependencies to dependencies.
Add ts6 catalog with typescript ^6.0.0 for local testing.

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 2: Clean Up tsconfig-resolver Removed Enums

**Files:**

- Modify: `package/src/rslib/plugins/utils/tsconfig-resolver.ts:1-10, 232-322, 555-588, 728-732`
- Modify: `package/src/rslib/plugins/utils/tsconfig-resolver.test.ts:1-10, 48-49, 104-112, 147-149, 242-264, 562-571`

- [ ] **Step 1: Update tests first - remove tests for removed enum values**

In `tsconfig-resolver.test.ts`:

1. Remove `ImportsNotUsedAsValues` from the import on line 3:

```typescript
import {
 JsxEmit,
 ModuleDetectionKind,
 ModuleKind,
 ModuleResolutionKind,
 NewLineKind,
 ScriptTarget,
} from "typescript";
```

1. In `describe("static convertScriptTarget")`, remove the ES3 test if present. The ES5 test (line 48-49) stays since ES5 is deprecated but not removed.

2. In `describe("static convertModuleKind")`, remove the test for removed module kinds. Change the "should handle other module kinds" test (lines 104-112) to only include valid kinds:

```typescript
it("should handle other module kinds", () => {
 expect(TsconfigResolver.convertModuleKind(ModuleKind.ES2015)).toBe("es2015");
 expect(TsconfigResolver.convertModuleKind(ModuleKind.ES2020)).toBe("es2020");
 expect(TsconfigResolver.convertModuleKind(ModuleKind.ES2022)).toBe("es2022");
});
```

1. In `describe("static convertModuleResolution")`, remove the Classic test (lines 147-149):

```typescript
// DELETE this test:
it("should convert Classic resolution", () => {
 expect(TsconfigResolver.convertModuleResolution(ModuleResolutionKind.Classic)).toBe("classic");
});
```

1. Remove the entire `describe("static convertImportsNotUsedAsValues")` block (lines 242-264).

2. In `describe("resolve method")`, remove the "should handle importsNotUsedAsValues" test (lines 562-571).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run --project unit package/src/rslib/plugins/utils/tsconfig-resolver.test.ts`

Expected: Tests fail because removed enum values no longer exist in TS v6 (compile errors for `ModuleKind.AMD`, `ModuleKind.UMD`, etc.).

- [ ] **Step 3: Update tsconfig-resolver source - remove ImportsNotUsedAsValues**

In `tsconfig-resolver.ts`:

1. Remove `ImportsNotUsedAsValues` from the import (line 3):

```typescript
import {
 JsxEmit,
 ModuleDetectionKind,
 ModuleKind,
 ModuleResolutionKind,
 NewLineKind,
 ScriptTarget,
} from "typescript";
```

1. Remove the `IMPORTS_NOT_USED_MAP` (lines 314-322):

```typescript
// DELETE entire block:
private static readonly IMPORTS_NOT_USED_MAP: ReadonlyMap<ImportsNotUsedAsValues, string> = new Map([...]);
```

1. Remove the `convertImportsNotUsedAsValues` method (lines 555-588).

2. Remove the `importsNotUsedAsValues` handling in `addEnumOptions` (lines 728-732):

```typescript
// DELETE:
if (opts.importsNotUsedAsValues !== undefined) {
 compilerOptions.importsNotUsedAsValues = TsconfigResolver.convertImportsNotUsedAsValues(
  opts.importsNotUsedAsValues,
 );
}
```

- [ ] **Step 4: Update tsconfig-resolver source - remove dead enum entries**

In `tsconfig-resolver.ts`:

1. In `SCRIPT_TARGET_MAP` (line 233), remove ES3:

```typescript
private static readonly SCRIPT_TARGET_MAP: ReadonlyMap<ScriptTarget, string> = new Map([
 [ScriptTarget.ES5, "es5"],
 [ScriptTarget.ES2015, "es2015"],
 [ScriptTarget.ES2016, "es2016"],
 [ScriptTarget.ES2017, "es2017"],
 [ScriptTarget.ES2018, "es2018"],
 [ScriptTarget.ES2019, "es2019"],
 [ScriptTarget.ES2020, "es2020"],
 [ScriptTarget.ES2021, "es2021"],
 [ScriptTarget.ES2022, "es2022"],
 [ScriptTarget.ES2023, "es2023"],
 [ScriptTarget.ES2024, "es2024"],
 [ScriptTarget.ESNext, "esnext"],
 [ScriptTarget.JSON, "json"],
]);
```

1. In `MODULE_KIND_MAP` (lines 253-267), remove None, AMD, UMD, System:

```typescript
private static readonly MODULE_KIND_MAP: ReadonlyMap<ModuleKind | number, string> = new Map([
 [ModuleKind.CommonJS, "commonjs"],
 [ModuleKind.ES2015, "es2015"],
 [ModuleKind.ES2020, "es2020"],
 [ModuleKind.ES2022, "es2022"],
 [ModuleKind.ESNext, "esnext"],
 [ModuleKind.Node16, "node16"],
 [101, "node18"], // ModuleKind.Node18 (not exported in all TS versions)
 [102, "node20"], // ModuleKind.Node20 (not exported in all TS versions)
 [ModuleKind.NodeNext, "nodenext"],
 [ModuleKind.Preserve, "preserve"],
]);
```

1. In `MODULE_RESOLUTION_MAP` (lines 274-280), remove Classic:

```typescript
private static readonly MODULE_RESOLUTION_MAP: ReadonlyMap<ModuleResolutionKind, string> = new Map([
 [ModuleResolutionKind.Node10, "node10"],
 [ModuleResolutionKind.Node16, "node16"],
 [ModuleResolutionKind.NodeNext, "nodenext"],
 [ModuleResolutionKind.Bundler, "bundler"],
]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run --project unit package/src/rslib/plugins/utils/tsconfig-resolver.test.ts`

Expected: All remaining tests pass.

- [ ] **Step 6: Commit**

```bash
git add package/src/rslib/plugins/utils/tsconfig-resolver.ts package/src/rslib/plugins/utils/tsconfig-resolver.test.ts
git commit -m "refactor: remove TS v6-removed enum values from tsconfig-resolver

Remove ImportsNotUsedAsValues (removed in TS v6), ScriptTarget.ES3,
ModuleKind.AMD/UMD/System/None, and ModuleResolutionKind.Classic.

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 3: Remove getApiExtractorPath and Its Tests

**Files:**

- Modify: `package/src/rslib/plugins/utils/file-utils.ts:85-127`
- Modify: `package/src/rslib/plugins/utils/dependency-path-utils.test.ts`
- Modify: `package/src/rslib/plugins/dts-plugin.ts:26, 1006`

- [ ] **Step 1: Remove getApiExtractorPath tests**

In `dependency-path-utils.test.ts`, remove the entire `describe("getApiExtractorPath")` block and its associated imports. The file imports `getApiExtractorPath` from `./file-utils.js` (line 5) and uses `existsSync` and `getWorkspaceManagerRoot` mocks. Remove all of this. If this file has no other tests, delete the file entirely.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run --project unit package/src/rslib/plugins/utils/dependency-path-utils.test.ts`

Expected: Fail because `getApiExtractorPath` still exists but tests are gone (or file deleted).

- [ ] **Step 3: Remove getApiExtractorPath from file-utils.ts**

In `file-utils.ts`, delete the entire `getApiExtractorPath` function (lines 82-126) and its JSDoc. Also remove the `getWorkspaceManagerRoot` import from `workspace-tools` (line 4) if it's not used elsewhere in the file. Check first:

```bash
grep -n "getWorkspaceManagerRoot" package/src/rslib/plugins/utils/file-utils.ts
```

If only used by `getApiExtractorPath`, remove the import.

- [ ] **Step 4: Remove getApiExtractorPath import and call from dts-plugin.ts**

In `dts-plugin.ts`:

1. Remove the import on line 26:

```typescript
// DELETE:
import { getApiExtractorPath } from "./utils/file-utils.js";
```

1. Remove the validation call on line 1006:

```typescript
// DELETE:
getApiExtractorPath();
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run --project unit`

Expected: All unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add package/src/rslib/plugins/utils/file-utils.ts package/src/rslib/plugins/utils/dependency-path-utils.test.ts package/src/rslib/plugins/dts-plugin.ts
git commit -m "refactor: remove getApiExtractorPath, api-extractor is now a direct dep

No longer need runtime path resolution since api-extractor is a direct
dependency, not a peer dependency.

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 4: Convert API Extractor to Static Imports

**Files:**

- Modify: `package/src/rslib/plugins/dts-plugin.ts:1027-1031`

- [ ] **Step 1: Replace dynamic imports with static top-level imports**

At the top of `dts-plugin.ts`, add static imports. Currently the file has dynamic imports at lines 1027 and 1031:

```typescript
const { TSDocConfigFile } = await import("@microsoft/tsdoc-config");
// ...
const { Extractor, ExtractorConfig, ExtractorMessage, ExtractorLogLevel } = await import("@microsoft/api-extractor");
```

Add these as static imports at the top of the file (after line 9, alongside the other imports):

```typescript
import { Extractor, ExtractorConfig, ExtractorLogLevel } from "@microsoft/api-extractor";
import type { ExtractorMessage } from "@microsoft/api-extractor";
import { TSDocConfigFile } from "@microsoft/tsdoc-config";
```

Then remove the two dynamic import lines (1027 and 1031). Note: `ExtractorMessage` is only used as a type annotation in the `messageCallback` parameter (line 1128), so import it as a type.

- [ ] **Step 2: Update the messageCallback type annotation**

The `messageCallback` at line 1128 uses `InstanceType<typeof ExtractorMessage>`. With static imports, simplify to just `ExtractorMessage`:

```typescript
messageCallback: (message: ExtractorMessage) => {
```

- [ ] **Step 3: Run type check**

Run: `pnpm run typecheck`

Expected: No type errors.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run --project unit`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add package/src/rslib/plugins/dts-plugin.ts
git commit -m "refactor: convert api-extractor to static imports

Replace dynamic await import() with static top-level imports since
api-extractor is now a direct dependency that is always available.

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 5: Add CompilerState Integration

**Files:**

- Modify: `package/src/rslib/plugins/dts-plugin.ts:1031-1140`

- [ ] **Step 1: Add CompilerState import**

At the top of `dts-plugin.ts`, add `CompilerState` to the api-extractor import:

```typescript
import { CompilerState, Extractor, ExtractorConfig, ExtractorLogLevel } from "@microsoft/api-extractor";
import type { ExtractorMessage } from "@microsoft/api-extractor";
```

- [ ] **Step 2: Resolve TypeScript compiler folder path**

Before the entry point loop (after line 1031 where the dynamic import used to be, now before the `for` loop at line 1034), add TypeScript folder resolution:

```typescript
import { createRequire } from "node:module";
```

Add this import at the top of the file with the other `node:` imports.

Then before the entry point loop, resolve the path:

```typescript
const require = createRequire(import.meta.url);
const typescriptCompilerFolder = dirname(require.resolve("typescript/package.json"));
```

Note: `dirname` is already imported from `node:path` on line 5.

- [ ] **Step 3: Create shared CompilerState before the entry point loop**

After resolving the TS folder and before the `for` loop, create the CompilerState using the first entry's config. This requires building the first ExtractorConfig early:

```typescript
// Build CompilerState once, shared across all entry points
// Use the first entry to create the initial config for CompilerState
const firstEntry = entryPoints.entries().next().value;
let sharedCompilerState: CompilerState | undefined;
```

Then inside the loop, after `extractorConfig` is created (line 1111), lazily create the CompilerState on the first iteration:

```typescript
if (!sharedCompilerState) {
 sharedCompilerState = CompilerState.create(extractorConfig, {
  typescriptCompilerFolder,
 });
}
```

- [ ] **Step 4: Pass CompilerState to Extractor.invoke**

Update the `Extractor.invoke` call (line 1125) to include the `compilerState`:

```typescript
const extractorResult = Extractor.invoke(extractorConfig, {
 compilerState: sharedCompilerState,
 localBuild: true,
 showVerboseMessages: false,
 messageCallback: (message: ExtractorMessage) => {
```

- [ ] **Step 5: Run type check**

Run: `pnpm run typecheck`

Expected: No type errors.

- [ ] **Step 6: Run tests**

Run: `pnpm exec vitest run --project unit`

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add package/src/rslib/plugins/dts-plugin.ts
git commit -m "feat: add CompilerState to point API Extractor at TS v6

Create a shared CompilerState with typescriptCompilerFolder pointing
at the installed TypeScript. Reused across all entry points for both
correctness (uses TS v6 instead of bundled TS) and performance.

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 6: Build and Integration Verification

**Files:**

- No file changes, verification only

- [ ] **Step 1: Run full type check**

Run: `pnpm run typecheck`

Expected: No type errors across the workspace.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`

Expected: All tests pass.

- [ ] **Step 3: Run the build**

Run: `pnpm build`

Expected: All packages build successfully, including example workspaces that exercise the builder.

- [ ] **Step 4: Verify API Extractor uses TS v6**

Check that the TS version mismatch warning is no longer being suppressed (it shouldn't fire at all since CompilerState uses TS v6). If the warning still fires, it means the CompilerState fallback is needed.

- [ ] **Step 5: Commit any fixes if needed**

If any issues were found during verification, fix them and commit with an appropriate message.
