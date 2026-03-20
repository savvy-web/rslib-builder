# @savvy-web/rslib-builder

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
