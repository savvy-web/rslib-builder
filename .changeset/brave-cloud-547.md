---
"@savvy-web/rslib-builder": minor
---

Add CI-aware forgotten exports handling and fix declaration generation

- Forgotten exports now fail the build in CI environments by default (`forgottenExports` defaults to `"error"` when `CI` or `GITHUB_ACTIONS` env vars are set)
- Local builds warn but succeed by default (`forgottenExports` defaults to `"include"`)
- Users can override with explicit `apiModel.forgottenExports` option: `"error"`, `"include"`, or `"ignore"`
- Fix declaration generation when `apiModel` option is not explicitly declared in builder options
- Add comprehensive E2E tests for API model options and forgotten exports behavior
