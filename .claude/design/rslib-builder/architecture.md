---
status: draft
module: rslib-builder
category: architecture
created: 2026-01-18
updated: 2026-01-18
last-synced: 2026-01-18
completeness: 75
related: []
dependencies: []
---

# RSlib Builder - Architecture

A sophisticated build system abstraction layer built on
RSlib/Rsbuild/Rspack, providing a fluent API for building TypeScript
packages with multi-target support.

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

`@savvy-web/rslib-builder` provides a high-level `NodeLibraryBuilder`
API that simplifies building TypeScript packages for multiple targets
(dev, npm, jsr). It handles automatic configuration generation, plugin
orchestration, and complex package.json transformations.

The system features a plugin-based architecture where plugins operate
at different asset processing stages, collectively transforming raw
TypeScript source into production-ready distributions with proper type
declarations, export mappings, and dependency resolution.

**Key Design Principles:**

- **Abstraction over complexity**: Hide RSlib/Rsbuild configuration
  details behind a fluent API
- **Plugin composition**: Modular plugins handle specific concerns
  (entries, types, transforms)
- **Multi-target support**: Single configuration produces dev, npm, and jsr builds
- **Convention over configuration**: Sensible defaults with escape hatches for customization

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

**Purpose:** Main public API providing a fluent interface for building Node.js libraries.

**Responsibilities:**

- Parse and validate build options
- Detect build target from `envMode` parameter
- Compose plugins for the selected target
- Generate RSlib configuration

**Key interfaces/APIs:**

```typescript
interface NodeLibraryBuilderOptions {
  bundle: boolean;
  format: "esm" | "cjs";
  entry?: Record<string, string>;
  exportsAsIndexes?: boolean;
  externals?: (string | RegExp)[];
  dtsBundledPackages?: string[];
  transform?: (ctx: TransformContext) => PackageJson;
  transformFiles?: (ctx: TransformFilesContext) => void;
  apiReports?: boolean;
}

// Factory method
NodeLibraryBuilder.create(options): RslibConfigAsyncFn
```

**Dependencies:**

- Depends on: All plugins, RSlib core
- Used by: Consumer rslib.config.ts files

#### Component 2: Plugin System

**Location:** `src/rslib/plugins/`

**Purpose:** Modular build transformations operating at specific asset
processing stages.

**Plugins:**

| Plugin | Purpose | Stage |
| ------ | ------- | ----- |
| AutoEntryPlugin | Discover entries from pkg | modifyRsbuildConfig |
| DtsPlugin | Generate .d.ts with tsgo | pre-process |
| PackageJsonTransformPlugin | Transform pkg for dist | pre-process |
| FilesArrayPlugin | Build pkg files array | additional |
| BundlelessPlugin | Transform bundleless paths | additional |
| JSRBundlelessPlugin | Preserve TS for JSR | optimize-inline |
| ApiReportPlugin | Generate API reports | modifyRsbuildConfig |

#### Component 3: Utility Modules

**Location:** `src/rslib/plugins/utils/`

**Purpose:** Shared utilities for entry extraction, package.json
building, and transformations.

**Key utilities:**

- `entry-extractor-utils.ts` - Parse package.json exports/bin for entries
- `package-json-builder-utils.ts` - Orchestrate transformation pipeline
- `rslib-transform-utils.ts` - Convert .ts paths to .js, add type conditions
- `pnpm-transform-utils.ts` - Resolve catalog: and workspace: references
- `json-asset-utils.ts` - Type-safe JSON file handling
- `logger-utils.ts` - Formatted build logging

### Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────┐
│                    User API Layer                            │
│           NodeLibraryBuilder.create(options)                 │
│                                                              │
│    High-level fluent interface hiding RSlib complexity       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Configuration Generation Layer                  │
│    - Target selection (dev/npm/jsr)                         │
│    - Plugin composition                                      │
│    - RSlib config assembly                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Plugin Orchestration Layer                      │
│    - 7 specialized plugins                                  │
│    - Sequential execution across build stages               │
│    - Shared state via api.expose/api.useExposed            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│           Rsbuild Asset Processing Pipeline                 │
│    - modifyRsbuildConfig (configuration)                    │
│    - processAssets: pre-process, optimize, additional, etc. │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│          RSlib/Rspack Compilation Engine                    │
│    - JavaScript compilation                                 │
│    - Asset generation                                       │
│    - Output directory management                            │
└─────────────────────────────────────────────────────────────┘
```

### Current Limitations

- **No incremental type generation**: tsgo runs full compilation each build
- **Sequential plugin stages**: Cannot parallelize cross-plugin operations
- **JSR requires exports**: Packages with only bin entries cannot publish to JSR

---

## Rationale

### Architectural Decisions

#### Decision 1: Plugin-Based Architecture

**Context:** Need modular, testable build transformations that can be
composed differently per target.

**Options considered:**

1. **Plugin composition (Chosen):**
   - Pros: Modular, testable, reusable across targets
   - Cons: Complexity of shared state management
   - Why chosen: Aligns with Rsbuild's extension model, enables fine-grained control

2. **Monolithic build function:**
   - Pros: Simpler control flow, no shared state concerns
   - Cons: Hard to test, difficult to customize per-target
   - Why rejected: Would become unmaintainable as features grow

#### Decision 2: Shared State via api.expose()

**Context:** Plugins need to share data (entries, files array) across
execution stages.

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
- **Implementation:** User options → internal defaults → RSlib config

### Constraints and Trade-offs

#### Trade-off 1: Flexibility vs. Simplicity

- **What we gained:** Simple API for common use cases
- **What we sacrificed:** Direct RSlib configuration access
- **Why it's worth it:** 90% of builds need standard patterns

#### Trade-off 2: Performance vs. Correctness

- **What we gained:** Fast declaration generation with tsgo
- **What we sacrificed:** Some tsc edge case compatibility
- **Why it's worth it:** Developer iteration speed is critical

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

#### Layer 2: Plugin Orchestration

**Responsibilities:**

- Compose plugins for target
- Manage shared state
- Execute stages in order

**Components:**

- All 7 plugins
- Shared state keys (files-array, entrypoints, etc.)

**Communication:** Plugins use api.expose/useExposed for data sharing

#### Layer 3: Asset Processing

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
   ├── AutoEntryPlugin      - Discover entry points from package.json
   ├── DtsPlugin            - Load tsconfig, prepare for declarations
   └── ApiReportPlugin      - Prepare API extraction if needed

2. processAssets: pre-process (Sequential)
   ├── PackageJsonTransformPlugin - Load package.json, README, LICENSE
   └── DtsPlugin                  - Generate .d.ts files with tsgo

3. processAssets: optimize (Sequential)
   └── PackageJsonTransformPlugin - Transform exports, resolve pnpm refs

4. processAssets: additional (Sequential)
   ├── BundlelessPlugin       - Transform paths for bundleless mode
   ├── FilesArrayPlugin       - Accumulate distributable files
   └── JSRBundlelessPlugin    - Emit TypeScript files for JSR

5. processAssets: optimize-inline (Sequential)
   ├── PackageJsonTransformPlugin - Set custom JSR name if provided
   ├── ApiReportPlugin            - Finalize API report output
   └── FilesArrayPlugin           - Write final package.json

6. processAssets: summarize (Sequential)
   └── DtsPlugin - Strip source map comments, cleanup
```

### Shared State Keys

| Key | Type | Producer | Consumers |
| --- | ---- | -------- | --------- |
| `files-array` | `Set<string>` | FilesArrayPlugin | All plugins |
| `entrypoints` | `Map` | AutoEntryPlugin | JSRBundlelessPlugin |
| `exportToOutputMap` | `Map` | AutoEntryPlugin | PkgJsonTransform |
| `api-extractor-temp-mapping` | object | ApiReportPlugin | DtsPlugin |
| `use-rollup-types` | boolean | ApiReportPlugin | DtsPlugin |

---

## Data Flow

### Configuration Flow

```text
User Options (NodeLibraryBuilder.create)
         ↓
    mergeOptions()
         ↓
    Merged defaults + user config
         ↓
    createSingleTarget(target, opts)
         ↓
    Plugin instantiation
         ↓
    defineConfig({ lib: [libConfig] })
         ↓
    RSlib CLI execution
```

### Package.json Transformation Pipeline

```text
Source package.json
         ↓
    Load in PackageJsonTransformPlugin (pre-process)
         ↓
    ┌────────────────────────────────────────┐
    │ applyPnpmTransformations()             │
    │   - Resolve catalog: references        │
    │   - Resolve workspace: references      │
    │   - Validate all resolved              │
    └────────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────────┐
    │ applyRslibTransformations()            │
    │   - transformPackageExports()          │
    │     .ts → .js, add type conditions     │
    │   - transformPackageBin()              │
    │   - transformTypesVersions()           │
    └────────────────────────────────────────┘
         ↓
    Custom transform function (if provided)
         ↓
    Output transformed package.json
```

### Declaration Generation Flow

```text
Source .ts files
         ↓
    tsgo --declaration --emitDeclarationOnly
         ↓
    .rslib/declarations/{target}/
         ↓
    ┌────────────────────────────────┐
    │ Bundle mode?                   │
    │ ├─ Yes: API Extractor bundling │
    │ └─ No: Per-file .d.ts emit     │
    └────────────────────────────────┘
         ↓
    Strip sourceMappingURL comments
         ↓
    dist/{target}/*.d.ts
```

---

## Integration Points

### RSlib Integration

**Configuration returned:**

```typescript
{
  lib: [{
    id: target,                    // "dev", "npm", "jsr"
    format: "esm" | "cjs",
    bundle: boolean,
    output: {
      target: "node",
      distPath: { root: `dist/${target}` },
      externals: [...],
      sourceMap: target === "dev"
    },
    plugins: [...composedPlugins],
    source: {
      tsconfigPath,
      entry: { ... }
    }
  }]
}
```

### Rsbuild Plugin API

**Used APIs:**

- `api.modifyRsbuildConfig()` - Modify config before compilation
- `api.processAssets(stage, handler)` - Process at specific stages
- `api.expose(key, value)` - Store shared state
- `api.useExposed(key)` - Retrieve shared state
- `api.context.rootPath` - Get project root

### External Dependencies

- **@microsoft/api-extractor**: Optional declaration bundling
- **@pnpm/exportable-manifest**: Resolve pnpm catalog/workspace references
- **tsgo (@typescript/native-preview)**: Fast declaration generation

---

## Testing Strategy

### Plugin Testing

**Location:** `src/__test__/rslib/plugins/`

**Approach:**

- Mock Rsbuild API with type-safe interfaces
- Test each plugin in isolation
- Verify shared state interactions

**Example:**

```typescript
const mockApi = createMockRsbuildApi();
const plugin = AutoEntryPlugin({ ... });
plugin.setup(mockApi);

// Trigger hook
await mockApi.triggerModifyRsbuildConfig(config);

// Assert entries populated
expect(config.source.entry).toEqual({ ... });
```

### Builder Testing

**Location:** `src/__test__/rslib/builders/`

**Approach:**

- Test option merging
- Verify plugin composition per target
- Snapshot configuration output

### Utility Testing

**Location:** `src/__test__/rslib/utils/`

**Approach:**

- Unit test pure transformation functions
- Test edge cases for entry extraction
- Verify pnpm reference resolution

---

## Future Enhancements

### Phase 1: Short-term

- **Incremental declaration caching**: Skip unchanged files in tsgo
- **Parallel plugin stages**: Where dependencies allow

### Phase 2: Medium-term

- **Watch mode support**: Rebuild on file changes
- **Source map preservation**: Optional .map file distribution

### Phase 3: Long-term

- **Monorepo support**: Build multiple packages in workspace
- **Remote caching**: Share build cache across CI runs

---

## Related Documentation

**Internal Design Docs:**

- (None yet - this is the first)

**Package Documentation:**

- `README.md` - Package overview and usage
- `CLAUDE.md` - Development guide for AI agents

**External Resources:**

- [RSlib Documentation](https://rslib.dev/) - Build system documentation
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core) - Plugin development
- [Rspack](https://rspack.dev/) - Underlying bundler
- [API Extractor](https://api-extractor.com/) - Declaration bundling

---

**Document Status:** Draft - Core architecture documented, needs refinement

**Next Steps:** Document additional plugin details, add sequence
diagrams for complex flows
