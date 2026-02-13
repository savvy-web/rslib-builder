---
status: complete
module: rslib-builder
category: architecture
created: 2026-02-03
updated: 2026-02-03
last-synced: 2026-02-03
completeness: 100
related:
  - rslib-builder/architecture.md
  - rslib-builder/api-extraction.md
dependencies: []
---

# Virtual Entries Feature

A feature to support bundling additional entry points with custom output names that bypass type generation and package.json exports while still being included in the published package.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [System Architecture](#system-architecture)
5. [Data Flow](#data-flow)
6. [Integration Points](#integration-points)
7. [Testing Strategy](#testing-strategy)
8. [Future Enhancements](#future-enhancements)

---

## Overview

The `virtualEntries` feature allows bundling additional entry points with custom output names without generating TypeScript declarations or adding them to package.json exports. These are "virtual" in the sense that they exist outside the standard entry point workflow while using the same bundling machinery.

**Primary Use Case:** pnpm config dependencies require a `pnpmfile.cjs` file that must be CommonJS, self-contained (no external requires), and doesn't need type declarations.

**Key Characteristics:**

- Uses same bundling machinery as regular entries
- Exact key names become output filenames (e.g., `pnpmfile.cjs`)
- Output location: `dist/{target}/` alongside other outputs
- Configurable format per-entry (defaults to `"esm"`)
- **No type generation** - `.d.ts` files are not created
- **No package.json exports** - these are internal/special files
- **Included in files array** - must be published to npm

**When to reference this document:**

- When implementing the virtualEntries feature
- When modifying how entry points are processed
- When extending the builder for additional specialized output types
- When debugging virtual entry bundling issues

---

## Current State

### Implemented API

The `virtualEntries` option and top-level `format` option are implemented in `NodeLibraryBuilderOptions`:

```typescript
interface VirtualEntryConfig {
  /** Path to source file (relative to package root) */
  source: string;
  /** Output format: "esm" | "cjs" (default: inherited from top-level format) */
  format?: "esm" | "cjs";
}

interface NodeLibraryBuilderOptions {
  // ... existing options ...

  /**
   * Output format for main entry points.
   * Also determines package.json "type" field:
   * - "esm" → "type": "module"
   * - "cjs" → "type": "commonjs"
   *
   * @default "esm"
   */
  format?: "esm" | "cjs";

  /**
   * Additional entry points bundled with custom output names.
   * These entries bypass type generation and package.json exports
   * but are included in the published package.
   *
   * A module may have ONLY virtualEntries with no regular entry points.
   *
   * @example
   * ```typescript
   * // Mixed: regular entries + virtual entries
   * NodeLibraryBuilder.create({
   *   virtualEntries: {
   *     "pnpmfile.cjs": {
   *       source: "./src/pnpmfile.ts",
   *       format: "cjs",
   *     },
   *   },
   * })
   *
   * // Virtual-only: no regular entry points
   * NodeLibraryBuilder.create({
   *   format: "cjs",
   *   virtualEntries: {
   *     "pnpmfile.cjs": {
   *       source: "./src/pnpmfile.ts",
   *     },
   *   },
   * })
   * ```
   */
  virtualEntries?: Record<string, VirtualEntryConfig>;
}
```

### Valid Configuration Patterns

1. **Standard**: Regular entries only (current behavior)
2. **Mixed**: Regular entries + virtual entries
3. **Virtual-only**: No regular entries, only virtual entries

Virtual-only configurations are valid for packages that exist solely to provide special files (like pnpmfile.cjs) without exposing a programmatic API.

### Behavior Matrix

| Aspect | Regular Entries | Virtual Entries |
| --- | --- | --- |
| Source discovery | Auto from package.json exports | Explicit `source` path |
| Output naming | Entry name + .js/.cjs | Exact key name |
| Format | Top-level `format` option (default: esm) | Per-entry or inherited from top-level |
| Type generation | Yes (.d.ts via DtsPlugin) | **No** |
| package.json exports | Yes (auto-added) | **No** |
| package.json files | Yes | **Yes** |
| Bundling | Full bundling | Full bundling |
| Externals | Uses configured externals | Uses configured externals |

### Package.json Type Field

The top-level `format` option determines the `type` field in the transformed package.json:

| Format | package.json type |
| --- | --- |
| `"esm"` (default) | `"type": "module"` |
| `"cjs"` | `"type": "commonjs"` |

This ensures Node.js correctly interprets the module format of the published package.

### Implementation Approach

There are two viable approaches for implementing virtual entries:

#### Approach A: Separate RSlib `lib` Configs (Recommended)

Create additional RSlib `lib` configurations for virtual entries that need different formats. This leverages RSlib's existing multi-lib support.

**Pros:**

- Clean separation of concerns
- Native format handling (no workarounds)
- Each virtual entry can have completely independent configuration
- Easier to debug (separate compilation units)

**Cons:**

- Slightly more complex configuration generation
- Multiple compilation passes for different formats

#### Approach B: Single Config with Custom Plugin

Process virtual entries within a custom Rsbuild plugin that handles the different format requirements.

**Pros:**

- Single build pass
- All entry processing in one place

**Cons:**

- Complex format handling within single config
- May conflict with RSlib's format assumptions
- Harder to maintain

**Decision:** Approach A (separate lib configs) is recommended for its cleaner architecture and native format support.

---

## Rationale

### Architectural Decisions

#### Decision 1: Separate lib Configs for Format Isolation

**Context:** Virtual entries may require different formats (CJS vs ESM) than the main library build.

**Options considered:**

1. **Separate lib configs per format (Chosen):**
   - Pros: Native RSlib format handling, clean separation
   - Cons: Multiple configs to manage
   - Why chosen: RSlib is designed for multi-lib builds; this aligns with its model

2. **Single config with format override:**
   - Pros: Simpler initial implementation
   - Cons: Fighting against RSlib's single-format-per-lib design
   - Why rejected: Would require workarounds that may break

3. **Post-build transform:**
   - Pros: Simple conceptually
   - Cons: Loses bundling benefits, manual CJS transform is error-prone
   - Why rejected: Doesn't meet the "same bundling machinery" requirement

#### Decision 2: Skip Type Generation via DtsPlugin Exclusion

**Context:** Virtual entries don't need TypeScript declarations.

**Options considered:**

1. **DtsPlugin exclusion list (Chosen):**
   - Pros: Clean opt-out mechanism, DtsPlugin already iterates entries
   - Cons: Requires DtsPlugin awareness of virtual entries
   - Why chosen: Minimal change, explicit exclusion is clear

2. **Separate compilation without DtsPlugin:**
   - Pros: Complete isolation
   - Cons: Duplicates plugin composition logic
   - Why rejected: Unnecessary complexity for just skipping types

#### Decision 3: FilesArrayPlugin Handles Virtual Entry Inclusion

**Context:** Virtual entries must be in package.json files array for publishing.

**Options considered:**

1. **FilesArrayPlugin extension (Chosen):**
   - Pros: Centralizes file management, existing pattern
   - Cons: FilesArrayPlugin needs access to virtual entry config
   - Why chosen: Consistent with existing architecture

2. **Dedicated VirtualEntryPlugin:**
   - Pros: Full isolation of virtual entry logic
   - Cons: Spreads file management across plugins
   - Why rejected: Would fragment file array management

#### Decision 4: Virtual Entries Not Added to package.json Exports

**Context:** Virtual entries are special files that shouldn't be importable as package exports.

**Rationale:**

- `pnpmfile.cjs` is loaded by pnpm, not imported by users
- Adding to exports would pollute the package API
- Users can still access via direct path if needed (`pkg/pnpmfile.cjs`)

### Design Patterns Used

#### Pattern: Configuration Aggregation

Virtual entries are aggregated into the RSlib configuration alongside regular entries, but routed to separate lib configs when formats differ.

```typescript
// Pseudo-code for config generation
const libConfigs: LibConfig[] = [mainLibConfig];

// Group virtual entries by format
const virtualByFormat = groupBy(virtualEntries, (e) => e.format ?? "esm");

for (const [format, entries] of virtualByFormat) {
  if (format === mainFormat && !needsSeparateConfig(entries)) {
    // Merge into main config
    mainLibConfig.source.entry = { ...mainLibConfig.source.entry, ...entries };
  } else {
    // Create separate lib config
    libConfigs.push(createVirtualLibConfig(format, entries));
  }
}
```

#### Pattern: Marker-Based Exclusion

DtsPlugin uses a marker to identify virtual entries and skip them:

```typescript
// Marker in entry name or via shared state
const virtualEntryNames = api.useExposed<Set<string>>("virtual-entry-names");
if (virtualEntryNames?.has(entryName)) {
  continue; // Skip type generation
}
```

---

## System Architecture

### Component Interactions

```text
+------------------------------------------+
|         NodeLibraryBuilder.create()      |
|   - Parse virtualEntries option          |
|   - Group entries by format              |
|   - Generate lib configs                 |
+------------------------------------------+
                    |
                    v
+------------------------------------------+
|         RSlib Configuration              |
|   lib: [                                 |
|     { id: "npm", format: "esm", ... },   |  <- Main build
|     { id: "npm-cjs", format: "cjs", ...} |  <- Virtual CJS entries
|   ]                                      |
+------------------------------------------+
                    |
                    v
+------------------------------------------+
|         Plugin Orchestration             |
|   - AutoEntryPlugin: Skip virtual entries|
|   - DtsPlugin: Exclude virtual entries   |
|   - FilesArrayPlugin: Include outputs    |
|   - PackageJsonTransformPlugin: No change|
+------------------------------------------+
```

### Shared State Keys

**`library-format`** - `"esm" | "cjs"`

- Producer: NodeLibraryBuilder (via plugin)
- Consumers: PackageJsonTransformPlugin, DtsPlugin
- Purpose: Determine package.json `type` field and resolved tsconfig.json module settings

**`virtual-entry-names`** - `Set<string>`

- Producer: NodeLibraryBuilder (via plugin or config)
- Consumers: DtsPlugin, AutoEntryPlugin
- Purpose: Identify entries to exclude from type generation

**`virtual-entry-outputs`** - `Map<string, string>`

- Producer: Virtual entry processing (during build)
- Consumers: FilesArrayPlugin
- Purpose: Track output files for files array inclusion

### RSlib Multi-Lib Configuration

When virtual entries have different formats, the configuration expands:

```typescript
// Generated RSlib config structure
{
  lib: [
    // Main ESM library
    {
      id: "npm",
      format: "esm",
      source: {
        entry: {
          index: "./src/index.ts",
          utils: "./src/utils/index.ts",
        },
      },
      plugins: [AutoEntryPlugin(), DtsPlugin(), ...],
    },
    // Virtual CJS entries
    {
      id: "npm-virtual-cjs",
      format: "cjs",
      bundle: true,
      output: {
        distPath: { root: "dist/npm" }, // Same output directory
      },
      source: {
        entry: {
          pnpmfile: "./src/pnpmfile.ts", // Entry name, output is "pnpmfile.cjs"
        },
      },
      plugins: [VirtualEntryPlugin({ virtualEntryNames })], // Minimal plugin set
    },
  ],
}
```

---

## Data Flow

### Configuration Flow

```text
User Options (virtualEntries)
         |
         v
    NodeLibraryBuilder.create()
         |
         v
    Validate virtual entry configs
         |
         v
    Group by format
         |
         v
    Generate lib configs:
    - Main lib (ESM, regular entries)
    - Virtual libs (per format group)
         |
         v
    Expose virtual-entry-names
         |
         v
    RSlib build execution
```

### Build Flow for Virtual Entries

```text
RSlib invokes each lib config
         |
         v
+----------------------------------------+
| Virtual Entry Lib Build                |
|   - Format: CJS (or ESM)               |
|   - No AutoEntryPlugin                 |
|   - No DtsPlugin                       |
|   - Minimal plugins                    |
+----------------------------------------+
         |
         v
    Rspack bundles entry
         |
         v
    Output: dist/npm/pnpmfile.cjs
         |
         v
    FilesArrayPlugin adds to files array
```

### Plugin Stage Participation

```text
Plugin Stages for Virtual Entries:

modifyRsbuildConfig
  +-- (Virtual entries already in config)

processAssets: pre-process
  +-- PackageJsonTransformPlugin (standard processing)
  +-- [DtsPlugin skipped for virtual libs]

processAssets: additional
  +-- FilesArrayPlugin (includes virtual entry outputs)

processAssets: optimize-inline
  +-- PackageJsonTransformPlugin (standard)
  +-- FilesArrayPlugin (writes files array)
```

---

## Integration Points

### NodeLibraryBuilder Changes

```typescript
// In NodeLibraryBuilder.createSingleTarget()

// Get top-level format (affects main entries and package.json type)
const libraryFormat = options.format ?? "esm";

// Process virtual entries
const virtualEntries = options.virtualEntries ?? {};
const virtualEntryNames = new Set(Object.keys(virtualEntries));

// Check if this is a virtual-only configuration
const hasRegularEntries = Object.keys(packageJsonExports).length > 0;
const hasVirtualEntries = Object.keys(virtualEntries).length > 0;

if (!hasRegularEntries && !hasVirtualEntries) {
  throw new Error("No entry points configured. Provide package.json exports or virtualEntries.");
}

// Group virtual entries by format (inherit from top-level if not specified)
const virtualByFormat = new Map<"esm" | "cjs", Map<string, string>>();
for (const [outputName, config] of Object.entries(virtualEntries)) {
  const format = config.format ?? libraryFormat;
  if (!virtualByFormat.has(format)) {
    virtualByFormat.set(format, new Map());
  }
  // Convert output name to entry name (strip extension)
  const entryName = outputName.replace(/\.(js|cjs|mjs)$/, "");
  virtualByFormat.get(format)!.set(entryName, config.source);
}

// Create lib configs
const libConfigs: LibConfig[] = [];

// Main lib config (only if there are regular entries)
if (hasRegularEntries) {
  libConfigs.push({
    id: target,
    format: libraryFormat,
    // ... rest of main config with AutoEntryPlugin, DtsPlugin, etc.
  });
}

// Additional lib configs for virtual entries (grouped by format)
for (const [format, entries] of virtualByFormat) {
  libConfigs.push({
    id: `${target}-virtual-${format}`,
    format,
    bundle: true,
    output: {
      target: "node",
      distPath: { root: `dist/${target}` },
      // No source maps for virtual entries (typically)
      sourceMap: false,
    },
    source: {
      entry: Object.fromEntries(entries),
    },
    plugins: [
      // Minimal plugins - just what's needed for bundling
      VirtualEntryPlugin({ virtualEntryNames }),
      FilesArrayPlugin({ target }),
    ],
  });
}

// Expose library format for PackageJsonTransformPlugin
// (via plugin that calls api.expose("library-format", libraryFormat))
```

### DtsPlugin Changes

**Virtual entry exclusion:**

```typescript
// In DtsPlugin, during entry iteration
const virtualEntryNames = api.useExposed<Set<string>>("virtual-entry-names");

for (const [entryName, sourcePath] of Object.entries(entries)) {
  // Skip virtual entries - they don't need type declarations
  if (virtualEntryNames?.has(entryName)) {
    continue;
  }

  // Existing type generation logic...
}
```

**Resolved tsconfig.json format alignment:**

When outputting the resolved `tsconfig.json` for virtual TS environments, it must reflect the actual compilation format. Since the source is always ESM, but the output may be CJS, the tsconfig needs adjustment:

```typescript
// In DtsPlugin, when emitting resolved tsconfig.json
const libraryFormat = api.useExposed<"esm" | "cjs">("library-format") ?? "esm";

const resolvedTsConfig = {
  // ... other options ...
  compilerOptions: {
    // ... other compiler options ...

    // Match the output format
    module: libraryFormat === "cjs" ? "CommonJS" : "ESNext",
    moduleResolution: libraryFormat === "cjs" ? "Node" : "Bundler",

    // For CJS, may also need:
    esModuleInterop: libraryFormat === "cjs" ? true : undefined,
  },
};
```

This ensures tools consuming the resolved tsconfig.json (like virtual TS environments, documentation generators, or IDE integrations) correctly understand the module format of the compiled output.

### AutoEntryPlugin Changes

No changes needed - AutoEntryPlugin processes package.json exports, and virtual entries are not in exports. The plugin naturally ignores them.

### FilesArrayPlugin Changes

```typescript
// In FilesArrayPlugin, during asset collection

// Virtual entry outputs are already in compilation.assets
// They will be automatically added to filesArray by existing logic:
for (const assetName of Object.keys(context.compilation.assets)) {
  if (!assetName.endsWith(".map") && !filesArray.has(assetName)) {
    filesArray.add(assetName);
  }
}

// No special handling needed - virtual entries appear as regular assets
```

### PackageJsonTransformPlugin Changes

**Type field based on format:**

```typescript
// In PackageJsonTransformPlugin, during package.json transformation
const format = api.useExposed<"esm" | "cjs">("library-format") ?? "esm";

// Set type field based on format
packageJson.type = format === "esm" ? "module" : "commonjs";
```

**No changes for exports** - virtual entries don't affect package.json exports transformation. The plugin only processes entries from the `entrypoints` map exposed by AutoEntryPlugin, which excludes virtual entries.

---

## Testing Strategy

### Unit Tests

**NodeLibraryBuilder Tests:**

```typescript
describe("format option", () => {
  it("should default format to esm", () => {
    const options = NodeLibraryBuilder.mergeOptions({});
    expect(options.format).toBeUndefined();
    // Format defaults to "esm" during config generation
  });

  it("should accept cjs format", () => {
    const options = NodeLibraryBuilder.mergeOptions({ format: "cjs" });
    expect(options.format).toBe("cjs");
  });
});

describe("virtualEntries option", () => {
  it("should include virtualEntries in merged options", () => {
    const options = NodeLibraryBuilder.mergeOptions({
      virtualEntries: {
        "pnpmfile.cjs": { source: "./src/pnpmfile.ts", format: "cjs" },
      },
    });
    expect(options.virtualEntries).toBeDefined();
    expect(options.virtualEntries?.["pnpmfile.cjs"]).toEqual({
      source: "./src/pnpmfile.ts",
      format: "cjs",
    });
  });

  it("should inherit format from top-level when not specified", () => {
    const options = NodeLibraryBuilder.mergeOptions({
      format: "cjs",
      virtualEntries: {
        "helper.cjs": { source: "./src/helper.ts" },
      },
    });
    // Virtual entry format should inherit "cjs" during config generation
    expect(options.virtualEntries?.["helper.cjs"].format).toBeUndefined();
  });

  it("should allow virtual-only configuration", () => {
    // Valid: no regular entries, only virtualEntries
    const options = NodeLibraryBuilder.mergeOptions({
      virtualEntries: {
        "pnpmfile.cjs": { source: "./src/pnpmfile.ts", format: "cjs" },
      },
    });
    expect(options.virtualEntries).toBeDefined();
  });
});
```

**DtsPlugin Tests:**

```typescript
describe("virtual entry exclusion", () => {
  it("should skip type generation for virtual entries", async () => {
    const mockApi = createMockApi({
      exposed: {
        "virtual-entry-names": new Set(["pnpmfile"]),
        entrypoints: new Map([
          ["index.ts", "./src/index.ts"],
          ["pnpmfile.ts", "./src/pnpmfile.ts"],
        ]),
      },
    });

    // ... setup and run plugin ...

    // Verify only index.d.ts was generated, not pnpmfile.d.ts
    expect(generatedFiles).toContain("index.d.ts");
    expect(generatedFiles).not.toContain("pnpmfile.d.ts");
  });
});
```

### E2E Tests

**Location:** `test/e2e/builder-options/virtual-entries.test.ts`

```typescript
describe("format option E2E", () => {
  it("should set package.json type to module for esm format", async () => {
    // Build fixture with format: "esm" (or default)
    // Read dist/npm/package.json
    // Verify "type": "module"
  });

  it("should set package.json type to commonjs for cjs format", async () => {
    // Build fixture with format: "cjs"
    // Read dist/npm/package.json
    // Verify "type": "commonjs"
  });

  it("should output .cjs files for cjs format", async () => {
    // Build fixture with format: "cjs"
    // Verify dist/npm/index.cjs exists (not index.js)
  });

  it("should emit resolved tsconfig.json with ESM module settings for esm format", async () => {
    // Build fixture with format: "esm" (or default)
    // Read dist/npm/tsconfig.json
    // Verify module: "ESNext" and moduleResolution: "Bundler"
  });

  it("should emit resolved tsconfig.json with CJS module settings for cjs format", async () => {
    // Build fixture with format: "cjs"
    // Read dist/npm/tsconfig.json
    // Verify module: "CommonJS" and moduleResolution: "Node"
    // Verify esModuleInterop: true
  });
});

describe("virtualEntries E2E", () => {
  it("should bundle CJS virtual entry with correct format", async () => {
    // Build fixture with virtualEntries config
    // Verify dist/npm/pnpmfile.cjs exists
    // Verify output is valid CommonJS (no import/export)
    // Verify no pnpmfile.d.ts exists
  });

  it("should include virtual entries in package.json files array", async () => {
    // Build fixture
    // Read dist/npm/package.json
    // Verify files array contains "pnpmfile.cjs"
  });

  it("should not add virtual entries to package.json exports", async () => {
    // Build fixture
    // Read dist/npm/package.json
    // Verify exports does not contain "./pnpmfile.cjs"
  });

  it("should handle multiple virtual entries with different formats", async () => {
    // Build fixture with both ESM and CJS virtual entries
    // Verify both outputs exist with correct formats
  });

  it("should support virtual-only configuration", async () => {
    // Build fixture with only virtualEntries (no package.json exports)
    // Verify virtual entry output exists
    // Verify package.json has no exports field (or empty)
    // Verify files array contains virtual entry
  });

  it("should inherit format from top-level for virtual entries", async () => {
    // Build fixture with format: "cjs" and virtualEntries without explicit format
    // Verify virtual entry uses CJS format
  });
});
```

### Fixture Structure

```text
test/e2e/fixtures/virtual-entries/
├── package.json
├── src/
│   ├── index.ts      # Main entry
│   ├── pnpmfile.ts   # CJS virtual entry
│   └── helper.ts     # ESM virtual entry
└── rslib.config.ts   # Generated during test
```

---

## Future Enhancements

### Phase 1: Core Implementation (Complete)

- ~~Basic virtualEntries option parsing~~
- ~~Separate lib config generation for different formats~~
- ~~DtsPlugin exclusion logic~~
- ~~FilesArrayPlugin integration~~

### Phase 2: Enhanced Configuration

- Per-entry externals override
- Per-entry source map configuration
- Banner/footer support for virtual entries
- Minification options

### Phase 3: Advanced Features

- Watch mode support for virtual entries
- Virtual entry dependencies (build order)
- Conditional virtual entries (target-specific)

---

## Related Documentation

**Internal Design Docs:**

- [Architecture](./architecture.md) - Overall plugin architecture
- [API Extraction](./api-extraction.md) - Type generation details

**External Resources:**

- [RSlib Multi-Lib Configuration](https://rslib.dev/guide/advanced/multiple-lib)
- [pnpm Configuration Dependencies](https://pnpm.io/package_json#dependenciesmeta)
- [pnpmfile.cjs Documentation](https://pnpm.io/pnpmfile)

---

**Document Status:** Complete - Feature implemented in v0.9.0

**Implementation Summary:**

- Core `virtualEntries` and `format` options added to `NodeLibraryBuilderOptions`
- `LibraryFormat` type centralized in `src/types/package-json.ts`
- `VirtualEntryPlugin` exposes virtual entry names and manages files array
- `DtsPlugin` skips type generation for virtual entries
- `PackageJsonTransformPlugin` sets `type` field based on format
- `TsconfigResolver` outputs format-appropriate module settings
- Comprehensive E2E tests in `test/e2e/builder-options/virtual-entries.test.ts`
- Unit tests for `VirtualEntryPlugin` in `src/rslib/plugins/virtual-entry-plugin.test.ts`
