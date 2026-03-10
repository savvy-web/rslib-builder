---
"@savvy-web/rslib-builder": minor
---

## Features

Separate mode from targets in multi-target building. All publish targets from `publishConfig.targets` are now processed uniformly by `PublishTargetPlugin`, producing independent output directories (e.g., `dist/npm`, `dist/github`) with per-target package.json transforms. Previously the first target was treated as "primary" and shared the build staging directory, which prevented correct multi-directory output.
