# @savvy-web/rslib-builder

RSlib-based build system for Node.js libraries with automatic package.json
transformation, TypeScript declaration bundling, and multi-target support.

## Features

- **Multiple Build Targets** - dev and npm with different optimizations
- **Bundled ESM Output** - Single-file outputs with rolled-up types
- **Auto Package.json Transform** - Export paths, PNPM catalog resolution,
  files array generation
- **TypeScript Declaration Bundling** - Fast generation with tsgo and
  API Extractor
- **Source Map Handling** - Generates for debugging but excludes from
  npm publishing
- **Plugin System** - Extensible with custom RSlib/Rsbuild plugins
- **API Model Generation** - Optional api.model.json for documentation tooling

## Prerequisites

- Node.js 24.x or later
- pnpm 10.x or later
- TypeScript 5.9.x or later

## Installation

```bash
pnpm add -D @savvy-web/rslib-builder
```

### Peer Dependencies

Install the required peer dependencies:

```bash
pnpm add -D @rslib/core @microsoft/api-extractor @typescript/native-preview
```

## Quick Start

Create an `rslib.config.ts` in your project root:

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
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

  // Generate API model file for documentation tooling
  apiModel?: ApiModelOptions | boolean;

  // Copy static files to dist
  copyPatterns?: CopyPattern[];
}
```

### Build Targets

Two build targets available via `--env-mode`:

- **dev** - Unminified with source maps for local development
- **npm** - Optimized for npm publishing (Node.js runtime)

```bash
rslib build --env-mode dev
rslib build --env-mode npm
```

## Advanced Usage

### TypeScript Declaration Bundling

Inline type definitions from dependencies:

```typescript
NodeLibraryBuilder.create({
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
2. **PackageJsonTransformPlugin** - Transforms package.json for targets
3. **DtsPlugin** - Generates TypeScript declarations with tsgo/API Extractor
4. **FilesArrayPlugin** - Generates files array, excludes source maps

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

- `tsconfig/root.json` - Base workspace configuration
- `tsconfig/node/ecma/lib.json` - Node.js ESM library configuration

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

The builder automatically handles common build concerns:

- **Entry Detection** - Extracts entry points from package.json exports
- **Package.json Transformation** - Resolves PNPM `catalog:` protocol,
  updates export paths from source to built, generates files array
- **Source Maps** - Generates .map files for debugging but excludes them
  from npm publishing to reduce package size
- **Declaration Bundling** - Uses tsgo for fast generation and API Extractor
  for bundling

## Examples

See the repository's own `rslib.config.ts` for a real-world example of the
builder building itself.

## License

[MIT](./LICENSE)

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup
and guidelines.

## Links

- [RSlib Documentation](https://rslib.dev/)
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core)
- [API Extractor](https://api-extractor.com/)
- [PNPM Workspace](https://pnpm.io/workspaces)
- [PNPM Catalogs](https://pnpm.io/catalogs)
