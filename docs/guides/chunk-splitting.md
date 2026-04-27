# Chunk splitting

How `NodeLibraryBuilder` and `RSPressPluginBuilder` structure rspack output, and how to opt out.

## Default policy

Both builders produce **self-contained, single-chunk-per-entry** output for the entry files in your `package.json` exports. Each `LibConfig` they emit sets:

- `optimization.runtimeChunk` to `false`
- `optimization.splitChunks` to `false`

This is enforced uniformly across every build variant: main libs, dual-format secondary libs, per-entry format overrides, virtual entries, and the RSPress plugin and runtime libs.

Modern-module's natural ESM-aware shared module extraction may still emit clean sibling ESM chunks (for example, a `512.js` containing a shared internal module, with the entries doing `import { x } from "./512.js"`). Those are valid ESM and load correctly under Node — they are not the bug being avoided.

## Why

rslib's default behavior, for ESM bundles with two or more entries that share internal modules, was to extract a webpack-runtime chunk that declared `__webpack_require__`. The other chunks both imported that symbol AND re-declared it locally as a function — invalid ESM that Node rejects with:

```text
SyntaxError: Identifier '__webpack_require__' has already been declared
```

Disabling `runtimeChunk` and `splitChunks` at the rspack-config level avoids the runtime extraction entirely. modern-module's clean ESM-aware sibling chunks still apply for code shared across entries, but those chunks have valid `import` / `export` bindings and load fine under Node.

## Escape hatch

If you need rslib's default chunk-splitting behavior back (for example, to share runtime code across entries with the same loader semantics rsbuild uses for browser bundles), wrap the config function and merge custom `tools.rspack` into each `LibConfig`:

```ts
// rslib.config.ts
import type { ConfigParams } from "@rslib/core";
import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

const baseConfig = NodeLibraryBuilder.create({ /* your options */ });

export default async (env: ConfigParams) => {
  const config = await baseConfig(env);
  for (const lib of config.lib ?? []) {
    if (!lib) continue;
    lib.tools = {
      ...(lib.tools ?? {}),
      rspack(rspackConfig) {
        rspackConfig.optimization ??= {};
        rspackConfig.optimization.runtimeChunk = { name: "runtime" };
        rspackConfig.optimization.splitChunks = { chunks: "async" };
      },
    };
  }
  return config;
};
```

The override sits at the lib-config level, where rslib's own `composeFormatConfig` is merged. Setting `performance.chunkSplit.strategy` at the rsbuild level does not work — rslib's `tools.rspack.optimization` takes precedence.

For the `RSPressPluginBuilder` runtime lib only, the existing `tools.rspack` is already a function (it injects a CSS banner). When overriding it, you must call the original function logic too — for example, by inspecting `lib.id` and merging instead of replacing.

## See also

- [Configuration reference](./configuration.md)
- [Issue #158](https://github.com/savvy-web/rslib-builder/issues/158) — original bug history.
