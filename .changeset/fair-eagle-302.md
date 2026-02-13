---
"@savvy-web/rslib-builder": patch
---

Fix dual format builds placing metadata files inside format subdirectories instead of the shared target root.

In dual format builds (`format: ['esm', 'cjs']`), metadata files (package.json, README, LICENSE, api.json, tsdoc-metadata.json, tsconfig.json) were incorrectly placed inside both `esm/` and `cjs/` subdirectories. They now correctly land at the shared `dist/{target}/` root while JS and DTS files route to their respective format subdirectories via `distPath.js` and the new `dtsPathPrefix` option.

Additionally, the `files` array in the output package.json now uses directory entries (`esm`, `cjs`) instead of listing individual files under each format directory, and secondary compilations no longer overwrite the primary's processed package.json.
