# @savvy-web/rslib-builder

[![npm version](https://img.shields.io/npm/v/@savvy-web/rslib-builder)](https://www.npmjs.com/package/@savvy-web/rslib-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)](https://nodejs.org)

Build modern ESM Node.js libraries with minimal configuration. Handles TypeScript declarations, package.json transformations, and PNPM workspace resolution automatically.

## Features

- **Zero-Config Entry Detection** - Auto-discovers entry points from package.json exports
- **10-100x Faster Types** - Uses tsgo (native TypeScript compiler) with API Extractor for bundled, clean public API declarations
- **Production-Ready Transforms** - Converts `.ts` exports to `.js`, resolves PNPM `catalog:` and `workspace:` references, generates files array
- **Bundled or Bundleless** - Choose single-file bundles per entry or bundleless mode that preserves your source file structure
- **RSPress Plugin Builder** - Dedicated builder for RSPress plugins with dual-bundle architecture (plugin + runtime) and React support
- **Multi-Target Builds** - Separate dev (with source maps) and npm (optimized) outputs from a single configuration
- **Flexible Formats** - ESM, CJS, or dual format output with per-entry format overrides
- **TSDoc Validation** - Pre-build documentation validation with automatic public API discovery

## Installation

```bash
npm install --save-dev @savvy-web/rslib-builder @rslib/core @microsoft/api-extractor @typescript/native-preview
```

## Quick Start

```typescript
// rslib.config.ts
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  externals: ['@rslib/core'],
});
```

Build with `rslib build --env-mode dev` or `rslib build --env-mode npm`.

## RSPress Plugins

Build RSPress plugins with zero-config dual-bundle output (plugin + runtime):

```typescript
// rslib.config.ts
import { RSPressPluginBuilder } from '@savvy-web/rslib-builder';

export default RSPressPluginBuilder.create({
  plugin: {
    externals: ['typescript', 'shiki'],
  },
  runtime: {
    externals: ['@rspress/plugin-llms'],
  },
});
```

RSPressPluginBuilder auto-detects the runtime entry at `src/runtime/index.tsx`, handles React JSX compilation, CSS modules, and built-in RSPress externals. For advanced configuration, see [RSPress Plugin Setup](./docs/guides/rspress-plugins.md).

## Documentation

For configuration options, API reference, and advanced usage, see [docs](./docs/).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
