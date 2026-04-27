import type { Rspack } from "@rsbuild/core";

/**
 * Disable rspack runtime-chunk extraction and async chunk splitting.
 *
 * @remarks
 * Sets `optimization.runtimeChunk = false` and `optimization.splitChunks = false`
 * on the rspack configuration. This prevents the webpack-runtime extraction
 * that produced invalid ESM for multi-entry libraries (chunks where the
 * webpack-require runtime symbol was both imported from a sibling and
 * re-declared locally). Used inside `LibConfig.tools.rspack` to override
 * rslib's `composeFormatConfig` defaults (`runtimeChunk: { name: ... }` for
 * multi-entry ESM bundles, and `splitChunks: { chunks: 'async' }`).
 *
 * Modern-module's own ESM-aware shared module extraction is unaffected and
 * may still emit clean sibling ESM chunks for code shared across entries.
 * Those chunks have valid `import` / `export` bindings and load fine under
 * Node — they were not the bug being avoided.
 *
 * @param config - The rspack configuration to mutate in place.
 *
 * @example
 * ```ts
 * tools: { rspack: disableSharedChunks }
 * ```
 *
 * @internal
 */
export function disableSharedChunks(config: Rspack.Configuration): void {
	config.optimization ??= {};
	config.optimization.runtimeChunk = false;
	config.optimization.splitChunks = false;
}
