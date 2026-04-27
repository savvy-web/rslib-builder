# @savvy-web/rslib-builder

Main publishable package. Self-builds using its own NodeLibraryBuilder.

- Source: `src/`
- Tests: co-located `.test.ts` files in `src/`
- Config: `rslib.config.ts` (self-build), `tsconfig.json`
- Build: `pnpm build` (from monorepo root)
- Test: `pnpm test` (from monorepo root)

See root CLAUDE.md for full monorepo context.

## Chunk Policy

Every `LibConfig` produced by `NodeLibraryBuilder` and `RSPressPluginBuilder` applies `disableSharedChunks` (see `src/rslib/builders/utils/disable-shared-chunks.ts`), which sets `optimization.runtimeChunk = false` and `optimization.splitChunks = false`. This prevents the duplicate `__webpack_require__` declaration that caused a `SyntaxError` on Node ESM load in multi-entry builds (issue #158). Modern-module's ESM-aware sibling chunk extraction still applies; those chunks are valid ESM.
