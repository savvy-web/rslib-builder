---
status: current
module: rslib-builder
category: architecture
created: 2026-01-18
updated: 2026-03-12
last-synced: 2026-03-12
completeness: 95
related:
  - rslib-builder/api-extraction.md
  - rslib-builder/testing-strategy.md
  - rslib-builder/rspress-plugin-builder.md
dependencies: []
---

# RSlib Builder - Architecture

A sophisticated build system abstraction layer built on RSlib/Rsbuild/Rspack, providing a fluent API for building TypeScript packages with multi-mode support (dev/npm), automatic package.json transformation, and TypeScript declaration bundling.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [System Architecture](#system-architecture)
5. [Data Flow](#data-flow)
6. [Integration Points](#integration-points)
7. [Testing Strategy](#testing-strategy)
8. [Future Enhancements](#future-enhancements)
9. [Related Documentation](#related-documentation)

---

## Overview

`@savvy-web/rslib-builder` provides a high-level `NodeLibraryBuilder` API that simplifies building TypeScript packages for multiple build modes (dev, npm). It handles automatic configuration generation, plugin orchestration, and complex package.json transformations.

The project is organized as a pnpm monorepo with the main package at `package/`, example consumer libraries at `examples/`, and shared configs at `lib/`. The examples serve as both documentation and integration validation (built via turbo alongside the main package).

The system features a plugin-based architecture where plugins operate at different Rsbuild asset processing stages, collectively transforming raw TypeScript source into production-ready distributions with proper type declarations, export mappings, and dependency resolution.

**Key Design Principles:**

- **Abstraction over complexity**: Hide RSlib/Rsbuild configuration details behind a fluent API
- **Plugin composition**: Modular plugins handle specific concerns (entries, types, transforms)
- **Multi-mode support**: Single configuration produces dev and npm builds
- **Convention over configuration**: Sensible defaults with escape hatches for customization
- **Self-building**: The package builds itself using its own NodeLibraryBuilder

**When to reference this document:**

- When adding new plugins to the build system
- When modifying plugin execution order or stages
- When debugging cross-plugin data flow issues
- When extending the builder API with new options

---

## Current State

### System Components

#### Component 1: NodeLibraryBuilder

**Location:** `package/src/rslib/builders/node-library-builder.ts`

**Purpose:** Main public API providing a fluent interface for building Node.js libraries.

**Responsibilities:**

- Parse and validate build options
- Detect build mode from `envMode` parameter
- Compose plugins for the selected build mode
- Generate RSlib configuration
- Inject package version at build time

**Key interfaces/APIs:**

```typescript
interface NodeLibraryBuilderOptions {
  entry?: Record<string, string | string[]>;
  exportsAsIndexes?: boolean;
  copyPatterns: (string | CopyPatternConfig)[];
  plugins: RsbuildPlugin[];
  define: SourceConfig["define"];
  tsconfigPath: string | undefined;
  targets?: BuildMode[];
  externals?: (string | RegExp)[];
  dtsBundledPackages?: string[];
  transformFiles?: (context: TransformFilesContext) => void;
  transform?: TransformPackageJsonFn;
  apiModel?: ApiModelOptions | boolean;  // Default: true
  format?: LibraryFormat | LibraryFormat[];  // Single or dual format
  entryFormats?: Record<string, LibraryFormat>;  // Per-entry overrides
  cjsInterop?: boolean;  // Default: false - CJS default export interop
}

type LibraryFormat = "esm" | "cjs";
type BuildMode = "dev" | "npm";
type PublishProtocol = "npm" | "jsr";

interface PublishTarget {
  protocol: PublishProtocol;
  registry: string | null;    // null for JSR targets
  directory: string;           // Absolute path to output directory
  access: "public" | "restricted";
  provenance: boolean;
  tag: string;
}

// Resolve publish targets from package.json publishConfig.targets
function resolvePublishTargets(
  packageJson: PackageJson,
  cwd: string,
  outdir: string,
): PublishTarget[];

// Declarative API Extractor warning suppression
interface WarningSuppressionRule {
  messageId?: string;  // e.g., "ae-forgotten-export"
  pattern?: string;    // Tried as RegExp first, falls back to substring
}

// Default options
NodeLibraryBuilder.DEFAULT_OPTIONS = {
  format: "esm",
  plugins: [],
  define: {},
  copyPatterns: [],
  targets: ["dev", "npm"],
  externals: [],
  apiModel: true,  // API model enabled by default
  bundle: true,
  cjsInterop: false,  // CJS default export interop disabled by default
};

// Factory method
NodeLibraryBuilder.create(options): RslibConfigAsyncFn
```

**Note:** TSDoc linting is controlled via `apiModel.tsdoc.lint` option (not a separate top-level option). Lint is enabled by default when `apiModel` is enabled.

**Dependencies:**

- Depends on: All plugins, RSlib core, Rsbuild core
- Used by: Consumer rslib.config.ts files

#### Component 2: Plugin System

**Location:** `package/src/rslib/plugins/`

**Purpose:** Modular build transformations operating at specific Rsbuild asset processing stages.

**Plugins:**

- **TsDocLintPlugin** - Validate TSDoc comments before build using ESLint
  - Stage: onBeforeBuild (runs before all other plugins)
  - Uses ImportGraph for automatic file discovery from package.json exports
  - Supports explicit include patterns to override automatic discovery
  - Bundled dependencies: eslint, @typescript-eslint/parser, eslint-plugin-tsdoc
  - Enabled by default when apiModel is enabled (controlled via `apiModel.tsdoc.lint`)
- **AutoEntryPlugin** - Discover entries from package.json exports/bin
  - Stage: modifyRsbuildConfig
- **DtsPlugin** - Generate .d.ts with tsgo, optional API Extractor bundling
  - Stages: modifyRsbuildConfig, pre-process, summarize, onCloseBuild
  - When apiModel enabled: emits tsconfig.json, api model, tsdoc-metadata.json
  - API model is enabled by default for npm mode
  - Multi-entry: runs API Extractor per entry, merges into single `.api.json` with multiple `EntryPoint` members via `mergeApiModels()`
  - Format-aware: emits `.d.cts` for CJS entries, `.d.ts` for ESM entries
- **PackageJsonTransformPlugin** - Transform package.json for dist
  - Stages: pre-process, optimize, optimize-inline
  - Format-aware: generates `import`/`require` conditions based on format
  - Supports `entryFormats` for per-entry format overrides
  - Supports `dualFormat` for combined ESM + CJS export conditions
  - Exposes `base-package-json` via `api.expose()` after standard transforms but before user transform, enabling PublishTargetPlugin to create per-target copies from the same base state
- **FilesArrayPlugin** - Build package.json files array, exclude source maps
  - Stages: additional, optimize-inline
  - Accepts optional `target?: PublishTarget` passed to `transformFiles` callback context
- **PublishTargetPlugin** - Produce per-target output directories for multi-registry publishing
  - Stage: onCloseBuild (runs after all other plugins complete)
  - For each additional publish target (beyond primary): creates directory, copies primary output, deep-copies base-package-json, applies per-target user transform, writes package.json
  - Consumes `base-package-json` exposed by PackageJsonTransformPlugin via `api.useExposed()`
  - Options: `additionalTargets`, `primaryOutdir`, `mode`, `transform?`, `name?`

#### Component 3: Utility Modules

**Location:** `package/src/rslib/plugins/utils/`

**Purpose:** Shared utilities for entry extraction, package.json building, transformations, and message suppression. Consolidated from 14 files to 9 focused modules.

**Consolidated structure (9 files):**

1. **`build-logger.ts`** - Build logging and timing utilities
   - Consolidated from: `time-utils.ts`, `logger-utils.ts`
   - Exports: `createTimer()`, `formatTime()`, `createEnvLogger()`
   - Provides formatted build logging with test suppression and duration tracking

2. **`asset-utils.ts`** - Asset handling utilities
   - Consolidated from: `json-asset-utils.ts`, `asset-processor-utils.ts`
   - Exports: `TextAsset` class, `JsonAsset` class, `createAssetProcessor()`
   - Type-safe JSON/text file handling with asset emission and caching

3. **`file-utils.ts`** - File system utilities
   - Consolidated with: `dependency-path-utils.ts`
   - Exports: `fileExistAsync()`, `packageJsonVersion()`, `getApiExtractorPath()`
   - File existence checks, package version reading, API Extractor path resolution

4. **`package-json-transformer.ts`** - Package.json transformation pipeline
   - Consolidated from: `bin-transform-utils.ts`, `export-transform-utils.ts`, `path-transform-utils.ts`, `rslib-transform-utils.ts`, `pnpm-transform-utils.ts`, `package-json-builder-utils.ts`, `package-json-types-utils.ts`
   - Exports: `buildPackageJson()`, `transformExportPath()`, `createTypePath()`, `transformPackageExports()`, `transformPackageBin()`, `applyRslibTransformations()`, `applyPnpmTransformations()`
   - Orchestrates pnpm + RSlib transformation pipeline, handles exports/bin fields, path transformations, type conditions

5. **`workspace-catalog.ts`** - Multi-package-manager workspace catalog resolution
   - Exports: `WorkspaceCatalog` class, `createWorkspaceCatalog()` factory
   - Multi-package-manager support via `workspace-tools`:
     - **pnpm**: Reads from `pnpm-lock.yaml` (primary, for config dependency catalogs like `catalog:silk`) then falls back to `pnpm-workspace.yaml`
     - **yarn**: Uses `workspace-tools`'s `getCatalogs()` function
     - Other package managers return empty catalogs
   - Factory pattern for dependency injection:
     - `createWorkspaceCatalog()` returns new instances (no global singleton)
     - Plugins can create, cache, and share their own instances
     - `applyPnpmTransformations()` accepts optional `catalog?: WorkspaceCatalog` parameter for DI
   - Named catalog support: Handles `catalog:default`, `catalog:silk`, `catalog:tools`, etc.
   - Validation: Validates referenced catalogs exist before resolution with clear error messages showing available catalogs
   - Logging: Shows which catalog each dependency was resolved from (e.g., `@microsoft/api-extractor: ^7.56.0 (catalog:silk)`)

6. **`entry-extractor.ts`** - Entry point extraction
   - Exports: `EntryExtractor` class, `ExtractedEntries` interface
   - Class-based entry extraction from package.json exports/bin fields
   - `ExtractedEntries` contains `entries` (name-to-source mapping) and `exportPaths` (name-to-original-export-key mapping, e.g., `"nested-one"` -> `"./nested/one"`)
   - `exportPaths` enables lossless reverse mapping for multi-entry API model canonical references

7. **`import-graph.ts`** - TypeScript import graph analysis
   - Exports: `ImportGraph` class, `ImportGraphOptions`, `ImportGraphResult`, `ImportGraphError`, `ImportGraphErrorType`
   - Traces imports from entry points to discover all reachable TypeScript files
   - Uses TypeScript compiler API for accurate module resolution
   - Filters test files, declaration files, and node_modules
   - Provides structured error types for programmatic error handling
   - Supports configurable exclude patterns for custom filtering

8. **`tsconfig-resolver.ts`** - TypeScript config resolution for virtual environments
   - Exports: `TsconfigResolver` class, `TsconfigResolverError`, `ResolvedTsconfig`, `ResolvedCompilerOptions`, standalone converter functions
   - Converts TypeScript's `ParsedCommandLine` to JSON-serializable format
   - Static methods for enum conversion (ScriptTarget, ModuleKind, JsxEmit, etc.)
   - Sets `composite: false` and `noEmit: true` for virtual environment compatibility
   - Excludes path-dependent options (outDir, rootDir, paths, typeRoots, declarationDir)
   - Excludes file selection patterns (include, exclude, files, references)
   - Converts lib references from full paths to canonical names (e.g., "esnext")
   - Used by DtsPlugin to emit resolved tsconfig.json alongside API model

9. **`message-suppressor.ts`** - API Extractor warning suppression
   - Exports: `matchesSuppression()`, `createMessageSuppressor()`, `MessageSuppressor` interface
   - Declarative suppression of API Extractor messages via `WarningSuppressionRule[]`
   - `createMessageSuppressor()` factory pre-compiles patterns for efficient matching
   - `matchesSuppression()` checks a single rule against messageId + text (AND logic when both fields set)
   - Pattern matching: tried as RegExp first, falls back to substring match on invalid regex
   - Used by `bundleDtsFiles()` in DtsPlugin's `messageCallback` before tsdoc/forgottenExports handling

#### Component 4: Multi-Format Build System

**Location:** `package/src/rslib/builders/node-library-builder.ts` (createSingleMode)

**Purpose:** Generate multiple LibConfig entries when the build requires different output formats for different entries.

**Responsibilities:**

- Normalize `format` option (single or array) into `formats[]`
- Detect dual format mode (`formats.length > 1`)
- Create primary LibConfig with full plugin set
- Create secondary LibConfigs (one per additional format) with minimal plugins
- Handle per-entry format overrides via `entryFormats`
- Assign format-specific output directories for dual format

**Multi-Format LibConfig Generation:**

```typescript
// Dual format: format: ['esm', 'cjs']
lib: [
  { id: "npm-esm", format: "esm", distPath: "dist/npm/esm/" },  // Primary
  { id: "npm-cjs", format: "cjs", distPath: "dist/npm/cjs/" },  // Secondary
]

// Per-entry override: entryFormats: { "./markdownlint": "cjs" }
lib: [
  { id: "npm", format: "esm", entries: { index, utils } },   // Primary (ESM)
  { id: "npm-cjs", format: "cjs", entries: { markdownlint } }, // Override (CJS)
]
```

**Primary vs Secondary LibConfigs:**

| Aspect | Primary | Secondary |
| --- | --- | --- |
| AutoEntryPlugin | Yes | No |
| PackageJsonTransformPlugin | Yes | No |
| DtsPlugin | Yes (with apiModel) | Yes (without apiModel) |
| FilesArrayPlugin | Yes | Yes |
| cleanDistPath | true | false |
| User plugins | Yes | No |
| PublishTargetPlugin | Yes (if additional targets) | No |
| cjsInterop footer | If format is CJS | If format is CJS |

**Format Condition Utilities:**

**Location:** `src/rslib/plugins/utils/package-json-transformer.ts`

Post-processing step that transforms standard `{ types, import }` conditions into format-specific conditions:

- `toCjsPath()` - `.js` → `.cjs`
- `toCtsTypePath()` - `.d.ts` → `.d.cts`
- `addFormatDirPrefix()` - `./index.js` → `./esm/index.js`
- `applyFormatConditions()` - Orchestrates per-entry and dual format transforms

#### Component 5: CJS Interop

**Location:** `package/src/rslib/builders/node-library-builder.ts`

**Purpose:** Patch CJS output so `require('module')` returns the default export directly rather than `{ default: value, __esModule: true }`.

**Option:** `cjsInterop?: boolean` (default: `false`)

**How it works:**

- A `CJS_INTEROP_FOOTER` constant is defined at module level containing a self-contained JavaScript snippet
- The snippet is injected via RSlib's `footer: { js: ... }` LibConfig property (maps to rspack's `BannerPlugin` with `footer: true`)
- Only applied to LibConfigs with `format: "cjs"` -- ESM output is never affected
- Applied at three LibConfig creation points: primary lib, secondary lib (dual format), and per-entry format override libs
- The snippet checks for `__esModule` and `default` on `module.exports`, copies named exports onto the default value, and reassigns `module.exports` to the default value
- No-op when there is no default export in the module

**Use case:** Tools like `markdownlint-cli2` that expect `require()` to return the default export directly.

#### Component 6: Multi-Registry Publishing

**Location:** `src/rslib/plugins/publish-target-plugin.ts`, `src/rslib/builders/node-library-builder.ts`

**Purpose:** Enable publishing a single package to multiple registries (e.g., npm + GitHub Packages, npm + JSR) with per-target package.json transformations.

**How it works:**

1. `createSingleMode()` reads `package.json` once at the top and reuses it throughout the method (consolidated from 3 separate reads)
2. `resolvePublishTargets()` is called in npm mode only; dev mode always gets empty targets
3. The primary target (index 0) is passed to `TransformPackageJsonFn` and `FilesArrayPlugin.transformFiles` callback
4. Additional targets (index > 0) are handled by `PublishTargetPlugin` in `onCloseBuild`

**Target resolution flow:**

```text
package.json publishConfig.targets
         |
         v
resolvePublishTargets(packageJson, cwd, outdir)
         |
         v
Expand shorthands ("npm", "github", "jsr", URL)
         |
         v
PublishTarget[] with resolved fields:
  - protocol, registry, directory, access, provenance, tag
         |
         v
targets[0] = primaryTarget (passed to transform/transformFiles)
targets[1..n] = additionalTargets (handled by PublishTargetPlugin)
```

**Known shorthands:**

| Shorthand | Protocol | Registry | Provenance |
| --- | --- | --- | --- |
| `"npm"` | npm | `https://registry.npmjs.org/` | true |
| `"github"` | npm | `https://npm.pkg.github.com/` | true |
| `"jsr"` | jsr | null | false |
| URL string | npm | the URL itself | false |

**Cross-plugin data flow for multi-registry publishing:**

```text
PackageJsonTransformPlugin (optimize stage)
  1. Run buildPackageJson() - standard transforms only
  2. api.expose("base-package-json", deepCopy) ----+
  3. Apply user transform                          |
                                                   |
PublishTargetPlugin (onCloseBuild)  <--------------+
  For each additional target:                      |
  1. Copy primary output directory                 |
  2. basePackageJson = api.useExposed() -----------+
  3. targetPkg = deepCopy(basePackageJson)
  4. Apply user transform({ mode, target, pkg: targetPkg })
  5. Apply optional name override
  6. Copy files array from primary package.json
  7. Write targetPkg to target directory
```

### Architecture Diagram

```text
+-------------------------------------------------------------+
|                    User API Layer                           |
|           NodeLibraryBuilder.create(options)                |
|                                                             |
|    High-level fluent interface hiding RSlib complexity      |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              Configuration Generation Layer                 |
|    - Mode selection (dev/npm)                               |
|    - Plugin composition                                     |
|    - RSlib config assembly                                  |
|    - Build cache configuration                              |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              Plugin Orchestration Layer                     |
|    - 5 specialized plugins + PublishTargetPlugin            |
|    - Sequential execution across build stages               |
|    - Shared state via api.expose/api.useExposed             |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|           Rsbuild Asset Processing Pipeline                 |
|    - modifyRsbuildConfig (configuration)                    |
|    - processAssets: pre-process, optimize, additional,      |
|                     optimize-inline, summarize              |
|    - onCloseBuild (post-build target publishing)            |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|          RSlib/Rspack Compilation Engine                    |
|    - JavaScript compilation                                 |
|    - Asset generation                                       |
|    - Output directory management                            |
+-------------------------------------------------------------+
```

### Current Limitations

- **No incremental type generation**: tsgo runs full compilation each build
- **Sequential plugin stages**: Cannot parallelize cross-plugin operations

---

## Rationale

### Architectural Decisions

#### Decision 1: Plugin-Based Architecture

**Context:** Need modular, testable build transformations that can be composed differently per build mode.

**Options considered:**

1. **Plugin composition (Chosen):**
   - Pros: Modular, testable, reusable across targets
   - Cons: Complexity of shared state management
   - Why chosen: Aligns with Rsbuild's extension model, enables fine-grained control

2. **Monolithic build function:**
   - Pros: Simpler control flow, no shared state concerns
   - Cons: Hard to test, difficult to customize per-mode
   - Why rejected: Would become unmaintainable as features grow

#### Decision 2: Shared State via api.expose()

**Context:** Plugins need to share data (entries, files array) across execution stages.

**Options considered:**

1. **Rsbuild expose/useExposed (Chosen):**
   - Pros: Framework-supported, scoped to build context
   - Cons: Loosely typed, requires runtime checks
   - Why chosen: Standard Rsbuild pattern, works across plugin boundaries

2. **Global singleton:**
   - Pros: Simple access pattern
   - Cons: Not isolated per-build, testing difficulties
   - Why rejected: Would break parallel builds and test isolation

#### Decision 3: tsgo for Declaration Generation

**Context:** Need fast TypeScript declaration generation for large codebases.

**Options considered:**

1. **tsgo native compiler (Chosen):**
   - Pros: 10-100x faster than tsc, native execution
   - Cons: Experimental, may have edge cases
   - Why chosen: Performance critical for developer experience

2. **Standard tsc:**
   - Pros: Battle-tested, full compatibility
   - Cons: Slow for large projects
   - Why rejected: Build times unacceptable for iteration speed

#### Decision 4: API Extractor for Declaration Bundling

**Context:** Need to bundle TypeScript declarations for cleaner public API.

**Options considered:**

1. **@microsoft/api-extractor (Chosen):**
   - Pros: Industry standard, generates API reports, bundles declarations
   - Cons: Can be slow, requires careful configuration
   - Why chosen: Best-in-class API documentation and declaration bundling

2. **rollup-plugin-dts:**
   - Pros: Simpler, faster
   - Cons: Less comprehensive, no API reports
   - Why rejected: Need API model generation for documentation tooling

#### Decision 5: Two-Stage Package.json Transformation

**Context:** Need to resolve pnpm references and transform paths for distribution.

**Options considered:**

1. **Separate pnpm and RSlib stages (Chosen):**
   - Pros: Clear separation of concerns, easier debugging
   - Cons: Two-pass transformation
   - Why chosen: pnpm catalog/workspace resolution must happen before path transformation

2. **Single-pass transformation:**
   - Pros: Potentially faster
   - Cons: Complex interleaving of concerns, harder to maintain
   - Why rejected: Order dependencies make single-pass error-prone

#### Decision 6: Pre-Build TSDoc Validation

**Context:** Need to catch TSDoc documentation errors early, before declaration generation and API model creation.

**Options considered:**

1. **onBeforeBuild hook (Chosen):**
   - Pros: Runs before all plugins, fails fast on doc errors, no wasted compilation time
   - Cons: Adds latency before build starts
   - Why chosen: Documentation errors should block the build early, not after expensive TypeScript compilation

2. **processAssets pre-process stage:**
   - Pros: Runs alongside other plugins
   - Cons: Expensive tsgo compilation already complete before validation
   - Why rejected: Wasteful to compile before knowing docs are valid

3. **Separate lint command:**
   - Pros: Decoupled from build
   - Cons: Easy to forget, not enforced in CI
   - Why rejected: Need integrated validation in build pipeline

#### Decision 7: Environment-Aware Error Handling

**Context:** TSDoc errors should fail CI builds but not block local development iteration.

**Options considered:**

1. **Auto-detect CI with configurable override (Chosen):**
   - Pros: Sensible defaults (throw in CI, error locally), users can override
   - Cons: Implicit behavior based on environment
   - Why chosen: Matches developer expectations - strict in CI, lenient locally

2. **Always throw:**
   - Pros: Consistent behavior
   - Cons: Blocks local iteration on doc issues
   - Why rejected: Too disruptive for development workflow

3. **Always warn:**
   - Pros: Never blocks builds
   - Cons: Errors can slip into production
   - Why rejected: CI should enforce documentation quality

### Design Patterns Used

#### Pattern 1: Factory Method

- **Where used:** `NodeLibraryBuilder.create()`
- **Why used:** Hide instantiation complexity, return config function
- **Implementation:** Static method returns `RslibConfigAsyncFn`

#### Pattern 2: Template Method

- **Where used:** Plugin hooks (modifyRsbuildConfig, processAssets)
- **Why used:** Framework controls execution order, plugins fill in behavior
- **Implementation:** Rsbuild defines stages, plugins implement handlers

#### Pattern 3: Adapter

- **Where used:** NodeLibraryBuilder wrapping RSlib
- **Why used:** Simplify complex RSlib configuration to fluent API
- **Implementation:** User options -> internal defaults -> RSlib config

#### Pattern 4: Factory with Instance Caching

- **Where used:** WorkspaceCatalog class
- **Why used:** Avoid repeated filesystem operations while enabling DI and plugin-level caching
- **Implementation:** Factory function `createWorkspaceCatalog()` returns new instances; each instance caches catalog data and workspace root internally; plugins can create and share instances via dependency injection

#### Pattern 5: Chain of Responsibility

- **Where used:** Package.json transformation pipeline
- **Why used:** Each transformer handles specific concerns in sequence
- **Implementation:** pnpm transforms -> RSlib transforms -> user transforms

### Constraints and Trade-offs

#### Trade-off 1: Flexibility vs. Simplicity

- **What we gained:** Simple API for common use cases
- **What we sacrificed:** Direct RSlib configuration access
- **Why it's worth it:** 90% of builds need standard patterns

#### Trade-off 2: Performance vs. Correctness

- **What we gained:** Fast declaration generation with tsgo
- **What we sacrificed:** Some tsc edge case compatibility
- **Why it's worth it:** Developer iteration speed is critical

#### Trade-off 3: Type Safety vs. API Simplicity

- **What we gained:** Simple shared state with api.expose()
- **What we sacrificed:** Compile-time type safety for shared state
- **Why it's worth it:** Rsbuild's pattern is well-understood, runtime checks suffice

---

## System Architecture

### Layered Architecture

#### Layer 1: User API

**Responsibilities:**

- Accept user configuration options
- Validate inputs
- Return RSlib-compatible config function

**Components:**

- NodeLibraryBuilder class
- Type definitions for options

**Communication:** Returns async function called by RSlib CLI

#### Layer 2: Configuration Generation

**Responsibilities:**

- Merge user options with defaults
- Detect and validate build mode
- Generate single-mode configuration

**Components:**

- NodeLibraryBuilder.mergeOptions()
- NodeLibraryBuilder.createSingleMode()

**Communication:** Produces LibConfig with composed plugins

#### Layer 3: Plugin Orchestration

**Responsibilities:**

- Compose plugins for build mode
- Manage shared state
- Execute stages in order

**Components:**

- All 5 core plugins + PublishTargetPlugin (conditional)
- Shared state keys (files-array, entrypoints, base-package-json, etc.)

**Communication:** Plugins use api.expose/useExposed for data sharing

#### Layer 4: Asset Processing

**Responsibilities:**

- Transform source files
- Generate declarations
- Build package.json

**Components:**

- Utility modules
- Rsbuild processAssets handlers

**Communication:** Modify compilation.assets directly

### Plugin Execution Model

```text
0. onBeforeBuild (Pre-compilation)
   +-- TsDocLintPlugin      - Validate TSDoc comments via ESLint
                            - Fail-fast before expensive compilation
                            - Environment-aware: throw in CI, error locally

1. modifyRsbuildConfig (Sequential)
   +-- AutoEntryPlugin      - Discover entry points from package.json
   +-- DtsPlugin            - Load tsconfig, prepare for declarations

2. processAssets: pre-process (Sequential)
   +-- PackageJsonTransformPlugin - Load package.json, README, LICENSE
   +-- DtsPlugin                  - Generate .d.ts files with tsgo
                                  - Optional: Bundle with API Extractor
                                  - Optional: Generate API model

3. processAssets: optimize (Sequential)
   +-- PackageJsonTransformPlugin - Transform exports, resolve pnpm refs
                                  - Expose base-package-json (before user transform)

4. processAssets: additional (Sequential)
   +-- FilesArrayPlugin       - Accumulate distributable files
   +-- (User transformFiles callback)

5. processAssets: optimize-inline (Sequential)
   +-- PackageJsonTransformPlugin - Set custom name if provided
   +-- FilesArrayPlugin           - Write final package.json with files array

6. processAssets: summarize (Sequential)
   +-- DtsPlugin - Strip source map comments, cleanup .d.ts.map files

7. onCloseBuild (Post-compilation)
   +-- TsDocLintPlugin      - Cleanup temporary tsdoc.json if not persisted
   +-- PublishTargetPlugin   - For each additional publish target:
                              1. Create target directory
                              2. Copy primary build output
                              3. Deep-copy base-package-json
                              4. Apply per-target user transform
                              5. Copy files array from primary package.json
                              6. Write target-specific package.json
```

### Shared State Keys

**`files-array`** - `Set<string>`

- Producer: PackageJsonTransformPlugin, FilesArrayPlugin
- Consumers: All plugins

**`entrypoints`** - `Map<string, string>`

- Producer: AutoEntryPlugin
- Consumers: DtsPlugin

**`exportToOutputMap`** - `Map<string, string>`

- Producer: AutoEntryPlugin
- Consumers: PackageJsonTransformPlugin

**`files-cache`** - `Map<string, CacheEntry>`

- Producer: PackageJsonTransformPlugin
- Consumers: (internal)

**`api-extractor-temp-mapping`** - `{ tempPath, originalPath }`

- Producer: (reserved for API reports)
- Consumers: DtsPlugin

**`api-extractor-package-json`** - `PackageJson`

- Producer: (reserved for API reports)
- Consumers: DtsPlugin

**`use-rollup-types`** - `boolean`

- Producer: (reserved for API reports)
- Consumers: PackageJsonTransformPlugin

**`base-package-json`** - `PackageJson`

- Producer: PackageJsonTransformPlugin (deep copy after standard transforms, before user transform)
- Consumers: PublishTargetPlugin (creates per-target copies from this base state)

### ImportGraph Architecture

**Location:** `package/src/rslib/plugins/utils/import-graph.ts`

**Purpose:** Analyzes TypeScript import relationships to discover all files reachable from specified entry points. Used by TsDocLintPlugin to automatically determine which files need TSDoc validation.

**Key interfaces:**

```typescript
interface ImportGraphOptions {
  rootDir: string;             // Project root for resolving paths
  tsconfigPath?: string;       // Custom tsconfig path (optional)
  sys?: ts.System;             // Custom TS system for testing (optional)
  excludePatterns?: string[];  // Additional patterns to exclude from results
}

interface ImportGraphResult {
  files: string[];           // All reachable TypeScript source files (sorted)
  entries: string[];         // Entry points that were traced
  errors: ImportGraphError[];// Structured errors encountered during analysis
}

// Structured error type for programmatic handling
type ImportGraphErrorType =
  | 'tsconfig_not_found'
  | 'tsconfig_read_error'
  | 'tsconfig_parse_error'
  | 'package_json_not_found'
  | 'package_json_parse_error'
  | 'entry_not_found'
  | 'file_read_error';

interface ImportGraphError {
  type: ImportGraphErrorType; // Error category for switch-case handling
  message: string;            // Human-readable error message
  path?: string;              // File path related to the error (if applicable)
}
```

**How it works:**

1. Parses the tsconfig.json from the project root (or custom path)
2. Creates a TypeScript module resolution cache for efficient resolution
3. For each entry point, recursively traces all imports:
   - Static imports: `import { foo } from "./module"`
   - Dynamic imports: `import("./module")`
   - Re-exports: `export * from "./module"` and `export { foo } from "./module"`
4. Uses the TypeScript compiler API for accurate path alias resolution
5. Tracks visited files to handle circular imports
6. Filters results to exclude:
   - Files in `node_modules`
   - Declaration files (`.d.ts`)
   - Test files (`*.test.ts`, `*.spec.ts`)
   - Files in `__test__` or `__tests__` directories

**Configurable exclusions:**

By default, ImportGraph filters out:

- Files in `node_modules`
- Declaration files (`.d.ts`)
- Test files (`*.test.ts`, `*.spec.ts`)
- Files in `__test__` or `__tests__` directories

Use `excludePatterns` to add custom exclusions:

```typescript
const graph = new ImportGraph({
  rootDir: process.cwd(),
  excludePatterns: ['/fixtures/', '/mocks/', '.stories.'],
});
```

**Usage patterns:**

```typescript
// Static convenience methods (recommended for most cases)
const result = ImportGraph.fromPackageExports('./package.json', { rootDir });
const result = ImportGraph.fromEntries(['./src/index.ts'], { rootDir });

// Instance methods (for repeated analysis, reuses TS program)
const graph = new ImportGraph({ rootDir });
const libResult = graph.traceFromPackageExports('./package.json');
const cliResult = graph.traceFromEntries(['./src/cli.ts']);

// Error handling with structured types
const result = ImportGraph.fromPackageExports('./package.json', { rootDir });
for (const error of result.errors) {
  switch (error.type) {
    case 'tsconfig_not_found':
      console.warn('No tsconfig.json found, using defaults');
      break;
    case 'entry_not_found':
      console.error(`Missing entry: ${error.path}`);
      break;
    default:
      console.error(error.message);
  }
}
```

**Integration with EntryExtractor:** ImportGraph uses EntryExtractor internally when tracing from package.json exports. EntryExtractor parses the `exports` and `bin` fields, then ImportGraph traces imports from those entry points.

---

### TsDocLintPlugin Configuration

The TsDocLintPlugin validates TSDoc comments before the build starts using ESLint with `eslint-plugin-tsdoc`. It shares TSDoc configuration with the DtsPlugin through the `TsDocConfigBuilder` utility.

**Configuration via apiModel.tsdoc.lint:**

TSDoc linting is now configured through the `apiModel.tsdoc.lint` option in `NodeLibraryBuilderOptions`. Lint is enabled by default when `apiModel` is enabled (which is the default).

```typescript
// Lint enabled by default (apiModel: true is the default)
NodeLibraryBuilder.create({})

// Disable lint explicitly
NodeLibraryBuilder.create({
  apiModel: {
    tsdoc: {
      lint: false,
    },
  },
})

// Customize lint behavior
NodeLibraryBuilder.create({
  apiModel: {
    tsdoc: {
      tagDefinitions: [{ tagName: "@error", syntaxKind: "inline" }],
      lint: {
        onError: "throw",
        include: ["src/**/*.ts"],
        persistConfig: true,
      },
    },
  },
})
```

**Lint options interface (nested under `apiModel.tsdoc.lint`):**

```typescript
interface TsDocLintOptions {
  include?: string[];                   // Override automatic file discovery
  onError?: TsDocLintErrorBehavior;     // Default: "throw" in CI, "error" locally
  persistConfig?: boolean | PathLike;   // Default: true locally, validates in CI
}

type TsDocLintErrorBehavior = "warn" | "error" | "throw";
```

**Automatic file discovery (default behavior):**

By default, TsDocLintPlugin uses ImportGraph to automatically discover files from your package's exports. This ensures only public API files are linted, not internal implementation details or test files.

The discovery process:

1. Reads `package.json` from the project root
2. Uses `EntryExtractor` to parse the `exports` and `bin` fields
3. Uses `ImportGraph.traceFromPackageExports()` to trace all imports
4. Returns only TypeScript source files (excludes tests, declarations)

**The `include` option (override automatic discovery):**

Use the `include` option when you need to lint specific files that are not part of the export graph, or to override automatic discovery entirely:

```typescript
apiModel: {
  tsdoc: {
    lint: {
      include: ["src/**/*.ts", "!**/*.test.ts"],
    },
  },
}
```

When `include` is specified:

- The ImportGraph analysis is skipped entirely
- Patterns are passed directly to ESLint
- Negation patterns (starting with `!`) work as expected

**The `onError` option (error handling):**

Controls how TSDoc lint errors are handled:

| Value | Behavior |
| --- | --- |
| `"warn"` | Log warnings, continue build |
| `"error"` | Log errors, continue build (default local) |
| `"throw"` | Fail build immediately (default CI) |

Environment detection uses `CI` or `GITHUB_ACTIONS` environment variables to determine if running in CI.

**The `persistConfig` option (tsdoc.json management):**

Controls whether the generated `tsdoc.json` configuration file is kept after linting. In CI environments, this validates the existing file matches expected configuration instead of writing.

| Value | Local Behavior | CI Behavior |
| --- | --- | --- |
| `true` | Persist to project root | Validate existing file |
| `false` | Clean up after linting | Skip validation, clean up |
| `PathLike` | Persist to custom path | Validate at custom path |
| undefined | Persist to project root (default) | Validate existing file |

**Error handling matrix:**

| Environment | Default onError | Lint Errors | Build Result |
| --- | --- | --- | --- |
| Local | `"error"` | Yes | Continue, log errors |
| CI | `"throw"` | Yes | Fail build |

---

## Data Flow

### Configuration Flow

```text
User Options (NodeLibraryBuilder.create)
         |
         v
    mergeOptions()
         |
         v
    Merged defaults + user config
         |
         v
    createSingleMode(mode, opts)
         |
         v
    Read package.json once (consolidated)
         |
         v
    resolvePublishTargets() (npm mode only)
         |   - dev mode always gets empty targets
         |   - Primary target = first resolved target
         |
         v
    Plugin instantiation
         |   - Plugins receive primaryTarget/mode context
         |   - PublishTargetPlugin added for additional targets
         |
         v
    defineConfig({ lib: [libConfig] })
         |
         v
    RSlib CLI execution
```

### Package.json Transformation Pipeline

```text
Source package.json
         |
         v
    Load in PackageJsonTransformPlugin (pre-process stage)
         |
         v
+----------------------------------------+
| Production mode only:                  |
| applyPnpmTransformations()             |
|   - Accepts optional WorkspaceCatalog  |
|     for dependency injection           |
|   - Creates new instance if not        |
|     provided                           |
|   - Delegates to WorkspaceCatalog      |
|     .resolvePackageJson()              |
+----------------------------------------+
         |
         v
+----------------------------------------+
| WorkspaceCatalog.getCatalogs()         |
|   1. Detect package manager via        |
|      workspace-tools                   |
|   2. For pnpm:                         |
|      - Primary: Read pnpm-lock.yaml    |
|        (config dependency catalogs)    |
|      - Fallback: pnpm-workspace.yaml   |
|   3. For yarn:                         |
|      - Use workspace-tools getCatalogs |
|   4. Other managers: return empty      |
+----------------------------------------+
         |
         v
+----------------------------------------+
| WorkspaceCatalog.resolvePackageJson()  |
|   - Parse catalog: specifiers with     |
|     @pnpm/catalogs.protocol-parser     |
|   - Validate all referenced catalogs   |
|     exist (error with available list)  |
|   - Resolve via @pnpm/exportable-      |
|     manifest with loaded catalogs      |
|   - Log resolved deps with catalog     |
|     source (catalog:silk, workspace:)  |
|   - Validate no unresolved references  |
+----------------------------------------+
         |
         v
+----------------------------------------+
| applyRslibTransformations()            |
|   - transformPackageExports()          |
|     .ts -> .js, add type conditions    |
|   - transformPackageBin()              |
|   - transformTypesVersions()           |
|   - Remove publishConfig, scripts      |
|   - Set private based on publishConfig |
+----------------------------------------+
         |
         v
+----------------------------------------+
| applyFormatConditions() (if needed)    |
|   - Per-entry CJS overrides:           |
|     import → require, .js → .cjs       |
|     .d.ts → .d.cts                     |
|   - Dual format:                       |
|     Add both import + require with     |
|     format directory prefixes          |
|     (./esm/index.js, ./cjs/index.cjs) |
+----------------------------------------+
         |
         v
+----------------------------------------+
| Expose base-package-json               |
|   - Deep copy of package.json after    |
|     all standard transforms            |
|   - Before user transform is applied   |
|   - api.expose("base-package-json")    |
|   - Consumed by PublishTargetPlugin    |
+----------------------------------------+
         |
         v
    Custom transform function (if provided)
         |
         v
    FilesArrayPlugin adds files array
         |
         v
    Output transformed package.json to dist
         |
         v (onCloseBuild, if additional publish targets)
+----------------------------------------+
| PublishTargetPlugin                    |
|   For each additional target:          |
|   1. Create target directory           |
|   2. Copy primary build output         |
|   3. Deep-copy base-package-json       |
|   4. Apply user transform with target  |
|   5. Apply optional name override      |
|   6. Copy files array from primary     |
|   7. Write package.json to target dir  |
+----------------------------------------+
```

### Declaration Generation Flow

```text
Source .ts files
         |
         v
    DtsPlugin: Generate temp tsconfig
         |
         v
    tsgo --declaration --emitDeclarationOnly
         |
         v
    .rslib/declarations/{mode}/
         |
         v
+----------------------------------------+
| API Extractor (per entry point)        |
|   - Bundle each entry's .d.ts          |
|   - Generate per-entry .api.json       |
|   - Generate tsdoc-metadata.json       |
|     (main entry only)                  |
+----------------------------------------+
         |
         v
+----------------------------------------+
| mergeApiModels() (if multiple entries) |
|   - Extract EntryPoint from each model |
|   - Rewrite canonical references for   |
|     sub-entries (e.g., @scope/pkg/sub!)|
|   - Combine into single Package with   |
|     multiple EntryPoint members        |
+----------------------------------------+
         |
         v
+----------------------------------------+
| TsconfigResolver (if apiModel)         |
|   - Convert ParsedCommandLine          |
|     to JSON-serializable               |
|   - Set composite: false,              |
|     noEmit: true                       |
|   - Emit tsconfig.json to dist         |
+----------------------------------------+
         |
         v
    Strip sourceMappingURL comments
         |
         v
    Remove .d.ts.map from dist
         |
         v
    dist/{mode}/*.d.ts
```

### Entry Detection Flow

```text
package.json
         |
         v
+----------------------------------------+
| EntryExtractor.extract()               |
|   - Parse exports field                |
|   - Parse bin field                    |
|   - Map export keys to entry names     |
|   - Resolve TS source paths            |
|   - Build exportPaths mapping          |
|     (entry name -> original export key)|
+----------------------------------------+
         |
         v
    ExtractedEntries: {
      entries: { "index": "./src/index.ts", ... },
      exportPaths: { "index": ".", "utils": "./utils", ... }
    }
         |
         v
    Populate entrypoints Map
         |
         v
    Configure Rsbuild source.entry
```

### TSDoc Validation Flow

```text
onBeforeBuild hook (before compilation)
         |
         v
+----------------------------------------+
| discoverFilesToLint()                  |
|   Check for explicit include patterns  |
+----------------------------------------+
         |
         +------> include provided?
         |        |
         |        +-- YES: Use glob patterns directly
         |        |
         |        +-- NO: Use ImportGraph analysis
         |                   |
         v                   v
+----------------------------------------+
| ImportGraph.fromPackageExports()       |
|   1. Read package.json                 |
|   2. EntryExtractor: parse exports/bin |
|   3. Trace all imports recursively     |
|   4. Filter: test files, .d.ts, etc.   |
|   5. Return sorted list of source files|
+----------------------------------------+
         |
         v
+----------------------------------------+
| TsDocConfigBuilder                     |
|   - Generate tsdoc.json from options   |
|   - Write to project root or temp      |
+----------------------------------------+
         |
         v
+----------------------------------------+
| ESLint (dynamic import)                |
|   - Import eslint, parser, tsdoc plugin|
|   - Configure inline ESLint config     |
|   - Create ESLint instance             |
+----------------------------------------+
         |
         v
    ESLint.lintFiles(discovered files)
         |
         v
    Parse results, count errors/warnings
         |
         v
+----------------------------------------+
| Error Handling (based on onError)      |
|   - "warn":  Log, continue build       |
|   - "error": Log errors, continue      |
|   - "throw": Fail build immediately    |
+----------------------------------------+
         |
         v
    If persistConfig: keep tsdoc.json
    Else: cleanup in onCloseBuild
         |
         v
    Proceed to modifyRsbuildConfig stage
```

### Import Graph Tracing Flow

```text
ImportGraph.traceFromPackageExports()
         |
         v
    Read package.json
         |
         v
+----------------------------------------+
| EntryExtractor.extract()               |
|   - Parse exports field                |
|   - Parse bin field                    |
|   - Map export keys to entry names     |
|   - Resolve TS source paths            |
+----------------------------------------+
         |
         v
    entries: { "index": "./src/index.ts", ... }
         |
         v
+----------------------------------------+
| initializeProgram()                    |
|   - Find tsconfig.json                 |
|   - Parse tsconfig options             |
|   - Create module resolution cache     |
|   - Create minimal TS program          |
+----------------------------------------+
         |
         v
    For each entry file:
         |
         v
+----------------------------------------+
| traceImports(filePath, visited, errors)|
|   1. Skip if already visited (cycle)   |
|   2. Skip if in node_modules           |
|   3. Mark as visited                   |
|   4. Read file content                 |
|   5. Create SourceFile AST             |
|   6. extractImports() from AST:        |
|      - import declarations             |
|      - export declarations             |
|      - dynamic imports                 |
|   7. For each import specifier:        |
|      - resolveImport() via TS API      |
|      - Skip external/declaration files |
|      - Recurse into traceImports()     |
+----------------------------------------+
         |
         v
    Filter visited set:
    - Keep only .ts/.tsx files
    - Exclude .d.ts files
    - Exclude .test.ts/.spec.ts
    - Exclude __test__/__tests__ dirs
    - Apply custom excludePatterns
         |
         v
    Return ImportGraphResult:
    - files: sorted list of source files
    - entries: entry points that were traced
    - errors: ImportGraphError[] with structured types
```

---

## Integration Points

### RSlib Integration

**Configuration returned (single format):**

```typescript
{
  lib: [{
    id: mode,                      // "dev" or "npm"
    outBase: outputDir,
    format: "esm",
    bundle: true,
    experiments: { advancedEsm: true },
    output: {
      target: "node",
      module: true,
      cleanDistPath: true,
      sourceMap: mode === "dev",
      distPath: { root: `dist/${mode}` },
      copy: { patterns: [...] },
      externals: [...],
    },
    plugins: [...composedPlugins],
    source: {
      tsconfigPath,
      entry: { ... },
      define: {
        "process.env.__PACKAGE_VERSION__": JSON.stringify(VERSION),
        ...userDefine,
      },
    }
  }],
  source: { tsconfigPath },
  performance: {
    buildCache: { cacheDirectory: `.rslib/cache/${mode}` }
  }
}
```

**Configuration returned (dual format):**

```typescript
{
  lib: [
    {
      id: `${mode}-esm`,            // Primary format
      format: "esm",
      output: { distPath: { root: `dist/${mode}/esm` } },
      plugins: [AutoEntry, PackageJson, Files, Dts, ...userPlugins],
    },
    {
      id: `${mode}-cjs`,            // Secondary format
      format: "cjs",
      output: {
        distPath: { root: `dist/${mode}/cjs` },
        cleanDistPath: false,
      },
      plugins: [Files, Dts],        // Minimal plugin set
      // If cjsInterop: true, adds footer: { js: CJS_INTEROP_FOOTER }
    },
  ],
}
```

### Rsbuild Plugin API

**Used APIs:**

- `api.modifyRsbuildConfig()` - Modify config before compilation
- `api.processAssets(stage, handler)` - Process at specific stages
- `api.expose(key, value)` - Store shared state
- `api.useExposed(key)` - Retrieve shared state
- `api.context.rootPath` - Get project root
- `api.getRsbuildConfig()` - Read current configuration
- `api.onBeforeBuild()` - Hook before build starts
- `api.onCloseBuild()` - Hook after build completes (used by PublishTargetPlugin)
- `api.logger` - Rsbuild logger instance

### External Dependencies

**Build Tools:**

- **@rslib/core**: RSlib build system
- **@rsbuild/core**: Underlying plugin framework
- **@rspack/core**: Bundler engine

**Type Generation:**

- **@typescript/native-preview (tsgo)**: Fast declaration generation
- **@microsoft/api-extractor**: Declaration bundling, API model generation
- **typescript**: TypeScript compiler API for config parsing

**TSDoc Validation (Bundled Dependencies):**

- **eslint**: ESLint core for programmatic linting
- **@typescript-eslint/parser**: TypeScript parser for ESLint
- **eslint-plugin-tsdoc**: TSDoc validation rules for ESLint

**Package.json Processing:**

- **@pnpm/exportable-manifest**: Resolve pnpm catalog/workspace references
- **@pnpm/lockfile.fs**: Read `pnpm-lock.yaml` for config dependency catalogs
- **@pnpm/workspace.read-manifest**: Read `pnpm-workspace.yaml` for traditional catalog definitions
- **@pnpm/catalogs.config**: Normalize catalogs from workspace manifest
- **@pnpm/catalogs.protocol-parser**: Parse `catalog:name` specifiers to extract catalog names
- **@pnpm/types**: Type definitions for pnpm manifests
- **sort-package-json**: Consistent package.json field ordering
- **type-fest**: PackageJson type definitions

**Workspace Detection and Catalog Resolution:**

- **workspace-tools**: Multi-package-manager workspace support
  - `getWorkspaceManagerAndRoot()`: Detect package manager (pnpm, yarn, npm, etc.) and workspace root
  - `getCatalogs()`: Read yarn workspace catalogs

**Utilities:**

- **picocolors**: Terminal coloring
- **glob**: File pattern matching

---

## Testing Strategy

### Co-Located Test Structure

Tests are co-located with source files for better discoverability and maintenance:

```text
package/src/
├── rslib/
│   ├── builders/
│   │   ├── node-library-builder.ts
│   │   └── node-library-builder.test.ts    # Co-located with source
│   └── plugins/
│       ├── auto-entry-plugin.ts
│       ├── auto-entry-plugin.test.ts       # Co-located with source
│       ├── dts-plugin.ts
│       ├── dts-plugin.test.ts
│       ├── files-array-plugin.ts
│       ├── files-array-plugin.test.ts
│       ├── package-json-transform-plugin.ts
│       ├── package-json-transform-plugin.test.ts
│       ├── publish-target-plugin.ts
│       ├── publish-target-plugin.test.ts
│       ├── tsdoc-lint-plugin.ts
│       ├── tsdoc-lint-plugin.test.ts       # 15 tests for TSDoc linting
│       └── utils/
│           ├── workspace-catalog.ts
│           ├── workspace-catalog.test.ts   # Co-located with source
│           ├── asset-utils.ts
│           ├── json-asset-utils.test.ts    # Tests asset utilities
│           └── ...
├── exports.test.ts                          # Module export tests
└── __test__/rslib/
    ├── types/test-types.ts                  # Shared mock types
    └── utils/test-types.ts                  # Shared test utilities
```

### Plugin Testing

**Approach:**

- Mock Rsbuild API with type-safe interfaces
- Test each plugin in isolation
- Verify shared state interactions via `api.expose()`

**Example:**

```typescript
import { createMockStats } from '../../__test__/rslib/types/test-types.js';

const plugin = AutoEntryPlugin();
const mockApi = {
  modifyRsbuildConfig: vi.fn(),
  expose: vi.fn(),
  useExposed: vi.fn().mockReturnValue(undefined),
  onBeforeBuild: vi.fn(),
  logger: { debug: vi.fn() },
};

plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

// Trigger hook and verify behavior
const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
await configModifier(config);
expect(config.environments.development.source).toHaveProperty('entry');
```

### Builder Testing

**Approach:**

- Test option merging
- Verify plugin composition per mode
- Snapshot configuration output

### Utility Testing

**Approach:**

- Unit test pure transformation functions
- Test edge cases for entry extraction
- Verify pnpm reference resolution
- Test path transformations with various inputs

### Shared Test Utilities

**Location:** `package/src/__test__/rslib/`

Shared test helpers remain in the `__test__` directory:

- `types/test-types.ts` - Mock asset types (`MockAsset`, `MockAssetRegistry`)
- `utils/test-types.ts` - Utility functions (`createMockStats()`, `createMockProcessAssetsContext()`)

**Type-safe mocks:**

```typescript
import type { MockAssetRegistry } from '../__test__/rslib/types/test-types.js';
import { createMockStats } from '../__test__/rslib/utils/test-types.js';

const mockAssets: MockAssetRegistry = {
  'index.js': { source: () => 'export {}' }
};

const stats = createMockStats(new Date());
```

**Never use `any`** - always create proper mock types.

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

For comprehensive testing strategy details, see [testing-strategy.md](./testing-strategy.md).

---

## RSPressPluginBuilder

In addition to `NodeLibraryBuilder`, the package provides `RSPressPluginBuilder` — a specialized builder for RSPress plugins with a dual-bundle architecture:

- **Plugin bundle** (always present): Node.js ESM server-side logic with RSPress externals
- **Runtime bundle** (optional, auto-detected): Web-targeted React components with CSS modules, BannerPlugin for CSS injection, and `pluginReact()` auto-added

`RSPressPluginBuilder` reuses the same plugin primitives (DtsPlugin, PackageJsonTransformPlugin, FilesArrayPlugin, PublishTargetPlugin, TsDocLintPlugin) but composes them differently across two lib entries. The plugin lib owns package.json processing; the runtime lib is lightweight.

Key differences from `NodeLibraryBuilder`:

- No AutoEntryPlugin — entries are fixed (plugin + optional runtime)
- No bundleless mode or CJS output — always bundled ESM
- `tsconfigPreset` option on DtsPlugin uses `TSConfigs.rspress.plugin` (module: esnext, moduleResolution: bundler)
- Runtime auto-detection via `fs.existsSync("src/runtime/index.tsx")`

For full details, see [rspress-plugin-builder.md](./rspress-plugin-builder.md).

---

## Future Enhancements

### Phase 1: Short-term

- **Incremental declaration caching**: Skip unchanged files in tsgo
- **Parallel plugin stages**: Where dependencies allow

### Phase 2: Medium-term

- **Watch mode support**: Rebuild on file changes
- **Source map preservation**: Optional .map file distribution
- **JSR target package.json transforms**: JSR-specific package.json transformations (protocol resolved, directory output working via PublishTargetPlugin)

### Phase 3: Long-term

- **Remote caching**: Share build cache across CI runs

---

## Related Documentation

**Internal Design Docs:**

- [API Extraction](./api-extraction.md) - API model generation and TSDoc configuration (TsDocLintPlugin shares tsdoc options with DtsPlugin)
- [RSPress Plugin Builder](./rspress-plugin-builder.md) - Dual-bundle builder for RSPress plugins with React runtime components

**Package Documentation:**

- `README.md` - Package overview and usage
- `CLAUDE.md` - Development guide for AI agents

**External Resources:**

- [RSlib Documentation](https://rslib.dev/) - Build system documentation
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core) - Plugin development
- [Rspack](https://rspack.dev/) - Underlying bundler
- [API Extractor](https://api-extractor.com/) - Declaration bundling
- [PNPM Workspace](https://pnpm.io/workspaces) - Workspace configuration
- [PNPM Catalog Protocol](https://pnpm.io/catalogs) - Dependency catalogs

---

**Document Status:** Current - Core architecture documented with all components including ImportGraph analysis, TsDocLintPlugin file discovery, multi-entry API model generation with per-entry API Extractor runs and merge, multi-package-manager workspace catalog resolution (pnpm, yarn) with factory pattern for dependency injection, multi-format build system (dual format, per-entry format overrides, format-aware DTS and export conditions), CJS interop footer injection for default export compatibility, and multi-registry publishing via PublishTargetPlugin with cross-plugin base-package-json data flow

**Next Steps:** Add sequence diagrams for complex flows, document edge cases in transformation pipeline
