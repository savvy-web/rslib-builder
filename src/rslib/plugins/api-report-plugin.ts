/* v8 ignore start - Complex integration plugin tested through consuming packages */
import { readFile, writeFile } from "node:fs/promises";
import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import type { PackageJson } from "type-fest";
import { extractEntriesFromPackageJson } from "#utils/entry-extractor.js";
import { fileExistAsync } from "#utils/file-utils.js";
import { createEnvLogger } from "#utils/logger-utils.js";

/**
 * Options for configuring the API Report plugin (new version).
 * @public
 */
export interface ApiReportPluginOptions {
	/**
	 * Path to the api-extractor file relative to the package root.
	 * @defaultValue "src/api-extractor.ts"
	 */
	apiExtractorPath?: string;

	/**
	 * Whether to enable API report generation.
	 * This option should only be used in bundle mode.
	 * @defaultValue false
	 */
	enabled?: boolean;
}

/**
 * Plugin to generate API reports for packages without a default export.
 *
 * @remarks
 * This plugin is designed for packages that:
 * - Do not have a "." export in package.json
 * - Use a magic file `src/api-extractor.ts` containing only `@packageDocumentation`
 * - Need to consolidate exports for API Extractor
 *
 * @param options - Plugin configuration options
 *
 * @example
 * ```typescript
 * import { ApiReportPluginNew } from "@savvy-web/shared/rslib";
 *
 * export default {
 *   plugins: [
 *     ApiReportPluginNew({ enabled: true })
 *   ]
 * };
 * ```
 *
 * @public
 */
/* v8 ignore next -- @preserve */
export const ApiReportPlugin = (options: ApiReportPluginOptions = {}): RsbuildPlugin => {
	const apiExtractorPath = options.apiExtractorPath ?? "src/api-extractor.ts";
	const enabled = options.enabled ?? false;

	// Store the path to the temporary file for cleanup
	let tempApiExtractorPath = "";
	let shouldRunCleanup = false; // Track if we should run cleanup hooks

	return {
		name: "api-report-plugin-new",
		setup(api: RsbuildPluginAPI): void {
			if (!enabled) {
				return;
			}

			// Generate exports and write to file before build
			api.modifyRsbuildConfig(async (config) => {
				const log = createEnvLogger("api-report-new");

				// Step 0: Clean up any leftover temporary files from previous failed builds
				// Do this BEFORE creating the new temp file
				try {
					const { glob } = await import("glob");
					const { unlink } = await import("node:fs/promises");
					const { dirname } = await import("node:path");

					// Find all api-extractor-*.ts files in src directory
					// Use a negative pattern to exclude .d.ts files
					const apiExtractorDir = dirname(apiExtractorPath);
					const pattern = `${apiExtractorDir}/api-extractor-*.ts`;
					const files = await glob(pattern, {
						ignore: ["**/*.d.ts", "**/*.d.ts.map"],
					});

					if (files.length > 0) {
						for (const file of files) {
							await unlink(file);
						}
						log.global.info(`✓ Cleaned up ${files.length} leftover temporary api-extractor file(s)`);
					}
				} catch (error) {
					log.global.warn(`Failed to clean up leftover temp files: ${error}`);
				}

				// Step 1: Load package.json
				const { assetPath: packageJsonPath, assetExists: packageJsonExists } = await fileExistAsync("package.json");

				if (!packageJsonExists) {
					log.global.error("package.json not found in project root");
					throw new Error("package.json not found in project root");
				}

				const packageJsonContent = await readFile(packageJsonPath, "utf-8");
				const packageJson = JSON.parse(packageJsonContent) as PackageJson;

				// Step 2: Check if there's a default export
				const hasDefaultExport =
					packageJson.exports && typeof packageJson.exports === "object" && "." in packageJson.exports;

				if (hasDefaultExport) {
					// Check if the default export has @packageDocumentation
					const { entries } = extractEntriesFromPackageJson(packageJson);
					const defaultExportEntry = entries.index; // Default export maps to "index" entry

					if (defaultExportEntry) {
						const { assetPath: defaultExportPath, assetExists: defaultExportExists } =
							await fileExistAsync(defaultExportEntry);

						if (defaultExportExists) {
							const defaultExportContent = await readFile(defaultExportPath, "utf-8");
							if (defaultExportContent.includes("@packageDocumentation")) {
								// Default export has @packageDocumentation - skip API report plugin
								// Let normal DTS bundling create separate rollups for each export
								log.global.info(
									"Default export has @packageDocumentation, skipping (will use normal DTS bundling for separate rollups)",
								);
								return config;
							}
						}
					}

					log.global.info('Package has a default export (".") without @packageDocumentation, skipping');
					return config;
				}

				log.global.info("✓ Package has no default export");

				// Expose flag to tell PackageJsonTransformPlugin we're using rollup types
				// Only set this when we're actually generating the API report
				api.expose("use-rollup-types", true);

				// Mark that we should run cleanup hooks
				shouldRunCleanup = true;

				// Step 3: Check if src/api-extractor.ts exists
				const { assetPath: apiExtractorFilePath, assetExists: apiExtractorExists } =
					await fileExistAsync(apiExtractorPath);

				if (!apiExtractorExists) {
					log.global.warn(`${apiExtractorPath} not found, cannot generate API report`);
					return config;
				}

				log.global.info(`✓ Found ${apiExtractorPath}`);

				// Step 4: Check if the file contains @packageDocumentation
				const apiExtractorContent = await readFile(apiExtractorFilePath, "utf-8");
				const hasPackageDocumentation = apiExtractorContent.includes("@packageDocumentation");

				if (!hasPackageDocumentation) {
					log.global.warn(`${apiExtractorPath} does not contain @packageDocumentation comment`);
					return config;
				}

				log.global.info("✓ File contains @packageDocumentation comment");

				// Step 4: Extract entry points from package.json
				const { entries } = extractEntriesFromPackageJson(packageJson);

				// Filter to get only non-bin entry points, excluding api-extractor itself
				// and map to import paths
				const entryPoints = Object.entries(entries)
					.filter(([name, sourcePath]) => {
						// Skip bin entries
						if (name.startsWith("bin/")) return false;
						// Skip api-extractor itself to avoid circular reference
						if (sourcePath === apiExtractorPath) return false;
						return true;
					})
					.map(([, sourcePath]) => {
						// Convert source path to relative import path with .js extension
						// e.g., "./src/rslib/index.ts" -> "./rslib/index.js"
						const relativePath = sourcePath.replace(/^\.\/src\//, "./").replace(/\.ts$/, ".js");
						return relativePath;
					});

				if (entryPoints.length === 0) {
					log.global.info("No entry points found, skipping API report generation");
					return config;
				}

				// Step 5: Generate export statements (types only - values will be removed)
				const allExports = entryPoints
					.map((importPath) => {
						return `export type * from "${importPath}";`;
					})
					.join("\n");

				// Step 7: Create a temporary file with the transformed content in src/ directory
				// This leaves the original api-extractor.ts untouched
				// We create it in src/ so relative imports work correctly
				const { randomBytes } = await import("node:crypto");
				const { join, dirname } = await import("node:path");

				// Generate random suffix for temp file
				const randomSuffix = randomBytes(4).toString("hex");
				const apiExtractorDir = dirname(apiExtractorPath);
				tempApiExtractorPath = join(api.context.rootPath, apiExtractorDir, `api-extractor-${randomSuffix}.ts`);

				const transformedContent = `${apiExtractorContent.trim()}\n\n${allExports}\n`;
				await writeFile(tempApiExtractorPath, transformedContent, "utf-8");
				log.global.info(`✓ Wrote transformed api-extractor.ts to temp file with ${entryPoints.length} entry points`);

				// Expose the mapping for the DTS plugin so it knows to save declarations
				// from the temp file as src/api-extractor.d.ts
				api.expose("api-extractor-temp-mapping", {
					tempPath: tempApiExtractorPath,
					originalPath: apiExtractorPath, // e.g., "src/api-extractor.ts"
				});

				// Step 8: Add temp api-extractor as ADDITIONAL build entry point
				// Don't replace existing entries - AutoEntryPlugin will add the other entry points
				config.source = config.source || {};
				config.source.entry = config.source.entry || {};

				// Add api-extractor entry pointing to the temp file
				config.source.entry["api-extractor"] = tempApiExtractorPath;

				// Step 9: Expose the in-memory package.json with api-extractor export
				// The DTS plugin will read this instead of modifying package.json on disk
				const tempPackageJson = { ...packageJson };
				if (!tempPackageJson.exports) {
					tempPackageJson.exports = {};
				}
				if (typeof tempPackageJson.exports === "object") {
					// Add temporary export for api-extractor pointing to the temp file
					// Use the original api-extractor path (not the temp file path)
					// The apiExtractorMapping will handle redirecting to the temp file
					(tempPackageJson.exports as Record<string, unknown>)["./api-extractor"] = apiExtractorPath;
					log.global.info("✓ Prepared api-extractor export in memory (not written to disk)");
				}

				// Expose the modified package.json for the DTS plugin to use
				api.expose("api-extractor-package-json", tempPackageJson);

				return config;
			});

			// Clean up temporary files after build completes successfully
			// Note: onBeforeBuild handles cleanup of leftover files from failed builds
			api.onAfterBuild(async () => {
				if (!shouldRunCleanup) return;

				const log = createEnvLogger("api-report-new");

				// Delete temporary api-extractor.ts file
				if (tempApiExtractorPath) {
					try {
						const { unlink } = await import("node:fs/promises");
						// Delete just the temp file (not the entire directory since it's in src/)
						await unlink(tempApiExtractorPath);
						log.global.info("✓ Cleaned up temporary api-extractor files");
					} catch (error) {
						log.global.warn(`Failed to clean up temp files: ${error}`);
					}
				}

				// Note: We no longer modify package.json on disk, so no cleanup needed
				// The in-memory modifications via api.expose() are automatically discarded after build
			});

			// Rename bundled output from api-extractor/index.d.ts to index.d.ts
			api.processAssets(
				{
					stage: "optimize-inline",
				},
				async (context) => {
					if (!shouldRunCleanup) return;

					const log = createEnvLogger("api-report-new");
					const assets = context.compilation.assets;

					// Get the shared files array
					const filesArray = api.useExposed<Set<string>>("files-array");

					// Move api-extractor.d.ts to root as index.d.ts
					if (assets["api-extractor.d.ts"]) {
						assets["index.d.ts"] = assets["api-extractor.d.ts"];
						delete assets["api-extractor.d.ts"];
						log.global.info("✓ Moved api-extractor.d.ts to index.d.ts");

						// Update files array
						if (filesArray) {
							filesArray.delete("api-extractor.d.ts");
							filesArray.add("index.d.ts");
						}
					}

					if (assets["api-extractor.d.ts.map"]) {
						assets["index.d.ts.map"] = assets["api-extractor.d.ts.map"];
						delete assets["api-extractor.d.ts.map"];
					}

					// Remove empty api-extractor JS files
					if (assets["api-extractor.js"]) {
						delete assets["api-extractor.js"];
						if (filesArray) {
							filesArray.delete("api-extractor.js");
						}
					}
					if (assets["api-extractor/index.js"]) {
						delete assets["api-extractor/index.js"];
						if (filesArray) {
							filesArray.delete("api-extractor/index.js");
						}
					}

					// Remove individual .d.ts files ONLY if we successfully created the rollup (index.d.ts)
					// Keep only the rollup (index.d.ts) and runtime .js files
					if (filesArray && assets["index.d.ts"]) {
						const filesToRemove: string[] = [];
						for (const file of filesArray) {
							// Remove individual .d.ts files but keep the root index.d.ts
							if (file.endsWith(".d.ts") && file !== "index.d.ts") {
								filesToRemove.push(file);
								delete assets[file];
							}
						}
						for (const file of filesToRemove) {
							filesArray.delete(file);
						}
						if (filesToRemove.length > 0) {
							log.global.info(`✓ Removed ${filesToRemove.length} individual .d.ts files (using rollup)`);
						}
					}
				},
			);
		},
	};
};
