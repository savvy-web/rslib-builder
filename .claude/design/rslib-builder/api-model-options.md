---
status: current
module: rslib-builder
category: reference
created: 2026-01-20
updated: 2026-02-05
last-synced: 2026-02-05
completeness: 95
related:
  - rslib-builder/architecture.md
  - rslib-builder/api-extraction.md
dependencies: []
---

# ApiModelOptions Configuration Reference

Quick reference for configuring API model generation in the DtsPlugin.

## Table of Contents

1. [Overview](#overview)
2. [Configuration Interface](#configuration-interface)
3. [Option Reference](#option-reference)
4. [Usage Examples](#usage-examples)
5. [Behavior Notes](#behavior-notes)
6. [Related Documentation](#related-documentation)

---

## Overview

The `ApiModelOptions` interface configures API model generation for TypeScript
packages using Microsoft's API Extractor. When enabled, it generates:

- `<package>.api.json` - Machine-readable API documentation for tooling
- `tsdoc-metadata.json` - TSDoc tag metadata for downstream consumers
- Optional: `tsdoc.json` - Persisted TSDoc config for IDE/ESLint integration

**Source:** `src/rslib/plugins/dts-plugin.ts`

**When to use this reference:**

- Configuring API model generation for a package
- Setting up TSDoc custom tags
- Troubleshooting API Extractor output
- Understanding default behaviors

---

## Configuration Interface

```typescript
interface ApiModelOptions {
  filename?: string;
  localPaths?: string[];
  tsdoc?: TsDocOptions;
  tsdocMetadata?: TsDocMetadataOptions | boolean;
  forgottenExports?: "include" | "error" | "ignore";
}

interface TsDocOptions {
  groups?: TsDocTagGroup[];
  tagDefinitions?: TsDocTagDefinition[];
  supportForTags?: Record<string, boolean>;
  warnings?: "log" | "fail" | "none";
  lint?: TsDocLintOptions | boolean;  // TSDoc lint configuration
}

interface TsDocLintOptions {
  include?: string[];                   // Override automatic file discovery
  onError?: TsDocLintErrorBehavior;     // Default: "throw" in CI, "error" locally
  persistConfig?: boolean | PathLike;   // Default: true locally, validates in CI
}

type TsDocLintErrorBehavior = "warn" | "error" | "throw";

interface TsDocMetadataOptions {
  enabled?: boolean;
  filename?: string;
}

type TsDocTagGroup = "core" | "extended" | "discretionary";

interface TsDocTagDefinition {
  tagName: string;
  syntaxKind: "block" | "inline" | "modifier";
  allowMultiple?: boolean;
}
```

**Note:** API model generation is **enabled by default** (`apiModel: true` in
`NodeLibraryBuilder.DEFAULT_OPTIONS`). TSDoc linting is controlled via
`apiModel.tsdoc.lint` and is also enabled by default when `apiModel` is enabled.

---

## Option Reference

### ApiModelOptions

**Note:** API model generation is **enabled by default**. The `apiModel` option
defaults to `true` in `NodeLibraryBuilder.DEFAULT_OPTIONS`. To disable API
model generation, explicitly set `apiModel: false`.

```typescript
// API model enabled by default (implicit)
NodeLibraryBuilder.create({})

// API model enabled with custom options
NodeLibraryBuilder.create({
  apiModel: {
    filename: "my-api.json",
  },
})

// Explicitly disable API model
NodeLibraryBuilder.create({
  apiModel: false,
})
```

#### `filename`

| Property | Value |
| -------- | ----- |
| Type | `string` |
| Default | `<unscopedPackageName>.api.json` |
| Required | No |

Custom filename for the generated API model file. The default follows API
Extractor conventions using the unscoped package name.

```typescript
// Package "@savvy-web/rslib-builder" generates "rslib-builder.api.json"
apiModel: { enabled: true }

// Custom filename
apiModel: { enabled: true, filename: "api.json" }
```

#### `localPaths`

| Property | Value |
| -------- | ----- |
| Type | `string[]` |
| Default | `undefined` |
| Required | No |

Local directory paths to copy API model and related files after build
completes. Used for local development with documentation systems.

**Files copied:**

- API model (`<package>.api.json`)
- TSDoc metadata (`tsdoc-metadata.json`) if enabled
- Transformed `package.json` from dist

**Requirements:**

- Each path must be a directory
- Parent directory must exist (final directory is created if missing)
- Paths are resolved relative to package root

```typescript
apiModel: {
  enabled: true,
  localPaths: ["../docs-site/lib/packages/my-package"]
}
```

#### `tsdoc`

| Property | Value |
| -------- | ----- |
| Type | `TsDocOptions` |
| Default | All standard tag groups enabled |
| Required | No |

TSDoc configuration for custom tag definitions. See [TsDocOptions](#tsdocoptions)
section for detailed configuration.

#### `tsdocMetadata`

| Property | Value |
| -------- | ----- |
| Type | `TsDocMetadataOptions \| boolean` |
| Default | `true` (enabled when apiModel is enabled) |
| Required | No |

Options for `tsdoc-metadata.json` generation. This file is required by the
TSDoc specification to be included in published packages.

```typescript
// Enable with defaults
apiModel: { enabled: true, tsdocMetadata: true }

// Custom filename
apiModel: {
  enabled: true,
  tsdocMetadata: { enabled: true, filename: "tsdoc-meta.json" }
}

// Disable
apiModel: { enabled: true, tsdocMetadata: false }
```

#### `forgottenExports`

| Property | Value |
| -------- | ----- |
| Type | `"include" \| "error" \| "ignore"` |
| Default | `"include"` |
| Required | No |

Controls handling of API Extractor's "forgotten export" (`ae-forgotten-export`)
messages. A forgotten export occurs when a public API references a declaration
that isn't exported from the entry point.

| Value | Behavior |
| ----- | -------- |
| `"include"` | Log a warning, include in the API model (default) |
| `"error"` | Fail the build with details about forgotten exports |
| `"ignore"` | Suppress all forgotten export messages silently |

**Implementation:** In the `messageCallback` passed to `Extractor.invoke()`,
messages with `messageId === "ae-forgotten-export"` are intercepted. For
`"include"` and `"error"`, messages are collected into a
`collectedForgottenExports` array and formatted using the same `formatWarning`
helper shared with TSDoc warning handling.

```typescript
// Fail build on forgotten exports
apiModel: { enabled: true, forgottenExports: "error" }

// Suppress forgotten export warnings
apiModel: { enabled: true, forgottenExports: "ignore" }

// Default: warn but include in API model
apiModel: { enabled: true }
```

### TsDocOptions

**Integrated Lint Configuration:** TSDoc linting is now controlled via the
`apiModel.tsdoc.lint` option. When `apiModel` is enabled (the default), lint
is also enabled by default. The lint plugin uses the TSDoc tag configuration
from the parent `tsdoc` object (tagDefinitions, groups, etc.).

#### `groups`

| Property | Value |
| -------- | ----- |
| Type | `("core" \| "extended" \| "discretionary")[]` |
| Default | `["core", "extended", "discretionary"]` |
| Required | No |

TSDoc tag groups to enable. Standard tags are imported from `@microsoft/tsdoc`.

**Groups:**

- **core:** `@param`, `@returns`, `@remarks`, `@deprecated`, `@typeParam`,
  `@link`, `@label`, `@packageDocumentation`, `@privateRemarks`
- **extended:** `@example`, `@defaultValue`, `@throws`, `@see`, `@inheritDoc`,
  `@virtual`, `@override`, `@sealed`, `@readonly`, `@eventProperty`,
  `@decorator`, `@jsx`, `@jsxFrag`, `@jsxImportSource`, `@jsxRuntime`
- **discretionary:** `@alpha`, `@beta`, `@experimental`, `@public`, `@internal`

```typescript
// All groups (default)
tsdoc: {}

// Core tags only
tsdoc: { groups: ["core"] }

// Core + discretionary (skip extended)
tsdoc: { groups: ["core", "discretionary"] }
```

#### `tagDefinitions`

| Property | Value |
| -------- | ----- |
| Type | `TsDocTagDefinition[]` |
| Default | `[]` |
| Required | No |

Custom TSDoc tag definitions beyond standard groups. Tags are automatically
added to `supportForTags` (no need to declare twice).

```typescript
tsdoc: {
  tagDefinitions: [
    { tagName: "@error", syntaxKind: "inline" },
    { tagName: "@category", syntaxKind: "block", allowMultiple: false }
  ]
}
```

#### `supportForTags`

| Property | Value |
| -------- | ----- |
| Type | `Record<string, boolean>` |
| Default | Auto-derived from groups + tagDefinitions |
| Required | No |

Override support for specific tags. **Only needed to disable tags.** Tags from
enabled groups and custom definitions are auto-supported.

```typescript
// Disable @beta even though "discretionary" group is enabled
tsdoc: {
  supportForTags: { "@beta": false }
}
```

#### `lint`

| Property | Value |
| -------- | ----- |
| Type | `TsDocLintOptions \| boolean` |
| Default | `true` (enabled when apiModel is enabled) |
| Required | No |

Controls TSDoc linting before the build. Lint is enabled by default when
`apiModel` is enabled.

```typescript
// Lint enabled by default (apiModel: true is the default)
apiModel: {}

// Disable lint explicitly
apiModel: {
  tsdoc: {
    lint: false,
  },
}

// Customize lint behavior
apiModel: {
  tsdoc: {
    tagDefinitions: [{ tagName: "@error", syntaxKind: "inline" }],
    lint: {
      onError: "throw",
      include: ["src/**/*.ts"],
      persistConfig: true,
    },
  },
}
```

**TsDocLintOptions fields:**

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `include` | `string[]` | Auto-discovery | Override automatic file discovery |
| `onError` | `TsDocLintErrorBehavior` | `"throw"` in CI, `"error"` locally | Error handling behavior |
| `persistConfig` | `boolean \| PathLike` | `true` locally | Persist tsdoc.json (validates in CI) |

**Lint persistence behavior in CI:** When `persistConfig` is `true` or undefined
in CI environments, the existing `tsdoc.json` is validated against the expected
configuration. If it doesn't match, the build fails with instructions to
regenerate locally. Set `persistConfig: false` to skip validation.

#### `warnings`

| Property | Value |
| -------- | ----- |
| Type | `"log" \| "fail" \| "none"` |
| Default | `"fail"` in CI, `"log"` locally |
| Required | No |

How to handle TSDoc validation warnings from API Extractor.

| Value | Behavior |
| ----- | -------- |
| `"log"` | Show warnings in console, continue build |
| `"fail"` | Show warnings and fail build if any found |
| `"none"` | Suppress TSDoc warnings entirely |

```typescript
// Fail on warnings (CI default)
tsdoc: { warnings: "fail" }

// Log but continue (local default)
tsdoc: { warnings: "log" }

// Suppress warnings
tsdoc: { warnings: "none" }
```

---

## Usage Examples

### Basic API Model Generation

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  apiModel: true
});
```

### Full Configuration

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  apiModel: {
    enabled: true,
    filename: "rslib-builder.api.json",
    localPaths: ["../docs-site/lib/packages/rslib-builder"],
    forgottenExports: "error",
    tsdoc: {
      groups: ["core", "extended", "discretionary"],
      tagDefinitions: [
        { tagName: "@error", syntaxKind: "inline" }
      ],
      supportForTags: { "@beta": false },
      persistConfig: true,
      warnings: "fail"
    },
    tsdocMetadata: {
      enabled: true,
      filename: "tsdoc-metadata.json"
    }
  }
});
```

### Custom Tags Only

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  apiModel: {
    enabled: true,
    tsdoc: {
      tagDefinitions: [
        { tagName: "@error", syntaxKind: "inline" },
        { tagName: "@category", syntaxKind: "block", allowMultiple: false }
      ]
    }
  }
});
```

### Core Tags Only (Minimal Config)

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  apiModel: {
    enabled: true,
    tsdoc: {
      groups: ["core"]
    }
  }
});
```

### Development Workflow with Local Paths

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  apiModel: {
    enabled: true,
    localPaths: [
      "../website/docs/en/packages/my-package"
    ],
    tsdoc: {
      persistConfig: true  // Keep tsdoc.json for ESLint
    }
  }
});
```

---

## Behavior Notes

### Multi-Entry API Model Generation

When a package has multiple entry points, API Extractor runs for each entry
and generates a per-entry `.api.json` file in a temp directory. These are
then merged into a single Package with multiple `EntryPoint` members via
`mergeApiModels()`.

**Single entry:** The per-entry API model is used as-is (no merge step).

**Multiple entries:** Each per-entry model's `EntryPoint` is extracted,
canonical references for sub-entries are rewritten to include the export
subpath (e.g., `@scope/pkg/utils!` instead of `@scope/pkg!`), and all
`EntryPoint` members are combined into one Package. The main entry (".")
is always first in the members array.

The `exportPaths` mapping from `EntryExtractor` provides the lossless
reverse mapping from entry names back to original export keys for correct
canonical reference scoping.

### File Distribution

| File | Emitted to dist | Published to npm |
| ---- | --------------- | ---------------- |
| `<package>.api.json` | Yes | No (negated pattern) |
| `tsdoc-metadata.json` | Yes | Yes (TSDoc spec requirement) |
| `tsdoc.json` | Yes (if persist) | No (negated pattern) |
| `tsconfig.json` | Yes (if apiModel) | No (negated pattern) |

### localPaths Behavior

- **Skipped in CI:** When `CI=true` or `GITHUB_ACTIONS=true`, localPaths
  copying is skipped to avoid polluting CI environments.

- **Atomic copy after build:** Files are copied in `onCloseBuild` hook after
  all assets are written to dist. This ensures the transformed `package.json`
  (with resolved pnpm references and updated paths) is copied, not the source.

- **Directory creation:** Final directory is created if it doesn't exist, but
  parent directories must exist. This prevents accidental creation of deep
  directory trees from typos.

### TSDoc Config Optimization

When all tag groups are enabled (the default), the generated `tsdoc.json`
uses `noStandardTags: false` to let TSDoc automatically load all standard
tags, producing a minimal config file. When a subset of groups is specified,
`noStandardTags: true` is used and only the enabled groups' tags are
explicitly defined.

---

## Related Documentation

**Internal Design Docs:**

- [Architecture](./architecture.md) - Overall system architecture and plugin
  execution model
- [API Extraction](./api-extraction.md) - Detailed API extraction process and
  TSDoc configuration rationale

**Source Code:**

- `src/rslib/plugins/dts-plugin.ts` - DtsPlugin implementation
- `src/rslib/builders/node-library-builder.ts` - NodeLibraryBuilder API

**External Resources:**

- [API Extractor](https://api-extractor.com/) - Microsoft's API documentation
  tool
- [TSDoc](https://tsdoc.org/) - Documentation comment standard
- [tsdoc.json Configuration](https://api-extractor.com/pages/configs/tsdoc_json/)
  - TSDoc config file reference

---

**Document Status:** Current - Comprehensive reference for ApiModelOptions
configuration with multi-entry API model generation support.
