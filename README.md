# rslib-builder

> [!CAUTION]
> **This package is deprecated and no longer maintained.**
> All functionality has been moved to our new bundler [`@savvy-web/bundler`](https://www.npmjs.com/package/@savvy-web/bundler)
> Sources live in the [Silk Suite monorepo](https://github.com/savvy-web/systems).
> No further releases, fixes, or security patches will be published here.

Monorepo for [`@savvy-web/rslib-builder`](./package/) — an RSlib-based build system for modern ESM Node.js libraries and RSPress plugins.

## Structure

| Directory | Description |
| :-------- | :---------- |
| [`package/`](./package/) | Main `@savvy-web/rslib-builder` package |
| [`examples/libraries/`](./examples/libraries/) | NodeLibraryBuilder example consumers |
| [`examples/rspress-plugin/`](./examples/rspress-plugin/) | RSPressPluginBuilder example (plugin + site) |
| [`lib/`](./lib/) | Shared configs (lint-staged, commitlint, markdownlint) |
| [`docs/`](./docs/) | Package documentation and guides |

## Quick Start

```bash
git clone https://github.com/savvy-web/rslib-builder.git
cd rslib-builder
pnpm install
pnpm build    # Build all workspaces via turbo
pnpm test     # Run all tests via vitest
```

## Commands

| Command | Description |
| :------ | :---------- |
| `pnpm build` | Build all workspaces via turbo |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm lint` | Check code with biome |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm reset` | Clean all build artifacts |

## Documentation

- **Package docs:** [`package/README.md`](./package/README.md)
- **Guides:** [`docs/`](./docs/)
- **Contributing:** [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## License

MIT
