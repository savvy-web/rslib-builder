# Contributing to @savvy-web/rslib-builder

Thank you for your interest in contributing! This guide covers the development
workflow and standards for this project.

## Prerequisites

- Node.js 24.x or later
- pnpm 10.x or later
- TypeScript 5.9.x or later

## Getting Started

```bash
# Clone the repository
git clone https://github.com/savvy-web/rslib-builder.git
cd rslib-builder

# Install dependencies
pnpm install
```

## Development Workflow

### Building

```bash
# Development build (with source maps)
pnpm build:dev

# Production build (optimized for npm)
pnpm build:npm

# Inspect generated RSlib config
pnpm build:inspect
```

### Testing

Tests are co-located with source files (e.g., `foo.test.ts` next to `foo.ts`).

```bash
# Run all tests
pnpm test

# Run with coverage report
pnpm test:coverage

# Watch mode for development
pnpm test:watch
```

#### Test Coverage Requirements

- Minimum 85% coverage per file (statements, branches, functions, lines)
- Use type-safe mocks from `src/__test__/rslib/types/test-types.ts`
- Never use `as any` - create proper mock interfaces

#### Writing Tests

```typescript
import { describe, expect, it, vi } from 'vitest';
import type { MockAssetRegistry } from '../__test__/rslib/types/test-types.js';

// Create type-safe mocks
const mockAssets: MockAssetRegistry = {
  'index.js': { source: () => 'export {}' }
};
```

### Linting

```bash
# Check for issues
pnpm lint

# Auto-fix safe issues
pnpm lint:fix

# Auto-fix including unsafe fixes
pnpm lint:fix:unsafe
```

### Type Checking

```bash
pnpm typecheck
```

## Project Structure

```text
rslib-builder/
├── src/
│   ├── rslib/                    # RSlib build system
│   │   ├── builders/             # High-level builder classes
│   │   └── plugins/              # RSlib/Rsbuild plugins
│   │       └── utils/            # Plugin utilities
│   ├── tsconfig/                 # TypeScript config templates
│   ├── public/                   # Static files (tsconfig JSONs)
│   ├── __test__/                 # Shared test utilities
│   └── types/                    # TypeScript type definitions
├── rslib.config.ts               # Self-builds using NodeLibraryBuilder
└── vitest.config.ts
```

## Code Standards

### TypeScript

- No `any` types - use proper interfaces
- Use `import type` for type-only imports
- All imports must use `.js` extension (ESM requirement)

### Test Standards

- Co-locate tests with source files (`*.test.ts`)
- Maintain 85%+ test coverage per file
- Use shared mock types from `src/__test__/rslib/`
- Use `/* v8 ignore */` for integration code that can't be unit tested

### Documentation

- Update `CLAUDE.md` for AI agent guidance changes
- Update design docs in `.claude/design/` for architectural changes
- Add JSDoc comments for public APIs

## Plugin Development

When adding or modifying plugins:

1. Plugins execute in order: AutoEntryPlugin → DtsPlugin →
   PackageJsonTransformPlugin → FilesArrayPlugin
2. Use `api.expose()` / `api.useExposed()` for cross-plugin state
3. Understand Rsbuild `processAssets` stages: `pre-process`, `optimize`,
   `additional`, `optimize-inline`, `summarize`

See `.claude/design/rslib-builder/architecture.md` for detailed plugin architecture.

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

## Pull Request Guidelines

1. Create a feature branch from `main`
2. Ensure all tests pass with 85%+ coverage
3. Run `pnpm lint:fix` before committing
4. Write clear commit messages
5. Update documentation as needed

## External Resources

- [RSlib Documentation](https://rslib.dev/)
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core)
- [Rspack](https://rspack.dev/)
- [PNPM Workspace](https://pnpm.io/workspaces)
- [PNPM Catalog Protocol](https://pnpm.io/catalogs)

## License

By contributing, you agree that your contributions will be licensed under the
MIT License.
