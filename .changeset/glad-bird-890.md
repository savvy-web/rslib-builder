---
"@savvy-web/rslib-builder": patch
---

Fix localPaths to copy transformed package.json after build completes.

Previously, when using `apiModel.localPaths`, the package.json was copied during
the `pre-process` stage before transformations were applied. Now files are copied
in `onCloseBuild` after the build completes, ensuring the transformed package.json
(with resolved pnpm references, transformed exports, etc.) is exported.
