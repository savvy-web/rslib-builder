# @savvy-web/rslib-builder - AI Agent Documentation

This document provides guidance for AI agents working on the `@savvy-web/rslib-builder` package.

## Package Overview

`@savvy-web/rslib-builder` is an RSlib-based build system for Node.js libraries. It provides a high-level builder API and plugin system that simplifies building TypeScript packages with support for:

- **Bundled and bundleless builds** - Single-file outputs or per-file compilation
- **Multiple targets** - dev, npm, and jsr with different optimizations
- **Automatic package.json transformation** - Export path updates, catalog resolution
- **TypeScript declaration bundling** - Fast declaration generation with tsgo and API Extractor
- **Source map handling** - Generates but excludes from npm publishing
- **Self-building** - This package builds itself using NodeLibraryBuilder

## Architecture

### Directory Structure

```
node-build/
├── src/
│   ├── rslib/                    # RSlib build system
│   │   ├── index.ts             # Main exports
│   │   ├── builders/            # High-level builder classes
│   │   │   └── node-library-builder.ts
│   │   └── plugins/             # RSlib/Rsbuild plugins
│   │       ├── auto-entry-plugin.ts
│   │       ├── bundleless-plugin.ts
│   │       ├── dts-plugin.ts
│   │       ├── files-array-plugin.ts
│   │       ├── jsr-bundleless-plugin.ts
│   │       ├── package-json-transform-plugin.ts
│   │       ├── api-report-plugin.ts
│   │       └── utils/           # Plugin utilities
│   ├── tsconfig/                # TypeScript config templates
│   ├── public/                  # Static files (tsconfig JSONs)
│   ├── __test__/                # Test files
│   │   └── rslib/
│   │       ├── types/           # Shared test types
│   │       ├── builders/        # Builder tests
│   │       ├── plugins/         # Plugin tests
│   │       └── utils/           # Utility tests
│   └── types/                   # TypeScript type definitions
├── rslib.config.ts              # Self-builds using NodeLibraryBuilder
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Key Components

#### NodeLibraryBuilder

The main API for building Node.js libraries. Provides a fluent interface for RSlib builds.

**Location**: `src/rslib/builders/node-library-builder.ts`

**Basic Usage**:

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  bundle: true,
  tsconfigPath: './tsconfig.build.json',
  externals: ['@rslib/core'],
  dtsBundledPackages: ['picocolors'],
  transform({ pkg, target }) {
    if (target === 'npm') {
      delete pkg.devDependencies;
    }
    return pkg;
  },
});
```

#### Plugin System

Custom RSlib plugins handle complex build scenarios:

1. **AutoEntryPlugin** - Automatically extracts entry points from package.json exports
2. **BundlelessPlugin** - Compiles each source file separately
3. **PackageJsonTransformPlugin** - Transforms package.json for different targets
4. **DtsPlugin** - Generates TypeScript declarations using tsgo and API Extractor
5. **FilesArrayPlugin** - Generates files array, excludes source maps
6. **JSRBundlelessPlugin** - Special handling for JSR builds
7. **APIReportPlugin** - Generates API reports using Microsoft API Extractor

### Build Targets

Three build targets with different optimizations:

- **dev**: Unminified, with source maps, for local development
- **npm**: Optimized for npm publishing (Node.js runtime)
- **jsr**: Optimized for JSR publishing (Deno/TypeScript-first)

Targets selected via `--env-mode`:

```bash
rslib build --env-mode dev
rslib build --env-mode npm
rslib build --env-mode jsr
```

### Bundle vs Bundleless

**Bundled mode** (`bundle: true`):
- Single-file outputs per export
- Faster runtime loading
- Better for CLI tools

**Bundleless mode** (`bundle: false`):
- Preserves source file structure
- Better tree-shaking
- Better for config packages

## Testing

### Test Organization

Tests use Vitest with type-safe mocks:

```typescript
// Use shared test types
import type { MockAsset } from '../__test__/rslib/types/test-types.js';

// Create type-safe mocks
const mockAssets: MockAssetRegistry = {
  'index.js': { source: () => 'export {}' }
};
```

**Never use `as any`**. Always create proper mock types.

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

## Common Patterns

### Source Map Publishing

Source maps (`.map` files) are generated but **NOT published to npm**:

- DtsPlugin generates `.d.ts.map` but only adds `.d.ts` to filesArray
- FilesArrayPlugin filters out all `.map` files
- Reduces package size, prevents exposing internals

### TypeScript Declaration Bundling

When using `dtsBundledPackages`:

- Supports minimatch patterns (e.g., `'@pnpm/**'`)
- Only applies when `bundle: true`
- Inlines type definitions to avoid external type imports

```typescript
NodeLibraryBuilder.create({
  bundle: true,
  dtsBundledPackages: ['@pnpm/types', 'picocolors'],
});
```

### External Dependencies

Use `externals` for dependencies that shouldn't be bundled:

```typescript
NodeLibraryBuilder.create({
  bundle: true,
  externals: ['@rslib/core', '@rsbuild/core'],
});
```

### Plugin Execution Order

Plugins run in this order:

1. AutoEntryPlugin (entry detection)
2. BundlelessPlugin (if bundleless mode)
3. DtsPlugin (type declarations - `pre-process` stage)
4. PackageJsonTransformPlugin (package.json processing)
5. FilesArrayPlugin (files array - `additional` stage)
6. User plugins (if provided)

## Development

### Building

```bash
# Development build
pnpm build:dev

# NPM build
pnpm build:npm

# JSR build
pnpm build:jsr

# Inspect config
pnpm build:inspect
```

### Linting

```bash
# Check only
pnpm lint

# Auto-fix
pnpm lint:fix

# Unsafe fixes
pnpm lint:fix:unsafe
```

### Type Checking

```bash
pnpm typecheck
```

## External Documentation

- [RSlib Documentation](https://rslib.dev/)
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core)
- [Rspack](https://rspack.dev/)
- [PNPM Workspace](https://pnpm.io/workspaces)
- [PNPM Catalog Protocol](https://pnpm.io/catalogs)

## Troubleshooting

### Build Failures

**Problem**: Build fails with "Cannot find module"

**Solution**: Check imports use `.js` extension

**Problem**: Types not resolving

**Solution**: Verify `dtsBundledPackages` includes necessary packages

### Test Failures

**Problem**: Mock types not matching

**Solution**: Import types using `import type`, create minimal mocks

### Plugin Issues

**Problem**: Plugin not running

**Solution**: Verify plugin added to correct target

**Problem**: Assets not processed

**Solution**: Check `processAssets` stage ordering

## Contributing

When adding features:

1. Maintain 90%+ test coverage
2. No `any` types, use proper interfaces
3. Update this CLAUDE.md
4. Add usage examples
5. Link to external docs
