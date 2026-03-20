---
"@savvy-web/rslib-builder": minor
---

## Features

* `RSPressPluginBuilder.create()` — zero-config builder for RSPress plugins with plugin + optional runtime bundles
* Runtime auto-detection from `src/runtime/index.tsx`
* TSConfig presets: `tsconfig/rspress/plugin.json` and `tsconfig/rspress/website.json` with `${configDir}` path resolution
* `tsconfigPreset` option on DtsPlugin for custom tsconfig preset selection
* `overrideEntries` option on DtsPlugin to prevent cross-contamination in dual-lib builds
* `LibraryTSConfigFile` and `TSConfigFile` types exported for DtsPlugin consumers
* Optional peer dependencies for React ecosystem (`@rsbuild/plugin-react`, `react`, `@types/react`, `react-dom`)

## Bug Fixes

* BannerPlugin CSS injection scoped to JS files via `include: /index\.js$/`
* Runtime DTS no longer cross-contaminates with plugin DTS in dual-lib builds
* `PackageJsonTransformPlugin` collapseIndex no longer produces wrong runtime export paths

## Other

* Monorepo structure with `package/`, `examples/`, and `lib/` workspaces
* Turbo-orchestrated build chain across all workspaces
