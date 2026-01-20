---
status: current
module: rslib-builder
category: reference
created: 2026-01-20
updated: 2026-01-20
last-synced: 2026-01-20
completeness: 90
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
  enabled?: boolean;
  filename?: string;
  localPaths?: string[];
  tsdoc?: TsDocOptions;
  tsdocMetadata?: TsDocMetadataOptions | boolean;
}

interface TsDocOptions {
  groups?: TsDocTagGroup[];
  tagDefinitions?: TsDocTagDefinition[];
  supportForTags?: Record<string, boolean>;
  persistConfig?: boolean | PathLike;
  warnings?: "log" | "fail" | "none";
}

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

---

## Option Reference

### ApiModelOptions

#### `enabled`

| Property | Value |
| -------- | ----- |
| Type | `boolean` |
| Default | `false` |
| Required | No |

Whether to enable API model generation. When `true` or when `ApiModelOptions`
is provided as an object without `enabled: false`, API Extractor generates
an API model file.

```typescript
// Enable with defaults
apiModel: true

// Enable with options
apiModel: { enabled: true, filename: "my-api.json" }

// Explicitly disable
apiModel: { enabled: false }
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

### TsDocOptions

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

#### `persistConfig`

| Property | Value |
| -------- | ----- |
| Type | `boolean \| PathLike` |
| Default | `true` locally, `false` in CI |
| Required | No |

Controls whether `tsdoc.json` persists to disk after build.

| Environment | `persistConfig` | Behavior |
| ----------- | --------------- | -------- |
| Local dev | `undefined` | Persist to project root |
| Local dev | `true` | Persist to project root |
| Local dev | `PathLike` | Persist to custom path |
| Local dev | `false` | Clean up after build |
| CI | `undefined` | Clean up after build |
| CI | `true` | Persist (override CI detection) |

**CI Detection:** Environment variables `CI=true` or `GITHUB_ACTIONS=true`.

```typescript
// Default: persist locally, clean up in CI
tsdoc: {}

// Custom path
tsdoc: { persistConfig: "./config/tsdoc.json" }

// Force persistence in CI
tsdoc: { persistConfig: true }

// Never persist
tsdoc: { persistConfig: false }
```

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

### API Model Generation Scope

API models are only generated for the main "index" entry point (the "."
export). Additional entry points like "./hooks" or "./utils" do not generate
separate API models. This prevents multiple conflicting models and ensures a
single source of truth.

### File Distribution

| File | Emitted to dist | Published to npm |
| ---- | --------------- | ---------------- |
| `<package>.api.json` | Yes | No (negated pattern) |
| `tsdoc-metadata.json` | Yes | Yes (TSDoc spec requirement) |
| `tsdoc.json` | Yes (if persist) | No (negated pattern) |

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
configuration.
