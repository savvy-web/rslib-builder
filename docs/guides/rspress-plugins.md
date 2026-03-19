# RSPress Plugin Setup

Build RSPress plugins with dual-bundle architecture using `RSPressPluginBuilder`.
This guide covers project structure, configuration, and publishing for RSPress
plugin packages.

## Table of Contents

- [Overview](#overview)
- [Plugin Setup](#plugin-setup)
- [Website Setup](#website-setup)
- [Configuration Reference](#configuration-reference)
- [Build and Publish](#build-and-publish)
- [Troubleshooting](#troubleshooting)

## Overview

RSPress plugins typically need two bundles:

- **Plugin bundle** - Node.js code that hooks into the RSPress build system
  (always generated)
- **Runtime bundle** - React components rendered in the browser
  (auto-detected or explicit)

`RSPressPluginBuilder` handles both in a single configuration, with built-in
externals, React JSX compilation, CSS modules, and API model generation.

## Plugin Setup

### Project Structure

A typical RSPress plugin monorepo:

```text
my-rspress-plugin/
├── plugin/                     # Plugin package workspace
│   ├── src/
│   │   ├── index.ts           # Plugin entry (Node.js)
│   │   └── runtime/
│   │       └── index.tsx      # Runtime entry (React components)
│   ├── rslib.config.ts
│   ├── tsconfig.json
│   └── package.json
└── sites/
    └── docs/                   # Documentation website workspace
        ├── docs/              # Markdown content
        ├── rspress.config.ts
        ├── tsconfig.json
        └── package.json
```

### Package.json

The plugin package.json needs dual exports for the plugin and runtime entries:

```json
{
  "name": "rspress-plugin-my-feature",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./runtime": "./src/runtime/index.tsx"
  },
  "peerDependencies": {
    "@rspress/core": ">=2.0.0-alpha"
  },
  "devDependencies": {
    "@rsbuild/plugin-react": "^1.0.0",
    "@savvy-web/rslib-builder": "^0.18.0",
    "@rslib/core": "^0.6.0",
    "@types/react": "^19.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

### TypeScript Configuration

Use the RSPress plugin preset:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@savvy-web/rslib-builder/tsconfig/rspress/plugin.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

This preset enables `jsx: "react-jsx"`, `module: "esnext"`,
`moduleResolution: "bundler"`, and strict mode.

### Build Configuration

#### Zero-Config

The simplest configuration:

```typescript
// rslib.config.ts
import { RSPressPluginBuilder } from '@savvy-web/rslib-builder';

export default RSPressPluginBuilder.create();
```

This auto-detects the runtime entry if `src/runtime/index.tsx` exists,
applies built-in RSPress externals, and enables API model generation.

#### Customized

```typescript
// rslib.config.ts
import { RSPressPluginBuilder } from '@savvy-web/rslib-builder';

export default RSPressPluginBuilder.create({
  plugin: {
    externals: ['typescript', 'shiki'],
  },
  runtime: {
    externals: ['@rspress/plugin-llms'],
  },
  dtsBundledPackages: ['picocolors'],
});
```

### Plugin Entry

The plugin entry (`src/index.ts`) exports an RSPress plugin function:

```typescript
import type { RspressPlugin } from '@rspress/core';

export function pluginMyFeature(): RspressPlugin {
  return {
    name: 'rspress-plugin-my-feature',
    globalUIComponents: [
      [require.resolve('./runtime/index.js'), { /* props */ }],
    ],
  };
}
```

### Runtime Entry

The runtime entry (`src/runtime/index.tsx`) exports React components:

```tsx
import styles from './styles.module.css';

export default function MyComponent() {
  return <div className={styles.container}>Hello from RSPress plugin</div>;
}
```

### CSS Modules

Runtime bundles are configured with CSS module support out of the box:

- `namedExport: false` - Use default imports (`import styles from './foo.module.css'`)
- `exportLocalsConvention: "camelCaseOnly"` - Class names are camelCased

The runtime lib automatically injects a CSS import at the top of the bundle
output so styles are loaded when the component is used.

### Required Peer Dependencies

The runtime bundle dynamically imports `@rsbuild/plugin-react`. Install it as
a dev dependency:

```bash
pnpm add -D @rsbuild/plugin-react react @types/react react-dom
```

## Website Setup

### Documentation Site Workspace

```text
sites/docs/
├── docs/
│   ├── index.md
│   └── guide.md
├── rspress.config.ts
├── tsconfig.json
└── package.json
```

### Website TypeScript Configuration

Use the RSPress website preset:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@savvy-web/rslib-builder/tsconfig/rspress/website.json"
}
```

This preset includes DOM lib types and MDX file support, with
`jsx: "react-jsx"` and bundler module resolution.

### RSPress Site Configuration

```typescript
// rspress.config.ts
import { defineConfig } from 'rspress/config';
import { pluginMyFeature } from 'rspress-plugin-my-feature';

export default defineConfig({
  root: 'docs',
  plugins: [pluginMyFeature()],
});
```

During development, link the plugin workspace so changes are reflected
immediately in the doc site.

## Configuration Reference

### RSPressPluginBuilderOptions

| Option | Type | Default | Description |
| :----- | :--- | :------ | :---------- |
| `plugin` | `RSPressPluginBundleOptions` | `{}` | Plugin bundle configuration |
| `runtime` | `RSPressPluginBundleOptions \| false` | auto-detect | Runtime bundle configuration |
| `apiModel` | `ApiModelOptions \| boolean` | `true` | API model generation |
| `dtsBundledPackages` | `string[]` | `[]` | Packages to bundle in declarations |
| `transform` | `TransformPackageJsonFn` | - | Custom package.json transform |
| `tsconfigPath` | `string` | - | Custom tsconfig path |
| `targets` | `BuildMode[]` | `["dev", "npm"]` | Build modes to produce |
| `copyPatterns` | `(string \| CopyPatternConfig)[]` | `[]` | Static files to copy |

### RSPressPluginBundleOptions

Options shared by both plugin and runtime bundles:

| Option | Type | Default | Description |
| :----- | :--- | :------ | :---------- |
| `entry` | `string` | See below | Entry point path |
| `externals` | `(string \| RegExp)[]` | `[]` | Additional externals |
| `plugins` | `RsbuildPlugin[]` | `[]` | Additional Rsbuild plugins |
| `define` | `Record<string, string>` | `{}` | Additional define constants |

**Default entries:**

- Plugin: `"./src/index.ts"`
- Runtime: `"./src/runtime/index.tsx"`

### Built-in Externals

#### RSPRESS_PLUGIN_EXTERNALS

Always applied to the plugin bundle:

- `@rspress/core`

#### RSPRESS_RUNTIME_EXTERNALS

Always applied to the runtime bundle:

- `react`
- `react/jsx-runtime`
- `react/jsx-dev-runtime`
- `@rspress/core`
- `@theme`

Additional externals specified via `plugin.externals` or `runtime.externals`
are merged with these built-in lists.

### Runtime Auto-Detection

When the `runtime` option is not specified, RSPressPluginBuilder checks for
the existence of `src/runtime/index.tsx` in the project root:

- File exists: runtime bundle is enabled automatically
- File does not exist: runtime bundle is skipped
- `runtime: false`: runtime bundle is explicitly disabled
- `runtime: { ... }`: runtime bundle is enabled with custom options

### API Model Generation

API model generation is enabled by default (`apiModel: true`). This produces:

- `<package>.api.json` for documentation tooling
- `tsdoc-metadata.json` for downstream tools
- Resolved `tsconfig.json` for virtual TS environments

The API model is generated only for the plugin bundle. The runtime bundle
generates DTS files with a `runtime` path prefix but does not produce a
separate API model.

See [API Model Generation](./configuration.md#api-model-generation) for
full configuration options.

### Define Constants

Both bundles automatically define `import.meta.env` to pass through the
RSPress environment. Additional constants can be added per-bundle:

```typescript
RSPressPluginBuilder.create({
  plugin: {
    define: {
      '__PLUGIN_VERSION__': JSON.stringify('1.0.0'),
    },
  },
});
```

## Build and Publish

### Build Modes

RSPressPluginBuilder uses the same build modes as NodeLibraryBuilder:

```bash
rslib build --env-mode dev   # Development: source maps, unminified
rslib build --env-mode npm   # Production: optimized for publishing
```

### Output Structure

```text
dist/
├── dev/                       # Dev mode output
│   ├── index.js              # Plugin bundle
│   ├── index.d.ts
│   ├── runtime/
│   │   ├── index.js          # Runtime bundle
│   │   └── index.d.ts
│   └── package.json
└── npm/                       # Npm mode output
    ├── index.js
    ├── index.d.ts
    ├── runtime/
    │   ├── index.js
    │   └── index.d.ts
    ├── package.json
    └── <package>.api.json     # API model (npm mode only)
```

### Publish Targets

Multi-registry publishing works the same as NodeLibraryBuilder. Configure
`publishConfig.targets` in your package.json:

```json
{
  "publishConfig": {
    "access": "public",
    "targets": ["npm", "github"]
  }
}
```

See [Publish Targets](./configuration.md#publish-targets) for details.

### Package.json Transformation

The plugin bundle includes PackageJsonTransformPlugin, which applies the
same automatic transforms as NodeLibraryBuilder:

- Resolves PNPM `catalog:` and `workspace:` references
- Updates export paths from `.ts`/`.tsx` to `.js`
- Adds `types` conditions to exports
- Sets `private: true` for dev builds
- Generates the `files` array

Custom transforms are supported via the `transform` option.

## Troubleshooting

### Missing @rsbuild/plugin-react

**Symptom:**

```text
@rsbuild/plugin-react is required for RSPress runtime bundles.
Install it as a dev dependency: pnpm add -D @rsbuild/plugin-react
```

**Solution:** Install the React plugin as a dev dependency:

```bash
pnpm add -D @rsbuild/plugin-react
```

This error only occurs when the runtime bundle is enabled (either
auto-detected or explicitly configured).

### Runtime Not Detected

**Symptom:** Runtime bundle is not generated even though you have runtime
components.

**Common causes:**

1. **Wrong file path** - The auto-detection checks for
   `src/runtime/index.tsx` specifically. Ensure the file exists at that
   exact path.

2. **Wrong file extension** - The default entry is `.tsx`, not `.ts`.
   If your runtime entry uses a different extension, specify it explicitly:

   ```typescript
   RSPressPluginBuilder.create({
     runtime: {
       entry: './src/runtime/index.ts',
     },
   });
   ```

3. **Runtime explicitly disabled** - Check that you haven't set
   `runtime: false`.

### CSS Modules Not Working

**Symptom:** CSS module imports return undefined or styles are not applied.

**Common causes:**

1. **Using named exports** - The runtime bundle sets
   `cssModules.namedExport: false`. Use default import syntax:

   ```typescript
   // Correct
   import styles from './component.module.css';

   // Incorrect - will not work
   import { container } from './component.module.css';
   ```

2. **Missing .module.css extension** - Only files with `.module.css` are
   treated as CSS modules. Regular `.css` files are processed as global
   styles.

### Plugin Bundle Targeting Wrong Environment

**Symptom:** Plugin code runs in the browser instead of Node.js, or vice
versa.

**Expected behavior:** The plugin bundle targets `node` and the runtime
bundle targets `web`. These are set automatically by RSPressPluginBuilder
and cannot be overridden.

### API Model Not Generated

**Symptom:** No `.api.json` file in the output.

**Common causes:**

1. **Dev mode build** - API model is only generated for npm mode:

   ```bash
   rslib build --env-mode npm
   ```

2. **API model disabled** - Check that you haven't set `apiModel: false`.

For general build issues, see the main [Troubleshooting](../troubleshooting.md)
guide.
