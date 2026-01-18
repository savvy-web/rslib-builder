import type { PackageJson } from "type-fest";
import { applyPnpmTransformations } from "#utils/pnpm-transform-utils.js";
import { applyRslibTransformations } from "#utils/rslib-transform-utils.js";

/**
 * Performs complete package.json transformation for build output and publishing.
 *
 * @remarks
 * This is the main entry point for package.json transformation, orchestrating both
 * pnpm-specific and RSLib-specific transformations in the correct order. The function
 * adapts its behavior based on the build environment:
 *
 * **Production Mode** (`isProduction: true`):
 * 1. **Stage 1**: Apply pnpm transformations (resolve catalog: and workspace: references)
 * 2. **Stage 2**: Apply RSLib transformations (path updates, field cleanup, type generation)
 * 3. **Stage 3**: Apply custom transform function if provided
 *
 * **Development Mode** (`isProduction: false`):
 * 1. **Stage 1**: Apply only RSLib transformations, preserving catalog: and workspace: references for local development
 * 2. **Stage 2**: Apply custom transform function if provided
 *
 * **Use Cases:**
 * - **Production Builds**: Complete transformation for npm publishing
 * - **Development Builds**: Path transformation while maintaining workspace links
 * - **Local Testing**: Generate build-compatible package.json without breaking workspace dependencies
 * - **Custom Transformations**: Apply package-specific modifications via transform function
 *
 * @param packageJson - The source package.json to transform
 * @param isProduction - Whether this is a production build requiring dependency resolution
 * @param processTSExports - Whether to process TypeScript files and generate export conditions
 * @param entrypoints - Map of export paths to entry files (from AutoEntryPlugin)
 * @param exportToOutputMap - Map of export paths to output files (for exportsAsIndexes mode)
 * @param bundle - Whether the build is in bundle mode
 * @param transform - Optional custom transform function to modify package.json after standard transformations
 * @returns Promise resolving to the fully transformed package.json
 * @throws {Error} When pnpm transformations fail in production mode
 *
 * @example
 * ```typescript
 * // Production build - full transformation
 * const prodPkg = await buildPackageJson(sourcePkg, true);
 * console.log(prodPkg.dependencies);
 * // { "react": "^18.2.0" } (resolved from catalog:react)
 *
 * // Development build - preserve workspace links
 * const devPkg = await buildPackageJson(sourcePkg, false);
 * console.log(devPkg.dependencies);
 * // { "react": "catalog:react" } (preserved for development)
 *
 * // TypeScript processing disabled
 * const jsPkg = await buildPackageJson(sourcePkg, true, false);
 * console.log(jsPkg.exports["."]);
 * // "./index.ts" (no JS transformation)
 *
 * // With custom transform
 * const customPkg = await buildPackageJson(
 *   sourcePkg,
 *   true,
 *   true,
 *   undefined,
 *   undefined,
 *   true,
 *   (pkg) => {
 *     delete pkg.devDependencies;
 *     return pkg;
 *   }
 * );
 * ```
 *
 * @see {@link applyPnpmTransformations} for pnpm-specific transformations
 * @see {@link applyRslibTransformations} for RSLib-specific transformations
 */
export async function buildPackageJson(
	packageJson: PackageJson,
	isProduction: boolean = false,
	processTSExports: boolean = true,
	entrypoints?: Map<string, string>,
	exportToOutputMap?: Map<string, string>,
	bundle?: boolean,
	format: "esm" | "cjs" = "esm",
	transform?: (pkg: PackageJson) => PackageJson,
): Promise<PackageJson> {
	// Step 1: Apply pnpm transformations (dependency resolution, etc.)
	// For production builds, resolve catalog: and workspace: references
	// For development builds, keep them as-is for local development
	let result: PackageJson;
	if (isProduction) {
		const pnpmTransformed = await applyPnpmTransformations(packageJson);
		result = applyRslibTransformations(
			pnpmTransformed,
			packageJson,
			processTSExports,
			entrypoints,
			exportToOutputMap,
			bundle,
			format,
		);
	} else {
		// Step 2: Apply RSLib transformations (path transformations, field removal, etc.)
		// Skip pnpm transformations for development to preserve catalog: and workspace: references
		result = applyRslibTransformations(
			packageJson,
			packageJson,
			processTSExports,
			entrypoints,
			exportToOutputMap,
			bundle,
			format,
		);
	}

	// Step 3: Apply custom transform if provided
	if (transform) {
		result = transform(result);
	}

	return result;
}
