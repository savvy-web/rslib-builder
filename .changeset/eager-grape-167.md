---
"@savvy-web/rslib-builder": minor
---

Add local type definitions to remove external type dependencies from public API

- Add `CopyPatternConfig` interface for copy pattern configuration, replacing dependency on `@rspack/binding` types
- Add `PackageJson` and related JSON types (`JsonObject`, `JsonValue`, etc.) with TSDoc-compliant documentation, replacing `type-fest` in public API
- Simplify TsDocLintPlugin by removing peer dependency checks for ESLint modules (now bundled dependencies)
- Export new types from public API: `CopyPatternConfig`, `PackageJson`, `JsonObject`, `JsonValue`, `JsonArray`, `JsonPrimitive`
