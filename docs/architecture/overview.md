# Architecture Overview

This document explains how rslib-builder works internally and how its
components interact.

## Table of Contents

- [System Layers](#system-layers)
- [Build Flow](#build-flow)
- [Plugin Architecture](#plugin-architecture)
- [Package.json Transformation](#packagejson-transformation)
- [Type Generation](#type-generation)
- [Build Modes and Publish Targets](#build-modes-and-publish-targets)

## System Layers

rslib-builder is organized into four conceptual layers:

```text
┌─────────────────────────────────────────────────────────┐
│                    User API Layer                       │
│            NodeLibraryBuilder.create(options)           │
│                                                         │
│     High-level fluent interface hiding RSlib complexity │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│             Configuration Generation Layer              │
│   - Target selection (dev/npm)                          │
│   - Plugin composition                                  │
│   - RSlib config assembly                               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Plugin Orchestration Layer                 │
│   - 7 specialized plugins                               │
│   - Sequential execution across build stages            │
│   - Shared state via api.expose/api.useExposed          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│          RSlib/Rspack Compilation Engine                │
│   - JavaScript compilation                              │
│   - Asset generation                                    │
│   - Output directory management                         │
└─────────────────────────────────────────────────────────┘
```

### Layer 1: User API

The `NodeLibraryBuilder` class provides a clean interface that hides
RSlib/Rsbuild configuration complexity:

```typescript
// Simple API - complexity hidden
export default NodeLibraryBuilder.create({
  externals: ['@rslib/core'],
});
```

### Layer 2: Configuration Generation

When you call `NodeLibraryBuilder.create()`, it
returns an async function that RSlib calls with
environment parameters:

```typescript
// Returns this function
async ({ envMode }) => {
  const target = envMode || 'dev';
  return defineConfig({ lib: [...] });
}
```

When dual format or per-entry format overrides are
used, multiple `lib` configs are generated (one per
format group). The primary format handles
package.json transformation; secondary formats get
minimal plugin sets.

Every emitted `LibConfig` (main, secondary format,
per-entry override, virtual entries, and the
RSPress plugin and runtime libs) sets
`optimization.runtimeChunk = false` and
`optimization.splitChunks = false`. This produces
self-contained, single-chunk-per-entry output and
avoids a duplicate `__webpack_require__`
declaration that broke Node ESM loading in
multi-entry builds. See
[Chunk Splitting](../guides/chunk-splitting.md)
for the rationale and the escape hatch.

### Layer 3: Plugin Orchestration

Seven plugins handle specific build concerns:

1. **TsDocLintPlugin** - Pre-build TSDoc validation
2. **AutoEntryPlugin** - Entry point discovery
3. **DtsPlugin** - TypeScript declarations
4. **PackageJsonTransformPlugin** - Package.json
   processing (exposes `base-package-json`)
5. **FilesArrayPlugin** - Files array generation
   (target-aware callbacks)
6. **VirtualEntryPlugin** - Virtual entry management
7. **PublishTargetPlugin** - Multi-registry publish
   output (post-build)

### Layer 4: RSlib/Rspack

The underlying build engine handles:

- JavaScript/TypeScript compilation
- Module bundling
- Asset emission
- Source map generation

## Build Flow

A complete build follows this sequence:

```text
rslib build --env-mode npm
        │
        ▼
┌─────────────────────────────────┐
│ 1. Load rslib.config.ts         │
│    - Call NodeLibraryBuilder    │
│    - Determine target from      │
│      envMode                    │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 2. modifyRsbuildConfig          │
│    - AutoEntryPlugin extracts   │
│      entries from package.json  │
│    - DtsPlugin loads tsconfig   │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 3. Rspack Compilation           │
│    - Bundle JavaScript          │
│    - Process imports            │
│    - Generate output files      │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 4. processAssets: pre-process   │
│    - Load package.json          │
│    - Generate .d.ts with tsgo   │
│    - Bundle with API Extractor  │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 5. processAssets: optimize      │
│    - Resolve PNPM references    │
│    - Transform export paths     │
│    - Add type conditions        │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 6. processAssets: additional    │
│    - Collect output files       │
│    - Run transformFiles         │
│      callback                   │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 7. processAssets: optimize-inline│
│    - Apply user transform       │
│    - Write final package.json   │
│    - Set files array            │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 8. processAssets: summarize     │
│    - Strip source map comments  │
│    - Clean up temp files        │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 9. onCloseBuild                 │
│    - PublishTargetPlugin copies  │
│      output for additional      │
│      publish targets            │
└─────────────────────────────────┘
        │
        ▼
     dist/npm/ (+ per-target dirs)
```

## Plugin Architecture

Plugins communicate through Rsbuild's expose/useExposed mechanism:

```text
┌────────────────┐      exposes       ┌────────────────┐
│ AutoEntryPlugin│ ───────────────▶   │  'entrypoints' │
│                │      Map           │                │
└────────────────┘                    └────────────────┘
                                             │
                                      uses   │
                                             ▼
┌────────────────┐                    ┌────────────────┐
│   DtsPlugin    │ ◀──────────────────│  'entrypoints' │
│                │                    │                │
└────────────────┘                    └────────────────┘
```

### Shared State Keys

| Key | Type | Description |
| :-- | :--- | :---------- |
| `files-array` | `Set<string>` | Files for package.json |
| `entrypoints` | `Map<string, string>` | Entry name to path |
| `exportToOutputMap` | `Map<string, string>` | Export to output |
| `base-package-json` | `PackageJson` | Post-transform, pre-user package.json |

## Package.json Transformation

The transformation pipeline processes package.json in stages:

```text
Source package.json (read once at top of createSingleMode)
        │
        ▼
┌─────────────────────────────────┐
│ PNPM Resolution                 │
│ - catalog: → actual versions    │
│ - workspace: → actual versions  │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ RSlib Transformations           │
│ - exports: .ts → .js paths      │
│ - Add types conditions          │
│ - bin: .ts → .js paths          │
│ - Remove scripts, publishConfig │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Expose base-package-json        │
│ - Snapshot for PublishTarget-   │
│   Plugin (cross-plugin flow)    │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ User Transform (optional)       │
│ - Custom modifications          │
│ - Receives {mode, target, pkg}  │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Files Array                     │
│ - Add generated files array     │
└─────────────────────────────────┘
        │
        ▼
Output package.json (primary target)
        │
        ▼  (if additional publish targets)
┌─────────────────────────────────┐
│ PublishTargetPlugin (onClose)   │
│ - Copy primary output           │
│ - Apply user transform per      │
│   target from base-package-json │
│ - Write per-target package.json │
└─────────────────────────────────┘
```

### Example Transformation

**Input:**

```json
{
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "lodash": "catalog:"
  }
}
```

**Output:**

```json
{
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    }
  },
  "dependencies": {
    "lodash": "^4.17.21"
  },
  "files": ["index.js", "index.d.ts", "package.json"]
}
```

## Type Generation

Type generation uses a two-stage process for speed and quality:

```text
Source .ts files
        │
        ▼
┌─────────────────────────────────┐
│ Stage 1: tsgo                   │
│ - Native TypeScript compiler    │
│ - 10-100x faster than tsc       │
│ - Generates individual .d.ts    │
└─────────────────────────────────┘
        │
        ▼
.rslib/declarations/{target}/
        │
        ▼
┌─────────────────────────────────┐
│ Stage 2: API Extractor          │
│ - Bundles .d.ts files           │
│ - Resolves type references      │
│ - Generates api.model.json      │
│   (optional)                    │
└─────────────────────────────────┘
        │
        ▼
dist/{target}/
├── *.d.ts              (bundled declarations)
├── <package>.api.json  (API model, excluded from npm)
├── tsdoc-metadata.json (TSDoc metadata)
├── tsdoc.json          (TSDoc config, excluded from npm)
└── tsconfig.json       (resolved config, excluded from npm)
```

### Why Two Stages?

**tsgo** provides speed - it's a native implementation that generates
declarations much faster than standard tsc.

**API Extractor** provides quality - it bundles declarations into
clean public API files and can generate documentation models.

### Resolved tsconfig.json Output

When API model generation is enabled, DtsPlugin also generates a resolved
(flattened) tsconfig.json file. This is designed for virtual TypeScript
environments and documentation tooling that need type configuration without
file system dependencies.

The resolved config:

- Converts enum values to strings (target, module, moduleResolution, jsx)
- Sets `composite: false` and `noEmit: true` for virtual environments
- Excludes path-dependent options (rootDir, outDir, paths, typeRoots)
- Excludes file selection patterns (include, exclude, files, references)
- Includes $schema for IDE support

This file is excluded from npm publish (via negated pattern in files array)
but is available in dist for local tooling use.

## Virtual Entries

Virtual entries are additional entry points bundled with custom output names
that bypass type generation and package.json exports:

```text
NodeLibraryBuilder.create({
  virtualEntries: {
    'pnpmfile.cjs': {
      source: './src/pnpmfile.ts',
      format: 'cjs'
    }
  }
})
        │
        ▼
┌─────────────────────────────────┐
│ Config Generation               │
│ - Group virtual entries by      │
│   format                        │
│ - Create separate lib configs   │
│   for different formats         │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ RSlib Multi-Lib Build           │
│ lib: [                          │
│   { id: "npm", format: "esm" }, │  ← Main library
│   { id: "npm-virtual-cjs",      │  ← Virtual CJS entries
│     format: "cjs" }             │
│ ]                               │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Plugin Coordination             │
│ - DtsPlugin skips virtual       │
│   entries (no .d.ts)            │
│ - FilesArrayPlugin includes     │
│   virtual outputs               │
│ - PackageJsonTransformPlugin    │
│   ignores virtual entries       │
└─────────────────────────────────┘
        │
        ▼
dist/npm/
├── index.js          (main entry)
├── index.d.ts        (declarations)
├── pnpmfile.cjs      (virtual entry, no types)
└── package.json      (no pnpmfile export)
```

### Virtual Entry Use Cases

- **pnpmfile.cjs** - pnpm configuration hooks (must be CommonJS)
- **CLI scripts** - Bundled executables not in package.json exports
- **Config files** - Framework configuration files with specific requirements

## Bundle Modes

rslib-builder supports two JavaScript output modes:

| Mode | JS Output | DTS Output |
| :--- | :-------- | :--------- |
| Bundled (default) | Single file per entry | Bundled per entry |
| Bundleless | Preserves file structure | Bundled per entry |

In bundleless mode, rslib-builder uses a hybrid approach: JavaScript files
preserve the source directory structure while TypeScript declarations remain
bundled per entry point via API Extractor. The builder uses `ImportGraph`
to trace all files reachable from package.json exports and creates individual
RSlib entries for each traced file.

## Build Modes and Publish Targets

rslib-builder separates two concepts:

- **BuildMode** (`dev` | `npm`) controls optimization level
- **PublishTarget** controls where output goes for multi-registry publishing

### Build Modes

Two build modes serve different purposes:

| Aspect | dev | npm |
| :----- | :-- | :-- |
| Source maps | Yes | No |
| private field | true | false |
| Use case | Development | Publishing |
| Output | dist/dev/ | dist/npm/ |
| Publish targets | Always empty | Resolved from package.json |

Modes are selected at build time via `--env-mode`:

```bash
rslib build --env-mode dev   # Development build
rslib build --env-mode npm   # Production build
```

### Mode-Specific Plugin Behavior

Some plugins behave differently per mode:

- **PackageJsonTransformPlugin** sets `private: true` for dev mode
- **DtsPlugin** only generates `api.model.json` for npm mode
- Source maps are only generated for dev mode
- **PublishTargetPlugin** only runs for npm mode with multiple targets

### Publish Targets

When `publishConfig.targets` is configured in package.json, the npm mode
build produces output for multiple registries:

```text
rslib build --env-mode npm
        │
        ▼
┌──────────────────────────────┐
│ Primary build to dist/npm/   │
│ (first target in array)      │
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ PublishTargetPlugin           │
│ (onCloseBuild)               │
│                              │
│ For each additional target:  │
│ 1. Copy dist/npm/ output     │
│ 2. Read base-package-json    │
│ 3. Apply user transform      │
│ 4. Write per-target pkg.json │
└──────────────────────────────┘
        │
        ▼
dist/npm/          (primary: npmjs.org)
dist/npm-github/   (additional: GitHub Packages)
```

Dev mode always gets empty targets regardless of `publishConfig.targets`
configuration, ensuring development builds never write to publish-target
directories.

## Further Reading

- [Plugin System](../guides/plugins.md) - Detailed plugin documentation
- [Configuration](../guides/configuration.md) - All configuration options
- [RSlib Documentation](https://rslib.dev/) - Underlying build system
