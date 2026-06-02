# dual-format-indexes example

Regression fixture for the dual-format + `exportsAsIndexes` declaration-path bug.

Nested export keys (`./group/alpha`, `./group/beta`) built with
`format: ["esm", "cjs"]` and `exportsAsIndexes: true` must emit `types`,
`import`, and `require` paths that all resolve to real files
(e.g. `./esm/group/alpha/index.d.ts`). The DtsPlugin previously flattened
declaration names to `group-alpha.d.ts`, leaving `types` pointing at a
non-existent file.

- Source: `src/`
- Depends on: `@savvy-web/rslib-builder` via `workspace:*`
- Build: `turbo run build:dev build:prod`
