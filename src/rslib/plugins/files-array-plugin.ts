import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import type { PackageJson } from "type-fest";
import { JsonAsset, TextAsset } from "#utils/asset-utils.js";
import { createEnvLogger } from "#utils/build-logger.js";

/**
 * @public
 */
export interface FilesArrayPluginOptions<TTarget extends string = string> {
	/**
	 * Optional callback to transform files after they're built but before the files array is finalized.
	 * Called in the additional stage, after all assets are created.
	 */
	transformFiles?: (context: {
		/** Rspack compilation object with assets */
		compilation: {
			assets: Record<string, unknown>;
		};
		filesArray: Set<string>;
		target: TTarget;
	}) => void | Promise<void>;
	/** Build target (dev/npm/jsr) */
	target: TTarget;
}

/**
 * Plugin to manage the files array in package.json
 * Adds essential files like package.json, README.md, LICENSE and compiled outputs
 * Other plugins can use api.useExposed("files-array") to add additional files
 * @public
 */
export const FilesArrayPlugin = <TTarget extends string = string>(
	options?: FilesArrayPluginOptions<TTarget>,
): RsbuildPlugin => {
	return {
		name: "files-array-plugin",
		post: ["rsbuild:dts"],
		setup(api: RsbuildPluginAPI): void {
			// Run during the main compilation to handle compiled assets and essential files

			let filesArray = api.useExposed("files-array") as Set<string> | undefined;
			if (!filesArray) {
				filesArray = new Set<string>();
				api.expose("files-array", filesArray);
			}

			api.processAssets(
				{
					stage: "additional", // Run at the very end after all assets are created
				},
				async (context) => {
					// Get or create the shared files array

					// Add essential files that are always included
					const packageJson = await JsonAsset.create<PackageJson>(context, "package.json", false);
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

					// Add all compiled JS and other assets (but not source maps)
					for (const assetName of Object.keys(context.compilation.assets)) {
						// Skip source maps as they're typically not published
						// Skip files already added
						if (!assetName.endsWith(".map") && !filesArray.has(assetName)) {
							filesArray.add(assetName);
						}
					}

					// Call user-provided transformFiles callback if provided
					if (options?.transformFiles) {
						await options.transformFiles({
							compilation: context.compilation,
							filesArray,
							target: options.target,
						});
					}
				},
			);

			api.processAssets(
				{
					stage: "optimize-inline",
				},
				async (context) => {
					// Extract environment from compilation name or options
					const envId = context.compilation?.name || context.compilation?.options?.name || "unknown";

					const log = createEnvLogger(envId);

					const packageJson = await JsonAsset.create<PackageJson>(context, "package.json", false);

					// Update package.json with the accumulated files array
					if (packageJson) {
						// Debug: log what's in the filesArray before writing

						// Get existing files from package.json
						const previousFiles = new Set(packageJson.data.files || []);

						// Combine existing files with new essential files from filesArray
						const allFiles = new Set([...previousFiles, ...Array.from(filesArray)].sort());

						if (allFiles.size === 0) {
							delete packageJson.data.files;
						} else {
							// Calculate difference manually for compatibility
							const newFiles = new Set([...allFiles].filter((file) => !previousFiles.has(file)));
							if (newFiles.size > 0) {
								log.fileOp("added to files array", Array.from(newFiles));
							}
						}

						packageJson.data.files = Array.from(allFiles);

						packageJson.update();
					}
				},
			);
		},
	};
};
