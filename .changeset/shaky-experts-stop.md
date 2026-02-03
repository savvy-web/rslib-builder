---
"@savvy-web/rslib-builder": minor
---

Add `virtualEntries` and `format` options to NodeLibraryBuilder

## New Features

### `format` Option

A new top-level `format` option allows specifying the output module format for library builds:

```typescript
NodeLibraryBuilder.create({
  format: "cjs", // or "esm" (default)
});
```

**Effects:**
- Sets `package.json` `type` field: `"module"` for ESM, `"commonjs"` for CJS
- Configures resolved `tsconfig.json` module settings appropriately
- Controls output file extensions (`.js` for ESM, `.cjs` for CJS)

### `virtualEntries` Option

Virtual entries are special entry points that are bundled like regular entries but:
- Do NOT generate TypeScript declarations (`.d.ts` files)
- Are NOT added to `package.json` exports
- ARE included in the `package.json` files array for publishing

**Primary use case:** Files like `pnpmfile.cjs` that must be self-contained CommonJS files without type declarations.

```typescript
NodeLibraryBuilder.create({
  format: "esm", // Main library is ESM
  virtualEntries: {
    "pnpmfile.cjs": {
      source: "./src/pnpmfile.ts",
      format: "cjs", // Override format for this entry
    },
  },
});
```

**Features:**
- Each virtual entry can specify its own format or inherit from top-level
- Multiple virtual entries with different formats are supported
- Virtual-only configurations (no regular exports) are valid
- Uses separate RSlib lib configs for format isolation

## Implementation Details

- New `VirtualEntryPlugin` exposes virtual entry names and manages files array inclusion
- `DtsPlugin` skips type generation for entries in the virtual entry set
- `PackageJsonTransformPlugin` sets the `type` field based on format
- `TsconfigResolver` outputs format-appropriate module settings in resolved tsconfig
- `LibraryFormat` type centralized in `src/types/package-json.ts`

## New Exports

- `LibraryFormat` - Type alias for `"esm" | "cjs"`
- `VirtualEntryConfig` - Interface for virtual entry configuration
- `VirtualEntryPlugin` - Plugin for handling virtual entries
- `VirtualEntryPluginOptions` - Plugin options interface
