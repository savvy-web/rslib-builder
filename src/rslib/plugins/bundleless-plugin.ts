import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";

/**
 * Extracts the root path from a distPath value, handling both string and object formats.
 *
 * @param distPath - The distPath value which can be a string or DistPathConfig object
 * @returns The root path as a string, or undefined if no path is configured
 *
 * @example
 * ```typescript
 * getDistPathRoot('dist') // returns 'dist'
 * getDistPathRoot({ root: 'dist/npm', js: 'js' }) // returns 'dist/npm'
 * getDistPathRoot(undefined) // returns undefined
 * getDistPathRoot({}) // returns undefined
 * ```
 * @public
 */
export function getDistPathRoot(distPath: string | { root?: string } | undefined): string | undefined {
	if (typeof distPath === "string") {
		return distPath;
	}
	return distPath?.root;
}

/**
 * Calculates the number of parent directory levels in a path.
 *
 * @param distPath - The distribution path relative to the package root
 * @returns The number of directory levels in the path
 *
 * @example
 * ```typescript
 * getPathDepth('dist') // returns 1
 * getPathDepth('dist/npm') // returns 2
 * getPathDepth('foo/bar/baz') // returns 3
 * ```
 * @public
 */
export function getPathDepth(distPath: string): number {
	// Remove leading/trailing slashes and split by separator
	const cleaned = distPath.replace(/^\/+|\/+$/g, "");
	if (!cleaned) return 0;
	return cleaned.split("/").length;
}

/**
 * Creates the parent directory prefix based on the depth of the output path.
 *
 * @param depth - The number of parent directories to traverse
 * @returns A string of parent directory references (e.g., "../../")
 *
 * @example
 * ```typescript
 * createParentPrefix(1) // returns "../"
 * createParentPrefix(2) // returns "../../"
 * createParentPrefix(3) // returns "../../../"
 * ```
 * @public
 */
export function createParentPrefix(depth: number): string {
	return "../".repeat(depth);
}

/**
 * Detects the source directory from asset paths by analyzing the pattern.
 *
 * @param assetPaths - Array of asset paths to analyze
 * @param parentPrefix - The expected parent directory prefix (e.g., "../../")
 * @returns The detected source directory name, or null if no consistent pattern found
 *
 * @example
 * ```typescript
 * detectSourceDirectory(["../../src/index.js", "../../src/utils.js"], "../../") // returns "src"
 * detectSourceDirectory(["../../source/index.js"], "../../") // returns "source"
 * detectSourceDirectory(["../../index.js"], "../../") // returns null (no source dir)
 * ```
 * @public
 */
export function detectSourceDirectory(assetPaths: string[], parentPrefix: string): string | null {
	// Find paths that start with the expected parent prefix
	const relevantPaths = assetPaths.filter((path) => path.startsWith(parentPrefix));

	if (relevantPaths.length === 0) {
		return null;
	}

	// Extract the part after the parent prefix
	const pathsAfterPrefix = relevantPaths.map((path) => path.substring(parentPrefix.length));

	// Check if there's a common first directory for ALL files
	const firstDirs = new Set<string>();
	let hasDirectFiles = false;

	for (const path of pathsAfterPrefix) {
		const firstSlash = path.indexOf("/");
		if (firstSlash > 0) {
			// There's a directory before the first slash
			firstDirs.add(path.substring(0, firstSlash));
		} else {
			// This is a file directly at the root (no subdirectory)
			hasDirectFiles = true;
		}
	}

	// If we have files directly at root level, there's no source directory
	if (hasDirectFiles) {
		return null;
	}

	// If all paths share the same first directory, that's likely the source directory
	if (firstDirs.size === 1) {
		return Array.from(firstDirs)[0];
	}

	// Multiple different first directories, no consistent source directory
	return null;
}

/**
 * Creates an Rsbuild plugin that transforms bundleless output paths by dynamically removing parent directory prefixes.
 *
 * @remarks
 * This plugin is designed to work with RSLib's bundleless mode, which generates JavaScript files
 * with paths like `../../src/plugins/file.js` (where the number of parent directories depends on
 * the output path configuration and the source directory name may vary). The plugin dynamically:
 * 1. Calculates the correct parent directory prefix based on the distPath configuration
 * 2. Detects the source directory name from the actual asset paths
 * 3. Transforms paths to their proper output structure
 *
 * The transformation happens during the "additional" stage of asset processing, ensuring that
 * the files are placed in the correct directory structure in the final build output.
 *
 * @returns An Rsbuild plugin configuration object with asset transformation logic
 *
 * @example
 * ```typescript
 * // In your rsbuild.config.ts
 * import { BundlelessPlugin } from '@savvy-web/tsconfig';
 *
 * export default {
 *   plugins: [
 *     BundlelessPlugin()
 *   ]
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Asset transformation examples for different configurations:
 * // distPath: "dist", source: "src" → "../src/" prefix removed
 * // distPath: "dist/npm", source: "source" → "../../source/" prefix removed
 * // distPath: "build", no source dir → "../" prefix removed
 * // distPath: "foo/bar/baz", source: "lib" → "../../../lib/" prefix removed
 * ```
 *
 * @see {@link https://rsbuild.dev/api/javascript-api/plugin} Rsbuild Plugin API documentation
 * @see {@link https://rslib.dev} RSLib documentation for bundleless mode
 * @public
 */
export const BundlelessPlugin = (): RsbuildPlugin => {
	return {
		name: "bundleless-plugin",
		/**
		 * Sets up the plugin hooks for asset transformation.
		 *
		 * @param api - The Rsbuild plugin API instance providing access to build hooks
		 *
		 * @remarks
		 * This setup function registers two hooks:
		 * 1. `onBeforeBuild` - Logs build context for debugging purposes (only when debug mode is enabled)
		 * 2. `processAssets` - Transforms JavaScript asset paths during the "additional" stage
		 *
		 * The asset processing logic dynamically calculates the parent directory prefix based on
		 * the environment's distPath configuration, then removes this prefix from JavaScript file paths.
		 * This ensures files are placed in the correct output directory structure for bundleless builds.
		 *
		 * The prefix is only removed from the start of the path to avoid unintended replacements
		 * in the middle of file paths.
		 */
		setup(api: RsbuildPluginAPI): void {
			/* v8 ignore start - Used for local debugging, no need to test*/
			api.onBeforeBuild(async (context) => {
				api.logger.debug("context", context);
			});
			/* v8 ignore stope */

			// Process assets during the "additional" stage to transform output paths
			api.processAssets(
				{
					stage: "additional",
				},
				async (context) => {
					// Get the current environment's distPath to calculate the prefix
					const environments = api.getRsbuildConfig().environments || {};
					const currentEnv = Object.values(environments)[0]; // Get first environment
					const distPath = getDistPathRoot(currentEnv?.output?.distPath) || "dist";

					// Calculate the relative path from package root
					const relativePath = distPath.replace(api.context.rootPath, "").replace(/^\/+/, "");
					const depth = getPathDepth(relativePath);
					const parentPrefix = createParentPrefix(depth);

					// Get all JavaScript asset paths to detect the source directory
					const jsPaths = Object.keys(context.compilation.assets).filter((key) => key.endsWith(".js"));
					const sourceDir = detectSourceDirectory(jsPaths, parentPrefix);

					// Transform all JavaScript file paths by removing the calculated prefix
					for (const [key, asset] of Object.entries(context.compilation.assets)) {
						if (key.endsWith(".js") && key.startsWith(parentPrefix)) {
							let newKey: string;

							if (sourceDir) {
								// If we detected a source directory, only transform files that have it
								const prefixWithSource = `${parentPrefix}${sourceDir}/`;
								if (key.startsWith(prefixWithSource)) {
									newKey = key.substring(prefixWithSource.length);
									/* v8 ignore start - edge case hard to test */
								} else {
									// File doesn't match the source directory pattern, skip it
									continue;
								}
								/* v8 ignore store */
							} else {
								// No source directory detected, just remove the parent prefix
								newKey = key.substring(parentPrefix.length);
							}

							context.compilation.assets[newKey] = asset;
							delete context.compilation.assets[key];
							// console.log(asset.source());
							// const newSource = new compiler.sources.OriginalSource(newKey, asset.source().toString());
							// compiler.compilation.emitAsset(newKey, newSource);
						}
					}
				},
			);
		},
	};
};
