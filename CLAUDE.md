# @savvy-web/rslib-builder

RSlib-based build system for modern ESM Node.js libraries. Provides `NodeLibraryBuilder`
API and plugin system for TypeScript packages.

## Package Overview

- Bundled ESM builds with rolled-up types
- Multiple targets (dev and npm) with different optimizations
- Automatic package.json transformation and pnpm catalog resolution
- TypeScript declarations via tsgo + API Extractor
- Multi-entry API model generation with per-entry canonical references
- Self-building (uses NodeLibraryBuilder for its own build)

## Design Documentation

For detailed architecture understanding, load the design doc:

--> `@./.claude/design/rslib-builder/architecture.md`

**Load when:**

- Adding new plugins to the build system
- Modifying plugin execution order or stages
- Debugging cross-plugin data flow issues
- Extending the builder API with new options

For API model generation and TSDoc configuration:

--> `@./.claude/design/rslib-builder/api-extraction.md`

**Load when:**

- Modifying API model generation in DtsPlugin
- Adding custom TSDoc tags for documentation
- Debugging API Extractor output issues
- Working with tsdoc.json or forgottenExports configuration

For API model options and multi-entry configuration:

--> `@./.claude/design/rslib-builder/api-model-options.md`

**Load when:**

- Configuring apiModel, tsdocMetadata, or localPaths options
- Working with multi-entry API model merge behavior
- Debugging API model output filenames or paths

For virtual entry system:

--> `@./.claude/design/rslib-builder/virtual-entries.md`

**Load when:**

- Working with the VirtualEntryPlugin or bundleless mode
- Adding virtual entries to a build configuration
- Debugging entry point resolution for non-TypeScript exports

For testing strategy details:

--> `@./.claude/design/rslib-builder/testing-strategy.md`

**Load when:**

- Writing new tests for plugins or utilities
- Creating mock types for Rsbuild/Rspack APIs
- Debugging coverage gaps or test failures

## Architecture

### Directory Structure

```text
rslib-builder/
├── src/
│   ├── rslib/                    # RSlib build system
│   │   ├── index.ts             # Main exports
│   │   ├── builders/            # High-level builder classes
│   │   │   ├── node-library-builder.ts
│   │   │   └── node-library-builder.test.ts
│   │   └── plugins/             # RSlib/Rsbuild plugins
│   │       ├── auto-entry-plugin.ts
│   │       ├── dts-plugin.ts
│   │       ├── files-array-plugin.ts
│   │       ├── package-json-transform-plugin.ts
│   │       ├── tsdoc-lint-plugin.ts
│   │       ├── virtual-entry-plugin.ts
│   │       └── utils/           # Plugin utilities (with co-located tests)
│   ├── tsconfig/                # TypeScript config templates
│   ├── public/                  # Static files (tsconfig JSONs)
│   ├── __test__/rslib/types/    # Shared test type definitions
│   └── types/                   # TypeScript type definitions
├── test/e2e/                    # E2E tests
├── rslib.config.ts              # Self-builds using NodeLibraryBuilder
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

All plugins and utilities have co-located `.test.ts` files.

### Key Components

#### NodeLibraryBuilder

The main API for building Node.js libraries. Provides a fluent interface for
RSlib builds.

**Location**: `src/rslib/builders/node-library-builder.ts`

**Basic Usage**:

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  externals: ['@rslib/core'],
  dtsBundledPackages: ['picocolors'],
});
```

#### Plugin System

Custom RSlib plugins handle complex build scenarios:

1. **TsDocLintPlugin** - Validates TSDoc comments before build using ESLint
   - Enabled by default when apiModel is enabled (configured via `apiModel.tsdoc.lint`)
2. **AutoEntryPlugin** - Automatically extracts entry points from package.json exports
3. **PackageJsonTransformPlugin** - Transforms package.json for different targets
4. **DtsPlugin** - Generates TypeScript declarations using tsgo and API Extractor
   - Runs API Extractor per entry, merges into single `.api.json` with multiple EntryPoints
   - When `apiModel` is enabled, also emits resolved `tsconfig.json` for virtual TS environments
5. **FilesArrayPlugin** - Generates files array, excludes source maps
6. **VirtualEntryPlugin** - Injects non-TypeScript virtual entries (JSON, static files)

### Build Targets

Two build targets with different optimizations:

- **dev**: Unminified, with source maps, for local development
- **npm**: Optimized for npm publishing (Node.js runtime)

Targets selected via `--env-mode`:

```bash
rslib build --env-mode dev
rslib build --env-mode npm
```

### Build Output

This module produces bundled ESM output with rolled-up types:

- Single-file outputs per export entry point
- TypeScript declarations bundled via API Extractor
- Optimized for npm publishing and fast runtime loading

**Note:** `apiModel` is enabled by default. When enabled, DtsPlugin also emits:

- `<package>.api.json` - API model for documentation tooling (excluded from npm)
- `tsdoc-metadata.json` - TSDoc metadata for downstream tools (published)
- `tsconfig.json` - Resolved/flattened tsconfig for virtual TS environments (excluded from npm)

## Testing

Tests are co-located with source files. Use type-safe mocks:

```typescript
import type { MockAssetRegistry } from '../__test__/rslib/types/test-types.js';

const mockAssets: MockAssetRegistry = {
  'index.js': { source: () => 'export {}' }
};
```

**Never use `as any`**. Always create proper mock types.

### E2E Tests

E2E tests verify builder options by building isolated fixture copies with
dynamically generated configs:

- `test/e2e/dts-bundling.test.ts` - DTS bundling for single/multi-entry fixtures
- `test/e2e/builder-options/api-model.test.ts` - API model generation options
- `test/e2e/builder-options/build-options.test.ts` - General build options (externals, transform)
- `test/e2e/builder-options/format-option.test.ts` - Output format configuration
- `test/e2e/builder-options/tsdoc-lint.test.ts` - TSDoc lint configuration
- `test/e2e/builder-options/virtual-entries.test.ts` - Virtual entry injection

## Plugin Execution Order

Plugins execute in this order during the build:

**Pre-Build Hooks:**

- TsDocLintPlugin (`onBeforeBuild` - validates TSDoc before compilation)

**Build Hooks:**

1. AutoEntryPlugin (entry detection - `modifyRsbuildConfig`)
2. PackageJsonTransformPlugin (package.json processing)
3. FilesArrayPlugin (files array - `additional` stage)
4. DtsPlugin (type declarations - `pre-process` stage)
5. User plugins (if provided)

VirtualEntryPlugin runs in a separate Rslib environment for non-TypeScript entries.

## Development

Key commands:

```bash
pnpm build              # Build all targets
pnpm test               # Run tests (verbose)
pnpm lint:fix           # Auto-fix lint issues
pnpm typecheck          # Type-check all workspaces
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full development workflow and
troubleshooting.

## External Documentation

- [RSlib Documentation](https://rslib.dev/)
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core)
- [API Extractor](https://api-extractor.com/)
- [PNPM Catalog Protocol](https://pnpm.io/catalogs)
