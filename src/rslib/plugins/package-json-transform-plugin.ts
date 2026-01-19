import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import type { PackageJson } from "type-fest";
import type { CacheEntry } from "#utils/asset-utils.js";
import { JsonAsset, TextAsset } from "#utils/asset-utils.js";
import { buildPackageJson } from "#utils/package-json-transformer.js";

/**
 * @public
 */
export interface PackageJsonTransformPluginOptions {
	/** Override the name property of the source package.json when building to a target */
	name?: string | true;
	/** Whether to force include private packages (with "private": true) in the output */
	forcePrivate?: boolean;
	/** Whether to process package.json exports of into  */
	processTSExports?: boolean;
	/** Whether the build is in bundle mode (affects export path transformation) */
	bundle?: boolean;
	/** Build target (dev, npm) - used for custom transformations */
	target?: string;
	/** Optional transform function to modify package.json after standard transformations */
	transform?: (pkg: PackageJson) => PackageJson;
}

/**
 * Plugin to process package.json for distribution
 * @public
 */
export const PackageJsonTransformPlugin = (options: PackageJsonTransformPluginOptions = {}): RsbuildPlugin => {
	const cache = new Map<string, CacheEntry>();
	return {
		name: "package-json-processor",
		setup(api: RsbuildPluginAPI): void {
			// Emit standard files to distribution
			api.expose("files-cache", cache);

			// Get or create the shared files array
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
					const entrypoints = api.useExposed<Map<string, string>>("entrypoints");
					const exportToOutputMap = api.useExposed<Map<string, string>>("exportToOutputMap");

					const processedPackageJson = await buildPackageJson(
						packageJson.data,
						isProduction,
						options.processTSExports,
						entrypoints,
						exportToOutputMap,
						options.bundle,
						options.transform,
					);
					packageJson.data = processedPackageJson;
					if (options.forcePrivate) {
						packageJson.data.private = true;
					}

					// Check if we should use rollup types (set by ApiReportPluginNew)
					const useRollupTypes = api.useExposed<boolean>("use-rollup-types");
					if (useRollupTypes && packageJson.data.exports && typeof packageJson.data.exports === "object") {
						const exports = packageJson.data.exports as Record<string, unknown>;

						// Remove api-extractor export (temporary build artifact)
						delete exports["./api-extractor"];

						// Update all exports to point types to the rollup
						for (const [, value] of Object.entries(exports)) {
							if (value && typeof value === "object" && "types" in value) {
								(value as Record<string, string>).types = "./index.d.ts";
							}
						}
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
