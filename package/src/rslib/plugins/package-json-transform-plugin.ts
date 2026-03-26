import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import type { LibraryFormat, PackageJson } from "../../types/package-json.js";
import { JsonAsset, TextAsset } from "./utils/asset-utils.js";
import type { FormatConditionOptions } from "./utils/package-json-transformer.js";
import { buildPackageJson } from "./utils/package-json-transformer.js";

/**
 * Options for the PackageJsonTransformPlugin.
 *
 * @public
 */
export interface PackageJsonTransformPluginOptions {
	/**
	 * Output format for the library.
	 * Determines the package.json `type` field:
	 * - `"esm"` → `"type": "module"`
	 * - `"cjs"` → `"type": "commonjs"`
	 *
	 * @defaultValue `"esm"`
	 */
	format?: LibraryFormat;

	/**
	 * Override the package name in the output package.json.
	 *
	 * @remarks
	 * - When a string is provided, the package name is replaced with that value
	 * - When `true`, the original name is preserved (no override)
	 * - When undefined, the original name is preserved
	 *
	 * @example
	 * ```typescript
	 * import type { PackageJsonTransformPluginOptions } from '@savvy-web/rslib-builder';
	 *
	 * const options: PackageJsonTransformPluginOptions = {
	 *   name: '@scope/my-package-dist',
	 * };
	 * ```
	 */
	name?: string | true;

	/**
	 * Force the output package.json to have `"private": true`.
	 *
	 * @remarks
	 * Useful for development builds that should never be published.
	 * When true, overrides the `publishConfig.access` setting.
	 *
	 * @defaultValue false
	 */
	forcePrivate?: boolean;

	/**
	 * Whether to process TypeScript exports and generate type conditions.
	 *
	 * @remarks
	 * When enabled, transforms export paths from `.ts` to `.js` and adds
	 * `types` conditions pointing to the corresponding `.d.ts` files.
	 *
	 * @example
	 * Input: `"./src/index.ts"`
	 * Output: `{ "types": "./index.d.ts", "import": "./index.js" }`
	 */
	processTSExports?: boolean;

	/**
	 * Whether the build is in bundle mode.
	 *
	 * @remarks
	 * Affects export path transformations - in bundle mode, nested index files
	 * are collapsed (e.g., `./utils/index.ts` becomes `./utils.js`).
	 *
	 * @defaultValue false
	 */
	bundle?: boolean;

	/**
	 * Build mode identifier for custom transformations.
	 *
	 * @remarks
	 * Passed to the transform function to allow mode-specific modifications.
	 * Common values: "dev", "npm"
	 */
	mode?: string;

	/**
	 * Custom transform function to modify package.json after standard transformations.
	 *
	 * @remarks
	 * Called after all built-in transformations (path updates, pnpm resolution, etc.)
	 * are applied. Mutations to the object are also supported.
	 *
	 * @param pkg - The package.json object after standard transformations
	 * @returns The modified package.json object
	 *
	 * @example
	 * ```typescript
	 * import type { PackageJsonTransformPluginOptions } from '@savvy-web/rslib-builder';
	 *
	 * const options: PackageJsonTransformPluginOptions = {
	 *   transform(pkg) {
	 *     delete pkg.devDependencies;
	 *     pkg.publishConfig = { access: 'public' };
	 *     return pkg;
	 *   },
	 * };
	 * ```
	 */
	transform?: (pkg: PackageJson) => PackageJson;

	/**
	 * Per-entry format overrides for export conditions.
	 * Maps export paths to their format (e.g., `{ "./markdownlint": "cjs" }`).
	 * Entries not listed inherit the top-level `format`.
	 */
	entryFormats?: Record<string, LibraryFormat>;

	/**
	 * Whether the build uses dual format (both ESM and CJS).
	 * When true, exports get both `import` and `require` conditions
	 * with format directory prefixes.
	 */
	dualFormat?: boolean;
}

/**
 * Plugin to transform package.json for distribution.
 *
 * @remarks
 * This plugin processes the source package.json and transforms it for the build output.
 * It handles path transformations, pnpm catalog/workspace resolution, and field cleanup.
 *
 * ## Transformations Applied
 *
 * - **Path Updates**: Converts source paths to output paths (e.g., `./src/index.ts` → `./index.js`)
 * - **Type Conditions**: Adds `types` fields to exports pointing to `.d.ts` files
 * - **pnpm Resolution**: Resolves `catalog:` and `workspace:*` dependency versions
 * - **Field Cleanup**: Removes `scripts`, `publishConfig`, and other dev-only fields
 * - **Private Flag**: Sets based on `publishConfig.access` or `forcePrivate` option
 *
 * ## Plugin Interoperability
 *
 * - Consumes `entrypoints` map from AutoEntryPlugin
 * - Consumes `exportToOutputMap` for exportsAsIndexes mode
 * - Consumes `use-rollup-types` flag from DtsPlugin
 * - Exposes `base-package-json` after standard transforms (before user transform)
 *
 * @param options - Plugin configuration options
 *
 * @example
 * Basic usage:
 * ```typescript
 * import { PackageJsonTransformPlugin } from '@savvy-web/rslib-builder';
 *
 * export default {
 *   plugins: [
 *     PackageJsonTransformPlugin({
 *       bundle: true,
 *       processTSExports: true,
 *     }),
 *   ],
 * };
 * ```
 *
 * @example
 * With custom transform:
 * ```typescript
 * import { PackageJsonTransformPlugin } from '@savvy-web/rslib-builder';
 *
 * export default {
 *   plugins: [
 *     PackageJsonTransformPlugin({
 *       target: 'npm',
 *       transform(pkg) {
 *         delete pkg.devDependencies;
 *         return pkg;
 *       },
 *     }),
 *   ],
 * };
 * ```
 *
 * @public
 */
export const PackageJsonTransformPlugin = (options: PackageJsonTransformPluginOptions = {}): RsbuildPlugin => {
	return {
		name: "package-json-processor",
		setup(api: RsbuildPluginAPI): void {
			// Get or create the shared files array
			// biome-ignore lint/correctness/useHookAtTopLevel: Rsbuild plugin API, not React hooks
			let filesArray = api.useExposed("files-array") as Set<string> | undefined;
			if (!filesArray) {
				filesArray = new Set<string>();
				api.expose("files-array", filesArray);
			}

			api.processAssets(
				{
					stage: "pre-process",
				},
				async (context) => {
					const packageJson = await JsonAsset.create<PackageJson>(context, "package.json", true);
					if (packageJson) {
						filesArray.add(packageJson.fileName);
					}
					const readme = await TextAsset.create(context, "README.md", false);
					if (readme) {
						filesArray.add(readme.fileName);
					}
					const license = await TextAsset.create(context, "LICENSE", false);
					if (license) {
						filesArray.add(license.fileName);
					}
				},
			);

			api.processAssets(
				{
					stage: "optimize",
				},
				async (context) => {
					const packageJson = await JsonAsset.create<PackageJson>(context, "package.json", true);
					if (!packageJson) {
						return; // Skip processing if package.json is not found
					}
					// Get environment ID from compiler context
					const envId = context.compilation?.name || "unknown";
					const isProduction = envId !== "dev";

					// Get the updated entrypoints map if available
					// biome-ignore lint/correctness/useHookAtTopLevel: Rsbuild plugin API, not React hooks
					const entrypoints = api.useExposed<Map<string, string>>("entrypoints");
					// biome-ignore lint/correctness/useHookAtTopLevel: Rsbuild plugin API, not React hooks
					const exportToOutputMap = api.useExposed<Map<string, string>>("exportToOutputMap");

					// Build format conditions from plugin options
					let formatConditions: FormatConditionOptions | undefined;
					if (options.entryFormats || options.dualFormat) {
						formatConditions = {
							...(options.format && { format: options.format }),
							...(options.entryFormats && { entryFormats: options.entryFormats }),
							...(options.dualFormat && { dualFormat: options.dualFormat }),
						};
					}

					// Run standard transforms WITHOUT user transform
					const processedPackageJson = await buildPackageJson(
						packageJson.data,
						isProduction,
						options.processTSExports,
						entrypoints,
						exportToOutputMap,
						options.bundle,
						undefined,
						formatConditions,
					);
					packageJson.data = processedPackageJson;
					if (options.forcePrivate) {
						packageJson.data.private = true;
					}

					// Set type field based on format
					if (options.format) {
						packageJson.data.type = options.format === "esm" ? "module" : "commonjs";
					}

					// Check if we should use rollup types (set by DtsPlugin)
					// biome-ignore lint/correctness/useHookAtTopLevel: Rsbuild plugin API, not React hooks
					const useRollupTypes = api.useExposed<boolean>("use-rollup-types");
					if (useRollupTypes && packageJson.data.exports && typeof packageJson.data.exports === "object") {
						const exports = packageJson.data.exports as Record<string, unknown>;

						// Remove api-extractor export (temporary build artifact)
						delete exports["./api-extractor"];

						// Update all exports to point types to the rollup
						for (const value of Object.values(exports)) {
							if (value && typeof value === "object" && "types" in value) {
								(value as Record<string, string>).types = "./index.d.ts";
							}
						}
					}

					// Expose base package.json state (after standard transforms, before user transform)
					// This is consumed by PublishTargetPlugin to create per-target copies
					api.expose("base-package-json", JSON.parse(JSON.stringify(packageJson.data)) as PackageJson);

					// Apply user transform (if provided)
					if (options.transform) {
						packageJson.data = options.transform(packageJson.data);
					}

					packageJson.update();
				},
			);
			api.processAssets(
				{
					stage: "optimize-inline",
				},
				async (compiler) => {
					if (options.name && options.name !== true) {
						const packageJson = await JsonAsset.create<PackageJson>(compiler, "package.json", true);
						if (packageJson) {
							packageJson.data.name = options.name;
							packageJson.update();
						}
					}
				},
			);
		},
	};
};
