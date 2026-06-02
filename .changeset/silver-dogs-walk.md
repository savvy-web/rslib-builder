---
"@savvy-web/rslib-builder": patch
---

## Bug Fixes

Fixed a broken `types` field in the generated `package.json` exports map when using `exportsAsIndexes: true` with a dual-format build (`format: ["esm", "cjs"]`) and nested export keys (e.g. `"./group/alpha"`).

Previously, declarations were emitted with a hyphen-flattened filename (`esm/group-alpha.d.ts`) while the `types` field pointed at a directory-style path (`esm/group/alpha.d.ts`), causing TypeScript to fail to resolve types for those exports. Now declarations are emitted alongside the JS output as `esm/group/alpha/index.d.ts` (and `cjs/.../index.d.cts`), so `types`, `import`, and `require` all resolve correctly.
