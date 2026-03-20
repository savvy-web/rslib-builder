# rspress-plugin example (site)

RSPress doc site consuming rspress-plugin-fixture via workspace:*.
Validates full plugin-to-site build pipeline.

- Docs: `docs/` (MDX pages importing plugin runtime components)
- Config: `rspress.config.ts` (uses HelloPlugin)
- Depends on: `rspress-plugin-fixture` via `workspace:*`
- Build: `rspress build`
- Dev: `pnpm dev`
