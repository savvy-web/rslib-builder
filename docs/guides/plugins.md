# Plugin System

rslib-builder uses a plugin architecture built on Rsbuild's plugin system.
This guide covers the built-in plugins and how to extend the build process.

## Table of Contents

- [Built-in Plugins](#built-in-plugins)
- [Plugin Execution Order](#plugin-execution-order)
- [Adding Custom Plugins](#adding-custom-plugins)
- [Rsbuild Plugin API](#rsbuild-plugin-api)
- [Shared State Between Plugins](#shared-state-between-plugins)

## Built-in Plugins

rslib-builder includes seven specialized plugins that handle different aspects
of the build process.

### TsDocLintPlugin

**Purpose:** Validates TSDoc comments before build using ESLint.

**What it does:**

1. Discovers files to lint using import graph analysis (default) or explicit patterns
2. Dynamically imports ESLint with `eslint-plugin-tsdoc`
3. Generates a `tsdoc.json` configuration file
4. Runs ESLint on source files to validate TSDoc syntax
5. Reports errors with file locations and rule IDs
6. Optionally fails the build on errors (default in CI)

**Stage:** `onBeforeBuild` (runs before all other plugins)

**Configuration:**

TSDoc lint is controlled via `apiModel.tsdoc.lint`:

```typescript
// Lint enabled by default (apiModel: true is the default)
NodeLibraryBuilder.create({});

// Disable lint explicitly
NodeLibraryBuilder.create({
  apiModel: {
    tsdoc: {
      lint: false,
    },
  },
});

// Or with custom options
NodeLibraryBuilder.create({
  apiModel: {
    tsdoc: {
      lint: {
        onError: 'throw',      // 'warn' | 'error' | 'throw'
        persistConfig: true,   // Keep tsdoc.json for IDE integration
      },
    },
  },
});
```

**Automatic File Discovery:**

By default, TsDocLintPlugin uses import graph analysis to discover which files
to lint. It traces imports starting from your `package.json` exports field,
finding all TypeScript files that are part of your public API.

This means:

- Only public API files are linted (files reachable from exports)
- Internal implementation files not referenced by exports are skipped
- Test files (`*.test.ts`, `*.spec.ts`) are automatically excluded
- Files in `__test__` or `__tests__` directories are excluded

**Overriding File Discovery:**

Use the `include` option when you need to lint specific files that are not
part of the export graph, or to override automatic discovery entirely:

```typescript
NodeLibraryBuilder.create({
  apiModel: {
    tsdoc: {
      lint: {
        // Override automatic discovery with explicit patterns
        include: ['src/**/*.ts', '!**/*.test.ts'],
      },
    },
  },
});
```

**Environment-Aware Defaults:**

| Environment | Default `onError` | Default `persistConfig` |
| :--- | :--- | :--- |
| Local | `'error'` | `true` |
| CI | `'throw'` | validates existing |

### VirtualEntryPlugin

**Purpose:** Manages virtual entries that bypass type generation and package.json
exports.

**What it does:**

1. Exposes virtual entry names to other plugins via shared state
2. Marks entries for exclusion from type generation
3. Ensures virtual entry outputs are included in the files array
4. Handles format-specific bundling configuration

**Stage:** Configuration and `additional` (files array management)

**Configuration:**

Virtual entries are configured via the top-level `virtualEntries` option:

```typescript
NodeLibraryBuilder.create({
  virtualEntries: {
    'pnpmfile.cjs': {
      source: './src/pnpmfile.ts',
      format: 'cjs',
    },
  },
});
```

**Shared State:**

VirtualEntryPlugin exposes:

- `virtual-entry-names` - `Set<string>` of entry names to exclude from type
  generation

**Implementation Notes:**

When virtual entries have different formats than the main library, separate
RSlib lib configurations are generated. This ensures native format handling
and clean separation of concerns.

### AutoEntryPlugin

**Purpose:** Discovers entry points from package.json exports and bin fields.

**What it does:**

- Parses the `exports` field in package.json
- Parses the `bin` field for CLI entry points
- Maps export keys to entry point names
- Resolves TypeScript source paths

**Stage:** `modifyRsbuildConfig`

**Example:** Given this package.json:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils/index.ts"
  },
  "bin": {
    "my-cli": "./src/cli.ts"
  }
}
```

AutoEntryPlugin configures these entries:

```typescript
{
  index: './src/index.ts',
  utils: './src/utils/index.ts',
  cli: './src/cli.ts'
}
```

### DtsPlugin

**Purpose:** Generates TypeScript declarations using tsgo and API Extractor.

**What it does:**

1. Generates a temporary tsconfig for declaration generation
2. Runs `tsgo --declaration --emitDeclarationOnly` for fast generation
3. Optionally bundles declarations with API Extractor
4. Optionally generates `api.model.json` for documentation
5. Generates resolved `tsconfig.json` for virtual TypeScript environments
6. Strips source map comments from final output
7. Cleans up `.d.ts.map` files

**Stages:**

- `modifyRsbuildConfig` - Load tsconfig, prepare configuration
- `pre-process` - Generate declarations with tsgo
- `summarize` - Clean up and finalize
- `onCloseBuild` - Copy files to localPaths

**Configuration:**

```typescript
NodeLibraryBuilder.create({
  tsconfigPath: './tsconfig.build.json',
  dtsBundledPackages: ['picocolors'],
  apiModel: true,
});
```

**Output Files (when apiModel enabled):**

| File | Description | npm Publish |
| :--- | :---------- | :---------: |
| `*.d.ts` | Bundled declaration files | Yes |
| `<package>.api.json` | API model for documentation | No |
| `tsdoc-metadata.json` | TSDoc metadata | Yes |
| `tsdoc.json` | TSDoc configuration | No |
| `tsconfig.json` | Resolved TypeScript config | No |

**Resolved tsconfig.json:**

When API model generation is active, DtsPlugin automatically exports a
resolved (flattened) tsconfig.json to the dist directory. This file is
designed for virtual TypeScript environments that need compiler options
without path dependencies.

The resolved config:

- Converts TypeScript enum values to strings (target, module, jsx, etc.)
- Sets `composite: false` and `noEmit: true` for virtual environments
- Excludes path-dependent options (rootDir, outDir, paths, typeRoots)
- Excludes file selection patterns (include, exclude, files)
- Includes $schema for IDE support

This file is automatically copied to localPaths when configured.

### PackageJsonTransformPlugin

**Purpose:** Transforms package.json for distribution.

**What it does:**

1. Loads source package.json, README, and LICENSE
2. Resolves PNPM `catalog:` and `workspace:` references
3. Transforms export paths from `.ts` to `.js`
4. Adds `types` conditions to exports
5. Transforms `bin` field paths
6. Removes dev-only fields (scripts, publishConfig)
7. Applies user transform function

**Stages:**

- `pre-process` - Load package.json and metadata files
- `optimize` - Apply transformations
- `optimize-inline` - Finalize with custom transforms

**Transformation Pipeline:**

```text
Source package.json
        │
        ▼
┌─────────────────────────┐
│ PNPM Resolution         │
│ - catalog: → versions   │
│ - workspace: → versions │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ RSlib Transformations   │
│ - .ts → .js paths       │
│ - Add type conditions   │
│ - Transform bin paths   │
│ - Remove dev fields     │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ User Transform (opt.)   │
│ - Custom modifications  │
└─────────────────────────┘
        │
        ▼
Output package.json
```

### FilesArrayPlugin

**Purpose:** Generates the `files` array in package.json.

**What it does:**

1. Scans compiled assets (JS, declarations)
2. Excludes source maps (`.js.map`, `.d.ts.map`)
3. Includes copied files (LICENSE, README)
4. Calls user's `transformFiles` callback with target context
5. Sets final `files` array in package.json

**Stages:**

- `additional` - Collect files from compilation
- `optimize-inline` - Write final package.json with files array

**Target-Aware Callbacks:**

The `transformFiles` callback receives the current `PublishTarget` (if
configured) so you can customize file handling per publish registry:

```typescript
NodeLibraryBuilder.create({
  transformFiles({ filesArray, target }) {
    if (target?.protocol === 'jsr') {
      filesArray.delete('some-npm-only-file.js');
    }
  },
});
```

**Example output:**

```json
{
  "files": [
    "index.js",
    "index.d.ts",
    "utils/index.js",
    "utils/index.d.ts",
    "LICENSE",
    "README.md",
    "package.json"
  ]
}
```

### PublishTargetPlugin

**Purpose:** Produces per-target output directories for multi-registry publishing.

**What it does:**

1. Runs after the primary build completes (`onCloseBuild`)
2. For each additional publish target (beyond the primary):
   - Creates the target output directory
   - Copies all build output from the primary output directory
   - Reads the `base-package-json` state exposed by PackageJsonTransformPlugin
   - Applies the user `transform` function with the target-specific context
   - Copies the `files` array from the primary output's package.json
   - Writes the final package.json to the target directory

**Stage:** `onCloseBuild` (post-compilation)

**Configuration:**

Publish targets are configured via `publishConfig.targets` in your
package.json:

```json
{
  "publishConfig": {
    "access": "public",
    "targets": ["npm", "github"]
  }
}
```

Supported shorthand values: `"npm"` (npmjs.org), `"github"` (GitHub
Packages), `"jsr"` (jsr.io), or a full registry URL.

**Cross-Plugin Data Flow:**

PublishTargetPlugin consumes the `base-package-json` key exposed by
PackageJsonTransformPlugin. This represents the package.json after all
standard transforms (PNPM resolution, path updates, type conditions) but
before the user `transform` function runs. Each additional target receives
a deep copy of this base state, then has the user transform applied with
target-specific context.

**Output Structure:**

With two targets (`npm` and `github`), the output looks like:

```text
dist/npm/                    # Primary target (built normally)
  index.js
  index.d.ts
  package.json

dist/npm-github/             # Additional target (copied + re-transformed)
  index.js
  index.d.ts
  package.json               # Per-target package.json
```

## Plugin Execution Order

Plugins execute in a specific order across Rsbuild's processing stages:

```text
0. onBeforeBuild (Pre-compilation)
   └── TsDocLintPlugin      → Validate TSDoc comments

1. modifyRsbuildConfig
   ├── AutoEntryPlugin      → Discover entries
   └── DtsPlugin            → Load tsconfig

2. processAssets: pre-process
   ├── PackageJsonTransformPlugin → Load files
   └── DtsPlugin                  → Generate .d.ts (skips virtual entries)
                                    In bundleless mode: traces import graph,
                                    bundles DTS per entry (hybrid approach)

3. processAssets: optimize
   └── PackageJsonTransformPlugin → Transform package.json

4. processAssets: additional
   ├── FilesArrayPlugin     → Collect files
   ├── VirtualEntryPlugin   → Add virtual entry outputs to files
   └── (User transformFiles callback)

5. processAssets: optimize-inline
   ├── PackageJsonTransformPlugin → Apply user transform
   └── FilesArrayPlugin           → Write package.json

6. processAssets: summarize
   └── DtsPlugin → Clean up .d.ts files

7. onCloseBuild (Post-compilation)
   ├── TsDocLintPlugin      → Cleanup temp tsdoc.json
   └── PublishTargetPlugin   → Copy output + per-target package.json
```

## Adding Custom Plugins

Add Rsbuild plugins via the `plugins` option:

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
import { myCustomPlugin } from './my-plugin.js';

export default NodeLibraryBuilder.create({
  plugins: [
    myCustomPlugin(),
  ],
});
```

Custom plugins run after built-in plugins in each stage.

### Writing a Custom Plugin

```typescript
import type { RsbuildPlugin } from '@rsbuild/core';

export function myCustomPlugin(): RsbuildPlugin {
  return {
    name: 'my-custom-plugin',

    setup(api) {
      // Modify configuration before build
      api.modifyRsbuildConfig((config) => {
        console.log('Modifying config...');
        return config;
      });

      // Process assets during build
      api.processAssets(
        { stage: 'additional' },
        async ({ compilation, sources }) => {
          // Add a custom file
          compilation.emitAsset(
            'VERSION',
            new sources.OriginalSource('1.0.0', 'VERSION'),
          );
        },
      );
    },
  };
}
```

## Rsbuild Plugin API

rslib-builder plugins use the Rsbuild plugin API. Key methods:

### api.modifyRsbuildConfig()

Modify configuration before compilation:

```typescript
api.modifyRsbuildConfig((config) => {
  config.output.minify = false;
  return config;
});
```

### api.processAssets()

Process assets at specific stages:

```typescript
api.processAssets(
  { stage: 'optimize' },
  async ({ compilation, sources }) => {
    // Access and modify assets
    const asset = compilation.assets['index.js'];
    const source = asset.source();
  },
);
```

**Available stages:**

| Stage | When | Use For |
| :---- | :--- | :------ |
| `pre-process` | Before optimizations | Generate files |
| `optimize` | During optimization | Transform content |
| `additional` | After optimization | Add extra files |
| `optimize-inline` | Final optimization | Last-minute changes |
| `summarize` | Cleanup | Remove temp files |

### api.expose() / api.useExposed()

Share data between plugins:

```typescript
// In plugin A
api.expose('my-data', { foo: 'bar' });

// In plugin B
const data = api.useExposed('my-data');
```

### api.context

Access build context:

```typescript
const rootPath = api.context.rootPath;
const distPath = api.context.distPath;
```

## Shared State Between Plugins

Built-in plugins share state via these exposed keys:

| Key | Type | Producer |
| :-- | :--- | :------- |
| `files-array` | `Set<string>` | FilesArrayPlugin |
| `entrypoints` | `Map<string, string>` | AutoEntryPlugin |
| `exportToOutputMap` | `Map<string, string>` | AutoEntryPlugin |
| `virtual-entry-names` | `Set<string>` | VirtualEntryPlugin |
| `library-format` | `'esm' \| 'cjs'` | NodeLibraryBuilder |
| `base-package-json` | `PackageJson` | PkgJsonTransformPlugin |

**Key descriptions:**

- `files-array` - Files for package.json files field
- `entrypoints` - Entry names to source file paths
  (consumed by DtsPlugin, PackageJsonTransformPlugin)
- `exportToOutputMap` - Export paths to output paths
  (consumed by PackageJsonTransformPlugin)
- `virtual-entry-names` - Entries to exclude from
  type generation (consumed by DtsPlugin)
- `library-format` - Output format for package.json
  type field
- `base-package-json` - Package.json after standard
  transforms but before user transform; consumed by
  PublishTargetPlugin to create per-target copies

### Accessing Shared State

```typescript
api.processAssets({ stage: 'additional' }, async () => {
  const filesArray = api.useExposed('files-array') as Set<string>;

  // Add a custom file
  filesArray.add('my-custom-file.txt');
});
```

### Creating Custom Shared State

```typescript
// Expose in your plugin
api.modifyRsbuildConfig(() => {
  api.expose('my-plugin-state', new Map());
});

// Use in another plugin or callback
const state = api.useExposed('my-plugin-state');
```

## Further Reading

- [Rsbuild Plugin Development](https://rsbuild.dev/plugins/dev/core)
- [Rspack Plugin API](https://rspack.dev/api/plugin-api)
- [Architecture Overview](../architecture/overview.md)
