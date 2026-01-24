---
"@savvy-web/rslib-builder": minor
---

Refactor public API surface and add TSDoc validation tooling.

**Breaking Changes:**

- Remove `EntryExtractor`, `PackageJsonTransformer`, and `PnpmCatalog` classes from public exports (now internal implementation details)

**New Features:**

- Add `TsDocConfigBuilder` to public API for custom TSDoc configurations
- Add ESLint with `eslint-plugin-tsdoc` for TSDoc syntax validation
- Add `lint:tsdoc` npm script and lint-staged integration

**Improvements:**

- Convert `PackageJsonTransformer` methods to standalone functions for better testability
- Add granular type exports (`BuildTarget`, `TransformPackageJsonFn`, option types)
- Improve TSDoc documentation with `@public` and `@internal` tags throughout
