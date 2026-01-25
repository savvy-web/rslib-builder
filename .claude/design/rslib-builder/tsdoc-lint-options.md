---
status: current
module: rslib-builder
category: reference
created: 2026-01-24
updated: 2026-01-25
last-synced: 2026-01-24
completeness: 95
related:
  - rslib-builder/architecture.md
  - rslib-builder/api-model-options.md
dependencies: []
---

# TsDocLintPluginOptions Configuration Reference

Quick reference for configuring TSDoc linting in the TsDocLintPlugin.

## Table of Contents

1. [Overview](#overview)
2. [Configuration Interface](#configuration-interface)
3. [Option Reference](#option-reference)
4. [Usage Examples](#usage-examples)
5. [Behavior Notes](#behavior-notes)
6. [Related Documentation](#related-documentation)

---

## Overview

The `TsDocLintPluginOptions` interface configures pre-build TSDoc validation
using ESLint with `eslint-plugin-tsdoc`. The plugin validates documentation
comments before compilation begins, catching errors early.

**Source:** `src/rslib/plugins/tsdoc-lint-plugin.ts`

**When to use this reference:**

- Configuring TSDoc validation for a package
- Setting up custom TSDoc tags for linting
- Adjusting error handling behavior for CI vs local development
- Understanding default behaviors and environment detection

**Required Dependencies (Optional Peer Dependencies):**

```bash
pnpm add -D eslint @typescript-eslint/parser eslint-plugin-tsdoc
```

---

## Configuration Interface

```typescript
interface TsDocLintPluginOptions {
  enabled?: boolean;
  tsdoc?: TsDocOptions;
  include?: string[];
  onError?: TsDocLintErrorBehavior;
  persistConfig?: boolean | PathLike;
}

type TsDocLintErrorBehavior = "warn" | "error" | "throw";

// Shared with DtsPlugin - see api-model-options.md for full reference
interface TsDocOptions {
  groups?: TsDocTagGroup[];
  tagDefinitions?: TsDocTagDefinition[];
  supportForTags?: Record<string, boolean>;
  persistConfig?: boolean | PathLike;
  warnings?: "log" | "fail" | "none";
}
```

---

## Option Reference

### TsDocLintPluginOptions

#### `enabled`

| Property | Value |
| -------- | ----- |
| Type | `boolean` |
| Default | `true` |
| Required | No |

Whether to enable TSDoc linting. Set to `false` to disable the plugin
entirely without removing it from configuration.

```typescript
// Enable (default)
tsdocLint: true

// Disable
tsdocLint: { enabled: false }
```

#### `tsdoc`

| Property | Value |
| -------- | ----- |
| Type | `TsDocOptions` |
| Default | All standard tag groups enabled |
| Required | No |

TSDoc configuration for custom tag definitions. This uses the same
`TsDocOptions` interface as the DtsPlugin's `apiModel.tsdoc` option.

**Configuration Sharing:** When both `tsdocLint` and `apiModel` are enabled
in NodeLibraryBuilder, and `tsdocLint.tsdoc` is not explicitly set, the
configuration is automatically shared from `apiModel.tsdoc`.

See [api-model-options.md](./api-model-options.md#tsdocoptions) for the full
`TsDocOptions` reference.

```typescript
tsdocLint: {
  tsdoc: {
    tagDefinitions: [
      { tagName: "@error", syntaxKind: "block" }
    ]
  }
}
```

#### `include`

| Property | Value |
| -------- | ----- |
| Type | `string[]` |
| Default | Automatic discovery via ImportGraph |
| Required | No |

Overrides automatic file discovery with explicit glob patterns. By default,
TsDocLintPlugin uses `ImportGraph` to trace imports from your `package.json`
exports and discover all public API files automatically.

**Automatic file discovery (default behavior):**

When `include` is not specified, the plugin:

1. Reads `package.json` from the project root
2. Extracts entry points from the `exports` and `bin` fields
3. Uses `ImportGraph.traceFromPackageExports()` to trace all imports
4. Returns only TypeScript source files (excludes tests, declarations)

This ensures only files that are part of your public API are linted,
avoiding false positives from internal implementation details.

**When to use explicit patterns:**

- Linting files not exported from `package.json`
- Overriding automatic discovery for specific needs
- Including additional directories beyond exports

```typescript
// Default: automatic discovery (recommended)
tsdocLint: {}

// Override with explicit patterns
tsdocLint: {
  include: ["src/**/*.ts", "!**/*.test.ts", "!**/__test__/**"]
}

// Custom patterns - lint lib/ directory
tsdocLint: {
  include: ["lib/**/*.ts", "!**/*.spec.ts"]
}

// Include multiple directories
tsdocLint: {
  include: ["src/**/*.ts", "packages/**/*.ts", "!**/*.test.ts"]
}
```

**Pattern syntax:**

- Standard glob patterns: `src/**/*.ts`
- Negation patterns: `!**/*.test.ts` (exclude test files)
- Multiple patterns: combine in array

When `include` is specified, ImportGraph analysis is skipped entirely and
patterns are passed directly to ESLint.

#### `onError`

| Property | Value |
| -------- | ----- |
| Type | `"warn" \| "error" \| "throw"` |
| Default | `"throw"` in CI, `"error"` locally |
| Required | No |

How to handle TSDoc lint errors.

| Value | Behavior |
| ----- | -------- |
| `"warn"` | Log warnings to console, continue build |
| `"error"` | Log errors to console, continue build |
| `"throw"` | Fail the build with an error |

**Environment Detection:** CI is detected via `CI=true` or
`GITHUB_ACTIONS=true` environment variables.

```typescript
// Fail build on errors (CI default)
tsdocLint: { onError: "throw" }

// Log errors but continue (local default)
tsdocLint: { onError: "error" }

// Treat as warnings only
tsdocLint: { onError: "warn" }
```

#### `persistConfig`

| Property | Value |
| -------- | ----- |
| Type | `boolean \| PathLike` |
| Default | `true` locally, `false` in CI |
| Required | No |

Controls whether `tsdoc.json` persists to disk after linting.

| Environment | `persistConfig` | Behavior |
| ----------- | --------------- | -------- |
| Local dev | `undefined` | Persist to project root |
| Local dev | `true` | Persist to project root |
| Local dev | `PathLike` | Persist to custom path |
| Local dev | `false` | Clean up after linting |
| CI | `undefined` | Clean up after linting |
| CI | `true` | Persist (override CI detection) |

**Why persist?** The `tsdoc.json` file enables IDE integration and allows
running `eslint-plugin-tsdoc` directly via CLI for consistent validation.

```typescript
// Default: persist locally, clean up in CI
tsdocLint: {}

// Custom path
tsdocLint: { persistConfig: "./config/tsdoc.json" }

// Force persistence in CI
tsdocLint: { persistConfig: true }

// Never persist
tsdocLint: { persistConfig: false }
```

---

## Usage Examples

### Basic Usage with NodeLibraryBuilder

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  tsdocLint: true
});
```

### Full Configuration

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  tsdocLint: {
    enabled: true,
    tsdoc: {
      groups: ["core", "extended", "discretionary"],
      tagDefinitions: [
        { tagName: "@error", syntaxKind: "block" }
      ]
    },
    include: ["src/**/*.ts", "!**/*.test.ts", "!**/__test__/**"],
    onError: "throw",
    persistConfig: true
  }
});
```

### Shared Configuration with API Model

When both features are enabled, TSDoc configuration can be shared:

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  // API model with custom tags
  apiModel: {
    enabled: true,
    tsdoc: {
      tagDefinitions: [
        { tagName: "@error", syntaxKind: "block" },
        { tagName: "@category", syntaxKind: "block" }
      ]
    }
  },
  // TSDoc lint automatically uses apiModel.tsdoc when tsdoc is not specified
  tsdocLint: true
});
```

### Standalone Plugin Usage

```typescript
import { defineConfig } from '@rslib/core';
import { TsDocLintPlugin } from '@savvy-web/rslib-builder';

export default defineConfig({
  lib: [{ /* ... */ }],
  plugins: [
    TsDocLintPlugin({
      onError: "warn",
      include: ["src/**/*.ts"]
    })
  ]
});
```

### CI-Specific Configuration

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

const isCI = process.env.CI === "true";

export default NodeLibraryBuilder.create({
  tsdocLint: {
    onError: isCI ? "throw" : "error",
    persistConfig: !isCI
  }
});
```

### Custom File Patterns

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  tsdocLint: {
    include: [
      "src/**/*.ts",
      "packages/*/src/**/*.ts",
      "!**/*.test.ts",
      "!**/*.spec.ts",
      "!**/__test__/**",
      "!**/__mocks__/**"
    ]
  }
});
```

---

## Behavior Notes

### Automatic File Discovery with ImportGraph

By default, TsDocLintPlugin uses `ImportGraph` to discover which files to lint.
This provides several benefits:

- **Public API focus:** Only files reachable from `package.json` exports are
  linted
- **No configuration needed:** Works automatically with standard package layouts
- **Test exclusion:** Automatically filters test files, `.d.ts` files, and
  `__test__` directories
- **Accurate resolution:** Uses TypeScript compiler API for path alias support

**How ImportGraph works:**

```text
package.json exports → EntryExtractor → entry points
                                              ↓
                                        ImportGraph
                                              ↓
         trace imports recursively (static, dynamic, re-exports)
                                              ↓
                         filter out tests, declarations, node_modules
                                              ↓
                              sorted list of source files
```

**Error handling:** ImportGraph errors are non-fatal. If some imports cannot
be resolved, the plugin logs warnings and continues with successfully
discovered files.

See [Architecture: ImportGraph Architecture](./architecture.md#importgraph-architecture)
for detailed implementation documentation.

### Plugin Execution Timing

TsDocLintPlugin runs in the `onBeforeBuild` hook, executing **before** all
other plugins and before TypeScript compilation begins. This provides:

- **Fail-fast behavior:** Errors are caught before expensive compilation
- **Clean error messages:** TSDoc errors aren't mixed with TypeScript errors
- **Consistent validation:** Same TSDoc config used for linting and API
  extraction

### Error Handling Matrix

| Environment | `onError` | Lint Errors | Build Result |
| ----------- | --------- | ----------- | ------------ |
| Local | default (`"error"`) | Yes | Continue, log errors |
| Local | `"warn"` | Yes | Continue, log warnings |
| Local | `"throw"` | Yes | Fail build |
| CI | default (`"throw"`) | Yes | Fail build |
| CI | `"error"` | Yes | Continue, log errors |
| Any | Any | No | Success |

### ESLint Integration

The plugin uses ESLint programmatically with an inline configuration:

```typescript
// Generated ESLint config (internal)
[
  { ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"] },
  {
    files: includePatterns,
    languageOptions: { parser: "@typescript-eslint/parser" },
    plugins: { tsdoc: "eslint-plugin-tsdoc" },
    rules: { "tsdoc/syntax": "error" }
  }
]
```

### tsdoc.json Generation

The plugin generates a `tsdoc.json` configuration file that:

1. Defines custom tags from `tagDefinitions`
2. Sets `supportForTags` based on enabled groups
3. Uses `noStandardTags: false` when all groups are enabled (minimal config)
4. Uses `noStandardTags: true` when subset of groups specified

This file can be persisted for:

- IDE integration (VS Code TSDoc extension)
- Running `eslint-plugin-tsdoc` directly via CLI
- Consistency between lint plugin and API Extractor

### Missing Dependencies

If the required ESLint packages are not installed, the plugin throws a
helpful error:

```text
TsDocLintPlugin requires eslint, @typescript-eslint/parser, and eslint-plugin-tsdoc.
Install them with: pnpm add -D eslint @typescript-eslint/parser eslint-plugin-tsdoc
```

---

## Related Documentation

**Internal Design Docs:**

- [Architecture](./architecture.md) - Overall system architecture and plugin
  execution model
- [API Model Options](./api-model-options.md) - `TsDocOptions` reference and
  API model configuration

**Source Code:**

- `src/rslib/plugins/tsdoc-lint-plugin.ts` - TsDocLintPlugin implementation
- `src/rslib/plugins/tsdoc-lint-plugin.test.ts` - Plugin tests
- `src/rslib/plugins/utils/import-graph.ts` - ImportGraph class for file discovery
- `src/rslib/builders/node-library-builder.ts` - NodeLibraryBuilder API

**External Resources:**

- [eslint-plugin-tsdoc](https://www.npmjs.com/package/eslint-plugin-tsdoc) -
  ESLint plugin for TSDoc validation
- [TSDoc](https://tsdoc.org/) - Documentation comment standard
- [@typescript-eslint/parser](https://typescript-eslint.io/packages/parser/) -
  TypeScript parser for ESLint

---

**Document Status:** Current - Comprehensive reference for TsDocLintPluginOptions
configuration including automatic file discovery via ImportGraph.
