/**
 * Transforms a single export path for RSLib compatibility.
 *
 * @remarks
 * This function performs several transformations to convert source file paths to their
 * corresponding build output paths:
 *
 * 1. **Prefix Stripping**: Removes common source directory prefixes (exports/, public/, src/)
 * 2. **Extension Transformation**: Converts TypeScript extensions (.ts/.tsx) to JavaScript (.js)
 * 3. **Bin Directory Preservation**: Keeps bin/ prefix for executable files
 *
 * The transformation process adapts to RSLib's build output structure where source files
 * from various directories are flattened into the distribution directory.
 *
 * @param path - The file path to transform
 * @param processTSExports - Whether to process TypeScript file extensions
 * @returns The transformed path suitable for the build output
 *
 * @example
 * ```typescript
 * // Source directory stripping
 * transformExportPath("./src/index.ts"); // "./index.js"
 * transformExportPath("./exports/utils.ts"); // "./utils.js"
 * transformExportPath("./public/assets.js"); // "./assets.js"
 *
 * // Bin directory preservation
 * transformExportPath("./bin/cli.ts"); // "./bin/cli.js"
 *
 * // TypeScript processing disabled
 * transformExportPath("./src/index.ts", false); // "./index.ts"
 * ```
 */
export function transformExportPath(
	path: string,
	processTSExports: boolean = true,
	collapseIndex: boolean = false,
	format: "esm" | "cjs" = "esm",
): string {
	let transformedPath = path;

	// Strip prefixes - RSLib handles the build output structure
	if (transformedPath.startsWith("./exports/")) {
		transformedPath = `./${transformedPath.slice("./exports/".length)}`;
	} else if (transformedPath.startsWith("./public/")) {
		transformedPath = `./${transformedPath.slice("./public/".length)}`;
	} else if (transformedPath.startsWith("./src/")) {
		transformedPath = `./${transformedPath.slice("./src/".length)}`;
	} else if (transformedPath.startsWith("./bin/")) {
		// Keep bin/ prefix for executable files - no transformation needed
	}

	if (processTSExports) {
		const extension = format === "cjs" ? ".cjs" : ".js";

		// In bundled mode (collapseIndex=true), rslib collapses /index.ts files to just the directory name
		// For example: ./foo/bar/index.ts -> ./foo/bar.js (rslib output)
		// In bundleless mode (collapseIndex=false), keep the full path: ./foo/bar/index.ts -> ./foo/bar/index.js
		// Note: Root index files (./index.ts) should not be collapsed as there's no parent directory
		if (collapseIndex && transformedPath.endsWith("/index.ts") && transformedPath !== "./index.ts") {
			transformedPath = `${transformedPath.slice(0, -"/index.ts".length)}${extension}`;
		} else if (collapseIndex && transformedPath.endsWith("/index.tsx") && transformedPath !== "./index.tsx") {
			transformedPath = `${transformedPath.slice(0, -"/index.tsx".length)}${extension}`;
		} else if (transformedPath.endsWith(".tsx")) {
			// Convert .tsx to .js/.cjs
			transformedPath = `${transformedPath.slice(0, -4)}${extension}`;
		} else if (transformedPath.endsWith(".ts") && !transformedPath.endsWith(".d.ts")) {
			// Convert .ts to .js/.cjs (excluding .d.ts files)
			transformedPath = `${transformedPath.slice(0, -3)}${extension}`;
		}
	}

	return transformedPath;
}

/**
 * Creates a TypeScript declaration file path from a JavaScript file path.
 *
 * @remarks
 * This function generates the corresponding .d.ts file path for a given JavaScript file.
 * It's used when generating export conditions that include both the JavaScript file and
 * its TypeScript declarations.
 *
 * When using `collapseIndex=true` (bundled mode), declaration files are bundled at the root level
 * while JavaScript files are output to subdirectories with index.js filenames. This function
 * strips the `/index` suffix from paths to correctly reference the bundled declarations.
 *
 * @param jsPath - The JavaScript file path
 * @param collapseIndex - Whether to collapse /index paths (bundled mode). Defaults to true for backwards compatibility.
 * @returns The corresponding TypeScript declaration file path
 *
 * @example
 * ```typescript
 * // Bundled mode (collapseIndex = true)
 * createTypePath("./index.js", true); // "./index.d.ts"
 * createTypePath("./rslib/index.js", true); // "./rslib.d.ts" (collapsed)
 * createTypePath("#utils/helper.js", true); // "#utils/helper.d.ts"
 *
 * // Bundleless mode (collapseIndex = false)
 * createTypePath("./index.js", false); // "./index.d.ts"
 * createTypePath("./rslib/index.js", false); // "./rslib/index.d.ts" (preserved)
 * createTypePath("#utils/helper.js", false); // "#utils/helper.d.ts"
 * ```
 */
export function createTypePath(jsPath: string, collapseIndex: boolean = true): string {
	// Handle both regular files and collapsed index files
	// ./foo.js -> ./foo.d.ts
	// ./foo.cjs -> ./foo.d.ts
	// ./foo/bar.js -> ./foo/bar.d.ts (this could be from ./foo/bar/index.ts)

	// Special handling for bundled mode (collapseIndex=true) where JS is ./foo/index.js
	// but declarations are bundled as ./foo.d.ts (not ./foo/index.d.ts)
	// Important: Don't collapse root index files (./index.js should become ./index.d.ts)
	if (collapseIndex && jsPath.endsWith("/index.js") && jsPath !== "./index.js") {
		return `${jsPath.slice(0, -"/index.js".length)}.d.ts`;
	}
	if (collapseIndex && jsPath.endsWith("/index.cjs") && jsPath !== "./index.cjs") {
		return `${jsPath.slice(0, -"/index.cjs".length)}.d.ts`;
	}

	if (jsPath.endsWith(".js")) {
		return `${jsPath.slice(0, -3)}.d.ts`;
	}
	if (jsPath.endsWith(".cjs")) {
		return `${jsPath.slice(0, -4)}.d.ts`;
	}
	return `${jsPath}.d.ts`;
}
