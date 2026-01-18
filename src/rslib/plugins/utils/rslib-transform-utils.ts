import sortPkg from "sort-package-json";
import type { PackageJson } from "type-fest";
import { transformPackageBin } from "#utils/bin-transform-utils.js";
import { transformPackageExports } from "#utils/export-transform-utils.js";
import { transformExportPath } from "#utils/path-transform-utils.js";

/**
 * Applies RSLib-specific transformations to package.json for build output compatibility.
 *
 * @remarks
 * This function performs the second stage of package.json transformation, focusing on
 * RSLib build system requirements. It transforms source file references to their
 * corresponding build output locations and removes development-only fields.
 *
 * **Key Transformations:**
 * - **Export Path Updates**: Transforms TypeScript paths to JavaScript equivalents
 * - **Type Definition Generation**: Creates export conditions with types field for TypeScript files
 * - **Bin Field Processing**: Updates executable file paths for build output
 * - **Files Array Transformation**: Removes source directory prefixes from files list
 * - **TypesVersions Processing**: Updates type mapping paths for compatibility
 * - **Field Cleanup**: Removes publishConfig, scripts, and other development fields (keeps devDependencies)
 * - **Privacy Settings**: Determines package privacy based on publishConfig.access
 *
 * **Source Directory Handling:**
 * The function strips common source prefixes (src/, exports/, public/) as RSLib flattens
 * the directory structure in the build output.
 *
 * @param packageJson - The package.json to transform (typically after pnpm transformations)
 * @param originalPackageJson - The original source package.json for reference
 * @param processTSExports - Whether to process TypeScript file extensions and generate type conditions
 * @returns The transformed package.json ready for build output
 *
 * @example
 * ```typescript
 * const transformed = applyRslibTransformations({
 *   name: "my-package",
 *   exports: {
 *     ".": "./src/index.ts",
 *     "./utils": "./src/utils.ts"
 *   },
 *   bin: "./src/cli.ts",
 *   devDependencies: { "typescript": "^5.0.0" }
 * }, originalPkg);
 *
 * console.log(transformed);
 * // {
 * //   name: "my-package",
 * //   exports: {
 * //     ".": { types: "./index.d.ts", import: "./index.js" },
 * //     "./utils": { types: "./utils.d.ts", import: "./utils.js" }
 * //   },
 * //   bin: "./cli.js",
 * //   private: false
 * // }
 * ```
 *
 * @see {@link applyPnpmTransformations} for the first stage of transformations
 * @see {@link buildPackageJson} for the complete transformation pipeline
 */
export function applyRslibTransformations(
	packageJson: PackageJson,
	originalPackageJson: PackageJson,
	processTSExports: boolean = true,
	entrypoints?: Map<string, string>,
	exportToOutputMap?: Map<string, string>,
	bundle?: boolean,
	format: "esm" | "cjs" = "esm",
): PackageJson {
	// Remove unwanted fields that pnpm doesn't remove
	// Keep devDependencies as package authors may need types from those packages
	const { publishConfig, scripts, ...rest } = packageJson;

	// Determine private field based on publishConfig from original
	let isPrivate = true;
	if (originalPackageJson.publishConfig?.access === "public") {
		isPrivate = false;
	}

	const processedManifest = {
		...rest,
		private: isPrivate,
	} as PackageJson;

	// Transform exports if they exist (RSLib-specific: .ts → .js/.cjs with type definitions)
	if (processedManifest.exports) {
		processedManifest.exports = transformPackageExports(
			processedManifest.exports,
			processTSExports,
			undefined,
			entrypoints,
			exportToOutputMap,
			bundle ?? false,
			format,
		) as PackageJson.Exports;
	}

	// Transform bin if it exists (RSLib-specific: .ts → .js)
	if (processedManifest.bin) {
		processedManifest.bin = transformPackageBin(processedManifest.bin, processTSExports);
	}

	// Transform typesVersions if it exists (RSLib-specific path transformations)
	if (originalPackageJson.typesVersions) {
		const transformedTypesVersions: Record<string, Record<string, string[]>> = {};

		for (const [version, paths] of Object.entries(originalPackageJson.typesVersions)) {
			const transformedPaths: Record<string, string[]> = {};

			for (const [key, value] of Object.entries(paths as Record<string, string[]>)) {
				transformedPaths[key] = value.map((path) =>
					transformExportPath(path, processTSExports, bundle ?? false, format),
				);
			}

			transformedTypesVersions[version] = transformedPaths;
		}

		processedManifest.typesVersions = transformedTypesVersions;
	}

	// Transform files array if it exists (RSLib-specific: remove public/ prefix)
	if (originalPackageJson.files) {
		processedManifest.files = originalPackageJson.files.map((file) => {
			// Remove leading ./ if present
			let transformedFile = file.startsWith("./") ? file.slice(2) : file;

			// Remove public/ prefix if present
			if (transformedFile.startsWith("public/")) {
				transformedFile = transformedFile.slice("public/".length);
			}

			return transformedFile;
		});
	}

	// Sort the final package.json
	return sortPkg(processedManifest);
}
