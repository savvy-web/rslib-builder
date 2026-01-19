import sortPkg from "sort-package-json";
import type { PackageJson } from "type-fest";
import { PnpmCatalog, getDefaultPnpmCatalog } from "#utils/pnpm-catalog.js";

/**
 * Flexible type definition for package.json exports field that accommodates various export formats.
 *
 * @remarks
 * This type extends the standard PackageJson.Exports to allow for custom fields and nested
 * structures commonly found in complex package configurations. It supports:
 * - Standard exports objects with conditions
 * - Custom field exports
 * - Array-based exports (for fallbacks)
 * - Null/undefined values for conditional exports
 */
export type FlexibleExports = PackageJson.Exports | Record<string, unknown> | FlexibleExports[] | undefined | null;

/**
 * Configuration structure for pnpm workspace files (pnpm-workspace.yaml).
 *
 * @remarks
 * This interface defines the structure of pnpm-workspace.yaml files, which configure
 * workspace behavior including package locations, dependency catalogs, and build options.
 */
export interface PnpmWorkspace {
	/** Array of glob patterns defining workspace package locations */
	packages?: string[];
	/** Centralized dependency version catalog */
	catalog?: Record<string, string>;
	/** Dependencies that should only be built, not installed from registry */
	onlyBuiltDependencies?: string[];
	/** Patterns for dependencies that should be hoisted to workspace root */
	publicHoistPattern?: string[];
}

/**
 * Prefix used by pnpm to reference catalog-defined dependency versions.
 */
export const CATALOG_PREFIX = "catalog:";

/**
 * Prefix used by pnpm to reference workspace package dependencies.
 */
export const WORKSPACE_PREFIX = "workspace:";

/**
 * Options for transforming package.json.
 * @public
 */
export interface PackageJsonTransformOptions {
	/**
	 * Whether to process TypeScript exports (convert .ts to .js and add types field).
	 * @defaultValue true
	 */
	processTSExports?: boolean;

	/**
	 * Whether to collapse index files (./foo/index.ts becomes ./foo.js).
	 * This is typically true for bundled builds.
	 * @defaultValue false
	 */
	collapseIndex?: boolean;

	/**
	 * Map of export paths to entry files (from AutoEntryPlugin).
	 */
	entrypoints?: Map<string, string>;

	/**
	 * Map of export paths to output files (for exportsAsIndexes mode).
	 */
	exportToOutputMap?: Map<string, string>;
}

/**
 * Transforms package.json for build output and publishing.
 *
 * @remarks
 * This class consolidates all package.json transformation logic including:
 * - Path transformations (src/ to dist/, .ts to .js)
 * - Export conditions generation (types, import, require)
 * - Bin field transformations
 * - PNPM catalog and workspace resolution
 * - Field cleanup for publishing
 *
 * @example
 * ```typescript
 * const transformer = new PackageJsonTransformer({
 *   processTSExports: true,
 *   collapseIndex: true,
 * });
 *
 * // For production builds (resolves catalog: and workspace: references)
 * const prodPkg = await transformer.transform(packageJson, { isProduction: true });
 *
 * // For development builds (preserves workspace links)
 * const devPkg = await transformer.transform(packageJson, { isProduction: false });
 * ```
 *
 * @public
 */
export class PackageJsonTransformer {
	private readonly options: Required<PackageJsonTransformOptions>;
	private readonly pnpmCatalog: PnpmCatalog;

	constructor(options: PackageJsonTransformOptions = {}) {
		this.options = {
			processTSExports: options.processTSExports ?? true,
			collapseIndex: options.collapseIndex ?? false,
			entrypoints: options.entrypoints ?? new Map(),
			exportToOutputMap: options.exportToOutputMap ?? new Map(),
		};
		this.pnpmCatalog = new PnpmCatalog();
	}

	/**
	 * Transforms a single export path for RSLib compatibility.
	 *
	 * @remarks
	 * Performs several transformations:
	 * 1. Strips source directory prefixes (exports/, public/, src/)
	 * 2. Converts TypeScript extensions to JavaScript
	 * 3. Preserves bin/ prefix for executables
	 *
	 * @param path - The file path to transform
	 * @returns The transformed path
	 *
	 * @example
	 * ```typescript
	 * transformer.transformExportPath("./src/index.ts"); // "./index.js"
	 * transformer.transformExportPath("./bin/cli.ts");   // "./bin/cli.js"
	 * ```
	 */
	transformExportPath(path: string): string {
		let transformedPath = path;

		// Strip prefixes - RSLib handles the build output structure
		if (transformedPath.startsWith("./exports/")) {
			transformedPath = `./${transformedPath.slice("./exports/".length)}`;
		} else if (transformedPath.startsWith("./public/")) {
			transformedPath = `./${transformedPath.slice("./public/".length)}`;
		} else if (transformedPath.startsWith("./src/")) {
			transformedPath = `./${transformedPath.slice("./src/".length)}`;
		}

		if (this.options.processTSExports) {
			const { collapseIndex } = this.options;

			// In bundled mode (collapseIndex=true), rslib collapses /index.ts files
			if (collapseIndex && transformedPath.endsWith("/index.ts") && transformedPath !== "./index.ts") {
				transformedPath = `${transformedPath.slice(0, -"/index.ts".length)}.js`;
			} else if (collapseIndex && transformedPath.endsWith("/index.tsx") && transformedPath !== "./index.tsx") {
				transformedPath = `${transformedPath.slice(0, -"/index.tsx".length)}.js`;
			} else if (transformedPath.endsWith(".tsx")) {
				transformedPath = `${transformedPath.slice(0, -4)}.js`;
			} else if (transformedPath.endsWith(".ts") && !transformedPath.endsWith(".d.ts")) {
				transformedPath = `${transformedPath.slice(0, -3)}.js`;
			}
		}

		return transformedPath;
	}

	/**
	 * Creates a TypeScript declaration file path from a JavaScript file path.
	 *
	 * @param jsPath - The JavaScript file path
	 * @returns The corresponding .d.ts file path
	 *
	 * @example
	 * ```typescript
	 * transformer.createTypePath("./index.js");      // "./index.d.ts"
	 * transformer.createTypePath("./rslib/index.js"); // "./rslib.d.ts" (bundled)
	 * ```
	 */
	createTypePath(jsPath: string): string {
		const { collapseIndex } = this.options;

		// Special handling for bundled mode where JS is ./foo/index.js but types are ./foo.d.ts
		if (collapseIndex && jsPath.endsWith("/index.js") && jsPath !== "./index.js") {
			return `${jsPath.slice(0, -"/index.js".length)}.d.ts`;
		}

		if (jsPath.endsWith(".js")) {
			return `${jsPath.slice(0, -3)}.d.ts`;
		}
		return `${jsPath}.d.ts`;
	}

	/**
	 * Transforms package.json exports field recursively.
	 *
	 * @param exports - The exports value to transform
	 * @param exportKey - The current export key for context
	 * @returns The transformed exports value
	 */
	transformExports(exports: FlexibleExports, exportKey?: string): FlexibleExports {
		if (typeof exports === "string") {
			return this.transformStringExport(exports, exportKey);
		}

		if (Array.isArray(exports)) {
			return exports.map((item) => {
				const transformed = this.transformExports(item as FlexibleExports, exportKey);
				return transformed ?? item;
			});
		}

		if (exports && typeof exports === "object") {
			return this.transformObjectExports(exports as Record<string, unknown>, exportKey);
		}

		return exports;
	}

	/**
	 * Transforms the bin field for build output.
	 *
	 * @param bin - The bin field from package.json
	 * @returns The transformed bin field
	 */
	transformBin(bin: PackageJson["bin"]): PackageJson["bin"] {
		if (typeof bin === "string") {
			return this.transformExportPath(bin);
		}

		if (bin && typeof bin === "object") {
			const transformed: Record<string, string> = {};
			for (const [command, path] of Object.entries(bin)) {
				if (path !== undefined) {
					transformed[command] = this.transformExportPath(path);
				}
			}
			return transformed;
		}

		return bin;
	}

	/**
	 * Performs the complete package.json transformation.
	 *
	 * @param packageJson - The source package.json
	 * @param context - Transform context with properties:
	 *   - `isProduction`: Whether this is a production build
	 *   - `customTransform`: Optional custom transform function
	 * @returns The transformed package.json
	 */
	async transform(
		packageJson: PackageJson,
		context: {
			isProduction?: boolean;
			customTransform?: (pkg: PackageJson) => PackageJson;
		} = {},
	): Promise<PackageJson> {
		const { isProduction = false, customTransform } = context;

		let result: PackageJson;

		if (isProduction) {
			// Apply PNPM transformations first (resolve catalog: and workspace: references)
			const pnpmTransformed = await this.applyPnpmTransformations(packageJson);
			result = this.applyRslibTransformations(pnpmTransformed, packageJson);
		} else {
			// For development, skip PNPM transformations to preserve workspace links
			result = this.applyRslibTransformations(packageJson, packageJson);
		}

		if (customTransform) {
			result = customTransform(result);
		}

		return result;
	}

	/**
	 * Applies PNPM-specific transformations (catalog and workspace resolution).
	 */
	private async applyPnpmTransformations(packageJson: PackageJson): Promise<PackageJson> {
		return this.pnpmCatalog.resolvePackageJson(packageJson);
	}

	/**
	 * Applies RSLib-specific transformations.
	 */
	private applyRslibTransformations(packageJson: PackageJson, originalPackageJson: PackageJson): PackageJson {
		// Remove unwanted fields
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

		// Transform exports
		if (processedManifest.exports) {
			processedManifest.exports = this.transformExports(processedManifest.exports) as PackageJson.Exports;
		}

		// Transform bin
		if (processedManifest.bin) {
			processedManifest.bin = this.transformBin(processedManifest.bin);
		}

		// Transform typesVersions
		if (originalPackageJson.typesVersions) {
			const transformedTypesVersions: Record<string, Record<string, string[]>> = {};

			for (const [version, paths] of Object.entries(originalPackageJson.typesVersions)) {
				const transformedPaths: Record<string, string[]> = {};

				for (const [key, value] of Object.entries(paths as Record<string, string[]>)) {
					transformedPaths[key] = value.map((path) => this.transformExportPath(path));
				}

				transformedTypesVersions[version] = transformedPaths;
			}

			processedManifest.typesVersions = transformedTypesVersions;
		}

		// Transform files array
		if (originalPackageJson.files) {
			processedManifest.files = originalPackageJson.files.map((file) => {
				let transformedFile = file.startsWith("./") ? file.slice(2) : file;
				if (transformedFile.startsWith("public/")) {
					transformedFile = transformedFile.slice("public/".length);
				}
				return transformedFile;
			});
		}

		return sortPkg(processedManifest);
	}

	/**
	 * Transforms a string export value.
	 */
	private transformStringExport(exportString: string, exportKey?: string): FlexibleExports {
		const { entrypoints, exportToOutputMap, processTSExports } = this.options;

		let transformedPath: string;

		// Check for direct mapping from exportToOutputMap (for exportsAsIndexes)
		if (exportToOutputMap.size > 0 && exportKey && exportToOutputMap.has(exportKey)) {
			const mappedPath = exportToOutputMap.get(exportKey);
			if (!mappedPath) {
				throw new Error(`Export key "${exportKey}" has no mapped path`);
			}
			transformedPath = mappedPath;
		} else if (entrypoints.size > 0 && exportKey) {
			// Check entrypoints map for updated paths
			const keyWithoutPrefix = exportKey.startsWith("./") ? exportKey.slice(2) : exportKey;
			if (entrypoints.has(exportKey)) {
				transformedPath = entrypoints.get(exportKey) ?? exportString;
			} else if (entrypoints.has(keyWithoutPrefix)) {
				transformedPath = entrypoints.get(keyWithoutPrefix) ?? exportString;
			} else {
				transformedPath = this.transformExportPath(exportString);
			}
		} else {
			transformedPath = this.transformExportPath(exportString);
		}

		// Generate export conditions for TypeScript files
		if (
			processTSExports &&
			(exportString.endsWith(".ts") || exportString.endsWith(".tsx")) &&
			!exportString.endsWith(".d.ts")
		) {
			return {
				types: this.createTypePath(transformedPath),
				import: transformedPath,
			};
		}

		return transformedPath;
	}

	/**
	 * Transforms an object export value.
	 */
	private transformObjectExports(exportsObject: Record<string, unknown>, exportKey?: string): Record<string, unknown> {
		const transformed: Record<string, unknown> = {};
		const isConditions = this.isConditionsObject(exportsObject);

		for (const [key, value] of Object.entries(exportsObject)) {
			transformed[key] = this.transformExportEntry(key, value, isConditions, exportKey);
		}

		return transformed;
	}

	/**
	 * Determines if an export object represents export conditions.
	 */
	private isConditionsObject(exports: Record<string, unknown>): boolean {
		return Object.keys(exports).some(
			(key) => key === "import" || key === "require" || key === "types" || key === "default",
		);
	}

	/**
	 * Transforms a single export entry.
	 */
	private transformExportEntry(key: string, value: unknown, isConditions: boolean, exportKey?: string): unknown {
		if (isConditions && (key === "import" || key === "require" || key === "types" || key === "default")) {
			if (typeof value === "string") {
				return this.transformExportPath(value);
			}
			if (value !== undefined && value !== null) {
				return this.transformExports(value as FlexibleExports, exportKey);
			}
			return value;
		}

		if (value !== undefined && value !== null) {
			return this.transformExports(value as FlexibleExports, key);
		}
		return value;
	}
}

// ============================================================================
// Standalone functions for backwards compatibility and direct usage
// ============================================================================

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
 * @param path - The file path to transform
 * @param processTSExports - Whether to process TypeScript file extensions
 * @param collapseIndex - Whether to collapse index files (bundled mode)
 * @returns The transformed path suitable for the build output
 *
 * @example
 * ```typescript
 * transformExportPath("./src/index.ts"); // "./index.js"
 * transformExportPath("./bin/cli.ts"); // "./bin/cli.js"
 * ```
 */
export function transformExportPath(
	path: string,
	processTSExports: boolean = true,
	collapseIndex: boolean = false,
): string {
	let transformedPath = path;

	// Strip prefixes - RSLib handles the build output structure
	if (transformedPath.startsWith("./exports/")) {
		transformedPath = `./${transformedPath.slice("./exports/".length)}`;
	} else if (transformedPath.startsWith("./public/")) {
		transformedPath = `./${transformedPath.slice("./public/".length)}`;
	} else if (transformedPath.startsWith("./src/")) {
		transformedPath = `./${transformedPath.slice("./src/".length)}`;
	}

	if (processTSExports) {
		if (collapseIndex && transformedPath.endsWith("/index.ts") && transformedPath !== "./index.ts") {
			transformedPath = `${transformedPath.slice(0, -"/index.ts".length)}.js`;
		} else if (collapseIndex && transformedPath.endsWith("/index.tsx") && transformedPath !== "./index.tsx") {
			transformedPath = `${transformedPath.slice(0, -"/index.tsx".length)}.js`;
		} else if (transformedPath.endsWith(".tsx")) {
			transformedPath = `${transformedPath.slice(0, -4)}.js`;
		} else if (transformedPath.endsWith(".ts") && !transformedPath.endsWith(".d.ts")) {
			transformedPath = `${transformedPath.slice(0, -3)}.js`;
		}
	}

	return transformedPath;
}

/**
 * Creates a TypeScript declaration file path from a JavaScript file path.
 *
 * @param jsPath - The JavaScript file path
 * @param collapseIndex - Whether to collapse /index paths (bundled mode)
 * @returns The corresponding TypeScript declaration file path
 *
 * @example
 * ```typescript
 * createTypePath("./index.js", true); // "./index.d.ts"
 * createTypePath("./rslib/index.js", true); // "./rslib.d.ts" (collapsed)
 * ```
 */
export function createTypePath(jsPath: string, collapseIndex: boolean = true): string {
	if (collapseIndex && jsPath.endsWith("/index.js") && jsPath !== "./index.js") {
		return `${jsPath.slice(0, -"/index.js".length)}.d.ts`;
	}

	if (jsPath.endsWith(".js")) {
		return `${jsPath.slice(0, -3)}.d.ts`;
	}
	return `${jsPath}.d.ts`;
}

/**
 * Transforms the package.json bin field for build output compatibility.
 *
 * @param bin - The bin field value from package.json
 * @param processTSExports - Whether to process TypeScript file extensions
 * @returns The transformed bin field with updated paths
 *
 * @example
 * ```typescript
 * transformPackageBin("./src/cli.ts"); // "./cli.js"
 * transformPackageBin({ "my-tool": "./src/cli.ts" }); // { "my-tool": "./cli.js" }
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

/**
 * Determines if an export object represents export conditions rather than subpath exports.
 *
 * @param exports - Export object to check
 * @returns True if the object contains export conditions, false for subpath exports
 */
export function isConditionsObject(exports: Record<string, unknown>): boolean {
	return Object.keys(exports).some(
		(key) => key === "import" || key === "require" || key === "types" || key === "default",
	);
}

/**
 * Recursively transforms package.json exports field.
 *
 * @param exports - The exports value to transform
 * @param processTSExports - Whether to process TypeScript file extensions
 * @param exportKey - The export key for context
 * @param entrypoints - Map of export paths to entry files
 * @param exportToOutputMap - Map of export paths to output files
 * @param collapseIndex - Whether to collapse index files (bundled mode)
 * @returns The transformed exports value
 */
export function transformPackageExports(
	exports: FlexibleExports,
	processTSExports: boolean = true,
	exportKey?: string,
	entrypoints?: Map<string, string>,
	exportToOutputMap?: Map<string, string>,
	collapseIndex: boolean = false,
): FlexibleExports {
	if (typeof exports === "string") {
		return transformStringExport(exports, processTSExports, exportKey, entrypoints, exportToOutputMap, collapseIndex);
	}

	if (Array.isArray(exports)) {
		return exports.map((item) => {
			const transformed = transformPackageExports(
				item as FlexibleExports,
				processTSExports,
				exportKey,
				entrypoints,
				exportToOutputMap,
				collapseIndex,
			);
			return transformed ?? item;
		});
	}

	if (exports && typeof exports === "object") {
		return transformObjectExports(
			exports as Record<string, unknown>,
			processTSExports,
			exportKey,
			entrypoints,
			exportToOutputMap,
			collapseIndex,
		);
	}

	/* v8 ignore next -- @preserve */
	return exports;
}

/**
 * Transforms string-based export values with special handling for TypeScript files.
 */
function transformStringExport(
	exportString: string,
	processTSExports: boolean,
	exportKey?: string,
	entrypoints?: Map<string, string>,
	exportToOutputMap?: Map<string, string>,
	collapseIndex: boolean = false,
): FlexibleExports {
	let transformedPath: string;
	if (exportToOutputMap && exportKey && exportToOutputMap.has(exportKey)) {
		const mappedPath = exportToOutputMap.get(exportKey);
		if (!mappedPath) {
			throw new Error(`Export key "${exportKey}" has no mapped path`);
		}
		transformedPath = mappedPath;
	} else if (entrypoints && exportKey) {
		const keyWithoutPrefix = exportKey.startsWith("./") ? exportKey.slice(2) : exportKey;
		if (entrypoints.has(exportKey)) {
			transformedPath = entrypoints.get(exportKey) ?? exportString;
		} else if (entrypoints.has(keyWithoutPrefix)) {
			transformedPath = entrypoints.get(keyWithoutPrefix) ?? exportString;
		} else {
			transformedPath = transformExportPath(exportString, processTSExports, collapseIndex);
		}
	} else {
		transformedPath = transformExportPath(exportString, processTSExports, collapseIndex);
	}

	if (
		processTSExports &&
		(exportString.endsWith(".ts") || exportString.endsWith(".tsx")) &&
		!exportString.endsWith(".d.ts")
	) {
		return {
			types: createTypePath(transformedPath, collapseIndex),
			import: transformedPath,
		};
	}

	return transformedPath;
}

/**
 * Transforms object exports by processing each entry appropriately.
 */
function transformObjectExports(
	exportsObject: Record<string, unknown>,
	processTSExports: boolean,
	exportKey?: string,
	entrypoints?: Map<string, string>,
	exportToOutputMap?: Map<string, string>,
	collapseIndex: boolean = false,
): Record<string, unknown> {
	const transformed: Record<string, unknown> = {};
	const isConditions = isConditionsObject(exportsObject);

	for (const [key, value] of Object.entries(exportsObject)) {
		transformed[key] = transformExportEntry(
			key,
			value,
			isConditions,
			processTSExports,
			exportKey,
			entrypoints,
			exportToOutputMap,
			collapseIndex,
		);
	}

	return transformed;
}

/**
 * Transforms a single export entry (key-value pair) based on whether it's a condition or subpath.
 */
function transformExportEntry(
	key: string,
	value: unknown,
	isConditions: boolean,
	processTSExports: boolean,
	exportKey?: string,
	entrypoints?: Map<string, string>,
	exportToOutputMap?: Map<string, string>,
	collapseIndex: boolean = false,
): unknown {
	if (isConditions && (key === "import" || key === "require" || key === "types" || key === "default")) {
		if (typeof value === "string") {
			return transformExportPath(value, processTSExports, collapseIndex);
		}
		if (value !== undefined && value !== null) {
			return transformPackageExports(
				value as FlexibleExports,
				processTSExports,
				exportKey,
				entrypoints,
				exportToOutputMap,
				collapseIndex,
			);
		}
		return value;
	}

	if (value !== undefined && value !== null) {
		return transformPackageExports(
			value as FlexibleExports,
			processTSExports,
			key,
			entrypoints,
			exportToOutputMap,
			collapseIndex,
		);
	}
	return value;
}

/**
 * Applies RSLib-specific transformations to package.json for build output compatibility.
 *
 * @param packageJson - The package.json to transform (typically after pnpm transformations)
 * @param originalPackageJson - The original source package.json for reference
 * @param processTSExports - Whether to process TypeScript file extensions and generate type conditions
 * @param entrypoints - Map of export paths to entry files
 * @param exportToOutputMap - Map of export paths to output files
 * @param bundle - Whether the build is in bundle mode
 * @returns The transformed package.json ready for build output
 */
export function applyRslibTransformations(
	packageJson: PackageJson,
	originalPackageJson: PackageJson,
	processTSExports: boolean = true,
	entrypoints?: Map<string, string>,
	exportToOutputMap?: Map<string, string>,
	bundle?: boolean,
): PackageJson {
	const { publishConfig, scripts, ...rest } = packageJson;

	let isPrivate = true;
	if (originalPackageJson.publishConfig?.access === "public") {
		isPrivate = false;
	}

	const processedManifest = {
		...rest,
		private: isPrivate,
	} as PackageJson;

	if (processedManifest.exports) {
		processedManifest.exports = transformPackageExports(
			processedManifest.exports,
			processTSExports,
			undefined,
			entrypoints,
			exportToOutputMap,
			bundle ?? false,
		) as PackageJson.Exports;
	}

	if (processedManifest.bin) {
		processedManifest.bin = transformPackageBin(processedManifest.bin, processTSExports);
	}

	if (originalPackageJson.typesVersions) {
		const transformedTypesVersions: Record<string, Record<string, string[]>> = {};

		for (const [version, paths] of Object.entries(originalPackageJson.typesVersions)) {
			const transformedPaths: Record<string, string[]> = {};

			for (const [key, value] of Object.entries(paths as Record<string, string[]>)) {
				transformedPaths[key] = value.map((path) => transformExportPath(path, processTSExports, bundle ?? false));
			}

			transformedTypesVersions[version] = transformedPaths;
		}

		processedManifest.typesVersions = transformedTypesVersions;
	}

	if (originalPackageJson.files) {
		processedManifest.files = originalPackageJson.files.map((file) => {
			let transformedFile = file.startsWith("./") ? file.slice(2) : file;
			if (transformedFile.startsWith("public/")) {
				transformedFile = transformedFile.slice("public/".length);
			}
			return transformedFile;
		});
	}

	return sortPkg(processedManifest);
}

/**
 * Applies pnpm-specific transformations to package.json for publishing compatibility.
 *
 * @param packageJson - The source package.json to transform
 * @param dir - The directory containing the package (defaults to current working directory)
 * @returns Promise resolving to the transformed package.json
 */
export async function applyPnpmTransformations(
	packageJson: PackageJson,
	dir: string = process.cwd(),
): Promise<PackageJson> {
	return getDefaultPnpmCatalog().resolvePackageJson(packageJson, dir);
}

/**
 * Performs complete package.json transformation for build output and publishing.
 *
 * @remarks
 * This is the main entry point for package.json transformation, orchestrating both
 * pnpm-specific and RSLib-specific transformations in the correct order.
 *
 * @param packageJson - The source package.json to transform
 * @param isProduction - Whether this is a production build requiring dependency resolution
 * @param processTSExports - Whether to process TypeScript files and generate export conditions
 * @param entrypoints - Map of export paths to entry files (from AutoEntryPlugin)
 * @param exportToOutputMap - Map of export paths to output files (for exportsAsIndexes mode)
 * @param bundle - Whether the build is in bundle mode
 * @param transform - Optional custom transform function to modify package.json after standard transformations
 * @returns Promise resolving to the fully transformed package.json
 */
export async function buildPackageJson(
	packageJson: PackageJson,
	isProduction: boolean = false,
	processTSExports: boolean = true,
	entrypoints?: Map<string, string>,
	exportToOutputMap?: Map<string, string>,
	bundle?: boolean,
	transform?: (pkg: PackageJson) => PackageJson,
): Promise<PackageJson> {
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
		);
	} else {
		result = applyRslibTransformations(
			packageJson,
			packageJson,
			processTSExports,
			entrypoints,
			exportToOutputMap,
			bundle,
		);
	}

	if (transform) {
		result = transform(result);
	}

	return result;
}

// Re-export for backwards compatibility with old imports
export { transformPackageExports as transformArrayExports };
export { transformExportEntry as transformExportEntryCompat };
