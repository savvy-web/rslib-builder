# @savvy-web/rslib-builder

RSlib-based build system for Node.js libraries with automatic package.json
transformation, TypeScript declaration bundling, and multi-target support.

## Features

- **🎯 Multiple Build Targets** - dev, npm, and jsr with different optimizations
- **📦 Bundle Modes** - Bundled (single file) or bundleless (per-file) compilation
- **🔄 Auto Package.json Transform** - Export paths, PNPM catalog
  resolution, files array
- **📘 TypeScript Declaration Bundling** - Fast generation with tsgo and API Extractor
- **🗺️ Source Map Handling** - Generates for debugging but excludes from npm publishing
- **🔌 Plugin System** - Extensible with custom RSlib/Rsbuild plugins
- **⚡ Self-Building** - Uses its own builder to build itself

## Installation

```bash
pnpm add -D @savvy-web/rslib-builder @rslib/core
```

## Quick Start

Create an `rslib.config.ts` in your project root:

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  bundle: true,
  externals: ['@rslib/core'],
  transform({ pkg, target }) {
    if (target === 'npm') {
      delete pkg.devDependencies;
    }
    return pkg;
  },
});
```

Add scripts to your `package.json`:

```json
{
  "scripts": {
    "build": "rslib build --env-mode dev",
    "build:npm": "rslib build --env-mode npm"
  }
}
```

## Configuration

### NodeLibraryBuilder Options

```typescript
interface BuilderOptions {
  // Bundle mode: true = single file, false = per-file compilation
  bundle?: boolean;

  // Path to tsconfig.json for compilation
  tsconfigPath?: string;

  // Dependencies to exclude from bundling
  externals?: (string | RegExp)[];

  // Packages whose types should be inlined in declarations
  dtsBundledPackages?: string[];

  // Transform package.json per target
  transform?: (context: TransformContext) => PackageJson;

  // Export entries as index files (e.g., ./foo/index.js instead of ./foo.js)
  exportsAsIndexes?: boolean;

  // Generate API reports with Microsoft API Extractor
  apiReports?: boolean;

  // Copy static files to dist
  copyPatterns?: CopyPattern[];
}
```

### Build Targets

Three build targets available via `--env-mode`:

- **dev** - Unminified with source maps for local development
- **npm** - Optimized for npm publishing (Node.js runtime)
- **jsr** - Optimized for JSR publishing (Deno/TypeScript-first)

```bash
rslib build --env-mode dev
rslib build --env-mode npm
rslib build --env-mode jsr
```

## Advanced Usage

### Bundled vs Bundleless

**Bundled mode** - Single-file outputs:

```typescript
NodeLibraryBuilder.create({
  bundle: true,
  externals: ['@rslib/core'],
});
```

**Bundleless mode** - Per-file compilation:

```typescript
NodeLibraryBuilder.create({
  bundle: false,
});
```

### TypeScript Declaration Bundling

Inline type definitions from dependencies:

```typescript
NodeLibraryBuilder.create({
  bundle: true,
  dtsBundledPackages: [
    'picocolors',      // Exact package name
    '@pnpm/**',        // Minimatch pattern
    '@types/*',        // All @types packages
  ],
});
```

### Package.json Transformation

Customize package.json per target:

```typescript
NodeLibraryBuilder.create({
  transform({ pkg, target }) {
    // Remove dev dependencies for npm
    if (target === 'npm') {
      delete pkg.devDependencies;
      delete pkg.scripts;
    }

    // Add JSR-specific config
    if (target === 'jsr') {
      pkg.type = 'module';
    }

    return pkg;
  },
});
```

### Copy Static Files

Copy non-compiled files to dist:

```typescript
NodeLibraryBuilder.create({
  copyPatterns: [
    {
      from: 'config/**/*.json',
      context: `${process.cwd()}/src`,
    },
  ],
});
```

## Plugins

The builder includes several built-in plugins:

1. **AutoEntryPlugin** - Auto-extracts entry points from package.json exports
2. **BundlelessPlugin** - Enables per-file compilation mode
3. **PackageJsonTransformPlugin** - Transforms package.json for targets
4. **DtsPlugin** - Generates TypeScript declarations with tsgo/API Extractor
5. **FilesArrayPlugin** - Generates files array, excludes source maps
6. **JSRBundlelessPlugin** - Special handling for JSR builds
7. **APIReportPlugin** - Generates API documentation reports

## TypeScript Config Templates

The package exports TypeScript config templates for different use cases:

```typescript
// In your tsconfig.json
{
  "extends": "@savvy-web/rslib-builder/tsconfig/node/ecma/lib.json",
  "compilerOptions": {
    "outDir": "dist"
  }
}
```

Available templates:

- `tsconfig/root.json` - Base configuration
- `tsconfig/node/ecma/lib.json` - Node.js library (bundleless)
- `tsconfig/node/ecma/bundle.json` - Node.js library (bundled)
- `tsconfig/node/ecma/bundleless.json` - Node.js library (explicit bundleless)
- `tsconfig/node/ecma/lib-compat.json` - Node.js with broader compatibility

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## How It Works

### Source Map Handling

Source maps are generated during build but **NOT published to npm**:

- `.d.ts.map` files are generated but excluded from files array
- `.js.map` files are generated but excluded from files array
- Reduces package size and protects internal implementation details

### Plugin Execution Order

1. AutoEntryPlugin - Extracts entries from package.json
2. BundlelessPlugin - Configures per-file compilation (if enabled)
3. DtsPlugin - Generates TypeScript declarations (`pre-process` stage)
4. PackageJsonTransformPlugin - Transforms package.json
5. FilesArrayPlugin - Generates files array (`additional` stage)
6. User plugins - Custom plugins (if provided)

### Automatic Package.json Transformation

The builder automatically:

1. Resolves PNPM `catalog:` protocol to actual versions
2. Updates export paths from source (`./src/...`) to built (`./...`)
3. Ensures bin files have proper shebang and permissions
4. Generates files array with all published assets (excluding `.map` files)

## Examples

See the repository's own `rslib.config.ts` for a real-world example of the
builder building itself.

## License

MIT

## Contributing

Contributions welcome! Please read the [CLAUDE.md](./CLAUDE.md) for
development guidelines.

## Links

- [RSlib Documentation](https://rslib.dev/)
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core)
- [PNPM Workspace](https://pnpm.io/workspaces)
