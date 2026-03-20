# rspress-plugin example (plugin)

RSPress plugin with dual-bundle architecture using RSPressPluginBuilder.

- Plugin entry: `src/index.ts` — exports HelloPlugin
- Runtime entry: `src/runtime/index.tsx` — React components with CSS modules
- Components: HelloBanner, FeatureCard with co-located CSS modules
- Peer dep: `@rspress/core`
- Depends on: `@savvy-web/rslib-builder` via `workspace:*`
- Build: `turbo run build:dev build:prod`
