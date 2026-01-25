# @savvy-web/rslib-builder

[![npm version](https://img.shields.io/npm/v/@savvy-web/rslib-builder)](https://www.npmjs.com/package/@savvy-web/rslib-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)](https://nodejs.org)

Build modern ESM Node.js libraries with minimal configuration. Handles
TypeScript declarations, package.json transformations, and PNPM workspace
resolution automatically.

Building TypeScript packages for npm involves repetitive setup: configuring
bundlers, generating declarations, transforming package.json exports, and
resolving workspace references. rslib-builder handles these tasks so you can
focus on your code.

## Features

- **Zero Config** - Auto-detects entry points from package.json exports
- **Fast Type Generation** - Uses tsgo (native TypeScript) for 10-100x faster
  declaration generation
- **Bundled Declarations** - Rolls up TypeScript types via API Extractor for
  cleaner public APIs
- **Multi-Target Builds** - Separate dev (source maps) and npm (optimized)
  outputs
- **PNPM Integration** - Automatically resolves `catalog:` and `workspace:`
  references
- **Package.json Transform** - Converts `.ts` exports to `.js`, generates files
  array, removes dev-only fields
- **TSDoc Validation** - Pre-build TSDoc validation with automatic public API discovery
- **API Model Generation** - Optional API model output for documentation tooling
- **Extensible** - Add custom RSlib/Rsbuild plugins for advanced use cases

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

For TSDoc validation (optional):

```bash
pnpm add -D eslint @typescript-eslint/parser eslint-plugin-tsdoc
```

## Quick Start

Extend the provided tsconfig for optimal settings:

```jsonc
// tsconfig.json
{
  "extends": "@savvy-web/rslib-builder/tsconfig/ecma/lib.json",
  "compilerOptions": {
    "outDir": "dist"
  }
}
```

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

## Build Targets

Two build targets available via `--env-mode`:

- **dev** - Unminified with source maps for local development
- **npm** - Optimized for npm publishing (Node.js runtime)

```bash
rslib build --env-mode dev
rslib build --env-mode npm
```

## API Overview

The package exports a main builder and several plugins:

| Export                       | Description                                   |
| ---------------------------- | --------------------------------------------- |
| `NodeLibraryBuilder`         | Main API for building Node.js libraries       |
| `AutoEntryPlugin`            | Auto-extracts entry points from package.json  |
| `DtsPlugin`                  | Generates TypeScript declarations with tsgo   |
| `PackageJsonTransformPlugin` | Transforms package.json for distribution      |
| `FilesArrayPlugin`           | Generates files array for npm publishing      |
| `TsDocLintPlugin`            | Validates TSDoc comments before build         |
| `TsDocConfigBuilder`         | Utility for TSDoc configuration               |
| `ImportGraph`                | Traces TypeScript imports for file discovery  |

See [Configuration](./docs/guides/configuration.md) for all options.

## Plugins

The builder includes several built-in plugins:

1. **TsDocLintPlugin** - Validates TSDoc comments before build (optional)
2. **AutoEntryPlugin** - Auto-extracts entry points from package.json exports
3. **DtsPlugin** - Generates TypeScript declarations with tsgo/API Extractor
4. **PackageJsonTransformPlugin** - Transforms package.json for targets
5. **FilesArrayPlugin** - Generates files array, excludes source maps

## How It Works

The builder automatically transforms your source package.json for distribution:

- **Entry Detection** - Extracts entry points from package.json exports
- **Export Transformation** - Converts `.ts` paths to `.js` in exports field
- **Bin Transformation** - Converts bin entries from `.ts` to `.js` scripts
- **PNPM Resolution** - Resolves `catalog:` and `workspace:` to real versions
- **Files Generation** - Creates accurate `files` array for npm publishing
- **Declaration Bundling** - Uses tsgo for fast generation and API Extractor
  for bundling

## Documentation

For detailed documentation, see the [docs/](./docs/) directory:

- [Getting Started](./docs/guides/getting-started.md) - Installation and setup
- [Configuration](./docs/guides/configuration.md) - All options explained
- [Plugin System](./docs/guides/plugins.md) - Built-in and custom plugins
- [Architecture](./docs/architecture/overview.md) - How it works internally
- [Troubleshooting](./docs/troubleshooting.md) - Common issues and solutions

## Examples

This package builds itself using its own `NodeLibraryBuilder`. See
[`rslib.config.ts`](./rslib.config.ts) for a production example demonstrating:

- API model generation for documentation tooling
- External package configuration
- Custom package.json transformations
- Copy patterns for static files

### Programmatic Usage

Use `ImportGraph` to discover all files reachable from your package exports:

```typescript
import { ImportGraph } from '@savvy-web/rslib-builder';

const result = ImportGraph.fromPackageExports('./package.json', {
  rootDir: process.cwd(),
});

console.log('Public API files:', result.files);
console.log('Entry points:', result.entries);
```

See [Configuration](./docs/guides/configuration.md#importgraph-utility) for more
examples.

## Support

This software is provided as-is under the MIT License with no warranty or
support guarantees. While we welcome bug reports and feature requests via
GitHub Issues, we cannot guarantee response times or resolution.

For security vulnerabilities, please see [SECURITY.md](./SECURITY.md).

## Links

- [RSlib Documentation](https://rslib.dev/)
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core)
- [API Extractor](https://api-extractor.com/)
- [PNPM Workspace](https://pnpm.io/workspaces)
- [PNPM Catalogs](https://pnpm.io/catalogs)

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup
and guidelines.

## License

[MIT](./LICENSE)
