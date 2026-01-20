---
status: current
module: rslib-builder
category: testing
created: 2026-01-18
updated: 2026-01-20
last-synced: 2026-01-18
completeness: 85
related:
  - rslib-builder/architecture.md
dependencies: []
---

# RSlib Builder - Testing Strategy

Comprehensive testing approach for @savvy-web/rslib-builder using Vitest with
v8 coverage, co-located test files, and type-safe mocking patterns.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Co-Located Test Structure](#co-located-test-structure)
5. [Vitest Configuration](#vitest-configuration)
6. [Type-Safe Mocking Patterns](#type-safe-mocking-patterns)
7. [Plugin Testing Approach](#plugin-testing-approach)
8. [Coverage Strategy](#coverage-strategy)
9. [Shared Test Utilities](#shared-test-utilities)
10. [Best Practices](#best-practices)

---

## Overview

The testing strategy for `@savvy-web/rslib-builder` prioritizes:

- **Co-location**: Test files live next to source files for discoverability
- **Type safety**: No `any` types; all mocks use proper interfaces
- **High coverage**: 85% per-file thresholds for statements, branches,
  functions, and lines
- **Isolation**: Unit tests mock external dependencies; integration tests use
  real APIs
- **Fast feedback**: Vitest provides instant re-runs in watch mode

**When to reference this document:**

- When writing new tests for plugins or utilities
- When creating mock types for Rsbuild/Rspack APIs
- When debugging coverage gaps or test failures
- When adding v8 ignore comments for untestable code

---

## Current State

### Test Organization

Tests follow a co-located structure where test files sit alongside their
source files:

```text
src/
├── rslib/
│   ├── builders/
│   │   ├── node-library-builder.ts
│   │   └── node-library-builder.test.ts
│   └── plugins/
│       ├── auto-entry-plugin.ts
│       ├── auto-entry-plugin.test.ts
│       ├── dts-plugin.ts
│       ├── dts-plugin.test.ts
│       ├── files-array-plugin.ts
│       ├── files-array-plugin.test.ts
│       ├── package-json-transform-plugin.ts
│       ├── package-json-transform-plugin.test.ts
│       └── utils/
│           ├── pnpm-catalog.ts
│           ├── pnpm-catalog.test.ts
│           ├── asset-utils.ts
│           ├── json-asset-utils.test.ts
│           ├── asset-processor-utils.test.ts
│           ├── entry-extractor.ts
│           ├── entry-extractor.test.ts
│           └── ...
├── exports.test.ts
└── __test__/rslib/
    ├── types/test-types.ts
    └── utils/test-types.ts
```

### Test Files

Current test file inventory:

| Category | File | Description |
| :------- | :--- | :---------- |
| Plugins | `auto-entry-plugin.test.ts` | Entry detection from package.json |
| Plugins | `dts-plugin.test.ts` | TypeScript declaration generation |
| Plugins | `files-array-plugin.test.ts` | Package.json files array building |
| Plugins | `package-json-transform-plugin.test.ts` | Package transformation |
| Builders | `node-library-builder.test.ts` | Builder API and configuration |
| Utils | `pnpm-catalog.test.ts` | PNPM catalog resolution |
| Utils | `json-asset-utils.test.ts` | JSON asset handling |
| Utils | `asset-processor-utils.test.ts` | Asset processing pipeline |
| Utils | `entry-extractor.test.ts` | Entry point extraction |
| Exports | `exports.test.ts` | Module export verification |

### Test Utility Location

Located in `src/__test__/rslib/`:

- **`types/test-types.ts`**: Mock type definitions
- **`utils/test-types.ts`**: Utility functions for creating mocks

---

## Rationale

### Why Co-Located Tests?

**Decision:** Place test files next to source files rather than in a separate
`__tests__` directory.

**Benefits:**

- Easier to find tests for a given source file
- Encourages writing tests alongside code
- Simplifies imports (relative paths are shorter)
- IDE navigation between source and test is faster

**Trade-offs:**

- Source directories contain more files
- Need to exclude `*.test.ts` from build outputs

### Why Vitest with v8 Coverage?

**Decision:** Use Vitest with v8 provider instead of Istanbul/c8.

**Benefits:**

- Native V8 coverage is faster than instrumentation-based approaches
- Better accuracy for modern JavaScript/TypeScript
- Seamless integration with Vitest
- Per-file thresholds catch coverage regressions early

**Trade-offs:**

- v8 coverage can be less accurate for some edge cases
- Requires Node.js with V8 coverage support

### Why 85% Coverage Thresholds?

**Decision:** Set per-file thresholds at 85% for all metrics.

**Benefits:**

- Catches coverage drops in individual files
- Prevents "averaging out" coverage across codebase
- Encourages comprehensive testing of new code
- Still allows reasonable exceptions for untestable code

**Trade-offs:**

- May need v8 ignore comments for integration-heavy code
- New files require immediate test coverage

---

## Co-Located Test Structure

### File Naming Convention

Test files use the `.test.ts` suffix:

```text
source-file.ts       -> source-file.test.ts
my-plugin.ts         -> my-plugin.test.ts
utils/helper.ts      -> utils/helper.test.ts
```

### Import Patterns

Co-located tests import the source file directly:

```typescript
// src/rslib/plugins/auto-entry-plugin.test.ts
import { AutoEntryPlugin } from './auto-entry-plugin.js';

// src/rslib/plugins/utils/pnpm-catalog.test.ts
import { PnpmCatalog } from '#utils/pnpm-catalog.js';
```

### Shared Utilities Import

Shared test utilities use relative paths from the test location:

```typescript
// From src/rslib/plugins/utils/*.test.ts
import { createMockStats } from '../../../__test__/rslib/utils/test-types.js';

// From src/rslib/plugins/*.test.ts
import { createMockStats } from '../../__test__/rslib/types/test-types.js';
```

---

## Vitest Configuration

### Configuration File

`vitest.config.ts`:

```typescript
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/__test__/**",
        "**/types/**",
        "**/*.d.ts",
        "**/tsconfig/**"
      ],
      thresholds: {
        perFile: true,
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
  resolve: {
    alias: {
      "#utils": fileURLToPath(
        new URL("./src/rslib/plugins/utils", import.meta.url)
      ),
      "#types": fileURLToPath(new URL("./src/types", import.meta.url)),
    },
    extensions: [".ts", ".js", ".json"],
  },
});
```

### Key Configuration Options

| Option | Value | Purpose |
| :----- | :---- | :------ |
| `globals: true` | true | Enables `describe`, `it`, `expect` without imports |
| `environment: "node"` | node | Node.js test environment |
| `include` | `src/**/*.test.ts` | Find co-located test files |
| `coverage.provider` | `v8` | Native V8 coverage (faster) |
| `coverage.perFile` | true | Per-file threshold enforcement |
| `thresholds.*` | 85 | Minimum coverage per file |

### Coverage Exclusions

The following are excluded from coverage:

- `**/*.test.ts` - Test files themselves
- `**/__test__/**` - Shared test utilities
- `**/types/**` - Type definition files
- `**/*.d.ts` - Declaration files
- `**/tsconfig/**` - TSConfig template files

---

## Type-Safe Mocking Patterns

### Core Principle

**Never use `any`** - always create proper mock types.

### Mock Type Definitions

Located in `src/__test__/rslib/types/test-types.ts`:

```typescript
/**
 * Type for mock asset objects used in tests
 */
export interface MockAsset {
  source: () => string;
}

/**
 * Type for mock asset registry used in tests
 */
export type MockAssetRegistry = Record<string, MockAsset>;

/**
 * Type for mock source objects used in webpack/rspack compilation
 */
export interface MockSource {
  source: () => string;
}

/**
 * Creates a mock Stats object for fs operations
 */
export function createMockStats(mtime: Date): import("node:fs").Stats {
  return {
    mtime,
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as import("node:fs").Stats;
}
```

### Mock Utility Functions

Located in `src/__test__/rslib/utils/test-types.ts`:

```typescript
import type { Stats } from "node:fs";
import type { ProcessAssetsHandler } from "@rsbuild/core";
import { vi } from "vitest";

export const createMockStats = (
  mtime: Date,
  isFile: boolean = false
): Stats => ({
  mtime,
  isFile: (): boolean => isFile,
  isDirectory: (): boolean => false,
  isBlockDevice: (): boolean => false,
  isCharacterDevice: (): boolean => false,
  isSymbolicLink: (): boolean => false,
  isFIFO: (): boolean => false,
  isSocket: (): boolean => false,
  dev: 1,
  ino: 1,
  mode: 1,
  nlink: 1,
  uid: 1,
  gid: 1,
  rdev: 1,
  size: 1,
  blksize: 1,
  blocks: 1,
  atimeMs: mtime.getTime(),
  mtimeMs: mtime.getTime(),
  ctimeMs: mtime.getTime(),
  birthtimeMs: mtime.getTime(),
  atime: mtime,
  ctime: mtime,
  birthtime: mtime,
});

export type ProcessAssetsContext = Parameters<ProcessAssetsHandler>[0];

export function createMockProcessAssetsContext(
  mockOriginalSource: ReturnType<typeof vi.fn> = vi.fn(),
  mockEmitAsset: ReturnType<typeof vi.fn> = vi.fn(),
): ProcessAssetsContext {
  return {
    assets: {},
    compiler: {} as unknown as ProcessAssetsContext["compiler"],
    compilation: {
      emitAsset: mockEmitAsset
    } as unknown as ProcessAssetsContext["compilation"],
    environment: {} as unknown as ProcessAssetsContext["environment"],
    sources: {
      OriginalSource: mockOriginalSource
    } as unknown as ProcessAssetsContext["sources"],
  };
}
```

### Mocking External Dependencies

Use `vi.mock()` at the top of test files before importing the module:

```typescript
// Mock external dependencies BEFORE importing the module
vi.mock("workspace-tools");
vi.mock("node:fs/promises", () => ({
  stat: vi.fn().mockRejectedValue(new Error("ENOENT")),
  readFile: vi.fn(),
}));
vi.mock("@pnpm/exportable-manifest", () => ({
  createExportableManifest: vi.fn(),
}));

// NOW import the module under test
import { PnpmCatalog } from "#utils/pnpm-catalog.js";
```

### Type-Safe Mock Access

Use `vi.mocked()` for type-safe access to mocked functions:

```typescript
import { readFile, stat } from "node:fs/promises";

const mockReadFile = vi.mocked(readFile);
const mockStat = vi.mocked(stat);

// Now mockReadFile and mockStat have proper types
mockStat.mockResolvedValue(createMockStats(new Date()));
mockReadFile.mockResolvedValue('{"name": "test"}');
```

---

## Plugin Testing Approach

### Mock Rsbuild API

Plugins receive an `api` object in their `setup()` function. Create type-safe
mocks:

```typescript
const plugin = AutoEntryPlugin();
const mockApi = {
  modifyRsbuildConfig: vi.fn(),
  expose: vi.fn(),
  useExposed: vi.fn().mockReturnValue(undefined),
  onBeforeBuild: vi.fn(),
  logger: {
    debug: vi.fn(),
  },
};

// Use type assertion to match the expected parameter type
plugin.setup(
  mockApi as unknown as Parameters<typeof plugin.setup>[0]
);
```

### Testing Configuration Modification

```typescript
// Get the config modifier registered by the plugin
const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];

// Create a test config
const config = {
  environments: {
    development: { source: {} },
    production: { source: {} },
  },
};

// Trigger the modifier
await configModifier(config);

// Verify the config was modified correctly
expect(config.environments.development.source).toHaveProperty("entry");
```

### Testing Shared State

Plugins share state via `api.expose()` and `api.useExposed()`:

```typescript
// Verify expose was called with expected key and value type
expect(mockApi.expose).toHaveBeenCalledWith("entrypoints", expect.any(Map));

// Get the exposed value for further assertions
const entrypointsMap = mockApi.expose.mock.calls[0][1] as Map<string, string>;
expect(entrypointsMap.has("index.ts")).toBe(true);
```

### Testing ProcessAssets Handlers

Use `createMockProcessAssetsContext()` for asset processing tests:

```typescript
import {
  createMockProcessAssetsContext,
  createMockStats
} from "../../../__test__/rslib/utils/test-types.js";

const mockOriginalSource = vi.fn();
const mockEmitAsset = vi.fn();
const context = createMockProcessAssetsContext(
  mockOriginalSource,
  mockEmitAsset
);

await processor(context);

expect(mockEmitAsset).toHaveBeenCalledWith("package.json", expect.anything());
```

---

## Coverage Strategy

### Per-File Thresholds

Each source file must meet 85% coverage for:

- **Statements**: Executable statements covered
- **Branches**: Conditional branches covered
- **Functions**: Functions called at least once
- **Lines**: Source lines executed

### v8 Ignore Comments

For integration-heavy code that cannot be unit tested, use v8 ignore comments:

```typescript
/* v8 ignore start */
function integrationHeavyCode() {
  // This code requires real filesystem, network, or external processes
  // and cannot be reasonably mocked for unit tests
}
/* v8 ignore stop */
```

**When to use v8 ignore:**

- Process spawning (tsgo, api-extractor)
- Complex filesystem operations that require real files
- Code paths only reachable in production builds
- Error handling for truly exceptional conditions

**When NOT to use v8 ignore:**

- Code that can be tested with mocks
- Business logic
- Configuration parsing
- Data transformations

### Coverage Reports

Generated reports:

| Reporter | Location | Purpose |
| :------- | :------- | :------ |
| `text` | Console | Quick feedback during development |
| `text-summary` | Console | Overview of coverage metrics |
| `html` | `coverage/` | Detailed browsable report |
| `lcov` | `coverage/` | CI/CD integration |

---

## Shared Test Utilities

### types/test-types.ts

Provides mock type definitions:

- `MockAsset` - Interface for mock compilation assets
- `MockAssetRegistry` - Record type for asset collections
- `MockSource` - Interface for webpack/rspack source objects
- `createMockStats()` - Factory for mock `fs.Stats` objects

### utils/test-types.ts

Provides utility functions:

- `createMockStats()` - Extended mock Stats with all properties
- `createMockProcessAssetsContext()` - Mock for processAssets handlers
- `ProcessAssetsContext` - Type alias for handler parameter

### Usage Example

```typescript
import type { MockAssetRegistry } from "../../../__test__/rslib/types/test-types.js";
import {
  createMockStats,
  createMockProcessAssetsContext
} from "../../../__test__/rslib/utils/test-types.js";

describe("MyPlugin", () => {
  it("should process assets", async () => {
    const mockAssets: MockAssetRegistry = {
      "index.js": { source: () => "export {}" }
    };

    const stats = createMockStats(new Date());
    const context = createMockProcessAssetsContext();

    // Test implementation...
  });
});
```

---

## Best Practices

### Test File Structure

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

// 1. Mock dependencies FIRST (before any imports that use them)
vi.mock("node:fs/promises");
vi.mock("external-dependency");

// 2. Import test utilities
import { createMockStats } from "../__test__/rslib/types/test-types.js";

// 3. Import mocked dependencies for type-safe access
import { readFile, stat } from "node:fs/promises";
const mockReadFile = vi.mocked(readFile);
const mockStat = vi.mocked(stat);

// 4. Import module under test LAST
import { MyModule } from "./my-module.js";

describe("MyModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Tests...
});
```

### Organizing Test Cases

- Group related tests with `describe()` blocks
- Use clear, descriptive test names
- Test both success and error paths
- Test edge cases explicitly

### Mock Management

- Clear mocks in `beforeEach()` with `vi.clearAllMocks()`
- Restore mocks in `afterEach()` if modifying global state
- Use `vi.mocked()` for type-safe mock access
- Prefer function mocks over object spreads for extensibility

### Assertions

- Use specific matchers (`toEqual`, `toHaveBeenCalledWith`)
- Avoid `toBeTruthy`/`toBeFalsy` when more specific matchers exist
- Assert on mock call arguments when verifying behavior
- Use `expect.any(Type)` for flexible type matching

### Error Testing

```typescript
// Test async error throwing
await expect(myAsyncFn()).rejects.toThrow("Expected error message");

// Test sync error throwing
expect(() => mySyncFn()).toThrow("Expected error message");
```

---

## Related Documentation

- [architecture.md](./architecture.md) - System architecture overview
- [Vitest Documentation](https://vitest.dev/) - Test framework reference
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core) - Plugin testing
  patterns

---

**Document Status:** Current - Comprehensive testing strategy documented

**Next Steps:** Document integration testing patterns, add CI/CD test
configuration guidance
