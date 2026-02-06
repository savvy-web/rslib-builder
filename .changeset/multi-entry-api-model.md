---
"@savvy-web/rslib-builder": minor
---

## Multi-entry API model generation

Replace virtual barrel approach with per-entry API Extractor runs merged into a
single `.api.json` with multiple `EntryPoint` members.

### New behavior

- API Extractor now runs for **every** entry point (not just the main `"."` export)
- Per-entry models are merged into a single Package with multiple EntryPoint members
- Sub-entry canonical references are scoped (e.g., `@scope/pkg/subpath!` instead
  of `@scope/pkg!`)
- Single-entry packages produce the same output as before (no merge needed)

### API changes

- Added `exportPaths: Record<string, string>` to `ExtractedEntries` interface,
  mapping entry names back to original export keys (e.g., `"nested-one"` to
  `"./nested/one"`) for lossless canonical reference scoping
- Removed `extractEntriesFromPackageJson` convenience function from public API;
  use `new EntryExtractor().extract(packageJson)` directly
- Added `mergeApiModels()` internal function for combining per-entry API models

### Bundleless mode

- DtsPlugin now emits individual `.d.ts` files (preserving source structure)
  when `bundle: false`, while still generating a merged API model across all
  entry points
- The `bundle` option on `DtsPluginOptions` controls whether declarations are
  rolled up per entry (bundle) or emitted individually (bundleless)

### Removed

- Removed virtual barrel generator (`VirtualBarrelGenerator`, `BarrelEntry`,
  `generateApiModelFromBarrel`, `BarrelApiModelResult`)
- Removed `generateVirtualBarrel` option from `DtsPluginOptions`

### Other changes

- `reportUnsupportedHtmlElements` changed from `false` to `true` in TSDoc config
- Extracted `resolveTsdocMetadataFilename` utility to deduplicate filename resolution
- Replaced duplicated CI detection with `TsDocConfigBuilder.isCI()`
