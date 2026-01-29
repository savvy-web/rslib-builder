---
"@savvy-web/rslib-builder": minor
---

Add automatic export of resolved tsconfig.json when API extraction is enabled.

The DtsPlugin now generates a flattened tsconfig.json file alongside the API model
output. This resolved configuration is designed for virtual TypeScript environments
and documentation tooling:

- Converts TypeScript enum values to strings (target, module, moduleResolution, jsx)
- Sets `composite: false` and `noEmit: true` for virtual environment compatibility
- Excludes path-dependent options (outDir, rootDir, declarationDir, typeRoots)
- Excludes file selection patterns (include, exclude, files)
- Uses default @types auto-discovery
- Includes $schema for IDE support

The tsconfig.json is excluded from npm publish and copied to localPaths when configured.
