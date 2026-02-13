# Configuration Reference

Complete reference for all `NodeLibraryBuilder` configuration options.

## Table of Contents

- [Basic Options](#basic-options)
- [Entry Points](#entry-points)
- [External Dependencies](#external-dependencies)
- [Type Generation](#type-generation)
- [Package.json Transform](#packagejson-transform)
- [File Handling](#file-handling)
- [Build Targets](#build-targets)
- [API Model Generation](#api-model-generation)
- [TSDoc Linting](#tsdoc-linting)
- [ImportGraph Utility](#importgraph-utility)
- [TsconfigResolver Utility](#tsconfigresolver-utility)
- [EntryExtractor Utility](#entryextractor-utility)
- [Bundle Mode](#bundle-mode)
- [Define Constants](#define-constants)

## Basic Options

### Full Interface

```typescript
interface NodeLibraryBuilderOptions {
  entry?: Record<string, string | string[]>;
  exportsAsIndexes?: boolean;
  copyPatterns?: CopyPattern[];
  plugins?: RsbuildPlugin[];
  define?: Record<string, string>;
  tsconfigPath?: string;
  targets?: BuildTarget[];
  externals?: (string | RegExp)[];
  dtsBundledPackages?: string[];
  transformFiles?: TransformFilesCallback;
  transform?: TransformPackageJsonFn;
  apiModel?: ApiModelOptions | boolean;
  format?: LibraryFormat | LibraryFormat[];
  entryFormats?: Record<string, LibraryFormat>;
  virtualEntries?: Record<string, VirtualEntryConfig>;
  bundle?: boolean;
}

type LibraryFormat = 'esm' | 'cjs';

interface VirtualEntryConfig {
  source: string;  // Path to source file
  format?: 'esm' | 'cjs';  // Override format for this entry
}

type BuildTarget = 'dev' | 'npm';
```

### Minimal Configuration

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({});
```

With no options, rslib-builder:

- Auto-detects entries from package.json exports
- Uses default tsconfig resolution
- Bundles all dependencies
- Generates both dev and npm targets

## Entry Points

### Auto-Detection (Recommended)

By default, entries are extracted from your package.json exports:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils/index.ts",
    "./config": "./src/config.ts"
  }
}
```

This generates three entry points: `index`, `utils`, and `config`.

### Manual Entry Override

Override automatic detection with explicit entries:

```typescript
NodeLibraryBuilder.create({
  entry: {
    index: './src/index.ts',
    cli: './src/cli.ts',
    utils: ['./src/utils/a.ts', './src/utils/b.ts'],
  },
});
```

### Export Output Structure

Control whether exports create directories or files:

```typescript
NodeLibraryBuilder.create({
  exportsAsIndexes: true,  // ./foo → foo/index.js
});
```

**With `exportsAsIndexes: false` (default):**

```text
dist/
├── index.js
├── foo.js
└── bar.js
```

**With `exportsAsIndexes: true`:**

```text
dist/
├── index.js
├── foo/
│   └── index.js
└── bar/
    └── index.js
```

## External Dependencies

### externals

Specify dependencies that should not be bundled:

```typescript
NodeLibraryBuilder.create({
  externals: [
    '@rslib/core',           // Exact match
    '@rsbuild/core',
    /^@types\//,             // Regex pattern
  ],
});
```

Use externals for:

- Peer dependencies
- Build tools your package uses to build other packages
- Large dependencies that consumers already have

### When to Externalize

| Dependency Type | Externalize? | Reason |
| :-------------- | :----------: | :----- |
| peerDependencies | Yes | Consumer provides them |
| dependencies | No | Bundled for reliability |
| devDependencies | Usually no | Not in final package |
| Build tools | Yes | Special case for meta-packages |

## Type Generation

### dtsBundledPackages

Control which package types are inlined in your declarations:

```typescript
NodeLibraryBuilder.create({
  dtsBundledPackages: [
    'picocolors',      // Exact package name
    '@pnpm/**',        // Minimatch pattern
    '@types/*',        // All @types packages
  ],
});
```

**When to bundle types:**

- Private dependencies whose types aren't available to consumers
- Internal packages in a monorepo
- Packages with complex transitive type dependencies

### tsconfigPath

Specify a custom tsconfig for type generation:

```typescript
NodeLibraryBuilder.create({
  tsconfigPath: './tsconfig.build.json',
});
```

If not specified, rslib-builder uses default TypeScript config resolution.

## Package.json Transform

### transform

Modify the output package.json before it's written:

```typescript
NodeLibraryBuilder.create({
  transform({ pkg, target }) {
    // Remove fields not needed for distribution
    if (target === 'npm') {
      delete pkg.devDependencies;
      delete pkg.scripts;
      delete pkg.private;
    }

    // Add custom fields
    pkg.funding = 'https://github.com/sponsors/myorg';

    return pkg;
  },
});
```

**Context provided:**

| Property | Type | Description |
| :------- | :--- | :---------- |
| `pkg` | `PackageJson` | The package.json being transformed |
| `target` | `'dev' \| 'npm'` | Current build target |

### Automatic Transformations

Even without a custom transform, rslib-builder automatically:

1. Resolves PNPM `catalog:` references to actual versions
2. Resolves `workspace:` references to actual versions
3. Updates export paths from `.ts` to `.js`
4. Adds `types` conditions to exports
5. Sets `private: true` for dev builds
6. Removes `publishConfig` and `scripts`
7. Generates `files` array

## File Handling

### copyPatterns

Copy static files to the dist directory:

```typescript
NodeLibraryBuilder.create({
  copyPatterns: [
    {
      from: './**/*.json',
      context: './src/public',
    },
    {
      from: './templates/**/*',
      to: './templates',
    },
  ],
});
```

**Public directory convention:**

If a `public/` directory exists in your project root, its contents are
automatically copied to the dist root.

### transformFiles

Modify files after the build but before the files array is finalized:

```typescript
NodeLibraryBuilder.create({
  transformFiles({ compilation, filesArray, target }) {
    // Copy a file with a new name
    const indexAsset = compilation.assets['index.js'];
    if (indexAsset) {
      compilation.assets['.pnpmfile.cjs'] = indexAsset;
      filesArray.add('.pnpmfile.cjs');
    }
  },
});
```

**Context provided:**

| Property | Type | Description |
| :------- | :--- | :---------- |
| `compilation` | `{ assets }` | Rspack compilation with assets |
| `filesArray` | `Set<string>` | Files to include in package.json |
| `target` | `BuildTarget` | Current build target |

## Build Targets

### targets

Specify which build targets to enable:

```typescript
NodeLibraryBuilder.create({
  targets: ['npm'],  // Only build for npm
});
```

Available targets:

| Target | Source Maps | Use Case |
| :----- | :---------: | :------- |
| `dev` | Yes | Local development, debugging |
| `npm` | No | npm publishing |

### Selecting Target at Build Time

The target is selected via `--env-mode`:

```bash
rslib build --env-mode dev   # Build dev target
rslib build --env-mode npm   # Build npm target
```

## API Model Generation

### apiModel

Generate an API model file for documentation tooling using API Extractor:

```typescript
// Enable with defaults
NodeLibraryBuilder.create({
  apiModel: true,
});

// Enable with custom options
NodeLibraryBuilder.create({
  apiModel: {
    enabled: true,
    filename: 'my-package.api.json',
    localPaths: ['../docs-site/lib/packages/my-package'],
    tsdoc: {
      tagDefinitions: [
        { tagName: '@error', syntaxKind: 'block' },
      ],
      warnings: 'fail',
    },
    tsdocMetadata: true,
  },
});
```

**API Model Options:**

| Option | Type | Default | Description |
| :----- | :--- | :------ | :---------- |
| `enabled` | `boolean` | `true` | Enable API model generation |
| `filename` | `string` | `<package>.api.json` | Output filename |
| `localPaths` | `string[]` | `[]` | Local paths to copy API model files |
| `tsdoc` | `TsDocOptions` | All groups | TSDoc configuration |
| `tsdocMetadata` | `boolean \| object` | `true` | tsdoc-metadata.json |
| `forgottenExports` | `string` | `'include'` | Forgotten export handling |

### TSDoc Configuration

The `tsdoc` option configures custom TSDoc tags and validation:

```typescript
interface TsDocOptions {
  groups?: ('core' | 'extended' | 'discretionary')[];
  tagDefinitions?: TsDocTagDefinition[];
  supportForTags?: Record<string, boolean>;
  persistConfig?: boolean | string;
  warnings?: 'log' | 'fail' | 'none';
}
```

**Tag Groups:**

| Group | Tags Included |
| :---- | :------------ |
| `core` | `@param`, `@returns`, `@remarks`, `@deprecated`, `@typeParam` |
| `extended` | `@example`, `@defaultValue`, `@throws`, `@see`, `@inheritDoc` |
| `discretionary` | `@alpha`, `@beta`, `@public`, `@internal`, `@experimental` |

**Custom Tag Definitions:**

```typescript
apiModel: {
  tsdoc: {
    tagDefinitions: [
      { tagName: '@error', syntaxKind: 'block' },
      { tagName: '@category', syntaxKind: 'block', allowMultiple: false },
    ],
  },
}
```

**TSDoc Warnings Behavior:**

| Value | Behavior |
| :---- | :------- |
| `'log'` | Show warnings, continue build (local default) |
| `'fail'` | Show warnings and fail build (CI default) |
| `'none'` | Suppress TSDoc warnings |

**Forgotten Exports Behavior:**

A "forgotten export" occurs when a public API references a declaration that
isn't exported from the entry point. API Extractor detects these as
`ae-forgotten-export` messages.

| Value | Behavior |
| :---- | :------- |
| `'include'` | Log a warning, include in the API model (default) |
| `'error'` | Fail the build with details about forgotten exports |
| `'ignore'` | Suppress all forgotten export messages |

```typescript
apiModel: {
  enabled: true,
  forgottenExports: 'error',  // Fail build on forgotten exports
}
```

**Note:** API model is only generated for the `npm` target, not `dev`.

### Build Output Files

When API model generation is enabled, DtsPlugin produces several auxiliary files
in addition to declarations:

| File | Purpose | npm Publish |
| :--- | :------ | :---------: |
| `<package>.api.json` | API model for documentation tooling | No |
| `tsdoc-metadata.json` | TSDoc metadata for documentation | Yes |
| `tsdoc.json` | TSDoc configuration for tools | No |
| `tsconfig.json` | Resolved TypeScript configuration | No |

The `tsconfig.json` output is a **resolved (flattened)** version of your
project's TypeScript configuration. It is designed for virtual TypeScript
environments and tooling that needs compiler options without path dependencies.

**What the resolved tsconfig.json includes:**

- All compiler options converted to JSON-serializable format
- Enum values converted to strings (target, module, moduleResolution, jsx)
- `composite: false` and `noEmit: true` set for virtual environment compatibility
- `$schema` for IDE support

**What it excludes:**

- Path-dependent options: `rootDir`, `outDir`, `baseUrl`, `paths`, `typeRoots`
- Emit-related options: `declaration`, `sourceMap`, `inlineSourceMap`
- File selection patterns: `include`, `exclude`, `files`, `references`
- Types array (uses default @types auto-discovery)

**Use cases for resolved tsconfig.json:**

- Documentation tooling that needs type information
- Language service implementations for virtual file systems
- API documentation generators that analyze type annotations
- IDE plugins that need TypeScript configuration without file system access

**Local Paths Integration:**

When using `localPaths`, the resolved tsconfig.json is automatically copied
alongside the API model and package.json:

```typescript
apiModel: {
  enabled: true,
  localPaths: ['../docs-site/lib/packages/my-package'],
}
// Copies to each localPath:
// - my-package.api.json
// - package.json (transformed)
// - tsconfig.json (resolved)
// - tsdoc-metadata.json (if enabled)
```

## TSDoc Linting

TSDoc linting is controlled via the `apiModel.tsdoc.lint` option. When enabled,
it validates TSDoc comments before the build starts using ESLint.

### Enabling TSDoc Lint

TSDoc lint is **enabled by default** when `apiModel` is enabled (which is the
default). To disable or customize lint behavior:

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

// Customize lint behavior
NodeLibraryBuilder.create({
  apiModel: {
    tsdoc: {
      tagDefinitions: [
        { tagName: '@error', syntaxKind: 'block' },
      ],
      lint: {
        onError: 'throw',
        include: ['src/**/*.ts'],
        persistConfig: true,
      },
    },
  },
});
```

**TSDoc Lint Options (nested under `apiModel.tsdoc.lint`):**

| Option | Type | Default | Description |
| :----- | :--- | :------ | :---------- |
| `onError` | `ErrorBehavior` | `throw`/`error` | Error mode |
| `include` | `string[]` | Auto | Override discovery |
| `persistConfig` | `boolean` | `true` (local) | Keep tsdoc.json |

### Automatic File Discovery

By default, TsDocLintPlugin uses **import graph analysis** to discover files.
It traces imports from your `package.json` exports to find all TypeScript
files that are part of your public API.

**How it works:**

1. Reads entry points from `package.json` exports field
2. Parses each entry file using TypeScript compiler API
3. Recursively traces all `import` and `export` statements
4. Collects only files reachable from public exports

**What gets linted:**

- All `.ts` and `.tsx` files reachable from exports
- Files referenced through path aliases (via tsconfig paths)

**What gets excluded:**

- Test files (`*.test.ts`, `*.spec.ts`)
- Test directories (`__test__/`, `__tests__/`)
- Declaration files (`.d.ts`)
- External packages (`node_modules`)

This approach ensures you only lint documentation that consumers will see,
avoiding noise from internal implementation details.

### Overriding File Discovery

Use the `include` option when you need to:

- Lint internal files not reachable from exports
- Lint a subset of your public API
- Use specific glob patterns for file selection

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

When `include` is specified, automatic discovery is bypassed entirely and
only the specified glob patterns are used.

### TSDoc Configuration Sharing

TSDoc lint uses the parent TSDoc configuration (`apiModel.tsdoc`) for validation
rules. Tag definitions, groups, and support settings are shared automatically:

```typescript
NodeLibraryBuilder.create({
  apiModel: {
    tsdoc: {
      // These settings apply to both API Extractor and lint validation
      tagDefinitions: [{ tagName: '@error', syntaxKind: 'block' }],
      groups: ['core', 'extended'],
      // Lint-specific settings
      lint: {
        onError: 'throw',
      },
    },
  },
});
```

### Error Handling

| Environment | Default `onError` | Lint Errors | Build Result |
| :--- | :--- | :--- | :--- |
| Local | `'error'` | Yes | Continue, log errors |
| CI | `'throw'` | Yes | Fail build |

### persistConfig Behavior

The `persistConfig` option controls whether the generated `tsdoc.json` file
is kept after linting:

| Value | Local Behavior | CI Behavior |
| :---- | :------------- | :---------- |
| `true` | Persist to project root | Validate existing file |
| `false` | Clean up after linting | Skip validation, clean up |
| `PathLike` | Persist to custom path | Validate at custom path |
| undefined | Persist to project root | Validate existing file |

## ImportGraph Utility

The `ImportGraph` class is exported for advanced use cases where you need to
analyze TypeScript import relationships programmatically.

### Basic Usage

```typescript
import { ImportGraph } from '@savvy-web/rslib-builder';

// Trace from explicit entry points
const result = ImportGraph.fromEntries(
  ['./src/index.ts', './src/cli.ts'],
  { rootDir: process.cwd() }
);

console.log('Files:', result.files);
console.log('Entries:', result.entries);
console.log('Errors:', result.errors);
```

### Trace from Package Exports

```typescript
import { ImportGraph } from '@savvy-web/rslib-builder';

// Discover all files from package.json exports
const result = ImportGraph.fromPackageExports(
  './package.json',
  { rootDir: process.cwd() }
);

console.log('Public API files:', result.files);
```

### Instance Methods for Repeated Analysis

For repeated analysis where you want to reuse the TypeScript program:

```typescript
import { ImportGraph } from '@savvy-web/rslib-builder';

const graph = new ImportGraph({ rootDir: '/path/to/project' });

// Reuses the TypeScript program across calls
const libResult = graph.traceFromEntries(['./src/index.ts']);
const cliResult = graph.traceFromEntries(['./src/cli.ts']);
```

### ImportGraphOptions

| Option | Type | Default | Description |
| :----- | :--- | :------ | :---------- |
| `rootDir` | `string` | Required | Project root directory |
| `tsconfigPath` | `string` | Auto-detect | Custom tsconfig path |
| `excludePatterns` | `string[]` | `[]` | Extra exclude patterns |

### Exclude Patterns

By default, ImportGraph excludes these file patterns:

- `.test.` and `.spec.` files
- `__test__` and `__tests__` directories
- `.d.ts` declaration files

Use `excludePatterns` to exclude additional files:

```typescript
import { ImportGraph } from '@savvy-web/rslib-builder';

const graph = new ImportGraph({
  rootDir: process.cwd(),
  excludePatterns: [
    '.stories.',     // Storybook files
    '/mocks/',       // Mock directories
    '/fixtures/',    // Test fixtures
    '.bench.',       // Benchmark files
  ],
});

const result = graph.traceFromEntries(['./src/index.ts']);
```

Patterns are matched using simple string inclusion against file paths.

### ImportGraphResult

| Property | Type | Description |
| :------- | :--- | :---------- |
| `files` | `string[]` | Reachable TS files (sorted, absolute) |
| `entries` | `string[]` | The entry points that were traced |
| `errors` | `ImportGraphError[]` | Errors during analysis |

### Structured Error Handling

ImportGraph uses structured errors for programmatic error handling. Each error
includes a `type` field that allows you to handle different failure modes
appropriately:

```typescript
import { ImportGraph } from '@savvy-web/rslib-builder';
import type { ImportGraphError } from '@savvy-web/rslib-builder';

const result = ImportGraph.fromPackageExports('./package.json', {
  rootDir: process.cwd(),
});

// Handle errors based on type
for (const error of result.errors) {
  switch (error.type) {
    case 'tsconfig_not_found':
      console.warn('No tsconfig.json found, using defaults');
      break;
    case 'entry_not_found':
      console.error(`Missing entry file: ${error.path}`);
      break;
    case 'package_json_not_found':
      console.error(`Package not found: ${error.path}`);
      break;
    case 'file_read_error':
      console.warn(`Could not read file: ${error.path}`);
      break;
    default:
      console.error(error.message);
  }
}
```

### ImportGraphError

| Property | Type | Description |
| :------- | :--- | :---------- |
| `type` | `ImportGraphErrorType` | Error type for programmatic handling |
| `message` | `string` | Human-readable error message |
| `path` | `string \| undefined` | Related file path (when applicable) |

### ImportGraphErrorType

| Type | Description |
| :--- | :---------- |
| `tsconfig_not_found` | No tsconfig.json found in project |
| `tsconfig_read_error` | Failed to read tsconfig.json |
| `tsconfig_parse_error` | Failed to parse tsconfig.json |
| `package_json_not_found` | Package.json not found |
| `package_json_parse_error` | Failed to parse package.json |
| `entry_not_found` | Entry file does not exist |
| `file_read_error` | Failed to read a source file |

### Use Cases

- **Custom linting tools**: Find files to lint based on export reachability
- **Dependency analysis**: Understand which files depend on which
- **Code coverage**: Identify public API surface for coverage targets
- **Documentation**: Discover files that need documentation

## TsconfigResolver Utility

The `TsconfigResolver` class converts TypeScript's internal `ParsedCommandLine`
representation to a JSON-serializable format suitable for virtual TypeScript
environments and documentation tooling.

### TsconfigResolver Usage

```typescript
import { parseJsonConfigFileContent, readConfigFile, sys } from 'typescript';
import { TsconfigResolver } from '@savvy-web/rslib-builder';

// Parse tsconfig using TypeScript API
const configFile = readConfigFile('tsconfig.json', sys.readFile.bind(sys));
const parsed = parseJsonConfigFileContent(configFile.config, sys, process.cwd());

// Resolve to JSON-serializable format
const resolver = new TsconfigResolver();
const resolved = resolver.resolve(parsed, process.cwd());

console.log(JSON.stringify(resolved, null, 2));
```

### Static Enum Conversion Methods

TsconfigResolver provides static methods for converting individual TypeScript
enum values to their string representations:

```typescript
import { ScriptTarget, ModuleKind, ModuleResolutionKind } from 'typescript';
import { TsconfigResolver } from '@savvy-web/rslib-builder';

// Convert individual enum values
TsconfigResolver.convertScriptTarget(ScriptTarget.ES2022);     // "es2022"
TsconfigResolver.convertModuleKind(ModuleKind.NodeNext);       // "nodenext"
TsconfigResolver.convertModuleResolution(ModuleResolutionKind.Bundler); // "bundler"
TsconfigResolver.convertJsxEmit(JsxEmit.ReactJSX);             // "react-jsx"
TsconfigResolver.convertLibReference('lib.esnext.d.ts');       // "esnext"
```

### What Gets Resolved

The resolver transforms the configuration for virtual environments:

**Included:**

- Enum values converted to strings (target, module, moduleResolution, jsx)
- Lib array converted from paths to canonical names
- Boolean type-checking options (strict, noImplicitAny, etc.)
- `composite: false` and `noEmit: true` for virtual compatibility
- `$schema` for IDE support

**Excluded:**

- Path-dependent: `rootDir`, `outDir`, `baseUrl`, `paths`, `typeRoots`
- Emit-related: `declaration`, `sourceMap`, `inlineSourceMap`
- File selection: `include`, `exclude`, `files`, `references`

### TsconfigResolver Use Cases

- Documentation tooling that needs TypeScript configuration
- Language service implementations for virtual file systems
- API documentation generators analyzing type annotations
- IDE plugins needing TypeScript config without file system access

## EntryExtractor Utility

The `EntryExtractor` class analyzes package.json to identify TypeScript entry
points for build configuration.

### EntryExtractor Usage

```typescript
import { EntryExtractor } from '@savvy-web/rslib-builder';

const extractor = new EntryExtractor();

const packageJson = {
  exports: {
    ".": "./src/index.ts",
    "./utils": "./src/utils.ts",
  },
  bin: {
    "my-cli": "./src/bin/cli.ts"
  }
};

const result = extractor.extract(packageJson);
console.log(result.entries);
// {
//   "index": "./src/index.ts",
//   "utils": "./src/utils.ts",
//   "bin/my-cli": "./src/bin/cli.ts"
// }
```

### One-Off Usage

For one-off use, you can create and immediately call the extractor:

```typescript
import { EntryExtractor } from '@savvy-web/rslib-builder';

const result = new EntryExtractor().extract(packageJson);
```

### EntryExtractorOptions

| Option | Type | Default | Description |
| :----- | :--- | :------ | :---------- |
| `exportsAsIndexes` | `boolean` | `false` | Preserve path structure |

**With `exportsAsIndexes: false` (default):**

- `"./foo/bar"` becomes entry name `"foo-bar"`

**With `exportsAsIndexes: true`:**

- `"./foo/bar"` becomes entry name `"foo/bar/index"`

### Export Path Mapping

The extractor handles various export formats:

| Export Key | Entry Name |
| :--------- | :--------- |
| `"."` | `"index"` |
| `"./utils"` | `"utils"` |
| `"./foo/bar"` | `"foo-bar"` |
| `"./package.json"` | (skipped) |

### Source Path Resolution

EntryExtractor prioritizes TypeScript sources:

- Prefers `.ts`/`.tsx` files over `.js` files
- Maps `/dist/` JavaScript paths back to `/src/` TypeScript sources
- Supports conditional exports (import, default, types fields)

## Output Format

### format

Specify the output format for entry points:

```typescript
NodeLibraryBuilder.create({
  format: 'cjs',
});
```

| Value | package.json type | Extension |
| :---- | :---------------- | :-------- |
| `'esm'` (default) | `"module"` | `.js` |
| `'cjs'` | `"commonjs"` | `.cjs` |

The format option affects:

- The `type` field in the output package.json
- The file extension of bundled output files
- The default format for virtual entries

### Dual Format

Build all entries in both ESM and CJS by passing
an array:

```typescript
NodeLibraryBuilder.create({
  format: ['esm', 'cjs'],
});
```

Each format outputs to its own subdirectory:

```text
dist/npm/
├── esm/
│   ├── index.js
│   └── index.d.ts
└── cjs/
    ├── index.cjs
    └── index.d.cts
```

The first format in the array is the primary format
and determines the `type` field in package.json.
Exports get both `import` and `require` conditions:

```json
{
  "exports": {
    ".": {
      "types": "./esm/index.d.ts",
      "import": "./esm/index.js",
      "require": "./cjs/index.cjs"
    }
  }
}
```

### Per-Entry Format Overrides (entryFormats)

Override the format for specific exports while
keeping the rest as the top-level format:

```typescript
NodeLibraryBuilder.create({
  format: 'esm',
  entryFormats: {
    './markdownlint': 'cjs',
  },
});
```

Keys must match your package.json export paths
exactly (e.g., `"./markdownlint"`, not
`"markdownlint"`).

Overridden entries get format-specific conditions:

```json
{
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    },
    "./markdownlint": {
      "types": "./markdownlint.d.cts",
      "require": "./markdownlint.cjs"
    }
  }
}
```

CJS entries emit `.cjs` files and `.d.cts` type
declarations.

### Combining Dual Format with entryFormats

When both features are used, `entryFormats` takes
precedence. An entry with an explicit format
override is built only in that format, even if the
global format is dual:

```typescript
NodeLibraryBuilder.create({
  format: ['esm', 'cjs'],
  entryFormats: {
    './markdownlint': 'cjs',
  },
});
```

In this case, `./markdownlint` is CJS-only while
all other entries get both ESM and CJS.

## Virtual Entries

### virtualEntries

Bundle additional entry points with custom output names that bypass type
generation and package.json exports. Useful for special files like `pnpmfile.cjs`
that need to be self-contained CommonJS modules.

```typescript
NodeLibraryBuilder.create({
  virtualEntries: {
    // Key is the exact output filename
    'pnpmfile.cjs': {
      source: './src/pnpmfile.ts',
      format: 'cjs',  // Override format for this entry
    },
  },
});
```

**Key characteristics:**

| Aspect | Regular Entries | Virtual Entries |
| :----- | :-------------- | :-------------- |
| Source discovery | From package.json exports | Explicit `source` path |
| Output naming | Entry name + extension | Exact key name |
| Format | Top-level `format` option | Per-entry or inherited |
| Type generation | Yes (.d.ts) | No |
| package.json exports | Yes | No |
| package.json files | Yes | Yes |

### Virtual-Only Configurations

A package can have only virtual entries with no regular entry points:

```typescript
NodeLibraryBuilder.create({
  format: 'cjs',
  virtualEntries: {
    'pnpmfile.cjs': {
      source: './src/pnpmfile.ts',
    },
  },
});
```

This is valid for packages that exist solely to provide special files without
exposing a programmatic API.

### Format Inheritance

Virtual entries inherit the top-level `format` when not specified:

```typescript
NodeLibraryBuilder.create({
  format: 'cjs',  // Top-level format
  virtualEntries: {
    // Inherits 'cjs' format from top-level
    'helper.cjs': { source: './src/helper.ts' },
    // Explicit 'esm' override
    'module.js': { source: './src/module.ts', format: 'esm' },
  },
});
```

## Bundle Mode

### bundle

Control whether JavaScript output is bundled into single files per entry or
preserves the source file structure.

```typescript
// Default: bundled output (single file per entry)
NodeLibraryBuilder.create({
  bundle: true,  // default
});

// Bundleless mode: preserve source file structure
NodeLibraryBuilder.create({
  bundle: false,
});
```

| Value | JS Output | DTS Output |
| :---- | :-------- | :--------- |
| `true` (default) | Single file per entry | Bundled per entry |
| `false` | Preserves file structure | Bundled per entry |

**How bundleless mode works:**

When `bundle: false`, rslib-builder runs in a hybrid mode:

- **JavaScript**: RSlib runs in bundleless mode, preserving your `src/` file
  structure in the output. Each source file becomes a separate output file.
- **TypeScript Declarations**: Still bundled per entry point via API Extractor.
  This gives consumers clean, single-file type definitions.
- **API Model**: When `apiModel` is enabled with multiple entries, per-entry
  models are merged into a single `.api.json` with multiple `EntryPoint` members.

**Entry resolution in bundleless mode:**

In bundleless mode, rslib-builder uses `ImportGraph` to trace all files
reachable from your package.json exports. Each traced file becomes an
individual entry for RSlib, preserving the directory structure.

```text
src/                          dist/npm/
├── index.ts          -->     ├── index.js
├── utils/                    ├── index.d.ts
│   ├── helpers.ts    -->     ├── utils/
│   └── format.ts    -->     │   ├── helpers.js
└── core/                     │   └── format.js
    └── engine.ts    -->     └── core/
                                  └── engine.js
```

**When to use bundleless mode:**

- Libraries where consumers benefit from importing specific subpaths
- Packages with many internal modules where tree-shaking is important
- Projects that want to preserve source file organization in the output

## Define Constants

### define

Inject compile-time constants:

```typescript
NodeLibraryBuilder.create({
  define: {
    'process.env.DEBUG': JSON.stringify('true'),
    '__VERSION__': JSON.stringify('1.0.0'),
  },
});
```

**Built-in defines:**

- `process.env.__PACKAGE_VERSION__` - Automatically set to package version

## Full Example

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  // Type generation
  tsconfigPath: './tsconfig.build.json',
  dtsBundledPackages: ['picocolors', '@pnpm/**'],

  // Dependencies
  externals: ['@rslib/core', '@rsbuild/core'],

  // Output structure
  exportsAsIndexes: true,

  // Static files
  copyPatterns: [
    { from: './templates/**/*', context: './src' },
  ],

  // Package.json customization
  transform({ pkg, target }) {
    if (target === 'npm') {
      delete pkg.devDependencies;
      delete pkg.scripts;
    }
    return pkg;
  },

  // API documentation and TSDoc validation
  apiModel: {
    forgottenExports: 'error',
    tsdoc: {
      tagDefinitions: [
        { tagName: '@error', syntaxKind: 'block' },
      ],
      warnings: 'fail',
      // TSDoc lint options (nested under tsdoc)
      lint: {
        onError: 'throw',
        persistConfig: true,
      },
    },
  },

  // Build constants
  define: {
    '__DEV__': JSON.stringify(false),
  },
});
```
