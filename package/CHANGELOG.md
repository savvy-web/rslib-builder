# @savvy-web/rslib-builder

## 0.21.2

### Bug Fixes

* [`72f8f15`](https://github.com/savvy-web/rslib-builder/commit/72f8f155220b7ba6f91f84ad22363af2c2c6dc87) Better handling of pnpm partial catalogs

## 0.21.1

### Bug Fixes

* [`0fb1dd4`](https://github.com/savvy-web/rslib-builder/commit/0fb1dd4db578ea6bf967f88e738d3c220aacc86f) Fixed a broken `types` field in the generated `package.json` exports map when using `exportsAsIndexes: true` with a dual-format build (`format: ["esm", "cjs"]`) and nested export keys (e.g. `"./group/alpha"`).

Previously, declarations were emitted with a hyphen-flattened filename (`esm/group-alpha.d.ts`) while the `types` field pointed at a directory-style path (`esm/group/alpha.d.ts`), causing TypeScript to fail to resolve types for those exports. Now declarations are emitted alongside the JS output as `esm/group/alpha/index.d.ts` (and `cjs/.../index.d.cts`), so `types`, `import`, and `require` all resolve correctly.

## 0.21.0

### Features

* [`02a6e53`](https://github.com/savvy-web/rslib-builder/commit/02a6e539eb3ca308a952c41bf35669472243737b) `RSPressPluginBuilder` now emits the React runtime **bundleless** (per-file transpile) into `dist/<mode>/runtime/` instead of compiling it into a single `runtime/index.js` bundle. This mirrors RSPress's own plugin pattern (e.g. `@rspress/plugin-algolia`): each component compiles to its own `.js` next to its CSS module, `react`/`@theme` stay external, and `import.meta.env` is left untouched so RSPress resolves `import.meta.env.SSG_MD` per site build. Shipping per-file output lets plugins register individual runtime components by file path via `globalUIComponents` / `resolve.alias` against the published files, and keeps SSG-MD (HTML vs markdown) dual-mode rendering working — both of which a frozen single bundle broke. A bundled `runtime/index.d.ts` is still emitted so the published `./runtime` export's `types` condition resolves. The runtime lib drops the previous `bundle: true` config, the CSS-injection `BannerPlugin`, and the chunk-splitting overrides, which are unnecessary for per-file output.

### Dependencies

* | [`6ffb679`](https://github.com/savvy-web/rslib-builder/commit/6ffb679d48eae9b52c4ee1e90c147ac91b36858d) | Dependency | Type    | Action  | From    | To |
  | :------------------------------------------------------------------------------------------------------ | :--------- | :------ | :------ | :------ | -- |
  | @typescript-eslint/parser                                                                               | dependency | updated | ^8.60.0 | ^8.60.1 |    |

## 0.20.12

### Bug Fixes

* [`c108769`](https://github.com/savvy-web/rslib-builder/commit/c1087699cb86f55413368d108563a508283a58ed) Preserve `workspace:` and `catalog:` dependency specifiers in dual-format dev builds. The package.json transform treated any rsbuild environment not named exactly `dev` as a production build, but dual-format builds name their dev environments `dev-esm` and `dev-cjs`. Their `dist/dev` manifests therefore had specifiers resolved to fixed versions, which broke pnpm `linkDirectory` resolution of the local dev output. The build mode is now derived from the explicit mode option with an environment-name prefix fallback.

### Dependencies

* | [`f295f09`](https://github.com/savvy-web/rslib-builder/commit/f295f0901d96d640ac4844b4e7e4b8c1702fcb24) | Dependency | Type    | Action | From   | To |
  | :------------------------------------------------------------------------------------------------------ | :--------- | :------ | :----- | :----- | -- |
  | @rsbuild/core                                                                                           | dependency | updated | ^2.0.8 | ^2.0.9 |    |

## 0.20.11

### Dependencies

* | [`1418e62`](https://github.com/savvy-web/rslib-builder/commit/1418e621d31c895fd0847e85f883b10fdcd41233) | Dependency     | Type    | Action  | From    | To |
  | :------------------------------------------------------------------------------------------------------ | :------------- | :------ | :------ | :------ | -- |
  | eslint                                                                                                  | dependency     | updated | ^10.4.0 | ^10.4.1 |    |
  | @rslib/core                                                                                             | peerDependency | updated | ^0.21.0 | ^0.22.0 |    |
  | @rslib/core                                                                                             | devDependency  | updated | ^0.21.5 | ^0.22.0 |    |

## 0.20.10

### Dependencies

* | [`908b61e`](https://github.com/savvy-web/rslib-builder/commit/908b61e47292e0d6a6ae06c74c1b39d9df598a00) | Dependency | Type    | Action                | From                  | To |
  | :------------------------------------------------------------------------------------------------------ | :--------- | :------ | :-------------------- | :-------------------- | -- |
  | @typescript/native-preview                                                                              | dependency | updated | ^7.0.0-dev.20260523.1 | ^7.0.0-dev.20260527.2 |    |
  | tmp                                                                                                     | dependency | updated | ^0.2.4                | ^0.2.7                |    |

## 0.20.9

### Dependencies

* | [`c85eb0a`](https://github.com/savvy-web/rslib-builder/commit/c85eb0aa1036cca63029f2b12ad6dc24617463f9) | Dependency    | Type    | Action    | From      | To |
  | :------------------------------------------------------------------------------------------------------ | :------------ | :------ | :-------- | :-------- | -- |
  | @pnpm/lockfile.fs                                                                                       | dependency    | updated | ^1100.1.1 | ^1100.1.2 |    |
  | @rsbuild/core                                                                                           | dependency    | updated | ^2.0.7    | ^2.0.8    |    |
  | tmp                                                                                                     | dependency    | updated | ^0.2.5    | ^0.2.7    |    |
  | @pnpm/types                                                                                             | devDependency | updated | ^1101.1.1 | ^1101.2.0 |    |

## 0.20.8

### Dependencies

* | [`2a73665`](https://github.com/savvy-web/rslib-builder/commit/2a73665ad88f2a1ad0908f8e9b58656113926b4f) | Dependency | Type    | Action  | From    | To |
  | :------------------------------------------------------------------------------------------------------ | :--------- | :------ | :------ | :------ | -- |
  | @typescript-eslint/parser                                                                               | dependency | updated | ^8.59.4 | ^8.60.0 |    |

## 0.20.7

### Dependencies

* | [`809f361`](https://github.com/savvy-web/rslib-builder/commit/809f36167f5bd83b7cae29570367c3bec1fc6300) | Dependency | Type    | Action                | From                  | To |
  | :------------------------------------------------------------------------------------------------------ | :--------- | :------ | :-------------------- | :-------------------- | -- |
  | @typescript/native-preview                                                                              | dependency | updated | ^7.0.0-dev.20260519.1 | ^7.0.0-dev.20260523.1 |    |

## 0.20.6

### Dependencies

* | [`6f8c67d`](https://github.com/savvy-web/rslib-builder/commit/6f8c67db67a60a4ef3d9cd0e8b8f4e8a1d8bda8f) | Dependency    | Type    | Action    | From      | To |
  | :------------------------------------------------------------------------------------------------------ | :------------ | :------ | :-------- | :-------- | -- |
  | @rsbuild/core                                                                                           | dependency    | updated | ^2.0.6    | ^2.0.7    |    |
  | tmp                                                                                                     | dependency    | updated | ^0.2.4    | ^0.2.5    |    |
  | @pnpm/types                                                                                             | devDependency | updated | ^1101.0.0 | ^1101.1.1 |    |

## 0.20.5

### Dependencies

* | [`2edb61d`](https://github.com/savvy-web/rslib-builder/commit/2edb61dfbc3620b9d335fc9331e456c9b75cf420) | Dependency | Type    | Action                | From                  | To |
  | :------------------------------------------------------------------------------------------------------ | :--------- | :------ | :-------------------- | :-------------------- | -- |
  | @types/node                                                                                             | dependency | updated | ^25.7.0               | ^25.9.1               |    |
  | @types/react                                                                                            | dependency | updated | ^19.2.14              | ^19.2.15              |    |
  | @typescript/native-preview                                                                              | dependency | updated | ^7.0.0-dev.20260513.1 | ^7.0.0-dev.20260519.1 |    |

## 0.20.4

### Bug Fixes

* [`4186537`](https://github.com/savvy-web/rslib-builder/commit/4186537fe272a6fd7bd51d198630e12e214e41e0) Fix `bin` paths in built `package.json` dropping leading `./` for npm 11.x compatibility.

npm 10/11 silently drops bin entries whose values start with `./`, leaving packages with no executable after publish — no CI error, just a broken `npx` invocation discovered by users. The builder now emits `bin/cli.js` instead of `./bin/cli.js`. The new `normalizeBinPaths` helper is also exported for direct use in custom transforms.

### Dependencies

* | [`c0d7a9c`](https://github.com/savvy-web/rslib-builder/commit/c0d7a9caf6eceec7e4eb39b8de6d5e8e12bcd4b6) | Dependency | Type    | Action                | From                  | To |
  | :------------------------------------------------------------------------------------------------------ | :--------- | :------ | :-------------------- | :-------------------- | -- |
  | @types/node                                                                                             | dependency | updated | ^25.6.0               | ^25.7.0               |    |
  | @typescript/native-preview                                                                              | dependency | updated | ^7.0.0-dev.20260424.2 | ^7.0.0-dev.20260513.1 |    |
  | react                                                                                                   | dependency | updated | ^19.2.5               | ^19.2.6               |    |
  | react-dom                                                                                               | dependency | updated | ^19.2.5               | ^19.2.6               |    |

## 0.20.3

### Bug Fixes

* [`2b29b24`](https://github.com/savvy-web/rslib-builder/commit/2b29b24b81041584a1d6e6a07a243385b6c45d4f) Multi-entry packages no longer emit invalid ESM where `__webpack_require__` is both imported from a sibling chunk and re-declared locally. Both `NodeLibraryBuilder` and `RSPressPluginBuilder` now disable rspack's runtime-chunk extraction and async chunk splitting on every emitted lib, so the duplicate-declaration `SyntaxError` that broke Node ESM loading on multi-entry libraries is gone. Modern-module's natural ESM-aware sibling chunk extraction is preserved — those chunks have valid `import` / `export` bindings and load correctly. See the new chunk splitting guide for the documented escape hatch. Fixes issue #158.

## 0.20.2

### Other

* [`7b18ec0`](https://github.com/savvy-web/rslib-builder/commit/7b18ec094c5732d0c3e19a6cd2442865afd2e948) Bumps @rsbuild/core to 2.0.0

## 0.20.1

### Other

* [`7a2282d`](https://github.com/savvy-web/rslib-builder/commit/7a2282dab4e404d806bef7d03c901856c323cdde) Switch to catalog dependency versioning

## 0.20.0

### Breaking Changes

* [`41562fc`](https://github.com/savvy-web/rslib-builder/commit/41562fc4e8dd0b3fe977870845bafb8dd5c16beb) TypeScript 5.x is no longer supported. Upgrade your project to TypeScript 6.0 before upgrading to this version.
* The `@microsoft/api-extractor` peer dependency has been removed. If you pinned a specific version of API Extractor in your own `package.json`, that entry can be removed.
* The following TypeScript compiler options are no longer recognized in `tsconfig.json` files processed by the builder, as TypeScript 6 removes them:
  * `module`: `AMD`, `UMD`, `System`, `None`
  * `moduleResolution`: `Classic`
  * `target`: `ES3`
  * `importsNotUsedAsValues` (replaced by `verbatimModuleSyntax` in TS 5.0+)

### Features

* [`41562fc`](https://github.com/savvy-web/rslib-builder/commit/41562fc4e8dd0b3fe977870845bafb8dd5c16beb) TypeScript 6.0 is now supported. The `typescript` peer dependency requires `^6.0.0`.
* `@microsoft/api-extractor` is now a direct dependency. Consumers no longer need to install it as a peer dependency — it ships with `rslib-builder`.
* API Extractor now uses the project's own TypeScript installation rather than its bundled copy. This ensures correct type analysis when building with TypeScript 6.

## 0.19.1

### Bug Fixes

* [`18891cc`](https://github.com/savvy-web/rslib-builder/commit/18891cc10a60e36265fc0cb845e29a2b188ab5e5) Pins workspace-tools to 0.41.0 due to breaking upstream change.

## 0.19.0

### Features

* [`3e8e270`](https://github.com/savvy-web/rslib-builder/commit/3e8e270ba96c347912669c25be9c67ba94366776) `RSPressPluginBuilder.create()` — zero-config builder for RSPress plugins with plugin + optional runtime bundles
* Runtime auto-detection from `src/runtime/index.tsx`
* TSConfig presets: `tsconfig/rspress/plugin.json` and `tsconfig/rspress/website.json` with `${configDir}` path resolution
* `tsconfigPreset` option on DtsPlugin for custom tsconfig preset selection
* `overrideEntries` option on DtsPlugin to prevent cross-contamination in dual-lib builds
* `LibraryTSConfigFile` and `TSConfigFile` types exported for DtsPlugin consumers
* Optional peer dependencies for React ecosystem (`@rsbuild/plugin-react`, `react`, `@types/react`, `react-dom`)

### Bug Fixes

* [`3e8e270`](https://github.com/savvy-web/rslib-builder/commit/3e8e270ba96c347912669c25be9c67ba94366776) BannerPlugin CSS injection scoped to JS files via `include: /index\.js$/`
* Runtime DTS no longer cross-contaminates with plugin DTS in dual-lib builds
* `PackageJsonTransformPlugin` collapseIndex no longer produces wrong runtime export paths

### Other

* [`3e8e270`](https://github.com/savvy-web/rslib-builder/commit/3e8e270ba96c347912669c25be9c67ba94366776) Monorepo structure with `package/`, `examples/`, and `lib/` workspaces
* Turbo-orchestrated build chain across all workspaces

## 0.18.3

### Dependencies

* | [`d9fb342`](https://github.com/savvy-web/rslib-builder/commit/d9fb342f220c21ba2ebccc0a4b968c3a7e0f6a07) | Dependency | Type    | Action | From   | To |
  | :------------------------------------------------------------------------------------------------------ | :--------- | :------ | :----- | :----- | -- |
  | @savvy-web/changesets                                                                                   | dependency | updated | ^0.5.1 | ^0.5.3 |    |
  | @savvy-web/commitlint                                                                                   | dependency | updated | ^0.4.1 | ^0.4.2 |    |
  | @savvy-web/lint-staged                                                                                  | dependency | updated | ^0.6.0 | ^0.6.1 |    |
  | @savvy-web/vitest                                                                                       | dependency | updated | ^0.2.1 | ^0.2.2 |    |

## 0.18.2

### Bug Fixes

* [`900a87c`](https://github.com/savvy-web/rslib-builder/commit/900a87c8158d7b3e257204de5bee184e07dcd854) Forward `compilerOptions.types` from project tsconfig to temp tsconfig for tsgo declaration generation. Defaults to `["node"]` when not set, fixing tsgo failures resolving `@types/node` with pnpm's symlinked `node_modules`. Fixes #114.

## 0.18.1

### Bug Fixes

* [`5ef9100`](https://github.com/savvy-web/rslib-builder/commit/5ef910098e830ae3b9ca11801338bd74b47e2244) Fix `suppressWarnings` and `forgottenExports` options not being applied in dev mode builds. Previously, the `apiModel` config was only passed to `DtsPlugin` in npm mode, causing warning suppression rules to be ignored in dev builds. In CI environments (where `forgottenExports` defaults to `"error"`), this caused dev builds to fail on warnings that were correctly suppressed in npm builds.

## 0.18.0

### Features

* [`a63b160`](https://github.com/savvy-web/rslib-builder/commit/a63b160b7da551863949cbafb119c9b33fd2a25b) Add granular API Extractor warning suppression via `suppressWarnings` on `ApiModelOptions`. Allows targeting specific warnings by `messageId` and/or text `pattern` with AND logic, instead of blanket category-level settings. Suppressions are evaluated before `forgottenExports` and TSDoc warning handling and take priority over both. Closes #106.

## 0.17.0

### Breaking Changes

* [`491710e`](https://github.com/savvy-web/rslib-builder/commit/491710e2f57364e859fcf251b6964830f6664235) The `transformFiles` callback no longer receives a `target` property in its context object. If your `transformFiles` callback referenced `target`, remove that usage — target-specific transforms should be handled via the `transform` callback instead, which receives `{ mode, target, pkg }` per target.

### Features

* [`491710e`](https://github.com/savvy-web/rslib-builder/commit/491710e2f57364e859fcf251b6964830f6664235) Separate mode from targets in multi-target building. All publish targets from `publishConfig.targets` are now processed uniformly by `PublishTargetPlugin`, producing independent output directories (e.g., `dist/npm`, `dist/github`) with per-target package.json transforms. Previously the first target was treated as "primary" and shared the build staging directory, which prevented correct multi-directory output.

## 0.16.0

### Features

* [`24e5aa1`](https://github.com/savvy-web/rslib-builder/commit/24e5aa1b753e63ad5743c6212258460dda11427e) Reverts control of peerDependencies to module

## 0.15.0

### Features

* [`716087f`](https://github.com/savvy-web/rslib-builder/commit/716087f7f617806f666804fdb0fa05c1a895ddb2) Add `PublishTargetPlugin` for per-target output directories in multi-registry builds
* Add `PublishProtocol` and `PublishTarget` types for multi-registry publishing
* Add `resolvePublishTargets()` function to resolve `publishConfig.targets`
* Wire publish target resolution into build pipeline: primary target passed to `transform` and `transformFiles`
* `PackageJsonTransformPlugin` now exposes `base-package-json` state for per-target copies
* `FilesArrayPlugin` now accepts and passes `target` to `transformFiles` callback
* Add `targets` field to `PublishConfig` interface

### Refactoring

* [`716087f`](https://github.com/savvy-web/rslib-builder/commit/716087f7f617806f666804fdb0fa05c1a895ddb2) Rename `BuildTarget` type to `BuildMode` for API alignment with bun-builder
* Rename `createSingleTarget()` to `createSingleMode()`
* Update `TransformPackageJsonFn` context from `{ target, pkg }` to `{ mode, target, pkg }`
* Rename plugin options: `buildTarget` → `buildMode`, `target` → `mode`

### Dependencies

* [`8eb663f`](https://github.com/savvy-web/rslib-builder/commit/8eb663ff76f1bcb8e6108a0b73bcbeb2cc9c0c59) Upgrade `eslint` from `^9.39.2` to `^10.0.0`
* Upgrade `eslint-plugin-tsdoc` from `^0.5.0` to `^0.5.2`
* Upgrade `@typescript-eslint/parser` from `^8.53.1` to `^8.56.0`

## 0.14.5

### Bug Fixes

* [`4ae13dc`](https://github.com/savvy-web/rslib-builder/commit/4ae13dc450707b3de325029d494dfd972a3eb352) Pins api-extractor version temporarily

## 0.14.4

### Patch Changes

* [`2982720`](https://github.com/savvy-web/rslib-builder/commit/298272091fe670ed6542a51f57753e3a58fbdf3a) Fix catalog resolution for named catalogs from pnpm configDependencies

Reads catalogs from `node_modules/.pnpm-workspace-state-v1.json` as the primary source, with lockfile and workspace manifest as fallbacks. The workspace state file contains all resolved catalogs including those from `configDependencies` plugins that may not appear in the lockfile (e.g., catalogs used only in `peerDependencies`).

## 0.14.3

### Dependencies

* [`0b0bc94`](https://github.com/savvy-web/rslib-builder/commit/0b0bc945fa21df813876738936c3bfdde25460d3) @savvy-web/commitlint: ^0.3.2 → ^0.3.3
* @savvy-web/lint-staged: ^0.4.0 → ^0.4.2

- [`39821cc`](https://github.com/savvy-web/rslib-builder/commit/39821ccdf17e199a8f885c1cdbfc2a26a605c0a3) @savvy-web/lint-staged: ^0.4.2 → ^0.4.3

## 0.14.2

### Patch Changes

* 21606fb: ## Features
  * Support for @savvy-web/changesets

## 0.14.1

### Patch Changes

* a4cadc3: Fix dual-format bin path resolution and compilation
  * Prefix bin paths with format directory in dual format mode (e.g., `./bin/cli.js` → `./esm/bin/cli.js`)
  * Exclude bin entries from secondary format builds so bins are only compiled for the primary format
  * Add E2E test coverage for single-format bin path in package.json

## 0.14.0

### Minor Changes

* a55e9b1: Add `cjsInterop` option that injects a footer snippet into CJS output files so `require('module')` returns the default export directly instead of `{ default: value }`. Named exports are preserved as properties on the default value.

## 0.13.1

### Patch Changes

* 06b7871: Fix dual format builds placing metadata files inside format subdirectories instead of the shared target root.

  In dual format builds (`format: ['esm', 'cjs']`), metadata files (package.json, README, LICENSE, api.json, tsdoc-metadata.json, tsconfig.json) were incorrectly placed inside both `esm/` and `cjs/` subdirectories. They now correctly land at the shared `dist/{target}/` root while JS and DTS files route to their respective format subdirectories via `distPath.js` and the new `dtsPathPrefix` option.

  Additionally, the `files` array in the output package.json now uses directory entries (`esm`, `cjs`) instead of listing individual files under each format directory, and secondary compilations no longer overwrite the primary's processed package.json.

## 0.13.0

### Minor Changes

* a0cd119: Add dual format and per-entry format override support
  * **Dual format**: Pass `format: ['esm', 'cjs']` to build all
    entries in both ESM and CJS, with separate output directories
    and both `import` and `require` export conditions
  * **Per-entry format overrides**: Use `entryFormats` to override
    the format for specific exports (e.g.,
    `{ './markdownlint': 'cjs' }`) while keeping the rest as the
    top-level format
  * **Format-aware DTS**: CJS entries emit `.d.cts` type
    declarations; ESM entries keep `.d.ts`
  * **Format-aware export conditions**: CJS entries use `require`
    condition with `.cjs` extension; dual format entries get both
    `import` and `require` with directory prefixes

### Patch Changes

* c451429: Update dependencies:

  **Dependencies:**

  * @savvy-web/commitlint: ^0.3.1 → ^0.3.2

## 0.12.2

### Patch Changes

* 99a487e: Update dependencies:

  **Dependencies:**

  * tmp: >=0.2.4 → ^0.2.4
  * @savvy-web/lint-staged: ^0.3.1 → ^0.4.0

## 0.12.1

### Patch Changes

* de459ba: Standardize dependencies with @savvy-web/pnpm-plugin-silk

## 0.12.0

### Minor Changes

* 480f29e: ## Multi-entry API model generation

  Replace virtual barrel approach with per-entry API Extractor runs merged into a
  single `.api.json` with multiple `EntryPoint` members.

  ### New behavior

  * API Extractor now runs for **every** entry point (not just the main `"."` export)
  * Per-entry models are merged into a single Package with multiple EntryPoint members
  * Sub-entry canonical references are scoped (e.g., `@scope/pkg/subpath!` instead
    of `@scope/pkg!`)
  * Single-entry packages produce the same output as before (no merge needed)

  ### API changes

  * Added `exportPaths: Record<string, string>` to `ExtractedEntries` interface,
    mapping entry names back to original export keys (e.g., `"nested-one"` to
    `"./nested/one"`) for lossless canonical reference scoping
  * Removed `extractEntriesFromPackageJson` convenience function from public API;
    use `new EntryExtractor().extract(packageJson)` directly
  * Added `mergeApiModels()` internal function for combining per-entry API models

  ### Bundleless mode

  * DtsPlugin now emits individual `.d.ts` files (preserving source structure)
    when `bundle: false`, while still generating a merged API model across all
    entry points
  * The `bundle` option on `DtsPluginOptions` controls whether declarations are
    rolled up per entry (bundle) or emitted individually (bundleless)

  ### Removed

  * Removed virtual barrel generator (`VirtualBarrelGenerator`, `BarrelEntry`,
    `generateApiModelFromBarrel`, `BarrelApiModelResult`)
  * Removed `generateVirtualBarrel` option from `DtsPluginOptions`

  ### Other changes

  * `reportUnsupportedHtmlElements` changed from `false` to `true` in TSDoc config
  * Extracted `resolveTsdocMetadataFilename` utility to deduplicate filename resolution
  * Replaced duplicated CI detection with `TsDocConfigBuilder.isCI()`

## 0.11.0

### Minor Changes

* 9d0b80e: Refactor catalog resolution to support multiple package managers
  * Rename `PnpmCatalog` to `WorkspaceCatalog` with multi-package-manager support
  * Add yarn 4 workspace catalog support via `workspace-tools` package
  * Replace singleton pattern with factory function `createWorkspaceCatalog()`
  * Add dependency injection support to `applyPnpmTransformations()` for plugin reuse
  * Remove dead code: unused `bundle()` method, cache functionality
  * Streamline README documentation

## 0.10.0

### Minor Changes

* e60f7f9: Add `virtualEntries` and `format` options to NodeLibraryBuilder

  ## New Features

  ### `format` Option

  A new top-level `format` option allows specifying the output module format for library builds:

  ```typescript
  NodeLibraryBuilder.create({
    format: "cjs", // or "esm" (default)
  });
  ```

  **Effects:**

  * Sets `package.json` `type` field: `"module"` for ESM, `"commonjs"` for CJS
  * Configures resolved `tsconfig.json` module settings appropriately
  * Controls output file extensions (`.js` for ESM, `.cjs` for CJS)

  ### `virtualEntries` Option

  Virtual entries are special entry points that are bundled like regular entries but:

  * Do NOT generate TypeScript declarations (`.d.ts` files)
  * Are NOT added to `package.json` exports
  * ARE included in the `package.json` files array for publishing

  **Primary use case:** Files like `pnpmfile.cjs` that must be self-contained CommonJS files without type declarations.

  ```typescript
  NodeLibraryBuilder.create({
    format: "esm", // Main library is ESM
    virtualEntries: {
      "pnpmfile.cjs": {
        source: "./src/pnpmfile.ts",
        format: "cjs", // Override format for this entry
      },
    },
  });
  ```

  **Features:**

  * Each virtual entry can specify its own format or inherit from top-level
  * Multiple virtual entries with different formats are supported
  * Virtual-only configurations (no regular exports) are valid
  * Uses separate RSlib lib configs for format isolation

  ## Implementation Details

  * New `VirtualEntryPlugin` exposes virtual entry names and manages files array inclusion
  * `DtsPlugin` skips type generation for entries in the virtual entry set
  * `PackageJsonTransformPlugin` sets the `type` field based on format
  * `TsconfigResolver` outputs format-appropriate module settings in resolved tsconfig
  * `LibraryFormat` type centralized in `src/types/package-json.ts`

  ## New Exports

  * `LibraryFormat` - Type alias for `"esm" | "cjs"`
  * `VirtualEntryConfig` - Interface for virtual entry configuration
  * `VirtualEntryPlugin` - Plugin for handling virtual entries
  * `VirtualEntryPluginOptions` - Plugin options interface

## 0.9.0

### Minor Changes

* 7be6565: Add CI-aware forgotten exports handling and fix declaration generation
  * Forgotten exports now fail the build in CI environments by default (`forgottenExports` defaults to `"error"` when `CI` or `GITHUB_ACTIONS` env vars are set)
  * Local builds warn but succeed by default (`forgottenExports` defaults to `"include"`)
  * Users can override with explicit `apiModel.forgottenExports` option: `"error"`, `"include"`, or `"ignore"`
  * Fix declaration generation when `apiModel` option is not explicitly declared in builder options
  * Add comprehensive E2E tests for API model options and forgotten exports behavior

## 0.8.1

### Patch Changes

* ee04942: Adds standard commitlint system

## 0.8.0

### Minor Changes

* c9ece9f: feat: Generate bundled TypeScript declarations for all entry points
  * DtsPlugin now uses EntryExtractor to discover ALL TypeScript exports from package.json, not just the main export
  * Packages with multiple exports (e.g., `.`, `./utils`, `./types`) now get individual bundled `.d.ts` files for each entry
  * Bin entries are correctly skipped (CLI tools don't need bundled type declarations)
  * Added E2E test infrastructure with fixture packages for integration testing
  * Exported new public utilities: `TsconfigResolver`, `EntryExtractor`, and related types
  * Added `engines.node` requirement (>=24.0.0) to package.json

## 0.7.0

### Minor Changes

* b4df84e: Add automatic export of resolved tsconfig.json when API extraction is enabled.

  The DtsPlugin now generates a flattened tsconfig.json file alongside the API model
  output. This resolved configuration is designed for virtual TypeScript environments
  and documentation tooling:

  * Converts TypeScript enum values to strings (target, module, moduleResolution, jsx)
  * Sets `composite: false` and `noEmit: true` for virtual environment compatibility
  * Excludes path-dependent options (outDir, rootDir, declarationDir, typeRoots)
  * Excludes file selection patterns (include, exclude, files)
  * Uses default @types auto-discovery
  * Includes $schema for IDE support

  The tsconfig.json is excluded from npm publish and copied to localPaths when configured.

## 0.6.0

### Minor Changes

* f8d27c6: Add `forgottenExports` option to `ApiModelOptions` for controlling how API
  Extractor's `ae-forgotten-export` messages are handled. Supports `"include"`
  (default — warn and include), `"error"` (fail the build), and `"ignore"`
  (suppress silently).

  Export `RslibConfigAsyncFn` type from public API to fix TypeScript portability
  error when using `export default NodeLibraryBuilder.create(...)` in pnpm
  workspaces.

## 0.5.0

### Minor Changes

* 264ddee: Add local type definitions to remove external type dependencies from public API
  * Add `CopyPatternConfig` interface for copy pattern configuration, replacing dependency on `@rspack/binding` types
  * Add `PackageJson` and related JSON types (`JsonObject`, `JsonValue`, etc.) with TSDoc-compliant documentation, replacing `type-fest` in public API
  * Simplify TsDocLintPlugin by removing peer dependency checks for ESLint modules (now bundled dependencies)
  * Export new types from public API: `CopyPatternConfig`, `PackageJson`, `JsonObject`, `JsonValue`, `JsonArray`, `JsonPrimitive`

## 0.4.0

### Minor Changes

* f4a26ef: Add TsDocLintPlugin for pre-build TSDoc comment validation

  This release introduces a new `TsDocLintPlugin` that programmatically runs ESLint
  with `eslint-plugin-tsdoc` to validate TSDoc comments before the build process
  begins. This helps catch documentation issues early in the development cycle.

  **New Features:**

  * `TsDocLintPlugin` - Standalone Rsbuild plugin for TSDoc validation
  * `tsdocLint` option in `NodeLibraryBuilder` for easy integration
  * Environment-aware defaults: throws errors in CI, logs errors locally
  * Configuration sharing between `tsdocLint` and `apiModel` options
  * Smart `tsdoc.json` persistence that avoids unnecessary file writes

  **Configuration Options:**

  ```typescript
  NodeLibraryBuilder.create({
    tsdocLint: {
      enabled: true, // Enable/disable linting
      onError: "throw", // 'warn' | 'error' | 'throw'
      include: ["src/**/*.ts"], // Files to lint
      persistConfig: true, // Keep tsdoc.json for IDE integration
      tsdoc: {
        // Custom TSDoc tags
        tagDefinitions: [{ tagName: "@error", syntaxKind: "block" }],
      },
    },
  });
  ```

  **Breaking Changes:** None. This is an opt-in feature.

  **Dependencies:**

  The plugin requires optional peer dependencies when enabled:

  * `eslint`
  * `@typescript-eslint/parser`
  * `eslint-plugin-tsdoc`

  If these packages are not installed, the plugin provides a helpful error message
  explaining how to install them.

  **Improvements:**

  * `TsDocConfigBuilder.writeConfigFile()` now compares existing config files using
    deep equality to avoid unnecessary writes and uses tabs for formatting
  * Added `deep-equal` package for robust object comparison

## 0.3.0

### Minor Changes

* a5354b3: Refactor public API surface and add TSDoc validation tooling.

  **Breaking Changes:**

  * Remove `EntryExtractor`, `PackageJsonTransformer`, and `PnpmCatalog` classes from public exports (now internal implementation details)

  **New Features:**

  * Add `TsDocConfigBuilder` to public API for custom TSDoc configurations
  * Add ESLint with `eslint-plugin-tsdoc` for TSDoc syntax validation
  * Add `lint:tsdoc` npm script and lint-staged integration

  **Improvements:**

  * Convert `PackageJsonTransformer` methods to standalone functions for better testability
  * Add granular type exports (`BuildTarget`, `TransformPackageJsonFn`, option types)
  * Improve TSDoc documentation with `@public` and `@internal` tags throughout

## 0.2.2

### Patch Changes

* 4eb48b7: Unlocks @typescript/native-preview peerDependency version. We just need a newish version.

## 0.2.1

### Patch Changes

* a106f73: Fix path transformations for bin entries and nested public exports.

  **Bin entries**: TypeScript bin entries are now correctly transformed to
  `./bin/{command}.js` instead of stripping the `./src/` prefix. This matches
  RSlib's actual output structure where `"test": "./src/cli/index.ts"` compiles
  to `./bin/test.js`. Non-TypeScript entries are preserved as-is.

  **Public exports**: Paths like `./src/public/tsconfig/root.json` now correctly
  strip both `./src/` and `./public/` prefixes, resulting in `./tsconfig/root.json`
  instead of `./public/tsconfig/root.json`.

* a106f73: Fix localPaths to copy transformed package.json after build completes.

  Previously, when using `apiModel.localPaths`, the package.json was copied during
  the `pre-process` stage before transformations were applied. Now files are copied
  in `onCloseBuild` after the build completes, ensuring the transformed package.json
  (with resolved pnpm references, transformed exports, etc.) is exported.

## 0.2.0

### Minor Changes

* 9d4a183: Add TSDoc configuration support for API Extractor integration.
  * New `TsDocConfigBuilder` class for managing TSDoc configuration
  * Tag group support: core, extended, and discretionary tag categories
  * Custom tag definitions and `supportForTags` auto-derivation
  * `tsdoc.json` persistence with CI-aware defaults (persist locally, skip in CI)
  * `tsdoc-metadata.json` generation for downstream tooling
  * Prettified TSDoc warnings with file:line:column location and color output
  * Configurable warning behavior: "log", "fail", or "ignore" (defaults to "fail" in CI)

## 0.1.2

### Patch Changes

* 2c67617: Fix API model being incorrectly included in npm package. The file is now excluded via negation pattern (`!<filename>`) in the `files` array while still being emitted to dist for local tooling. Also renamed default filename to `<unscopedPackageName>.api.json` following API Extractor convention.

## 0.1.1

### Patch Changes

* 6f503aa: Fix ReDoS vulnerability in `stripSourceMapComment` regex (CWE-1333).

## 0.1.0

### Minor Changes

* ce4d70e: Initial release of RSlib Builder - a streamlined build system for modern
  ECMAScript libraries.

  Build TypeScript packages effortlessly with:

  * **Zero-config bundling** - Automatic entry point detection from package.json
  * **Rolled-up type declarations** - API Extractor integration bundles your
    .d.ts files for clean public APIs
  * **Multi-target builds** - Dev builds with source maps, optimized npm builds
  * **PNPM workspace support** - Resolves catalog: and workspace: references
  * **Self-building** - This package builds itself using NodeLibraryBuilder

  Get started with a simple config:

  ```typescript
  import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

  export default NodeLibraryBuilder.create({
    externals: ["@rslib/core"],
  });
  ```
