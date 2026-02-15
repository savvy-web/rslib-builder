---
"@savvy-web/rslib-builder": patch
---

Fix dual-format bin path resolution and compilation

- Prefix bin paths with format directory in dual format mode (e.g., `./bin/cli.js` → `./esm/bin/cli.js`)
- Exclude bin entries from secondary format builds so bins are only compiled for the primary format
- Add E2E test coverage for single-format bin path in package.json
