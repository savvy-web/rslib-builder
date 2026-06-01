---
"@savvy-web/rslib-builder": minor
---

## Features

* `RSPressPluginBuilder` now emits the React runtime **bundleless** (per-file transpile) into `dist/<mode>/runtime/` instead of compiling it into a single `runtime/index.js` bundle. This mirrors RSPress's own plugin pattern (e.g. `@rspress/plugin-algolia`): each component compiles to its own `.js` next to its CSS module, `react`/`@theme` stay external, and `import.meta.env` is left untouched so RSPress resolves `import.meta.env.SSG_MD` per site build. Shipping per-file output lets plugins register individual runtime components by file path via `globalUIComponents` / `resolve.alias` against the published files, and keeps SSG-MD (HTML vs markdown) dual-mode rendering working — both of which a frozen single bundle broke. A bundled `runtime/index.d.ts` is still emitted so the published `./runtime` export's `types` condition resolves. The runtime lib drops the previous `bundle: true` config, the CSS-injection `BannerPlugin`, and the chunk-splitting overrides, which are unnecessary for per-file output.
