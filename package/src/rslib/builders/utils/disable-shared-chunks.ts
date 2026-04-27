import type { Rspack } from "@rsbuild/core";

/**
 * Force a self-contained, single-chunk-per-entry rspack output.
 *
 * @remarks
 * Disables rslib's runtime-chunk extraction and cross-chunk splitting, which
 * would otherwise produce invalid ESM for multi-entry libraries (chunks where
 * `__webpack_require__` is both imported and re-declared). Used inside
 * `LibConfig.tools.rspack` to override rslib's `composeFormatConfig` defaults
 * (`runtimeChunk: { name: ... }` for multi-entry ESM bundles, and
 * `splitChunks: { chunks: 'async' }`).
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
