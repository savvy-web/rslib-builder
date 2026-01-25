---
status: current
module: rslib-builder
category: architecture
created: 2026-01-18
updated: 2026-01-25
last-synced: 2026-01-25
completeness: 95
related:
  - rslib-builder/api-extraction.md
dependencies: []
---

# RSlib Builder - Architecture

A sophisticated build system abstraction layer built on RSlib/Rsbuild/Rspack,
providing a fluent API for building TypeScript packages with multi-target
support, automatic package.json transformation, and TypeScript declaration
bundling.

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

`@savvy-web/rslib-builder` provides a high-level `NodeLibraryBuilder` API that
simplifies building TypeScript packages for multiple targets (dev, npm). It
handles automatic configuration generation, plugin orchestration, and complex
package.json transformations.

The system features a plugin-based architecture where plugins operate at
different Rsbuild asset processing stages, collectively transforming raw
TypeScript source into production-ready distributions with proper type
declarations, export mappings, and dependency resolution.

**Key Design Principles:**

- **Abstraction over complexity**: Hide RSlib/Rsbuild configuration details
  behind a fluent API
- **Plugin composition**: Modular plugins handle specific concerns (entries,
  types, transforms)
- **Multi-target support**: Single configuration produces dev and npm builds
- **Convention over configuration**: Sensible defaults with escape hatches for
  customization
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

**Location:** `src/rslib/builders/node-library-builder.ts`

**Purpose:** Main public API providing a fluent interface for building Node.js
libraries.

**Responsibilities:**

- Parse and validate build options
- Detect build target from `envMode` parameter
- Compose plugins for the selected target
- Generate RSlib configuration
- Inject package version at build time

**Key interfaces/APIs:**

```typescript
interface NodeLibraryBuilderOptions {
  entry?: Record<string, string | string[]>;
  exportsAsIndexes?: boolean;
  copyPatterns: (string | RawCopyPattern)[];
  plugins: RsbuildPlugin[];
  define: SourceConfig["define"];
  tsconfigPath: string | undefined;
  targets?: BuildTarget[];
  externals?: (string | RegExp)[];
  dtsBundledPackages?: string[];
  transformFiles?: (context: TransformFilesContext) => void;
  transform?: TransformPackageJsonFn;
  apiModel?: ApiModelOptions | boolean;
  tsdocLint?: TsDocLintPluginOptions | boolean;
}

type BuildTarget = "dev" | "npm";

// Factory method
NodeLibraryBuilder.create(options): RslibConfigAsyncFn
```

**Dependencies:**

- Depends on: All plugins, RSlib core, Rsbuild core
- Used by: Consumer rslib.config.ts files

#### Component 2: Plugin System

**Location:** `src/rslib/plugins/`

**Purpose:** Modular build transformations operating at specific Rsbuild asset
processing stages.

**Plugins:**

- **TsDocLintPlugin** - Validate TSDoc comments before build using ESLint
  - Stage: onBeforeBuild (runs before all other plugins)
  - Uses ImportGraph for automatic file discovery from package.json exports
  - Supports explicit include patterns to override automatic discovery
  - Optional peer dependencies: eslint, @typescript-eslint/parser,
    eslint-plugin-tsdoc
- **AutoEntryPlugin** - Discover entries from package.json exports/bin
  - Stage: modifyRsbuildConfig
- **DtsPlugin** - Generate .d.ts with tsgo, optional API Extractor bundling
  - Stages: modifyRsbuildConfig, pre-process, summarize
- **PackageJsonTransformPlugin** - Transform package.json for dist
  - Stages: pre-process, optimize, optimize-inline
- **FilesArrayPlugin** - Build package.json files array, exclude source maps
  - Stages: additional, optimize-inline

#### Component 3: Utility Modules

**Location:** `src/rslib/plugins/utils/`

**Purpose:** Shared utilities for entry extraction, package.json building, and
transformations. Consolidated from 14 files to 6 focused modules.

**Consolidated structure (6 files):**

1. **`build-logger.ts`** - Build logging and timing utilities
   - Consolidated from: `time-utils.ts`, `logger-utils.ts`
   - Exports: `createTimer()`, `formatTime()`, `createEnvLogger()`
   - Provides formatted build logging with test suppression and duration
     tracking

2. **`asset-utils.ts`** - Asset handling utilities
   - Consolidated from: `json-asset-utils.ts`, `asset-processor-utils.ts`
   - Exports: `TextAsset` class, `JsonAsset` class, `createAssetProcessor()`
   - Type-safe JSON/text file handling with asset emission and caching

3. **`file-utils.ts`** - File system utilities
   - Consolidated with: `dependency-path-utils.ts`
   - Exports: `fileExistAsync()`, `packageJsonVersion()`, `getApiExtractorPath()`
   - File existence checks, package version reading, API Extractor path
     resolution

4. **`package-json-transformer.ts`** - Package.json transformation pipeline
   - Consolidated from: `bin-transform-utils.ts`, `export-transform-utils.ts`,
     `path-transform-utils.ts`, `rslib-transform-utils.ts`,
     `pnpm-transform-utils.ts`, `package-json-builder-utils.ts`,
     `package-json-types-utils.ts`
   - Exports: `buildPackageJson()`, `transformExportPath()`, `createTypePath()`,
     `transformPackageExports()`, `transformPackageBin()`,
     `applyRslibTransformations()`, `applyPnpmTransformations()`
   - Orchestrates pnpm + RSlib transformation pipeline, handles exports/bin
     fields, path transformations, type conditions

5. **`pnpm-catalog.ts`** - PNPM catalog resolution (unchanged)
   - Exports: `PnpmCatalog` class
   - Singleton with mtime-based cache invalidation for catalog/workspace
     reference resolution

6. **`entry-extractor.ts`** - Entry point extraction (unchanged)
   - Exports: `EntryExtractor` class
   - Class-based entry extraction from package.json exports/bin fields

7. **`import-graph.ts`** - TypeScript import graph analysis
   - Exports: `ImportGraph` class, `ImportGraphOptions`, `ImportGraphResult`,
     `ImportGraphError`, `ImportGraphErrorType`
   - Traces imports from entry points to discover all reachable TypeScript files
   - Uses TypeScript compiler API for accurate module resolution
   - Filters test files, declaration files, and node_modules
   - Provides structured error types for programmatic error handling
   - Supports configurable exclude patterns for custom filtering

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
|    - Target selection (dev/npm)                             |
|    - Plugin composition                                     |
|    - RSlib config assembly                                  |
|    - Build cache configuration                              |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              Plugin Orchestration Layer                     |
|    - 4 specialized plugins                                  |
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
- **Single entry bundled declarations**: API Extractor only bundles the main
  entry point (".") declarations

---

## Rationale

### Architectural Decisions

#### Decision 1: Plugin-Based Architecture

**Context:** Need modular, testable build transformations that can be composed
differently per target.

**Options considered:**

1. **Plugin composition (Chosen):**
   - Pros: Modular, testable, reusable across targets
   - Cons: Complexity of shared state management
   - Why chosen: Aligns with Rsbuild's extension model, enables fine-grained
     control

2. **Monolithic build function:**
   - Pros: Simpler control flow, no shared state concerns
   - Cons: Hard to test, difficult to customize per-target
   - Why rejected: Would become unmaintainable as features grow

#### Decision 2: Shared State via api.expose()

**Context:** Plugins need to share data (entries, files array) across execution
stages.

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

**Context:** Need to resolve pnpm references and transform paths for
distribution.

**Options considered:**

1. **Separate pnpm and RSlib stages (Chosen):**
   - Pros: Clear separation of concerns, easier debugging
   - Cons: Two-pass transformation
   - Why chosen: pnpm catalog/workspace resolution must happen before path
     transformation

2. **Single-pass transformation:**
   - Pros: Potentially faster
   - Cons: Complex interleaving of concerns, harder to maintain
   - Why rejected: Order dependencies make single-pass error-prone

#### Decision 6: Pre-Build TSDoc Validation

**Context:** Need to catch TSDoc documentation errors early, before declaration
generation and API model creation.

**Options considered:**

1. **onBeforeBuild hook (Chosen):**
   - Pros: Runs before all plugins, fails fast on doc errors, no wasted
     compilation time
   - Cons: Adds latency before build starts
   - Why chosen: Documentation errors should block the build early, not after
     expensive TypeScript compilation

2. **processAssets pre-process stage:**
   - Pros: Runs alongside other plugins
   - Cons: Expensive tsgo compilation already complete before validation
   - Why rejected: Wasteful to compile before knowing docs are valid

3. **Separate lint command:**
   - Pros: Decoupled from build
   - Cons: Easy to forget, not enforced in CI
   - Why rejected: Need integrated validation in build pipeline

#### Decision 7: Environment-Aware Error Handling

**Context:** TSDoc errors should fail CI builds but not block local development
iteration.

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

#### Pattern 4: Singleton with Caching

- **Where used:** PnpmCatalog class
- **Why used:** Avoid repeated filesystem operations for catalog resolution
- **Implementation:** Module-level instance with mtime-based cache invalidation

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
- **Why it's worth it:** Rsbuild's pattern is well-understood, runtime checks
  suffice

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
- Detect and validate build target
- Generate single-target configuration

**Components:**

- NodeLibraryBuilder.mergeOptions()
- NodeLibraryBuilder.createSingleTarget()

**Communication:** Produces LibConfig with composed plugins

#### Layer 3: Plugin Orchestration

**Responsibilities:**

- Compose plugins for target
- Manage shared state
- Execute stages in order

**Components:**

- All 4 plugins
- Shared state keys (files-array, entrypoints, etc.)

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

### ImportGraph Architecture

**Location:** `src/rslib/plugins/utils/import-graph.ts`

**Purpose:** Analyzes TypeScript import relationships to discover all files
reachable from specified entry points. Used by TsDocLintPlugin to automatically
determine which files need TSDoc validation.

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

**Integration with EntryExtractor:** ImportGraph uses EntryExtractor internally
when tracing from package.json exports. EntryExtractor parses the `exports`
and `bin` fields, then ImportGraph traces imports from those entry points.

---

### TsDocLintPlugin Configuration

The TsDocLintPlugin validates TSDoc comments before the build starts using
ESLint with `eslint-plugin-tsdoc`. It shares TSDoc configuration with the
DtsPlugin through the `TsDocConfigBuilder` utility.

**Options interface:**

```typescript
interface TsDocLintPluginOptions {
  enabled?: boolean;                    // Default: true
  tsdoc?: TsDocOptions;                 // Shared with DtsPlugin apiModel.tsdoc
  include?: string[];                   // Override automatic file discovery
  onError?: TsDocLintErrorBehavior;     // Default: "throw" in CI, "error" locally
  persistConfig?: boolean | PathLike;   // Default: true locally, false in CI
}

type TsDocLintErrorBehavior = "warn" | "error" | "throw";
```

**Automatic file discovery (default behavior):**

By default, TsDocLintPlugin uses ImportGraph to automatically discover files
from your package's exports. This ensures only public API files are linted,
not internal implementation details or test files.

The discovery process:

1. Reads `package.json` from the project root
2. Uses `EntryExtractor` to parse the `exports` and `bin` fields
3. Uses `ImportGraph.traceFromPackageExports()` to trace all imports
4. Returns only TypeScript source files (excludes tests, declarations)

**The `include` option (override automatic discovery):**

Use the `include` option when you need to lint specific files that are not
part of the export graph, or to override automatic discovery entirely:

```typescript
// Override with explicit glob patterns
TsDocLintPlugin({
  include: ["src/**/*.ts", "!**/*.test.ts"],
})

// Lint only specific files
TsDocLintPlugin({
  include: ["src/public-api.ts", "src/types.ts"],
})
```

When `include` is specified:

- The ImportGraph analysis is skipped entirely
- Patterns are passed directly to ESLint
- Negation patterns (starting with `!`) work as expected

**The `onError` option (error handling):**

Controls how TSDoc lint errors are handled:

| Value     | Behavior                                   |
| --------- | ------------------------------------------ |
| `"warn"`  | Log warnings, continue build               |
| `"error"` | Log errors, continue build (default local) |
| `"throw"` | Fail build immediately (default CI)        |

Environment detection uses `CI`, `GITHUB_ACTIONS`, or `CONTINUOUS_INTEGRATION`
environment variables to determine if running in CI.

**The `persistConfig` option (tsdoc.json management):**

Controls whether the generated `tsdoc.json` configuration file is kept after
linting:

| Value      | Behavior                                      |
| ---------- | --------------------------------------------- |
| `true`     | Keep tsdoc.json in project root (IDE support) |
| `false`    | Delete after linting completes                |
| `PathLike` | Write to custom path                          |

Default: `true` locally (for IDE integration), `false` in CI environments.

**Configuration sharing:** When `NodeLibraryBuilder` has both `apiModel.tsdoc`
and `tsdocLint` configured, the same tag definitions and TSDoc configuration
are used by both plugins to ensure consistent validation and API model
generation.

**Error handling matrix:**

| Environment | Default onError | Lint Errors | Build Result         |
| ----------- | --------------- | ----------- | -------------------- |
| Local       | `"error"`       | Yes         | Continue, log errors |
| CI          | `"throw"`       | Yes         | Fail build           |

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
    createSingleTarget(target, opts)
         |
         v
    Plugin instantiation
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
|   - Delegates to PnpmCatalog           |
|     .resolvePackageJson()              |
|   - Resolves catalog: references       |
|   - Resolves workspace: references     |
|   - Validates all resolved             |
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
    Custom transform function (if provided)
         |
         v
    FilesArrayPlugin adds files array
         |
         v
    Output transformed package.json to dist
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
    .rslib/declarations/{target}/
         |
         v
+--------------------------------+
| API Extractor                  |
|   - Bundle main entry .d.ts    |
|   - Optional: Generate         |
|     api.model.json             |
+--------------------------------+
         |
         v
    Strip sourceMappingURL comments
         |
         v
    Remove .d.ts.map from dist
         |
         v
    dist/{target}/*.d.ts
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
+----------------------------------------+
         |
         v
    entries: { "index": "./src/index.ts", ... }
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

**Configuration returned:**

```typescript
{
  lib: [{
    id: target,                    // "dev" or "npm"
    outBase: outputDir,
    format: "esm",
    bundle: true,
    experiments: { advancedEsm: true },
    output: {
      target: "node",
      module: true,
      cleanDistPath: true,
      sourceMap: target === "dev", // Only for dev
      distPath: { root: `dist/${target}` },
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
    buildCache: { cacheDirectory: `.rslib/cache/${target}` }
  }
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

**TSDoc Validation (Optional Peer Dependencies):**

- **eslint**: ESLint core for programmatic linting
- **@typescript-eslint/parser**: TypeScript parser for ESLint
- **eslint-plugin-tsdoc**: TSDoc validation rules for ESLint

**Package.json Processing:**

- **@pnpm/exportable-manifest**: Resolve pnpm catalog/workspace references
- **@pnpm/types**: Type definitions for pnpm manifests
- **sort-package-json**: Consistent package.json field ordering
- **type-fest**: PackageJson type definitions

**Workspace Detection:**

- **workspace-tools**: Find workspace root across package managers

**Utilities:**

- **picocolors**: Terminal coloring
- **yaml**: Parse pnpm-workspace.yaml
- **glob**: File pattern matching

---

## Testing Strategy

### Co-Located Test Structure

Tests are co-located with source files for better discoverability and
maintenance:

```text
src/
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
│       ├── tsdoc-lint-plugin.ts
│       ├── tsdoc-lint-plugin.test.ts       # 15 tests for TSDoc linting
│       └── utils/
│           ├── pnpm-catalog.ts
│           ├── pnpm-catalog.test.ts        # Co-located with source
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
- Verify plugin composition per target
- Snapshot configuration output

### Utility Testing

**Approach:**

- Unit test pure transformation functions
- Test edge cases for entry extraction
- Verify pnpm reference resolution
- Test path transformations with various inputs

### Shared Test Utilities

**Location:** `src/__test__/rslib/`

Shared test helpers remain in the `__test__` directory:

- `types/test-types.ts` - Mock asset types (`MockAsset`, `MockAssetRegistry`)
- `utils/test-types.ts` - Utility functions (`createMockStats()`,
  `createMockProcessAssetsContext()`)

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

For comprehensive testing strategy details, see
[testing-strategy.md](./testing-strategy.md).

---

## Future Enhancements

### Phase 1: Short-term

- **Incremental declaration caching**: Skip unchanged files in tsgo
- **Parallel plugin stages**: Where dependencies allow
- **Multi-entry declaration bundling**: Extend API Extractor to bundle all
  entries

### Phase 2: Medium-term

- **Watch mode support**: Rebuild on file changes
- **Source map preservation**: Optional .map file distribution
- **JSR target support**: Publish to JavaScript Registry

### Phase 3: Long-term

- **Monorepo support**: Build multiple packages in workspace
- **Remote caching**: Share build cache across CI runs
- **Custom plugin hooks**: User-defined build stages

---

## Related Documentation

**Internal Design Docs:**

- [API Extraction](./api-extraction.md) - API model generation and TSDoc
  configuration (TsDocLintPlugin shares tsdoc options with DtsPlugin)

**Package Documentation:**

- `README.md` - Package overview and usage
- `CLAUDE.md` - Development guide for AI agents

**External Resources:**

- [RSlib Documentation](https://rslib.dev/) - Build system documentation
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core) - Plugin
  development
- [Rspack](https://rspack.dev/) - Underlying bundler
- [API Extractor](https://api-extractor.com/) - Declaration bundling
- [PNPM Workspace](https://pnpm.io/workspaces) - Workspace configuration
- [PNPM Catalog Protocol](https://pnpm.io/catalogs) - Dependency catalogs

---

**Document Status:** Current - Core architecture documented with all components
including ImportGraph analysis and TsDocLintPlugin file discovery

**Next Steps:** Add sequence diagrams for complex flows, document edge cases in
transformation pipeline
