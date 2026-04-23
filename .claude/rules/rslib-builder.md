---
paths:
  - "**/rslib.config.ts"
---

# @savvy-web/rslib-builder

Standardized build wrapper over RSlib and API Extractor for TypeScript packages. Handles bundled ESM output, rolled-up `.d.ts` declarations, package.json transformation, multi-registry publishing, and API model generation. Packages configure their build entirely through `rslib.config.ts`.

The file must `export default` the result of a builder's `.create()` method:

```typescript
import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

export default NodeLibraryBuilder.create();
```

Entry points are auto-detected from `package.json` `exports` field. Most packages need zero or minimal options.

## NodeLibraryBuilder

For Node.js libraries. Produces bundled ESM (or CJS) with rolled-up types per entry.

```typescript
NodeLibraryBuilder.create({
  // -- Format --
  format?: "esm" | "cjs" | ("esm" | "cjs")[];  // default: "esm"
  entryFormats?: Record<string, "esm" | "cjs">; // per-entry overrides
  cjsInterop?: boolean;       // require() returns default directly (default: false)

  // -- Entries --
  entry?: Record<string, string | string[]>;  // override auto-detected entries
  exportsAsIndexes?: boolean;  // export paths become dir indexes
  bundle?: boolean;            // default: true. false = bundleless JS (DTS still bundled)
  virtualEntries?: Record<string, { source: string; format?: "esm" | "cjs" }>;

  // -- Build --
  targets?: ("dev" | "npm")[];           // default: ["dev", "npm"]
  externals?: (string | RegExp)[];       // deps to exclude from bundle
  dtsBundledPackages?: string[];         // .d.ts packages to inline (minimatch)
  tsconfigPath?: string;                 // auto-detected if omitted
  plugins?: RsbuildPlugin[];             // additional Rsbuild plugins
  define?: Record<string, string>;       // compile-time constants
  copyPatterns?: (string | CopyPatternConfig)[];  // files to copy to output

  // -- Transforms --
  transform?: (ctx: { mode, target, pkg }) => PackageJson;  // package.json transform
  transformFiles?: (ctx: { compilation, filesArray, mode }) => void | Promise<void>;

  // -- API Model (default: enabled) --
  apiModel?: boolean | ApiModelOptions;  // false to disable
});
```

### Realistic example

```typescript
import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

export default NodeLibraryBuilder.create({
  externals: ["@rslib/core", "@rspack/core", "typescript"],
  copyPatterns: [{ from: "./**/*.json", context: "./src/public" }],
  apiModel: {
    tsdoc: {
      tagDefinitions: [
        { tagName: "@category", syntaxKind: "modifier" },
      ],
    },
  },
  transform({ pkg }) {
    delete pkg.devDependencies;
    delete pkg.scripts;
    return pkg;
  },
});
```

## RSPressPluginBuilder

For RSPress plugins. Dual-bundle architecture: plugin entry (always) + runtime React bundle (auto-detected from `src/runtime/index.tsx`).

```typescript
import { RSPressPluginBuilder } from "@savvy-web/rslib-builder";

export default RSPressPluginBuilder.create({
  // Plugin bundle (always generated)
  plugin?: {
    entry?: string;                   // default: "./src/index.ts"
    externals?: (string | RegExp)[]; // merged with ["@rspress/core"]
    plugins?: RsbuildPlugin[];
    define?: Record<string, string>;
  };

  // Runtime bundle. Auto-detected if src/runtime/index.tsx exists
  runtime?: {
    entry?: string;                   // default: "./src/runtime/index.tsx"
    externals?: (string | RegExp)[]; // merged with react, @rspress/core, @theme
    plugins?: RsbuildPlugin[];        // pluginReact() auto-added
    define?: Record<string, string>;
  } | false;  // false = explicitly disable

  // Shared options
  apiModel?: boolean | ApiModelOptions;  // plugin entry only (default: true)
  dtsBundledPackages?: string[];
  transform?: (ctx: { mode, target, pkg }) => PackageJson;
  tsconfigPath?: string;
  modes?: ("dev" | "npm")[];             // default: ["dev", "npm"]
  copyPatterns?: (string | CopyPatternConfig)[];
});
```

## ApiModelOptions

Both builders enable API model generation by default. Set `apiModel: false` to disable. Generates `<unscopedPackageName>.api.json` in npm mode only.

```typescript
interface ApiModelOptions {
  filename?: string;
  localPaths?: string[];
  forgottenExports?: "include" | "error" | "ignore";
  suppressWarnings?: { messageId?: string; pattern?: string }[];
  tsdocMetadata?: { enabled?: boolean; filename?: string } | boolean;
  tsdoc?: {
    groups?: ("core" | "extended" | "discretionary")[];
    tagDefinitions?: { tagName: string; syntaxKind: "block" | "inline" | "modifier"; allowMultiple?: boolean }[];
    supportForTags?: Record<string, boolean>;
    warnings?: "log" | "fail" | "none";
    lint?: { include?: string[]; onError?: "warn" | "error" | "throw"; persistConfig?: boolean } | boolean;
  };
}
```

## Key Concepts

- **Build modes**: `"dev"` (unminified, source maps) and `"npm"` (optimized). Build via `rslib build --env-mode dev` or `rslib build --env-mode npm`
- **Publish targets**: Resolved from `publishConfig.targets` in package.json. Each target gets its own output dir with per-target package.json transforms
- **`transform`**: Mutate package.json before it is written to dist. Called once per publish target, or once with `target: undefined` if no targets
