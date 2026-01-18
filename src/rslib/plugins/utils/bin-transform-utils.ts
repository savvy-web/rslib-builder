import type { PackageJson } from "type-fest";
import { transformExportPath } from "#utils/path-transform-utils.js";

/**
 * Transforms the package.json bin field for build output compatibility.
 *
 * @remarks
 * This function processes the bin field to ensure executable file paths are correctly
 * transformed for the build output. It handles both string and object formats of the
 * bin field, applying the same path transformations used for exports.
 *
 * The bin field can be defined as:
 * - A string: Direct path to the executable
 * - An object: Map of command names to executable paths
 *
 * @param bin - The bin field value from package.json
 * @param processTSExports - Whether to process TypeScript file extensions
 * @returns The transformed bin field with updated paths
 *
 * @example
 * ```typescript
 * // String format
 * transformPackageBin("./src/cli.ts"); // "./cli.js"
 *
 * // Object format
 * transformPackageBin({
 *   "my-tool": "./src/cli.ts",
 *   "helper": "./bin/helper.ts"
 * });
 * // Result:
 * // {
 * //   "my-tool": "./cli.js",
 * //   "helper": "./bin/helper.js"
 * // }
 *
 * // With TypeScript processing disabled
 * transformPackageBin("./src/cli.ts", false); // "./cli.ts"
 * ```
 */
export function transformPackageBin(bin: PackageJson["bin"], processTSExports: boolean = true): PackageJson["bin"] {
	if (typeof bin === "string") {
		return transformExportPath(bin, processTSExports);
	}

	if (bin && typeof bin === "object") {
		const transformed: Record<string, string> = {};
		for (const [command, path] of Object.entries(bin)) {
			if (path !== undefined) {
				transformed[command] = transformExportPath(path, processTSExports);
			}
		}
		return transformed;
	}

	return bin;
}
