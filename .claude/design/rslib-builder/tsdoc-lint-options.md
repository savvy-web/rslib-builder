---
status: archived
archived: 2026-02-03
archival-reason: Configuration integrated into apiModel.tsdoc.lint
module: rslib-builder
category: reference
created: 2026-01-24
updated: 2026-02-03
last-synced: 2026-02-03
completeness: 0
related:
  - rslib-builder/architecture.md
  - rslib-builder/api-model-options.md
dependencies: []
---

# TsDocLintPlugin Configuration (Archived)

**This document is archived.** TSDoc linting configuration has been integrated into the `apiModel.tsdoc.lint` option. See [api-model-options.md](./api-model-options.md) for the current configuration reference.

## Migration Guide

The `tsdocLint` option no longer exists as a separate top-level option in `NodeLibraryBuilderOptions`. TSDoc linting is now controlled via `apiModel.tsdoc.lint`.

### Before (Old Configuration)

```typescript
// Old: separate tsdocLint option
NodeLibraryBuilder.create({
  apiModel: true,
  tsdocLint: {
    onError: "throw",
    include: ["src/**/*.ts"],
    persistConfig: true,
  },
});
```

### After (Current Configuration)

```typescript
// New: lint nested under apiModel.tsdoc
NodeLibraryBuilder.create({
  apiModel: {
    tsdoc: {
      tagDefinitions: [{ tagName: "@error", syntaxKind: "inline" }],
      lint: {
        onError: "throw",
        include: ["src/**/*.ts"],
        persistConfig: true,
      },
    },
  },
});
```

### Key Changes

1. **Default behavior**: Lint is enabled by default when `apiModel` is enabled (which is also the default)
2. **Configuration location**: Moved from `tsdocLint` to `apiModel.tsdoc.lint`
3. **TSDoc config sharing**: The lint plugin automatically uses tag definitions from the parent `apiModel.tsdoc` object
4. **Persistence in CI**: When `persistConfig` is true/undefined in CI, the existing `tsdoc.json` is validated instead of written

### Disabling Lint

```typescript
// Disable lint only
NodeLibraryBuilder.create({
  apiModel: {
    tsdoc: {
      lint: false,
    },
  },
});

// Disable apiModel entirely (also disables lint)
NodeLibraryBuilder.create({
  apiModel: false,
});
```

## Related Documentation

- [API Model Options](./api-model-options.md) - Current lint configuration reference
- [Architecture](./architecture.md) - TsDocLintPlugin execution model
