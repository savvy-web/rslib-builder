---
status: current
module: rslib-builder
category: architecture
created: 2026-01-18
updated: 2026-01-18
last-synced: 2026-01-19
completeness: 90
related: []
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
   - Exports: `PackageJsonTransformer` class plus standalone functions
   - Orchestrates pnpm + RSlib transformation pipeline, handles exports/bin
     fields, path transformations, type conditions

5. **`pnpm-catalog.ts`** - PNPM catalog resolution (unchanged)
   - Exports: `PnpmCatalog` class
   - Singleton with mtime-based cache invalidation for catalog/workspace
     reference resolution

6. **`entry-extractor.ts`** - Entry point extraction (unchanged)
   - Exports: `EntryExtractor` class
   - Class-based entry extraction from package.json exports/bin fields

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

**Next Steps:** Add sequence diagrams for complex flows, document edge cases in
transformation pipeline
