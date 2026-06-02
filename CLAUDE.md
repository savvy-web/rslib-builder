# @savvy-web/rslib-builder

RSlib-based build system for modern ESM Node.js libraries. Provides `NodeLibraryBuilder` API and plugin system for TypeScript packages.

## Project Overview

- Bundled ESM builds with rolled-up types
- Multiple build modes (dev and npm) with different optimizations
- Automatic package.json transformation and pnpm catalog resolution
- Multi-registry publishing via `publishConfig.targets` with per-target transforms
- TypeScript declarations via tsgo + API Extractor
- Multi-entry API model generation with per-entry canonical references
- Self-building (uses NodeLibraryBuilder for its own build)

For per-package context, see `package/CLAUDE.md`. Each example workspace also has a brief `examples/*/CLAUDE.md` describing its purpose.

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

For RSPress plugin builder architecture:

--> `@./.claude/design/rslib-builder/rspress-plugin-builder.md`

**Load when:**

- Working with the RSPressPluginBuilder
- Debugging dual-bundle plugin/runtime builds
- Configuring runtime entries, CSS banner injection, or plugin externals

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
├── package/                     # @savvy-web/rslib-builder (publishable)
│   ├── src/
│   │   ├── rslib/               # RSlib build system
│   │   │   ├── builders/        # NodeLibraryBuilder, RSPressPluginBuilder
│   │   │   └── plugins/         # Build plugins + utils
│   │   ├── tsconfig/            # TypeScript config system
│   │   ├── public/              # Static files (tsconfig JSONs)
│   │   └── types/               # TypeScript type definitions
│   ├── __test__/                # E2E test utilities (preserved)
│   ├── rslib.config.ts          # Self-builds using NodeLibraryBuilder
│   ├── package.json
│   └── tsconfig.json
├── examples/
│   ├── libraries/               # NodeLibraryBuilder examples
│   │   ├── single-entry/        # Toy calculator (single export)
│   │   ├── multi-entry/         # Multiple exports
│   │   ├── with-bin/            # CLI bin entry
│   │   ├── options-testing/     # Builder options combos
│   │   └── dual-format-indexes/ # ESM+CJS with exportsAsIndexes (nested types regression)
│   └── rspress-plugin/          # RSPressPluginBuilder example
│       ├── plugin/              # Plugin + runtime components
│       └── site/                # RSPress doc site using the plugin
├── lib/                         # Shared configs
│   ├── configs/                 # lint-staged, commitlint, markdownlint
│   └── scripts/                 # hard-reset.ts
├── docs/                        # Package documentation (guides, architecture)
├── pnpm-workspace.yaml
├── turbo.json                   # Root task graph
├── vitest.config.ts             # Root test orchestration
└── biome.jsonc                  # Shared lint config
```

All plugins and utilities have co-located `.test.ts` files in `package/src/`.

### Key Components

#### NodeLibraryBuilder

The main API for building Node.js libraries. Provides a fluent interface for RSlib builds.

**Location**: `package/src/rslib/builders/node-library-builder.ts`

**Basic Usage**:

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  externals: ['@rslib/core'],
  dtsBundledPackages: ['picocolors'],
});
```

**CJS Interop** (`cjsInterop: true`): When enabled on CJS-format builds, injects a footer snippet so `require('module')` returns the default export directly instead of `{ default: value, __esModule: true }`. Named exports are preserved as properties on the default value. Only affects CJS output; ESM is unchanged.

#### Plugin System

Custom RSlib plugins handle complex build scenarios. The current plugins:

1. **TsDocLintPlugin** — validates TSDoc comments before build via ESLint
2. **AutoEntryPlugin** — extracts entry points from `package.json` exports
3. **PackageJsonTransformPlugin** — transforms `package.json` per build mode
4. **DtsPlugin** — generates TypeScript declarations via tsgo + API Extractor
5. **FilesArrayPlugin** — generates the files array, excludes source maps
6. **VirtualEntryPlugin** — injects non-TypeScript virtual entries
7. **PublishTargetPlugin** — produces per-target output directories for multi-registry publishing

Execution order, hook stages, exposed cross-plugin state, and detailed responsibilities live in `@./.claude/design/rslib-builder/architecture.md`.

### Build Modes

Two build modes (`BuildMode`) with different optimizations:

- **dev**: Unminified, with source maps, for local development
- **npm**: Optimized for npm publishing (Node.js runtime)

Modes selected via `--env-mode`:

```bash
rslib build --env-mode dev
rslib build --env-mode npm
```

**Mode vs Targets:** Mode controls *how* to build (source maps, minification). Targets control *where* to publish. The build always outputs to `dist/<mode>` as a staging area. In npm mode, `PublishTargetPlugin` copies staging output to each target's directory and applies per-target package.json transforms. Dev mode has no targets.

**Key types:** `BuildMode` (dev/npm), `PublishTarget`, `PublishProtocol` (npm/jsr), `resolvePublishTargets()`.
`TransformPackageJsonFn` receives `{ mode, target, pkg }` where `mode` is the `BuildMode` and `target` is the `PublishTarget`. When targets exist, transform is called once per target by `PublishTargetPlugin`. When no targets, transform is called with `target: undefined` by `PackageJsonTransformPlugin`.

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

Tests are co-located with source files in `package/src/`. Use type-safe mocks:

```typescript
import type { MockAssetRegistry } from '../__test__/rslib/types/test-types.js';

const mockAssets: MockAssetRegistry = {
  'index.js': { source: () => 'export {}' }
};
```

**Never use `as any`**. Always create proper mock types.

### Integration Validation via Examples

The `examples/` workspaces serve as integration validation. They are built via turbo as part of the normal `pnpm build` pipeline, replacing the old synthetic E2E test infrastructure. Each example depends on `@savvy-web/rslib-builder` via `workspace:*` and uses turbo `dependsOn: ["^build"]` to ensure correct build ordering.

## Development

Key commands:

```bash
pnpm build              # Build all modes (via turbo)
pnpm test               # Run tests (verbose)
pnpm lint:fix           # Auto-fix lint issues
pnpm typecheck          # Type-check all workspaces
pnpm reset              # Clean all build artifacts
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full development workflow and troubleshooting.

## External Documentation

- [RSlib Documentation](https://rslib.dev/)
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core)
- [API Extractor](https://api-extractor.com/)
- [PNPM Catalog Protocol](https://pnpm.io/catalogs)
