---
"@savvy-web/rslib-builder": minor
---

Initial release of RSlib Builder - a streamlined build system for modern
ECMAScript libraries.

Build TypeScript packages effortlessly with:

- **Zero-config bundling** - Automatic entry point detection from package.json
- **Rolled-up type declarations** - API Extractor integration bundles your
  .d.ts files for clean public APIs
- **Multi-target builds** - Dev builds with source maps, optimized npm builds
- **PNPM workspace support** - Resolves catalog: and workspace: references
- **Self-building** - This package builds itself using NodeLibraryBuilder

Get started with a simple config:

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  externals: ['@rslib/core'],
});
```
