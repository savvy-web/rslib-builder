import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ProcessAssetsHandler, Rspack } from "@rsbuild/core";

/**
 * Represents a text-based asset in the Rsbuild compilation process.
 *
 * @remarks
 * This class provides a wrapper around Rsbuild's asset system for handling text files
 * such as README.md, LICENSE, or other plain text assets. It supports both reading
 * existing assets from the compilation context and loading files from the filesystem.
 *
 * The class handles the conversion between Rsbuild's internal asset representation
 * and a more convenient string-based interface for manipulation.
 *
 * @example
 * ```typescript
 * // Create a text asset for a README file (optional)
 * const readme = await TextAsset.create(context, "README.md", false);
 * if (readme) {
 *   readme.source = "# Updated README\n\nNew content";
 *   readme.update();
 * }
 *
 * // Create a required license file
 * const license = await TextAsset.create(context, "LICENSE", true);
 * console.log(license.source); // File contents as string
 * ```
 */
export class TextAsset {
	/** The underlying Rsbuild asset source object */
	protected asset: Rspack.sources.Source;

	/** The string content of the asset, editable for modifications */
	public source: string;

	/**
	 * Creates a new TextAsset instance from an existing asset in the compilation context.
	 *
	 * @remarks
	 * This constructor is typically not called directly. Use the static `create` method
	 * instead, which handles both existing assets and filesystem loading.
	 *
	 * @param compiler - The Rsbuild compilation context containing assets and sources
	 * @param _fileName - The name of the asset file to wrap
	 * @throws {Error} Throws if the asset doesn't exist in the compilation context
	 */
	constructor(
		protected compiler: Parameters<ProcessAssetsHandler>[0],
		private _fileName: string,
	) {
		this.asset = compiler.assets[_fileName];
		this.source = this.asset.source().toString();
	}

	/**
	 * Gets the file name of this asset.
	 *
	 * @returns The file name as specified during construction
	 */
	get fileName(): string {
		return this._fileName;
	}

	/**
	 * Updates the asset in the compilation with the current source content.
	 *
	 * @remarks
	 * This method synchronizes any changes made to the `source` property back to
	 * the Rsbuild compilation context. Call this method after modifying the source
	 * content to ensure changes are reflected in the final build output.
	 *
	 * Uses RawSource to avoid unnecessary source map generation for text files.
	 *
	 * @example
	 * ```typescript
	 * const readme = await TextAsset.create(context, "README.md", false);
	 * if (readme) {
	 *   readme.source = readme.source.replace("old text", "new text");
	 *   readme.update(); // Persist changes to compilation
	 * }
	 * ```
	 */
	update(): void {
		const updatedSource = new this.compiler.sources.RawSource(this.source);
		this.compiler.compilation.updateAsset(this.fileName, updatedSource);
	}

	/**
	 * Creates a TextAsset instance by loading from compilation assets or filesystem.
	 *
	 * @remarks
	 * This method first checks if the asset already exists in the compilation context.
	 * If not found, it attempts to read the file from the filesystem relative to the
	 * current working directory. The behavior when files are missing depends on the
	 * `required` parameter.
	 *
	 * For required files (like LICENSE or important documentation), the method throws
	 * an error if the file cannot be found. For optional files (like README.md), it
	 * returns null instead, allowing graceful handling of missing files.
	 *
	 * @param context - The Rsbuild compilation context with assets and compilation methods
	 * @param fileName - The name of the file to load (relative to project root)
	 * @param required - Whether the file is required (defaults to true)
	 * @returns Promise resolving to TextAsset instance, or null if not required and missing
	 * @throws {Error} Throws if required file cannot be loaded or parsed
	 *
	 * @example
	 * ```typescript
	 * // Load required license file (throws if missing)
	 * const license = await TextAsset.create(context, "LICENSE", true);
	 *
	 * // Load optional README (returns null if missing)
	 * const readme = await TextAsset.create(context, "README.md", false);
	 * if (readme) {
	 *   console.log("README found:", readme.source.length, "characters");
	 * }
	 * ```
	 */
	static async create(
		context: Parameters<ProcessAssetsHandler>[0],
		fileName: string,
		required: boolean = true,
	): Promise<TextAsset | null> {
		let asset = context.assets[fileName];
		if (asset) {
			return new TextAsset(context, fileName);
		}
		try {
			const filePath = join(process.cwd(), fileName);
			const content = await readFile(filePath, "utf-8");
			// Use RawSource for plain text files to avoid source map generation
			const source = new context.sources.RawSource(content);
			context.compilation.emitAsset(fileName, source);
			asset = source;
			return new TextAsset(context, fileName);
		} catch (error) {
			if (required) {
				throw new Error(
					`Failed to load text asset: ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			return null;
		}
	}
}

/**
 * Represents a JSON-based asset in the Rsbuild compilation process.
 *
 * @remarks
 * This class extends TextAsset to provide specialized handling for JSON files such as
 * package.json, tsconfig.json, or other configuration files. It automatically parses
 * the JSON content and provides type-safe access to the data structure.
 *
 * The class maintains both the raw string content (inherited from TextAsset) and the
 * parsed data object, automatically synchronizing between them when updates are made.
 *
 * @typeParam T - The expected type structure of the JSON data
 *
 * @example
 * ```typescript
 * import type { PackageJson } from "type-fest";
 *
 * // Load package.json with type safety
 * const pkg = await JsonAsset.create<PackageJson>(context, "package.json", true);
 * if (pkg) {
 *   console.log("Package name:", pkg.data.name);
 *   pkg.data.version = "2.0.0";
 *   pkg.update(); // Automatically stringifies and updates
 * }
 * ```
 */
export class JsonAsset<T> extends TextAsset {
	/** The parsed JSON data with type safety */
	public data: T;

	/**
	 * Creates a new JsonAsset instance from an existing asset in the compilation context.
	 *
	 * @remarks
	 * This constructor automatically parses the JSON content from the source string.
	 * Use the static `create` method instead of calling this constructor directly.
	 *
	 * @param compiler - The Rsbuild compilation context containing assets and sources
	 * @param fileName - The name of the JSON file to wrap
	 * @throws {Error} Throws if the JSON content cannot be parsed
	 */
	constructor(compiler: Parameters<ProcessAssetsHandler>[0], fileName: string) {
		super(compiler, fileName);
		try {
			this.data = JSON.parse(this.source) as T;
		} catch (error) {
			throw new Error(`Failed to parse JSON in ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Updates the asset in the compilation with the current JSON data.
	 *
	 * @remarks
	 * This method automatically stringifies the `data` object to JSON format with
	 * tab indentation, updates the source string, and then calls the parent class
	 * update method to persist changes to the compilation context.
	 *
	 * The JSON is formatted with tab indentation for better readability in the
	 * output files.
	 *
	 * @example
	 * ```typescript
	 * const pkg = await JsonAsset.create<PackageJson>(context, "package.json", true);
	 * if (pkg) {
	 *   pkg.data.scripts = { ...pkg.data.scripts, build: "tsc" };
	 *   pkg.update(); // Serializes data to JSON and updates compilation
	 * }
	 * ```
	 */
	update(): void {
		this.source = JSON.stringify(this.data, null, "\t");
		super.update();
	}

	/**
	 * Creates a JsonAsset instance by loading from compilation assets or filesystem.
	 *
	 * @remarks
	 * This method provides the same loading behavior as TextAsset.create but with
	 * automatic JSON parsing. It defaults to `required: false` since many JSON
	 * configuration files are optional in build processes.
	 *
	 * The method first checks for existing assets in the compilation, then attempts
	 * filesystem loading if needed. JSON parsing occurs during construction, so
	 * parse errors will be thrown even for non-required files.
	 *
	 * @typeParam T - The expected type structure of the JSON data
	 * @param context - The Rsbuild compilation context with assets and compilation methods
	 * @param fileName - The name of the JSON file to load (relative to project root)
	 * @param required - Whether the file is required (defaults to false for JSON files)
	 * @returns Promise resolving to JsonAsset instance, or null if not required and missing
	 * @throws {Error} Throws if required file cannot be loaded, or if JSON parsing fails
	 *
	 * @example
	 * ```typescript
	 * import type { PackageJson } from "type-fest";
	 *
	 * // Load package.json (typically required)
	 * const pkg = await JsonAsset.create<PackageJson>(context, "package.json", true);
	 * console.log("Package version:", pkg?.data.version);
	 *
	 * // Load optional config file
	 * const config = await JsonAsset.create<MyConfig>(context, "custom.config.json", false);
	 * if (config) {
	 *   console.log("Config loaded:", config.data);
	 * } else {
	 *   console.log("Using default configuration");
	 * }
	 * ```
	 *
	 * @see {@link TextAsset.create} for text-based asset creation
	 */
	static async create<T>(
		context: Parameters<ProcessAssetsHandler>[0],
		fileName: string,
		required: boolean = false,
	): Promise<JsonAsset<T> | null> {
		let asset = context.assets[fileName];
		if (asset) {
			return new JsonAsset<T>(context, fileName);
		}
		try {
			const filePath = join(process.cwd(), fileName);
			const content = await readFile(filePath, "utf-8");
			const source = new context.sources.RawSource(content);
			context.compilation.emitAsset(fileName, source);
			asset = source;
			return new JsonAsset<T>(context, fileName);
		} catch (err) {
			if (required) {
				throw new Error(`Failed to load JSON asset: ${fileName}: ${err instanceof Error ? err.message : String(err)}`);
			}
			return null;
		}
	}
}

/**
 * Cache entry for file contents with modification time tracking.
 */
export interface CacheEntry {
	content: string;
	mtime: number;
}

/**
 * Cache type for asset processor.
 */
export type AssetCache = Map<string, CacheEntry>;

/**
 * Result of checking file existence.
 */
export interface FileExistResult {
	assetName: string;
	assetPath: string;
	assetExists: boolean;
}

/**
 * Asynchronously checks if a file exists in the current working directory.
 *
 * @remarks
 * This function safely checks file existence without throwing errors for missing files.
 * It uses the Node.js `fs.stat()` method internally and catches any filesystem errors.
 * The file path is resolved relative to the current working directory using `process.cwd()`.
 *
 * @param assetName - The relative path to the file from the current working directory
 * @returns A promise that resolves to file existence info
 *
 * @example
 * ```typescript
 * // Check if package.json exists in the current directory
 * const { assetExists } = await fileExistAsync('package.json');
 * console.log(assetExists); // true or false
 *
 * // Check if a nested file exists
 * const { assetPath, assetExists } = await fileExistAsync('src/index.ts');
 * if (assetExists) {
 *   console.log('File found at:', assetPath);
 * }
 * ```
 */
export async function fileExistAsync(assetName: string): Promise<FileExistResult> {
	const assetPath = join(process.cwd(), assetName);
	const assetExists = !!(await stat(assetPath).catch(() => false));
	return {
		assetName,
		assetPath,
		assetExists,
	};
}

/**
 * Creates an asset emission processor with caching for improved performance.
 *
 * @remarks
 * This factory function creates a ProcessAssetsHandler that emits files as assets
 * with intelligent caching based on file modification time. This improves performance
 * in watch mode and repeated builds by avoiding unnecessary file reads.
 *
 * @param filename - The name of the file to process
 * @param cache - The cache map for storing file contents
 * @returns A ProcessAssetsHandler function
 *
 * @example
 * ```typescript
 * const cache: AssetCache = new Map();
 * const processor = createAssetProcessor("README.md", cache);
 *
 * // Use in Rsbuild plugin
 * api.processAssets({ stage: "additional" }, processor);
 * ```
 */
export function createAssetProcessor(filename: string, cache: AssetCache): ProcessAssetsHandler {
	return async (context: Parameters<ProcessAssetsHandler>[0]): Promise<void> => {
		const { assetName, assetPath, assetExists } = await fileExistAsync(filename);
		if (assetExists) {
			// Read and cache file content for repeated builds
			const cacheKey = `${filename}-${assetPath}`;
			const fileStats = await stat(assetPath);
			const currentMtime = fileStats.mtime.getTime();

			let content: string;
			const cachedEntry = cache.get(cacheKey);

			if (cachedEntry && cachedEntry.mtime === currentMtime) {
				// Use cached content if file hasn't changed
				content = cachedEntry.content;
			} else {
				// Read file and update cache
				content = await readFile(assetPath, "utf-8");
				cache.set(cacheKey, {
					content,
					mtime: currentMtime,
				});
			}

			const source = new context.sources.OriginalSource(content, assetName);
			context.compilation.emitAsset(assetName, source);
		}
	};
}

/**
 * Reads the version from package.json in the current working directory.
 *
 * @returns Promise resolving to the package version string
 * @throws {Error} If package.json is not found or version cannot be read
 *
 * @example
 * ```typescript
 * const version = await packageJsonVersion();
 * console.log(`Current version: ${version}`);
 * ```
 */
export async function packageJsonVersion(): Promise<string> {
	const { assetExists, assetPath } = await fileExistAsync("package.json");
	if (!assetExists) {
		throw new Error("package.json not found in project root");
	}
	try {
		const json = await readFile(assetPath, "utf-8");
		const { version } = JSON.parse(json);
		return version;
	} catch {
		throw new Error("Failed to read version from package.json");
	}
}
