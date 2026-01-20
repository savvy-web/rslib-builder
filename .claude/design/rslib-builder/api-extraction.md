---
status: current
module: rslib-builder
category: integration
created: 2026-01-19
updated: 2026-01-20
last-synced: 2026-01-19
completeness: 95
related:
  - rslib-builder/architecture.md
  - rslib-builder/api-model-options.md
dependencies: []
---

# API Extraction

API model generation and TypeScript declaration bundling using Microsoft's
API Extractor, with TSDoc configuration support for custom documentation tags.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Implementation Details](#implementation-details)
5. [TSDoc Configuration](#tsdoc-configuration)
6. [Testing Strategy](#testing-strategy)
7. [Related Documentation](#related-documentation)

---

## Overview

The API extraction system generates machine-readable API documentation and
bundled TypeScript declarations using Microsoft's API Extractor. This enables
documentation tools (like RSPress plugins) to consume structured API data for
generating documentation sites.

**Key Features:**

- API model generation (`<package>.api.json`) for documentation tooling
- Declaration bundling via API Extractor (single `.d.ts` per entry point)
- TSDoc configuration with tag groups for custom inline/block tags
- TSDoc metadata generation (`tsdoc-metadata.json`) for downstream tools
- Local path copying for development workflows

**When to reference this document:**

- When modifying API model generation in DtsPlugin
- When adding custom TSDoc tags for documentation
- When debugging API Extractor configuration issues
- When extending the apiModel options interface

---

## Current State

### What Exists Now

API extraction is handled by the `DtsPlugin` as part of the declaration
bundling process. When `apiModel` is enabled, API Extractor generates both
bundled declarations and an API model file.

**Key Components:**

1. **DtsPlugin** (`src/rslib/plugins/dts-plugin.ts`)
   - Purpose: Generates TypeScript declarations and optional API models
   - Status: Implemented
   - Key functions: `bundleDtsFiles()`, `DtsPlugin()`

2. **ApiModelOptions Interface** (`src/rslib/plugins/dts-plugin.ts`)
   - Purpose: Configuration for API model generation
   - Status: Fully implemented with TSDoc support

### Current Capabilities

- Generate API model for main entry point ("." export only)
- Exclude API model from npm publish via negated files array pattern
- Copy API model to local paths for documentation development
- Bundle declarations using API Extractor
- TSDoc configuration with tag groups (core, extended, discretionary)
- Custom tag definitions with auto-derived `supportForTags`
- TSDoc metadata file generation (`tsdoc-metadata.json`)
- TSDoc config persistence (`persistConfig` option)
  - Persist `tsdoc.json` to disk for tool integration (ESLint, IDEs)
  - Auto-detect CI environment to skip persistence
  - Support custom output paths via `PathLike`

### Planned Capabilities

None currently - all planned features have been implemented.

---

## Rationale

### Why API Extractor

**Context:** Need to generate machine-readable API documentation for
documentation sites.

**Options considered:**

1. **TypeDoc** - JSON output, custom themes
   - Pros: Well-documented, flexible output
   - Cons: Different API format, separate tooling
2. **API Extractor** (Chosen)
   - Pros: Standard API model format, declaration bundling, TSDoc support
   - Cons: Microsoft-specific, complex configuration
3. **Custom parser** - Parse TypeScript AST directly
   - Pros: Full control
   - Cons: Massive effort, reinventing the wheel

**Decision:** API Extractor chosen for its standard `.api.json` format and
integration with TSDoc for custom tags.

### Why Tag Groups

**Context:** Users need to define custom TSDoc tags but don't want to
manually re-enable all standard tags.

**Options considered:**

1. **Use `extends` array** - Extend base configs
   - Pros: Simple, standard approach
   - Cons: Requires users to know config file paths
2. **Tag groups** (Chosen) - Predefined sets of tags
   - Pros: Ergonomic defaults, explicit control, no external file dependencies
   - Cons: None - tags imported from official `@microsoft/tsdoc` package

**Decision:** Tag groups using `StandardTags` from `@microsoft/tsdoc` package.
Standard tags are organized into three standardization groups (core, extended,
discretionary) as defined by the official TSDoc specification.

### Why Smart noStandardTags

**Context:** The `noStandardTags` setting in `tsdoc.json` controls whether
TSDoc automatically loads standard tags or requires explicit definitions.

**Options considered:**

1. **Always `noStandardTags: true`** - Explicit tag definitions
   - Pros: Full control over which tags are enabled
   - Cons: Verbose config files, must keep up with TSDoc updates
2. **Always `noStandardTags: false`** - Auto-load all tags
   - Pros: Minimal config
   - Cons: No way to use subset of groups
3. **Smart based on groups** (Chosen) - Conditional behavior
   - Pros: Minimal config by default, explicit when needed
   - Cons: Slightly more complex logic

**Decision:** When all groups are enabled (default), use `noStandardTags: false`
to produce minimal config files. When a subset of groups is specified, use
`noStandardTags: true` and explicitly define only the enabled groups' tags.

### Why Auto-Derive supportForTags

**Context:** Users had to list custom tags twice (in `tagDefinitions` and
`supportForTags`).

**Decision:** Auto-derive `supportForTags` from all tag definitions. Users
only need `supportForTags` to explicitly disable specific tags.

### Why Persist tsdoc.json by Default (Non-CI)

**Context:** The generated `tsdoc.json` file enables tool integration:

- ESLint's `eslint-plugin-tsdoc` reads it for tag validation
- IDEs can use it for TSDoc autocomplete and validation
- Other documentation tools may reference it

**Options considered:**

1. **Always clean up** - Delete after API Extractor runs
   - Pros: No file clutter
   - Cons: Breaks tool integration, users must maintain separate config
2. **Always persist** - Keep file on disk
   - Pros: Tool integration works
   - Cons: Unnecessary in CI, potential git noise
3. **CI-aware persistence** (Chosen) - Persist locally, clean up in CI
   - Pros: Best of both worlds
   - Cons: Slightly more complex logic

**Decision:** Default to persisting `tsdoc.json` in local development
(tools can read it), but clean up in CI environments where the file serves
no purpose. CI detection uses `CI` or `GITHUB_ACTIONS` environment variables.

---

## Implementation Details

### Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                     NodeLibraryBuilder                          │
│                        apiModel option                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DtsPlugin                                │
│                                                                 │
│  ┌───────────────────────────┐    ┌─────────────────┐           │
│  │   TsDocConfigBuilder      │    │ bundleDtsFiles  │           │
│  │   .writeConfigFile()      │───▶│ ()              │           │
│  └───────────────────────────┘    └────────┬────────┘           │
│                                            │                    │
└────────────────────────────────────────────┼────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Extractor                                │
│                                                                 │
│  Inputs:                        Outputs:                        │
│  - mainEntryPointFilePath       - bundled .d.ts                 │
│  - tsdocConfigFile              - <package>.api.json            │
│  - tsdocMetadata config         - tsdoc-metadata.json           │
└─────────────────────────────────────────────────────────────────┘
```

### Key Interfaces

**ApiModelOptions** - Main configuration interface:

```typescript
interface ApiModelOptions {
  enabled?: boolean;
  filename?: string;
  localPaths?: string[];
  tsdoc?: TsDocOptions;
  tsdocMetadata?: TsDocMetadataOptions | boolean;
}
```

**TsDocOptions** - TSDoc configuration:

```typescript
import type { PathLike } from "node:fs";

interface TsDocOptions {
  groups?: TsDocTagGroup[];        // Default: all groups
  tagDefinitions?: TsDocTagDefinition[];
  supportForTags?: Record<string, boolean>;  // Only for disabling
  persistConfig?: boolean | PathLike;  // Persist tsdoc.json to disk
  warnings?: "log" | "fail" | "none";  // Default: "fail" in CI, "log" locally
}

type TsDocTagGroup = "core" | "extended" | "discretionary";

interface TsDocTagDefinition {
  tagName: string;
  syntaxKind: "block" | "inline" | "modifier";
  allowMultiple?: boolean;
}
```

### API Extractor Configuration

The plugin generates an `ExtractorConfig` programmatically:

```typescript
ExtractorConfig.prepare({
  configObject: {
    projectFolder: cwd,
    mainEntryPointFilePath: tempDtsPath,
    compiler: { tsconfigFilePath },
    dtsRollup: { enabled: true, untrimmedFilePath },
    docModel: { enabled: true, apiJsonFilePath },
    tsdocMetadata: { enabled: true, tsdocMetadataFilePath },
    bundledPackages,
  },
  tsdocConfigFile: generatedTsdocJsonPath,
  packageJsonFullPath,
});
```

### Output Files

| File | Purpose | npm Publish |
| ---- | ------- | ----------- |
| `index.d.ts` | Bundled declarations | Yes |
| `<package>.api.json` | API model for docs | No (negated) |
| `tsdoc-metadata.json` | TSDoc tag metadata | Yes (required by TSDoc spec) |
| `tsdoc.json` | TSDoc config for tooling | No (negated) |

---

## TSDoc Configuration

### Tag Groups

Standard tags are imported from the official `@microsoft/tsdoc` package and
organized into three standardization groups:

**Core** - Essential TSDoc tags (always needed):

- `@param`, `@returns`, `@remarks`, `@deprecated`, `@typeParam`
- `@link`, `@label`, `@packageDocumentation`, `@privateRemarks`

**Extended** - Additional documentation tags:

- `@example`, `@defaultValue`, `@throws`, `@see`, `@inheritDoc`
- `@virtual`, `@override`, `@sealed`, `@readonly`
- `@eventProperty`, `@decorator`
- `@jsx`, `@jsxFrag`, `@jsxImportSource`, `@jsxRuntime`

**Discretionary** - Release stage indicators:

- `@alpha`, `@beta`, `@experimental`, `@public`, `@internal`

### Usage Examples

**Minimal - just add custom tags:**

```typescript
apiModel: {
  enabled: true,
  tsdoc: {
    tagDefinitions: [
      { tagName: "@error", syntaxKind: "inline" }
    ]
  }
}
```

**Core tags only:**

```typescript
apiModel: {
  enabled: true,
  tsdoc: {
    groups: ["core"],
    tagDefinitions: [{ tagName: "@error", syntaxKind: "inline" }]
  }
}
```

**Disable specific tag:**

```typescript
apiModel: {
  enabled: true,
  tsdoc: {
    supportForTags: { "@beta": false }
  }
}
```

**Suppress TSDoc validation warnings:**

```typescript
apiModel: {
  enabled: true,
  tsdoc: {
    warnings: "none"  // Default: "fail" in CI, "log" locally
  }
}
```

### Generated tsdoc.json

The plugin generates a `tsdoc.json` file with smart `noStandardTags` handling.
Note: `supportForTags` is always populated because API Extractor requires explicit
support declarations for each tag (defining tags isn't sufficient).

**Default (all groups enabled):**

```json
{
  "$schema": "https://developer.microsoft.com/...",
  "noStandardTags": false,
  "supportForTags": { "@param": true, "@returns": true, "..." },
  "reportUnsupportedHtmlElements": false
}
```

**With custom tags (all groups enabled):**

```json
{
  "$schema": "https://developer.microsoft.com/...",
  "noStandardTags": false,
  "tagDefinitions": [{ "tagName": "@error", "syntaxKind": "inline" }],
  "supportForTags": { "@param": true, "...": true, "@error": true },
  "reportUnsupportedHtmlElements": false
}
```

**Subset of groups (explicit tags):**

```json
{
  "$schema": "https://developer.microsoft.com/...",
  "noStandardTags": true,
  "tagDefinitions": [/* tags from enabled groups + custom */],
  "supportForTags": {/* tags from enabled groups, user overrides applied */},
  "reportUnsupportedHtmlElements": false
}
```

### Config Persistence Behavior

The `persistConfig` option controls whether `tsdoc.json` remains on disk:

| Environment | `persistConfig` | Behavior |
| ----------- | --------------- | -------- |
| Local dev | `undefined` | Persist to project root |
| Local dev | `true` | Persist to project root |
| Local dev | `PathLike` | Persist to custom path |
| Local dev | `false` | Clean up after build |
| CI | `undefined` | Clean up after build |
| CI | `true` | Persist (override CI detection) |

**CI Detection:** Environment variables `CI=true` or `GITHUB_ACTIONS=true`.

**Usage examples:**

```typescript
// Default: persist locally, clean up in CI
apiModel: {
  enabled: true,
  tsdoc: { /* tags */ }
}

// Persist to custom path
apiModel: {
  enabled: true,
  tsdoc: {
    persistConfig: "./config/tsdoc.json"
  }
}

// Force persistence even in CI
apiModel: {
  enabled: true,
  tsdoc: {
    persistConfig: true
  }
}

// Never persist (always clean up)
apiModel: {
  enabled: true,
  tsdoc: {
    persistConfig: false
  }
}
```

---

## Testing Strategy

### Unit Tests

**Location:** `src/rslib/plugins/dts-plugin.test.ts`

**What to test:**

1. `TsDocConfigBuilder.build()` method
   - Expands tag groups correctly
   - Adds custom tag definitions
   - Auto-derives supportForTags
   - Applies user overrides

2. `TsDocConfigBuilder.writeConfigFile()` method
   - Generates valid JSON
   - Sets noStandardTags appropriately (smart defaults)
   - Includes all required fields

3. `TsDocConfigBuilder` utility methods
   - `isCI()` - CI environment detection
   - `shouldPersist()` - Persistence logic
   - `getConfigPath()` - Path resolution

4. API model options
   - tsdocMetadata defaults to enabled
   - Files array exclusion patterns

### Integration Tests

Integration with API Extractor is difficult to unit test. Rely on:

- Build self-test (rslib-builder builds itself)
- Manual verification of generated files

---

## Related Documentation

**Internal Design Docs:**

- [Architecture](./architecture.md) - Overall system architecture

**Implementation:**

- Plan: `.claude/plans/tsdoc-configuration-support.md`

**External Resources:**

- [API Extractor](https://api-extractor.com/) - Documentation
- [TSDoc](https://tsdoc.org/) - Tag specification
- [tsdoc.json](https://api-extractor.com/pages/configs/tsdoc_json/) - Config

---

**Document Status:** Current - All features implemented.

**Implementation:**

- TSDoc tag groups: Complete - See `tsdoc-configuration-support.md` plan
- Config persistence: Complete - See `tsdoc-persist-config.md` plan
