# Troubleshooting

Common issues and solutions when using rslib-builder.

## Table of Contents

- [Build Errors](#build-errors)
- [Type Generation Issues](#type-generation-issues)
- [Package.json Problems](#packagejson-problems)
- [Performance Issues](#performance-issues)
- [Publish Target Issues](#publish-target-issues)
- [Format Issues](#format-issues)
- [Plugin Issues](#plugin-issues)
- [RSPress Plugin Issues](#rspress-plugin-issues)

## Build Errors

### "Cannot find module" errors

**Symptom:** Build fails with module resolution errors.

**Common causes:**

1. **Missing `.js` extension in imports**

   ESM requires explicit file extensions:

   ```typescript
   // Wrong
   import { helper } from './utils/helper';

   // Correct
   import { helper } from './utils/helper.js';
   ```

2. **Missing peer dependencies**

   Install required peer dependencies:

   ```bash
   pnpm add -D @rslib/core @microsoft/api-extractor @typescript/native-preview
   ```

3. **Incorrect externals configuration**

   If you externalize a package, ensure it's available at runtime:

   ```typescript
   NodeLibraryBuilder.create({
     externals: ['@rslib/core'],  // Must be a peerDependency
   });
   ```

### "Invalid env-mode" error

**Symptom:** Error message about invalid build target.

**Solution:** Use a valid `--env-mode` value:

```bash
# Valid
rslib build --env-mode dev
rslib build --env-mode npm

# Invalid
rslib build --env-mode production  # Not a valid target
```

### Build hangs or times out

**Symptom:** Build process doesn't complete.

**Common causes:**

1. **Circular dependencies** - Check for import cycles
2. **Large node_modules** - Ensure externals are configured
3. **tsgo issues** - Try with a fresh `.rslib/` cache

**Solution:**

```bash
# Clear cache and rebuild
rm -rf .rslib/
rslib build --env-mode dev
```

## Type Generation Issues

### Types not generating

**Symptom:** No `.d.ts` files in output.

**Common causes:**

1. **Missing peer dependency**

   ```bash
   pnpm add -D @typescript/native-preview
   ```

2. **tsconfig issues** - Ensure your tsconfig is valid:

   ```bash
   npx tsc --noEmit  # Check for errors
   ```

3. **Entry point not in exports**

   Entries must be listed in package.json exports:

   ```json
   {
     "exports": {
       ".": "./src/index.ts"
     }
   }
   ```

### "Cannot find declaration file" errors

**Symptom:** Type errors about missing declarations.

**Solution:** Add packages to `dtsBundledPackages`:

```typescript
NodeLibraryBuilder.create({
  dtsBundledPackages: [
    'problematic-package',
    '@types/*',  // Bundle all @types
  ],
});
```

### API Extractor errors

**Symptom:** Errors during declaration bundling.

**Common causes:**

1. **Invalid TypeScript syntax** - Fix any TS errors first
2. **Circular type references** - Simplify complex type structures
3. **Missing types** - Add to `dtsBundledPackages`

**Debugging:**

Check the intermediate declarations:

```bash
ls .rslib/declarations/npm/
```

## Package.json Problems

### PNPM catalog references not resolved

**Symptom:** Output still contains `catalog:` references.

**Common causes:**

1. **Missing pnpm-workspace.yaml**

   Ensure you have a valid workspace configuration:

   ```yaml
   # pnpm-workspace.yaml
   catalog:
     lodash: ^4.17.21
   ```

2. **Package not in catalog**

   Add the package to your catalog:

   ```yaml
   catalog:
     missing-package: ^1.0.0
   ```

### exports field incorrect

**Symptom:** Output exports don't match expected structure.

**Check your source exports:**

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils/index.ts"
  }
}
```

**Expected output:**

```json
{
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    },
    "./utils": {
      "types": "./utils/index.d.ts",
      "import": "./utils/index.js"
    }
  }
}
```

### files array missing entries

**Symptom:** Some files not included in package.

**Solution:** Check that files are being emitted:

```bash
ls dist/npm/
```

If files exist but aren't in `files` array, use `transformFiles`:

```typescript
NodeLibraryBuilder.create({
  transformFiles({ filesArray }) {
    filesArray.add('my-missing-file.json');
  },
});
```

## Performance Issues

### Slow first build

**Expected behavior:** First builds are slower due to cache warming.

Subsequent builds use `.rslib/cache/` and are much faster.

**Tips:**

- Don't delete `.rslib/` between builds
- Add `.rslib/` to `.gitignore` but not `.dockerignore`

### Build gets slower over time

**Symptom:** Builds slow down as project grows.

**Solutions:**

1. **Review externals** - Externalize large dependencies:

   ```typescript
   NodeLibraryBuilder.create({
     externals: ['lodash', 'rxjs'],  // Don't bundle these
   });
   ```

2. **Clear cache periodically:**

   ```bash
   rm -rf .rslib/cache/
   ```

3. **Check for unnecessary files** - Ensure `copyPatterns` isn't
   copying too much:

   ```typescript
   copyPatterns: [
     // Be specific
     { from: './templates/*.json', context: './src' },
     // Avoid broad patterns like:
     // { from: './**/*', context: './src' }
   ],
   ```

### tsgo taking too long

**Symptom:** Declaration generation is slow.

**Solutions:**

1. **Check tsconfig strictness** - Looser configs compile faster
2. **Reduce included files** - Use tsconfig `include`/`exclude`
3. **Check for type complexity** - Simplify recursive/deep types

## Virtual Entry Issues

### Virtual entry not in output

**Symptom:** Virtual entry file not appearing in dist directory.

**Common causes:**

1. **Source path incorrect**

   Ensure the source path is correct and the file exists:

   ```typescript
   virtualEntries: {
     'pnpmfile.cjs': {
       source: './src/pnpmfile.ts',  // Must exist
       format: 'cjs',
     },
   },
   ```

2. **Build target mismatch**

   Virtual entries are built for all targets. Check the correct dist directory:

   ```bash
   ls dist/npm/pnpmfile.cjs
   ls dist/dev/pnpmfile.cjs
   ```

### Virtual entry generating types

**Symptom:** Unexpected .d.ts files for virtual entries.

**Solution:** Ensure the entry is in `virtualEntries`, not in package.json exports:

```typescript
// Correct: virtual entry
virtualEntries: {
  'helper.cjs': { source: './src/helper.ts', format: 'cjs' },
},

// Incorrect: this would be a regular entry with types
// package.json: "exports": { "./helper": "./src/helper.ts" }
```

### Wrong format in virtual entry output

**Symptom:** Virtual entry bundled as ESM when CJS expected (or vice versa).

**Solution:** Explicitly set the format for each virtual entry:

```typescript
virtualEntries: {
  'pnpmfile.cjs': {
    source: './src/pnpmfile.ts',
    format: 'cjs',  // Explicit format
  },
},
```

Without explicit format, virtual entries inherit the top-level `format` option
(default: `'esm'`).

## Format Issues

### Wrong export conditions in output

**Symptom:** Output package.json has `import` instead
of `require` (or vice versa).

**Common causes:**

1. **entryFormats key mismatch**

   Keys must exactly match package.json export paths:

   ```typescript
   // Correct
   entryFormats: { './markdownlint': 'cjs' }

   // Wrong - missing "./" prefix
   entryFormats: { 'markdownlint': 'cjs' }
   ```

2. **Missing format option**

   Dual format requires an array:

   ```typescript
   // Dual format
   format: ['esm', 'cjs']

   // Single format (no require conditions)
   format: 'esm'
   ```

### CJS types using .d.ts instead of .d.cts

**Symptom:** CJS entries have `.d.ts` type
declarations instead of `.d.cts`.

**Solution:** Ensure `entryFormats` is configured.
The DTS plugin reads the format from the LibConfig
and emits `.d.cts` only when the format is `"cjs"`.

### Dual format output missing a directory

**Symptom:** Only one format directory appears
in `dist/npm/`.

**Solution:** Both formats must be specified:

```typescript
format: ['esm', 'cjs']  // Creates esm/ and cjs/
```

Check that the build completes without errors.
The secondary format uses `cleanDistPath: false`
so it won't delete the primary format's output.

### CJS require() returns { default: value } instead of value

**Symptom:** A CJS consumer does `require('my-package')` and
gets `{ default: fn, __esModule: true }` instead of `fn`
directly. Tools like `markdownlint-cli2` fail because they
expect the default export value.

**Solution:** Enable the `cjsInterop` option:

```typescript
NodeLibraryBuilder.create({
  format: ['esm', 'cjs'],
  cjsInterop: true,
});
```

This injects a footer snippet into CJS output files that
reassigns `module.exports` to the default export value.
Named exports are preserved as properties on that value.

See [CJS Interop](./configuration.md#cjs-interop) for full
details.

### cjsInterop not taking effect

**Symptom:** `cjsInterop: true` is set but CJS output still
wraps the default export.

**Common causes:**

1. **No CJS format configured**

   `cjsInterop` only affects CJS output. Ensure at least one
   entry uses CJS format:

   ```typescript
   // Correct - has CJS output
   format: ['esm', 'cjs']
   // or
   format: 'cjs'
   // or
   entryFormats: { './config': 'cjs' }
   ```

2. **No default export in the module**

   The interop snippet is a no-op when there is no default
   export. Verify your entry file has `export default`.

## Publish Target Issues

### Additional target directories not created

**Symptom:** Only the primary `dist/npm/` directory is created, no per-target
directories.

**Common causes:**

1. **Only one target configured**

   PublishTargetPlugin only runs when there are two or more targets. A single
   target uses the primary output directory directly:

   ```json
   {
     "publishConfig": {
       "targets": ["npm", "github"]
     }
   }
   ```

2. **Dev mode build**

   Publish targets are only resolved for npm mode. Dev mode always gets
   empty targets:

   ```bash
   rslib build --env-mode npm   # Targets resolved
   rslib build --env-mode dev   # Targets always empty
   ```

### Per-target package.json not customized

**Symptom:** All target directories have identical package.json files.

**Solution:** Use the `transform` function with the `target` parameter:

```typescript
NodeLibraryBuilder.create({
  transform({ mode, target, pkg }) {
    if (target?.registry?.includes('github')) {
      // GitHub Packages requires scoped names
      pkg.name = '@myorg/my-package';
    }
    return pkg;
  },
});
```

The `target` parameter is `undefined` for dev mode and for single-registry
npm builds. For multi-registry builds, each target receives its resolved
`PublishTarget` object.

### Unknown publish target shorthand

**Symptom:** Error `Unknown publish target shorthand: <value>`.

**Solution:** Use a valid shorthand (`"npm"`, `"github"`, `"jsr"`) or a full
registry URL starting with `https://`:

```json
{
  "publishConfig": {
    "targets": ["npm", "https://my-registry.example.com/"]
  }
}
```

## Bundleless Mode Issues

### Unexpected file structure in output

**Symptom:** Output directory structure does not match source.

**Common causes:**

1. **Source files not reachable from exports**

   In bundleless mode, rslib-builder uses `ImportGraph` to trace all files
   from your package.json exports. Files not reachable through imports from
   your entry points will not appear in the output.

   **Solution:** Ensure all files you want in the output are imported
   (directly or transitively) from an exported entry point.

2. **`outBase` misconfiguration**

   Bundleless mode sets `outBase` to `src` to preserve the source directory
   structure. If your source files are not under `src/`, the output structure
   may differ from expectations.

### DTS still bundled in bundleless mode

**Expected behavior:** This is by design. In bundleless mode, rslib-builder
uses a hybrid approach where JavaScript preserves the file structure while
TypeScript declarations are still bundled per entry point via API Extractor.
This provides clean public API type definitions for consumers.

## Plugin Issues

### Custom plugin not running

**Symptom:** Your custom plugin doesn't seem to execute.

**Common causes:**

1. **Plugin added to wrong array:**

   ```typescript
   NodeLibraryBuilder.create({
     plugins: [myPlugin()],  // Correct location
   });
   ```

2. **Wrong stage in processAssets:**

   ```typescript
   // Ensure stage matches when your code should run
   api.processAssets({ stage: 'additional' }, async () => {
     // This runs AFTER 'optimize' stage
   });
   ```

3. **Plugin returning early:**

   Check for early returns in your plugin setup.

### Plugin conflicts

**Symptom:** Unexpected behavior when multiple plugins interact.

**Solution:** Check plugin execution order and shared state:

```typescript
api.processAssets({ stage: 'additional' }, async () => {
  const filesArray = api.useExposed('files-array');
  console.log('Current files:', [...filesArray]);  // Debug
});
```

### Shared state not available

**Symptom:** `api.useExposed()` returns undefined.

**Common causes:**

1. **Wrong timing** - State may not be exposed yet at your stage
2. **Wrong key name** - Check spelling of exposed keys
3. **Plugin order** - Ensure producing plugin runs first

**Valid shared state keys:**

- `files-array` - Available after FilesArrayPlugin initializes
- `entrypoints` - Available after AutoEntryPlugin runs
- `exportToOutputMap` - Available after AutoEntryPlugin runs
- `base-package-json` - Available after PackageJsonTransformPlugin optimize stage

## RSPress Plugin Issues

### Missing @rsbuild/plugin-react

**Symptom:** Error: `@rsbuild/plugin-react is required for RSPress runtime bundles.`

**Solution:** Install the React plugin:

```bash
pnpm add -D @rsbuild/plugin-react
```

This is only needed when the runtime bundle is enabled (auto-detected from
`src/runtime/index.tsx` or explicitly configured).

### Runtime bundle not generated

**Symptom:** No `runtime/` directory in build output.

**Common causes:**

1. **Missing default entry** - Auto-detection looks for `src/runtime/index.tsx`
   exactly. Check path and `.tsx` extension.

2. **Explicitly disabled** - Ensure `runtime` is not set to `false`.

3. **Custom entry path** - If your runtime entry is elsewhere, specify it:

   ```typescript
   RSPressPluginBuilder.create({
     runtime: {
       entry: './src/runtime/index.ts',
     },
   });
   ```

### CSS module imports return undefined

**Symptom:** `import styles from './foo.module.css'` returns an empty object.

**Solution:** The runtime bundle uses `namedExport: false`. Use default import
syntax, not named imports:

```typescript
// Correct
import styles from './component.module.css';
styles.myClass;

// Incorrect
import { myClass } from './component.module.css';
```

For more RSPress-specific issues, see
[RSPress Plugin Setup - Troubleshooting](./guides/rspress-plugins.md#troubleshooting).

## Getting Help

If you can't resolve an issue:

1. **Check the build output** - Run with verbose logging:

   ```bash
   DEBUG=* rslib build --env-mode dev
   ```

2. **Inspect generated config:**

   ```bash
   rslib inspect --verbose
   ```

3. **Review intermediate files:**

   ```bash
   ls -la .rslib/
   ```

4. **Open an issue** - Include:
   - rslib-builder version
   - Node.js version
   - Minimal reproduction
   - Full error output
