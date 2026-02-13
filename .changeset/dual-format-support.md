---
"@savvy-web/rslib-builder": minor
---

Add dual format and per-entry format override support

- **Dual format**: Pass `format: ['esm', 'cjs']` to build all
  entries in both ESM and CJS, with separate output directories
  and both `import` and `require` export conditions
- **Per-entry format overrides**: Use `entryFormats` to override
  the format for specific exports (e.g.,
  `{ './markdownlint': 'cjs' }`) while keeping the rest as the
  top-level format
- **Format-aware DTS**: CJS entries emit `.d.cts` type
  declarations; ESM entries keep `.d.ts`
- **Format-aware export conditions**: CJS entries use `require`
  condition with `.cjs` extension; dual format entries get both
  `import` and `require` with directory prefixes
