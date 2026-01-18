import type { PackageJson } from "type-fest";

/**
 * Extracts TypeScript entry points from package.json exports and bin fields for build configuration.
 *
 * @remarks
 * This function analyzes package.json export and bin configurations to identify TypeScript
 * source files that need to be built. It handles various export formats and automatically
 * maps JavaScript output paths back to their TypeScript source files.
 *
 *
 * **Export Path Mapping:**
 * - Converts export keys to entry names (e.g., "./utils" → "utils")
 * - Maps the root export "." to "index" entry
 * - Replaces path separators with hyphens for nested exports (default)
 * - When `exportsAsIndexes` is true, preserves path structure and appends "/index"
 *
 * **Source Path Resolution:**
 * - Prioritizes TypeScript files (.ts/.tsx) over JavaScript files
 * - Maps /dist/ JavaScript paths back to /src/ TypeScript sources
 * - Supports conditional exports (import, default, types fields)
 *
 * @param packageJson - The package.json object to extract entries from
 * @param options - Configuration options for entry extraction
 * @param options.exportsAsIndexes - When true, export paths create index files in nested directories
 * @returns An object containing:
 *   - `entries`: Entry name to TypeScript source path mapping for regular builds
 *
 * @example
 * Basic usage:
 * ```typescript
 * const packageJson = {
 *   exports: {
 *     ".": "./src/index.ts",
 *     "./utils": "./src/utils.ts",
 *   },
 *   bin: {
 *     "my-cli": "./src/bin/cli.ts"
 *   }
 * };
 *
 * const result = extractEntriesFromPackageJson(packageJson);
 * console.log(result.entries);
 * // {
 * //   "index": "./src/index.ts",
 * //   "utils": "./src/utils.ts",
 * //   "bin/my-cli": "./src/bin/cli.ts"
 * // }
 * ```
 *
 * @example
 * With exportsAsIndexes:
 * ```typescript
 * const packageJson = {
 *   exports: {
 *     ".": "./src/index.ts",
 *     "./foo/bar": "./src/foo/bar.ts",
 *   }
 * };
 *
 * const result = extractEntriesFromPackageJson(packageJson, { exportsAsIndexes: true });
 * console.log(result.entries);
 * // {
 * //   "index": "./src/index.ts",
 * //   "foo/bar/index": "./src/foo/bar.ts"
 * // }
 * ```
 *
 * @example
 * Handles conditional exports:
 * ```typescript
 * const packageJson = {
 *   exports: {
 *     ".": {
 *       import: "./src/index.ts",
 *       types: "./dist/index.d.ts"
 *     }
 *   }
 * };
 *
 * const result = extractEntriesFromPackageJson(packageJson);
 * console.log(result.entries);
 * // { "index": "./src/index.ts" }
 * ```
 *
 * @see {@link https://nodejs.org/api/packages.html#exports} for Node.js exports specification
 * @see {@link https://docs.npmjs.com/cli/v9/configuring-npm/package-json#bin} for npm bin field documentation
 */
export function extractEntriesFromPackageJson(
	packageJson: PackageJson,
	options?: { exportsAsIndexes?: boolean },
): {
	entries: Record<string, string>;
} {
	const entries: Record<string, string> = {};

	// Extract from exports field
	if (packageJson.exports) {
		const exports = packageJson.exports;

		// Handle different export formats
		if (typeof exports === "string") {
			// Simple string export
			if (exports.endsWith(".ts") || exports.endsWith(".tsx")) {
				entries.index = exports;
			}
		} else if (typeof exports === "object") {
			for (const [key, value] of Object.entries(exports)) {
				// Skip package.json
				if (key === "./package.json") {
					continue;
				}

				// Skip JSON exports from regular entry processing
				if (key.endsWith(".json")) {
					continue;
				}

				let sourcePath: string | undefined;

				// Handle different export formats
				if (typeof value === "string") {
					sourcePath = value;
				} else if (typeof value === "object" && value !== null) {
					// Look for TypeScript source in import/default/types fields
					const exportObj = value as Record<string, unknown>;
					sourcePath = (exportObj.import as string) || (exportObj.default as string) || (exportObj.types as string);
				}

				// Check if it's a TypeScript file or map JS files back to TS
				if (sourcePath) {
					let resolvedSourcePath = sourcePath;

					// If it's a JS file in dist, try to find the corresponding TS source
					if (sourcePath.endsWith(".js") && sourcePath.includes("/dist/")) {
						resolvedSourcePath = sourcePath.replace("/dist/", "/src/").replace(/\.js$/, ".ts");
					}

					if (resolvedSourcePath.endsWith(".ts") || resolvedSourcePath.endsWith(".tsx")) {
						// Create entry name from export key
						let entryName: string;
						if (key === ".") {
							entryName = "index";
						} else if (options?.exportsAsIndexes) {
							// Preserve path structure and append /index
							// "./foo/bar" -> "foo/bar/index"
							entryName = `${key.replace(/^\.\//, "")}/index`;
						} else {
							// Default behavior: replace slashes with hyphens
							// "./foo/bar" -> "foo-bar"
							entryName = key.replace(/^\.\//, "").replace(/\//g, "-");
						}
						entries[entryName] = resolvedSourcePath;
					}
				}
			}
		}
	}

	// Extract from bin field
	if (packageJson.bin) {
		const bin = packageJson.bin;

		if (typeof bin === "string") {
			// Single bin entry
			let resolvedBinPath = bin;

			// If it's a JS file in dist, try to find the corresponding TS source
			/* v8 ignore start - Edge case for pre-built JS bin files */
			if (bin.endsWith(".js") && bin.includes("/dist/")) {
				resolvedBinPath = bin.replace("/dist/", "/src/").replace(/\.js$/, ".ts");
			}
			/* v8 ignore stop */

			if (resolvedBinPath.endsWith(".ts") || resolvedBinPath.endsWith(".tsx")) {
				entries["bin/cli"] = resolvedBinPath;
			}
		} else if (typeof bin === "object") {
			// Multiple bin entries
			for (const [key, value] of Object.entries(bin)) {
				if (typeof value === "string") {
					let resolvedBinPath = value;

					// If it's a JS file in dist, try to find the corresponding TS source
					/* v8 ignore start - Edge case for pre-built JS bin files in multi-bin setup */
					if (value.endsWith(".js") && value.includes("/dist/")) {
						resolvedBinPath = value.replace("/dist/", "/src/").replace(/\.js$/, ".ts");
					}
					/* v8 ignore stop */

					if (resolvedBinPath.endsWith(".ts") || resolvedBinPath.endsWith(".tsx")) {
						// Place bin entries in bin/ subdirectory
						entries[`bin/${key}`] = resolvedBinPath;
					}
				}
			}
		}
	}

	return { entries };
}
