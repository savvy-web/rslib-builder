import sortPkg from "sort-package-json";
import type { PackageJson } from "type-fest";
import type { FlexibleExports } from "#utils/package-json-types-utils.js";
import { PnpmCatalog } from "#utils/pnpm-catalog.js";
import type { OutputFormat } from "../../builders/node-library-builder.js";

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
	 * Whether to collapse index files (./foo/index.ts -> ./foo.js).
	 * This is typically true for bundled builds.
	 * @defaultValue false
	 */
	collapseIndex?: boolean;

	/**
	 * Output format - 'esm' or 'cjs'.
	 * @defaultValue 'esm'
	 */
	format?: OutputFormat;

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
 * - Path transformations (src/ -> dist/, .ts -> .js)
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
 *   format: 'esm'
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
			format: options.format ?? "esm",
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
			const extension = this.options.format === "cjs" ? ".cjs" : ".js";
			const { collapseIndex } = this.options;

			// In bundled mode (collapseIndex=true), rslib collapses /index.ts files
			if (collapseIndex && transformedPath.endsWith("/index.ts") && transformedPath !== "./index.ts") {
				transformedPath = `${transformedPath.slice(0, -"/index.ts".length)}${extension}`;
			} else if (collapseIndex && transformedPath.endsWith("/index.tsx") && transformedPath !== "./index.tsx") {
				transformedPath = `${transformedPath.slice(0, -"/index.tsx".length)}${extension}`;
			} else if (transformedPath.endsWith(".tsx")) {
				transformedPath = `${transformedPath.slice(0, -4)}${extension}`;
			} else if (transformedPath.endsWith(".ts") && !transformedPath.endsWith(".d.ts")) {
				transformedPath = `${transformedPath.slice(0, -3)}${extension}`;
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
	 * @param context - Transform context
	 * @param context.isProduction - Whether this is a production build
	 * @param context.customTransform - Optional custom transform function
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
		const { entrypoints, exportToOutputMap, format, processTSExports } = this.options;

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
			const moduleKey = format === "cjs" ? "require" : "import";
			return {
				types: this.createTypePath(transformedPath),
				[moduleKey]: transformedPath,
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
