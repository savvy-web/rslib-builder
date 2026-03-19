---
status: current
module: rslib-builder
category: architecture
created: 2026-03-19
updated: 2026-03-19
last-synced: 2026-03-19
completeness: 95
related:
  - rslib-builder/architecture.md
  - rslib-builder/api-extraction.md
  - rslib-builder/testing-strategy.md
dependencies: []
---

# RSPress Plugin Builder

Specialized builder for RSPress plugin packages with a dual-bundle architecture, producing both a Node.js plugin bundle and an optional web-targeted runtime bundle for React components.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Architecture](#architecture)
5. [Plugin Composition Order](#plugin-composition-order)
6. [TSConfig Presets](#tsconfig-presets)
7. [DtsPlugin Integration](#dtsplugin-integration)
8. [Configuration Reference](#configuration-reference)
9. [Built-in Externals](#built-in-externals)
10. [Mode Handling](#mode-handling)
11. [Testing](#testing)
12. [Related Documentation](#related-documentation)

---

## Overview

`RSPressPluginBuilder` is a specialized builder class alongside `NodeLibraryBuilder` that targets RSPress plugin packages. RSPress plugins have a unique requirement: they need both server-side Node.js code (the plugin entry) and client-side React components (the runtime entry) bundled from a single package. The builder automates this dual-bundle pattern.

**Key Design Principles:**

- **Dual-lib architecture**: One RSlib config produces two separate lib entries with different targets
- **Auto-detection**: Runtime bundle is automatically enabled when `src/runtime/index.tsx` exists
- **Plugin reuse**: Shares core plugins (DtsPlugin, PackageJsonTransformPlugin, etc.) with NodeLibraryBuilder
- **Convention over configuration**: Sensible defaults for RSPress plugin structure with escape hatches

**When to reference this document:**

- When modifying the RSPressPluginBuilder or its dual-lib architecture
- When adding new configuration options for RSPress plugin builds
- When debugging plugin or runtime bundle output issues
- When understanding how the builder composes plugins differently from NodeLibraryBuilder

---

## Current State

### Implementation Status

RSPressPluginBuilder is fully implemented and tested.

**Key Components:**

1. **RSPressPluginBuilder** (`src/rslib/builders/rspress-plugin-builder.ts`)
   - Purpose: Main public API for building RSPress plugin packages
   - Status: Implemented (95% complete)
   - Key methods: `create()`, `mergeOptions()`, `createSingleMode()`, `createPluginLib()`, `createRuntimeLib()`

2. **TSConfig Presets** (`src/tsconfig/index.ts`)
   - Purpose: RSPress-specific TypeScript configuration presets
   - Status: Implemented
   - Presets: `TSConfigs.rspress.plugin` (module: esnext, moduleResolution: bundler), `TSConfigs.rspress.website`

3. **E2E Fixture** (`__fixtures__/rspress-plugin/`)
   - Purpose: Integration test fixture with React runtime components
   - Status: Implemented with plugin + runtime source files

### Current Capabilities

- Dual-bundle output (plugin + runtime) from a single `rslib.config.ts`
- Auto-detection of runtime entry from `src/runtime/index.tsx`
- CSS Modules support in runtime bundle with `camelCaseOnly` convention
- BannerPlugin-based CSS injection (`import "./index.css"`) in runtime output
- Dynamic import of `@rsbuild/plugin-react` with actionable error message
- Full publish target support (same as NodeLibraryBuilder)
- TSDoc linting integration via `apiModel.tsdoc.lint`
- API model generation on the plugin lib
- DTS generation with `dtsPathPrefix` for runtime declarations

---

## Rationale

### Why a Separate Builder Class

**Context:** RSPress plugins require fundamentally different build configurations from standard Node.js libraries -- they need two lib entries with different output targets (node vs web).

**Options considered:**

1. **Separate builder class (Chosen):**
   - Pros: Clean API, dedicated defaults, no conditional complexity in NodeLibraryBuilder
   - Cons: Some code duplication in plugin composition
   - Why chosen: Keeps NodeLibraryBuilder focused on its use case while providing RSPress-specific defaults

2. **Extend NodeLibraryBuilder with RSPress options:**
   - Pros: Single builder class
   - Cons: Bloats the main builder with RSPress-specific concerns, complicates the API
   - Why rejected: Violates single responsibility principle

### Why Dual-Lib Instead of Two Separate Builds

**Context:** RSPress plugins need both plugin and runtime output under a single package.

**Options considered:**

1. **Dual-lib in single RSlib config (Chosen):**
   - Pros: Single build command, shared cache, atomic output
   - Cons: More complex config generation
   - Why chosen: Better developer experience, consistent output

2. **Separate build commands:**
   - Pros: Simpler per-build configuration
   - Cons: Two build steps, coordination overhead, cache invalidation issues
   - Why rejected: Poor developer experience

### Why Auto-Detect Runtime

**Context:** Not all RSPress plugins have runtime components. Need a way to conditionally include the runtime bundle.

**Decision:** Check for `src/runtime/index.tsx` at build time. If it exists, enable the runtime lib. If not, only build the plugin lib. Explicit `runtime: false` can disable auto-detection.

### Why BannerPlugin for CSS Injection

**Context:** Runtime React components may use CSS Modules. The compiled CSS needs to be imported at the top of the runtime JS output.

**Decision:** Use rspack's `BannerPlugin` to inject `import "./index.css";` as a raw banner at `PROCESS_ASSETS_STAGE_ADDITIONS`. This is more reliable than manual string concatenation and works with rspack's asset pipeline.

---

## Architecture

### Dual-Lib System

RSPressPluginBuilder produces up to two RSlib lib configs per build mode:

```text
rslib.config.ts
     |
     v
RSPressPluginBuilder.create(options)
     |
     v
createSingleMode(mode, options)
     |
     +-- createPluginLib() -----> LibConfig { id: "npm-plugin", target: "node" }
     |                            - Full plugin set (TsDocLint, PackageJson, Files, Dts, Publish)
     |                            - Owns package.json processing
     |                            - API model generation
     |                            - Output: dist/<mode>/
     |
     +-- createRuntimeLib() ----> LibConfig { id: "npm-runtime", target: "web" }
                                  - Minimal plugin set (Dts with dtsPathPrefix, pluginReact)
                                  - CSS Modules with BannerPlugin injection
                                  - No package.json processing
                                  - Output: dist/<mode>/runtime/
```

### Plugin Lib

The plugin lib is the primary bundle. It:

- Targets Node.js (`output.target: "node"`)
- Produces ESM output (`format: "esm"`)
- Owns package.json transformation and files array generation
- Runs API model generation and TSDoc linting
- Handles publish target orchestration
- Default entry: `./src/index.ts`

### Runtime Lib

The runtime lib is conditionally generated. It:

- Targets the web (`output.target: "web"`)
- Produces ESM output with React JSX support via `pluginReact()`
- Enables CSS Modules (`namedExport: false`, `exportLocalsConvention: "camelCaseOnly"`)
- Injects CSS import via rspack `BannerPlugin`
- Uses `dtsPathPrefix: "runtime"` so DTS files are emitted at the correct path
- Does not process package.json (the plugin lib handles this)
- Default entry: `./src/runtime/index.tsx`
- Output: `dist/<mode>/runtime/`

### Runtime Auto-Detection

```text
options.runtime
     |
     +-- false -----------------> Runtime disabled
     |
     +-- { entry, ... } --------> Runtime enabled (explicit config)
     |
     +-- undefined (default) ---> Check existsSync("src/runtime/index.tsx")
                                   |
                                   +-- true --> Runtime enabled (auto-detected)
                                   +-- false -> Runtime disabled
```

---

## Plugin Composition Order

### Plugin Lib

```text
1. TsDocLintPlugin        (onBeforeBuild - validates TSDoc before compilation)
2. PackageJsonTransformPlugin (pre-process, optimize, optimize-inline)
3. FilesArrayPlugin        (additional, optimize-inline)
4. DtsPlugin               (modifyRsbuildConfig, pre-process, summarize, onCloseBuild)
                           Uses tsconfigPreset: TSConfigs.rspress.plugin
5. User plugins            (from plugin.plugins option)
6. PublishTargetPlugin     (onCloseBuild - npm mode only, when targets exist)
```

### Runtime Lib

```text
1. DtsPlugin               (with dtsPathPrefix: "runtime", no apiModel)
                           Uses tsconfigPreset: TSConfigs.rspress.plugin
2. pluginReact()           (dynamically imported from @rsbuild/plugin-react)
3. User plugins            (from runtime.plugins option)
```

The runtime lib has a minimal plugin set because:

- Package.json processing is handled by the plugin lib
- TSDoc linting applies only to the plugin entry
- Files array is managed by the plugin lib
- Publish targets are handled by the plugin lib

---

## TSConfig Presets

RSPressPluginBuilder uses dedicated TypeScript configuration presets for RSPress environments.

### rspress/plugin.json

**Location:** `src/public/tsconfig/rspress/plugin.json`

**Purpose:** TypeScript configuration for building RSPress plugins. Key settings:

- `module: "esnext"` - ESM module format
- `moduleResolution: "bundler"` - Bundler-compatible resolution
- Enables JSX support for runtime components
- Used by DtsPlugin via `tsconfigPreset` option

**Usage in builder:**

```typescript
DtsPlugin({
  tsconfigPreset: TSConfigs.rspress.plugin,
  // ...
})
```

### rspress/website.json

**Location:** `src/public/tsconfig/rspress/website.json`

**Purpose:** TypeScript configuration for RSPress documentation websites (exported for consumer use, not used internally by the builder).

### Custom tsconfig Override

Users can override the preset via `tsconfigPath`:

```typescript
RSPressPluginBuilder.create({
  tsconfigPath: "./tsconfig.custom.json",
})
```

When `tsconfigPath` is provided, it is used directly instead of the rspress/plugin preset.

---

## DtsPlugin Integration

The DtsPlugin receives a `tsconfigPreset` option that tells it which `LibraryTSConfigFile` to use for generating the temporary tsconfig during declaration generation.

**Flow:**

```text
RSPressPluginBuilder
     |
     +-- options.tsconfigPath provided?
     |      |
     |      +-- YES: DtsPlugin({ tsconfigPath: options.tsconfigPath })
     |      |
     |      +-- NO:  DtsPlugin({ tsconfigPreset: TSConfigs.rspress.plugin })
     |
     v
DtsPlugin.modifyRsbuildConfig
     |
     v
preset.writeBundleTempConfig(mode, overrides)
     |
     v
Temporary tsconfig.json for tsgo
```

For the runtime lib, DtsPlugin also receives `dtsPathPrefix: "runtime"`, which causes declaration files to be emitted with a `runtime/` path prefix. This ensures runtime type declarations appear at the correct location relative to the package exports (e.g., `runtime.d.ts` at the dist root for the `./runtime` export condition).

---

## Configuration Reference

### RSPressPluginBuilderOptions

```typescript
interface RSPressPluginBuilderOptions {
  /** Plugin bundle configuration. Always generated. */
  plugin?: RSPressPluginBundleOptions;
  /** Runtime bundle configuration. Auto-detected from src/runtime/index.tsx, or false to disable. */
  runtime?: RSPressPluginBundleOptions | false;
  /** API model generation options. Default: true. */
  apiModel?: ApiModelOptions | boolean;
  /** Packages to bundle in TypeScript declarations. */
  dtsBundledPackages?: string[];
  /** Custom package.json transform function. */
  transform?: TransformPackageJsonFn;
  /** Path to custom tsconfig.json. Overrides the RSPress plugin preset. */
  tsconfigPath?: string;
  /** Build modes to produce. Default: ["dev", "npm"]. */
  targets?: BuildMode[];
  /** Static files to copy to output. */
  copyPatterns?: (string | CopyPatternConfig)[];
}
```

### RSPressPluginBundleOptions

```typescript
interface RSPressPluginBundleOptions {
  /** Entry point path. Plugin default: "./src/index.ts", runtime default: "./src/runtime/index.tsx" */
  entry?: string;
  /** Additional externals merged with built-in RSPress externals. */
  externals?: (string | RegExp)[];
  /** Additional Rsbuild plugins. pluginReact() is auto-added on runtime. */
  plugins?: RsbuildPlugin[];
  /** Additional define constants merged with { "import.meta.env": "import.meta.env" }. */
  define?: SourceConfig["define"];
}
```

### Default Options

```typescript
RSPressPluginBuilder.mergeOptions({}) === {
  apiModel: true,
  targets: ["dev", "npm"],
  copyPatterns: [],
}
```

### Basic Usage

```typescript
import { RSPressPluginBuilder } from "@savvy-web/rslib-builder";

// Minimal - auto-detects runtime from src/runtime/index.tsx
export default RSPressPluginBuilder.create({});

// With explicit runtime disabled
export default RSPressPluginBuilder.create({
  runtime: false,
});

// With custom plugin externals
export default RSPressPluginBuilder.create({
  plugin: {
    externals: ["@rspress/plugin-shiki"],
  },
});
```

---

## Built-in Externals

### RSPRESS_PLUGIN_EXTERNALS

Applied to the plugin lib. These are packages provided by the RSPress runtime that should not be bundled:

```typescript
const RSPRESS_PLUGIN_EXTERNALS: readonly string[] = ["@rspress/core"];
```

**Rationale:** `@rspress/core` is always available in the RSPress host environment. Bundling it would cause version conflicts and increase bundle size.

### RSPRESS_RUNTIME_EXTERNALS

Applied to the runtime lib. These are packages provided by the RSPress theme system:

```typescript
const RSPRESS_RUNTIME_EXTERNALS: readonly string[] = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "@rspress/core",
  "@theme",
];
```

**Rationale:**

- `react` and its JSX runtimes are provided by the RSPress host application
- `@rspress/core` provides shared utilities available in both plugin and runtime contexts
- `@theme` is the RSPress virtual module for theme components and must be resolved at runtime by RSPress

User-specified `externals` in `plugin` or `runtime` options are merged with these built-in lists.

---

## Mode Handling

RSPressPluginBuilder uses the same `BuildMode` system as NodeLibraryBuilder:

| Mode | Plugin Lib | Runtime Lib | Source Maps | Publish Targets |
| ---- | ---------- | ----------- | ----------- | --------------- |
| `dev` | `dist/dev/` | `dist/dev/runtime/` | Yes | No |
| `npm` | `dist/npm/` | `dist/npm/runtime/` | No | Yes (if configured) |

Both libs receive the same mode. The runtime lib output is nested under `runtime/` within the mode directory.

Build cache is configured per mode at `.rslib/cache/<mode>`.

---

## Testing

### Unit Tests

**File:** `src/rslib/builders/rspress-plugin-builder.test.ts` (39 tests)

**Coverage:**

- `mergeOptions()` - Default merging, option spreading, undefined handling
- `create()` - Factory method, mode validation, invalid mode errors
- `createSingleMode()` - Full config generation for both libs
- `createPluginLib()` - Plugin composition, externals merging, define merging, TSDoc lint setup
- `createRuntimeLib()` - React plugin loading, CSS modules config, BannerPlugin injection, dtsPathPrefix
- `shouldEnableRuntime()` - Auto-detection logic, explicit enable/disable
- Publish target integration - Target resolution, PublishTargetPlugin composition

**Mocking approach:**

- Mocks `node:fs` (`existsSync`, `readFileSync`) for runtime auto-detection and package.json reading
- Mocks `@rslib/core` (`defineConfig`) to capture generated config
- Mocks `@rsbuild/plugin-react` for runtime lib plugin injection
- Uses `vi.spyOn(process, "cwd")` for path resolution

### E2E Tests

**File:** `__test__/e2e/rspress-plugin-builder.e2e.test.ts` (8 tests)

**Fixture:** `__fixtures__/rspress-plugin/` - Contains:

- `src/index.ts` - Plugin entry point
- `src/runtime/index.tsx` - Runtime React component entry
- `src/runtime/` - React components with CSS Modules
- `types/css.d.ts` - CSS module type declarations
- `rslib.config.ts` - Uses RSPressPluginBuilder

**Test scenarios:**

1. **Plugin + runtime build (npm mode):**
   - Build succeeds
   - Plugin JS and DTS output produced
   - Runtime JS output in `runtime/` subdirectory
   - Runtime DTS via `dtsPathPrefix` at dist root
   - Runtime CSS output produced
   - Package.json has correct exports for both `.` and `./runtime`

2. **Plugin-only build (runtime disabled):**
   - Build succeeds with `runtime: false`
   - Plugin JS and DTS produced
   - No runtime JS or CSS output

**Extended `buildFixture()` support:**

The E2E test utility `build-fixture.ts` supports `rspressBuilderOptions` in the `ConfigOptions` interface. When `rspressBuilderOptions` is provided, the generated `rslib.config.ts` uses `RSPressPluginBuilder.create()` instead of `NodeLibraryBuilder.create()`.

---

## Related Documentation

**Internal Design Docs:**

- [Architecture](./architecture.md) - Overall system architecture and plugin system
- [API Extraction](./api-extraction.md) - API model generation shared with plugin lib
- [Testing Strategy](./testing-strategy.md) - Testing patterns and infrastructure

**External Resources:**

- [RSPress Plugin Development](https://rspress.dev/plugin/system/introduction) - RSPress plugin documentation
- [RSlib Documentation](https://rslib.dev/) - Build system documentation
- [Rsbuild Plugin React](https://rsbuild.dev/plugins/list/plugin-react) - React plugin for runtime builds

---

**Document Status:** Current - RSPressPluginBuilder fully implemented with dual-lib architecture, auto-detection, CSS Modules with BannerPlugin injection, and comprehensive test coverage.
