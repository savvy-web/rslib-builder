---
"@savvy-web/rslib-builder": minor
---

## Features

Add granular API Extractor warning suppression via `suppressWarnings` on `ApiModelOptions`. Allows targeting specific warnings by `messageId` and/or text `pattern` with AND logic, instead of blanket category-level settings. Suppressions are evaluated before `forgottenExports` and TSDoc warning handling and take priority over both. Closes #106.
