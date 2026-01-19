---
"@savvy-web/rslib-builder": minor
---

Add TSDoc configuration support for API Extractor integration.

- New `TsDocConfigBuilder` class for managing TSDoc configuration
- Tag group support: core, extended, and discretionary tag categories
- Custom tag definitions and `supportForTags` auto-derivation
- `tsdoc.json` persistence with CI-aware defaults (persist locally, skip in CI)
- `tsdoc-metadata.json` generation for downstream tooling
- Prettified TSDoc warnings with file:line:column location and color output
- Configurable warning behavior: "log", "fail", or "ignore" (defaults to "fail" in CI)
