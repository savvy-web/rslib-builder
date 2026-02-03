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
  cleaner public APIs, with multi-entry support for packages with multiple exports
- **Multi-Target Builds** - Separate dev (source maps) and npm (optimized)
  outputs
- **PNPM Integration** - Automatically resolves `catalog:` and `workspace:`
  references
- **Package.json Transform** - Converts `.ts` exports to `.js`, generates files
  array, removes dev-only fields
- **TSDoc Validation** - Pre-build TSDoc validation with automatic public API discovery
- **API Model Generation** - Optional API model and resolved tsconfig output for
  documentation tooling
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

## Quick Start

Extend the provided tsconfig for optimal settings:

```jsonc
// tsconfig.json
{
  "extends": "@savvy-web/rslib-builder/tsconfig/ecma/lib.json"
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

## Documentation

For detailed documentation, see the [docs/](./docs/) directory:

- [Getting Started](./docs/guides/getting-started.md) - Installation and setup
- [Configuration](./docs/guides/configuration.md) - All options explained
- [Plugin System](./docs/guides/plugins.md) - Built-in and custom plugins
- [Architecture](./docs/architecture/overview.md) - How it works internally
- [Troubleshooting](./docs/troubleshooting.md) - Common issues and solutions

## Example

This package builds itself using its own `NodeLibraryBuilder`. See
[`rslib.config.ts`](./rslib.config.ts) for a production example.

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
