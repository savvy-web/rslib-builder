import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RsbuildPlugin, SourceConfig } from "@rsbuild/core";
import type { ConfigParams, LibConfig, RslibConfig } from "@rslib/core";
import { defineConfig } from "@rslib/core";
import type { LibraryFormat, PackageJson } from "../../types/package-json.js";
import { AutoEntryPlugin } from "../plugins/auto-entry-plugin.js";
import type { ApiModelOptions } from "../plugins/dts-plugin.js";
import { DtsPlugin } from "../plugins/dts-plugin.js";
import { FilesArrayPlugin } from "../plugins/files-array-plugin.js";
import { PackageJsonTransformPlugin } from "../plugins/package-json-transform-plugin.js";
import type { TsDocLintPluginOptions } from "../plugins/tsdoc-lint-plugin.js";
import { TsDocLintPlugin } from "../plugins/tsdoc-lint-plugin.js";
import { packageJsonVersion } from "../plugins/utils/file-utils.js";
import { VirtualEntryPlugin } from "../plugins/virtual-entry-plugin.js";

/**
 * Async RSLib configuration function type.
 * @public
 */
export type RslibConfigAsyncFn = (env: ConfigParams) => Promise<RslibConfig>;

/**
 * Build target environment for library output.
 *
 * @remarks
 * Each target produces different output optimizations:
 * - `"dev"`: Development build with source maps for debugging
 * - `"npm"`: Production build optimized for npm publishing
 *
 * @example
 * Specifying targets via CLI:
 * ```bash
 * rslib build --env-mode dev
 * rslib build --env-mode npm
 * ```
 *
 * @public
 */
export type BuildTarget = "dev" | "npm";

// Re-export LibraryFormat from types for public API
export type { LibraryFormat } from "../../types/package-json.js";

/**
 * Configuration for a virtual entry point.
 *
 * @remarks
 * Virtual entries are bundled entry points that bypass type generation
 * and package.json exports while still being included in the published package.
 *
 * @example
 * ```typescript
 * const config: VirtualEntryConfig = {
 *   source: "./src/pnpmfile.ts",
 *   format: "cjs",
 * };
 * ```
 *
 * @public
 */
export interface VirtualEntryConfig {
	/**
	 * Path to source file (relative to package root).
	 */
	source: string;

	/**
	 * Output format for this entry.
	 * If not specified, inherits from top-level `format` option.
	 */
	format?: LibraryFormat;
}

/**
 * Function to transform package.json during the build process.
 *
 * @remarks
 * This function is called after all standard transformations are applied,
 * allowing you to modify the package.json before it's written to the output directory.
 * Mutations to the `pkg` object are also supported.
 *
 * @param context - Transform context containing:
 *   - `target`: The current build target ("dev" or "npm")
 *   - `pkg`: The package.json object to transform
 * @returns The modified package.json object
 *
 * @example
 * ```typescript
 * import type { TransformPackageJsonFn } from '@savvy-web/rslib-builder';
 *
 * const transform: TransformPackageJsonFn = ({ target, pkg }) => {
 *   if (target === 'npm') {
 *     delete pkg.devDependencies;
 *     delete pkg.scripts;
 *   }
 *   return pkg;
 * };
 * ```
 * @public
 */
export type TransformPackageJsonFn = (context: { target: BuildTarget; pkg: PackageJson }) => PackageJson;

/**
 * Configuration for copying files during the build process.
 *
 * @remarks
 * This interface mirrors rspack's copy pattern configuration and is passed directly
 * to the rspack CopyPlugin. All properties except `from` are optional.
 *
 * @example
 * ```typescript
 * // Copy a directory
 * { from: "./public", to: "./", context: process.cwd() }
 *
 * // Copy specific files
 * { from: "**\/*.json", to: "./config" }
 * ```
 *
 * @public
 */
export interface CopyPatternConfig {
	/** Source path or glob pattern to copy from */
	from: string;
	/** Destination path (relative to output directory) */
	to?: string;
	/** Base directory for resolving `from` path */
	context?: string;
	/** Type of destination: "dir", "file", or "template" */
	toType?: "dir" | "file" | "template";
	/** If true, does not emit an error if the source is missing */
	noErrorOnMissing?: boolean;
	/** Glob options for pattern matching */
	globOptions?: {
		/** Patterns to ignore */
		ignore?: string[];
		/** Whether to match dotfiles */
		dot?: boolean;
	};
	/** Filter function to include/exclude files */
	filter?: (filepath: string) => boolean | Promise<boolean>;
	/** Transform function to modify file contents */
	transform?:
		| {
				transformer: (input: Buffer, absoluteFilename: string) => string | Buffer | Promise<string> | Promise<Buffer>;
		  }
		| ((input: Buffer, absoluteFilename: string) => string | Buffer | Promise<string> | Promise<Buffer>);
	/** Priority for conflicting files (higher = higher priority) */
	priority?: number;
}

/**
 * Configuration options for the NodeLibraryBuilder.
 *
 * @remarks
 * All options are optional with sensible defaults. The most commonly customized options are:
 * - `externals`: For dependencies that should remain external
 * - `dtsBundledPackages`: For inlining type definitions
 * - `transform`: For custom package.json modifications
 *
 * @example
 * ```typescript
 * import type { NodeLibraryBuilderOptions } from '@savvy-web/rslib-builder';
 *
 * const options: NodeLibraryBuilderOptions = {
 *   externals: ['@rslib/core'],
 *   dtsBundledPackages: ['picocolors'],
 *   apiModel: {
 *     localPaths: ['../docs/packages/my-package'],
 *   },
 * };
 * ```
 *
 * @public
 */
export interface NodeLibraryBuilderOptions {
	/**
	 * Output format for main entry points.
	 * Also determines package.json `type` field:
	 * - `"esm"` → `"type": "module"`
	 * - `"cjs"` → `"type": "commonjs"`
	 *
	 * @defaultValue `"esm"`
	 */
	format?: LibraryFormat;

	/**
	 * Additional entry points bundled with custom output names.
	 * These entries bypass type generation and package.json exports
	 * but are included in the published package.
	 *
	 * @remarks
	 * Virtual entries are useful for special files like pnpm config files
	 * that need to be bundled but don't require type declarations or
	 * exposure as package exports.
	 *
	 * A module may have ONLY virtualEntries with no regular entry points.
	 *
	 * @example
	 * Mixed: regular entries + virtual entries
	 * ```typescript
	 * NodeLibraryBuilder.create({
	 *   virtualEntries: {
	 *     "pnpmfile.cjs": {
	 *       source: "./src/pnpmfile.ts",
	 *       format: "cjs",
	 *     },
	 *   },
	 * })
	 * ```
	 *
	 * @example
	 * Virtual-only: no regular entry points
	 * ```typescript
	 * NodeLibraryBuilder.create({
	 *   format: "cjs",
	 *   virtualEntries: {
	 *     "pnpmfile.cjs": {
	 *       source: "./src/pnpmfile.ts",
	 *     },
	 *   },
	 * })
	 * ```
	 */
	virtualEntries?: Record<string, VirtualEntryConfig>;

	/** Override entry points (optional - will auto-detect from package.json) */
	entry?: Record<string, string | string[]>;
	/**
	 * When enabled, each export path will generate an index.js file in a directory
	 * structure matching the export path, rather than using the export name as the filename.
	 *
	 * @example
	 * When `exportsAsIndexes` is `true`, given this package.json configuration:
	 * ```json
	 * {
	 *   "exports": {
	 *     ".": "./src/entrypoint.ts",
	 *     "./foo/bar": "./src/foo/bar.ts",
	 *     "./foo/baz": "./src/foo/baz.ts"
	 *   }
	 * }
	 * ```
	 *
	 * You would get this output file structure:
	 * ```
	 * dist/
	 *   index.js
	 *   foo/
	 *     bar/
	 *       index.js
	 *     baz/
	 *       index.js
	 * ```
	 */
	exportsAsIndexes?: boolean;
	/**
	 * Patterns for files to copy to the output directory.
	 *
	 * @remarks
	 * Supports both string paths and detailed configuration objects.
	 * A `public/` directory in the project root is automatically added if it exists.
	 *
	 * @defaultValue `[]`
	 */
	copyPatterns: (string | CopyPatternConfig)[];

	/**
	 * Additional Rsbuild plugins to include in the build.
	 *
	 * @remarks
	 * These plugins run after the built-in plugins (AutoEntryPlugin, DtsPlugin, etc.).
	 *
	 * @defaultValue `[]`
	 */
	plugins: RsbuildPlugin[];

	/**
	 * Compile-time constants for code replacement.
	 *
	 * @remarks
	 * Values are stringified and replaced in the source code during bundling.
	 * The `process.env.__PACKAGE_VERSION__` constant is automatically defined.
	 *
	 * @see {@link https://rsbuild.dev/config/source/define | Rsbuild define documentation}
	 *
	 * @defaultValue `{}`
	 */
	define: SourceConfig["define"];

	/**
	 * Path to the TypeScript configuration file for the build.
	 *
	 * @remarks
	 * If not specified, the plugin searches for `tsconfig.json` in the project root.
	 * A temporary tsconfig is generated for declaration generation regardless of this setting.
	 *
	 * @defaultValue `undefined` (auto-detected)
	 */
	tsconfigPath: string | undefined;
	/** Build targets to include (default: ["dev", "npm"]) */
	targets?: BuildTarget[];
	/**
	 * External dependencies that should not be bundled.
	 * These modules will be imported at runtime instead of being included in the bundle.
	 *
	 * @remarks
	 * This is useful for dependencies that are in devDependencies but needed at runtime,
	 * such as build tools that the package uses to build other packages.
	 *
	 * @example
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   externals: ['@rslib/core', '@rsbuild/core'],
	 * });
	 * ```
	 */
	externals?: (string | RegExp)[];
	/**
	 * Packages whose type declarations should be bundled into the output .d.ts files.
	 *
	 * @remarks
	 * By default, RSlib bundles types from packages in package.json. Use this to explicitly
	 * specify which packages (including transitive dependencies) should have their types bundled.
	 * This is particularly useful for ensuring devDependencies are fully inlined without external imports.
	 *
	 * Supports minimatch patterns (e.g., '\@pnpm/**', 'picocolors')
	 *
	 * @example
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   dtsBundledPackages: ['@pnpm/lockfile.types', '@pnpm/types', 'picocolors'],
	 * });
	 * ```
	 */
	dtsBundledPackages?: string[];
	/**
	 * Optional callback to transform files after they're built but before the files array is finalized.
	 * Useful for copying/renaming files or adding additional files to the build output.
	 *
	 * @param context - Transform context with properties:
	 *   - `compilation`: Rspack compilation object with assets
	 *   - `filesArray`: Set of files that will be included in package.json files field
	 *   - `target`: Current build target (dev/npm/jsr)
	 *
	 * @example
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   transformFiles({ compilation, filesArray }) {
	 *     // Copy index.cjs to .pnpmfile.cjs
	 *     const indexAsset = compilation.assets['index.cjs'];
	 *     if (indexAsset) {
	 *       compilation.assets['.pnpmfile.cjs'] = indexAsset;
	 *       filesArray.add('.pnpmfile.cjs');
	 *     }
	 *   },
	 * });
	 * ```
	 */
	transformFiles?: (context: {
		/** Rspack compilation object with assets */
		compilation: {
			assets: Record<string, unknown>;
		};
		filesArray: Set<string>;
		target: BuildTarget;
	}) => void | Promise<void>;
	/**
	 * Optional transform function to modify package.json before it's saved.
	 * Called after all standard transformations are applied.
	 *
	 * @param context - Transform context containing the target and package.json
	 * @returns The modified package.json (mutations are also supported)
	 *
	 * @example
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   transform({ target, pkg }) {
	 *     if (target === 'npm') {
	 *       delete pkg.devDependencies;
	 *       delete pkg.scripts;
	 *     }
	 *     return pkg;
	 *   },
	 * });
	 * ```
	 */
	transform?: TransformPackageJsonFn;
	/**
	 * Options for API model generation.
	 * Generates an `<unscopedPackageName>.api.json` file in the dist directory.
	 * Only applies when target is "npm".
	 *
	 * @remarks
	 * API model generation is **enabled by default**. The generated file contains
	 * full API documentation in a machine-readable format for documentation generators.
	 * The file is emitted to dist but excluded from npm publish (added as negated pattern in `files` array).
	 *
	 * @defaultValue true
	 *
	 * @example
	 * Disable API model generation:
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   apiModel: false,
	 * });
	 * ```
	 *
	 * @example
	 * Customize with options (implicitly enabled):
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   apiModel: {
	 *     filename: 'my-package.api.json',
	 *   },
	 * });
	 * ```
	 */
	apiModel?: ApiModelOptions | boolean;
}

/**
 * Builder for Node.js ESM libraries using RSlib.
 *
 * @remarks
 * NodeLibraryBuilder provides a high-level API for building modern ESM Node.js libraries.
 * It handles TypeScript compilation, declaration bundling, package.json transformation,
 * and multi-target builds (dev and npm).
 *
 * Features:
 * - Automatic entry point detection from package.json exports
 * - TypeScript declarations via tsgo + API Extractor
 * - pnpm catalog and workspace protocol resolution
 * - Source maps for development builds
 * - Configurable external dependencies and type bundling
 *
 * @example
 * Basic usage in `rslib.config.ts`:
 * ```typescript
 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
 *
 * export default NodeLibraryBuilder.create();
 * ```
 *
 * @example
 * With custom options:
 * ```typescript
 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
 *
 * export default NodeLibraryBuilder.create({
 *   externals: ['@rslib/core', '@rsbuild/core'],
 *   dtsBundledPackages: ['picocolors'],
 *   transform({ target, pkg }) {
 *     if (target === 'npm') {
 *       delete pkg.devDependencies;
 *     }
 *     return pkg;
 *   },
 * });
 * ```
 *
 * @example
 * Build commands:
 * ```bash
 * # Development build (with source maps)
 * rslib build --env-mode dev
 *
 * # Production build (for npm publishing)
 * rslib build --env-mode npm
 * ```
 *
 * @public
 */
/* v8 ignore next -- @preserve */
// biome-ignore lint/complexity/noStaticOnlyClass: <This is a nicety for the API>
export class NodeLibraryBuilder {
	/** Valid build targets for validation. */
	private static readonly VALID_TARGETS: readonly BuildTarget[] = ["dev", "npm"];

	/**
	 * Default configuration options for NodeLibraryBuilder.
	 *
	 * @remarks
	 * These defaults are merged with user-provided options in {@link NodeLibraryBuilder.mergeOptions}.
	 * Arrays are deep-copied to prevent mutation of this object.
	 */
	static readonly DEFAULT_OPTIONS = {
		format: "esm",
		plugins: [],
		define: {},
		copyPatterns: [],
		targets: ["dev", "npm"],
		externals: [],
		apiModel: true,
	} satisfies Partial<NodeLibraryBuilderOptions>;

	/**
	 * Merges user-provided options with default options.
	 *
	 * @remarks
	 * This method performs a shallow merge of options with special handling for arrays
	 * (deep-copied to avoid mutation). If a `public` directory exists in the project root,
	 * it's automatically added to `copyPatterns`.
	 *
	 * @param options - Partial configuration options to merge
	 * @returns Complete configuration with all required fields
	 */
	static mergeOptions(options: Partial<NodeLibraryBuilderOptions> = {}): NodeLibraryBuilderOptions {
		// Deep copy arrays to avoid mutating DEFAULT_OPTIONS
		const copyPatterns = [...(options.copyPatterns ?? NodeLibraryBuilder.DEFAULT_OPTIONS.copyPatterns)];
		if (existsSync(join(process.cwd(), "public"))) {
			copyPatterns.unshift({ from: "./public", to: "./", context: process.cwd() });
		}

		// Build merged options, using defaults for undefined values
		const merged: NodeLibraryBuilderOptions = {
			// Required properties with defaults
			copyPatterns,
			plugins: options.plugins ?? NodeLibraryBuilder.DEFAULT_OPTIONS.plugins,
			define: options.define ?? NodeLibraryBuilder.DEFAULT_OPTIONS.define,
			tsconfigPath: options.tsconfigPath,
			// Optional properties with defaults
			format: options.format ?? NodeLibraryBuilder.DEFAULT_OPTIONS.format,
			targets: options.targets ?? NodeLibraryBuilder.DEFAULT_OPTIONS.targets,
			externals: options.externals ?? NodeLibraryBuilder.DEFAULT_OPTIONS.externals,
			apiModel: options.apiModel ?? NodeLibraryBuilder.DEFAULT_OPTIONS.apiModel,
			// Optional properties - only include if explicitly defined
			...(options.entry !== undefined && { entry: options.entry }),
			...(options.exportsAsIndexes !== undefined && { exportsAsIndexes: options.exportsAsIndexes }),
			...(options.dtsBundledPackages !== undefined && { dtsBundledPackages: options.dtsBundledPackages }),
			...(options.transformFiles !== undefined && { transformFiles: options.transformFiles }),
			...(options.transform !== undefined && { transform: options.transform }),
			...(options.virtualEntries !== undefined && { virtualEntries: options.virtualEntries }),
		};

		return merged;
	}

	/**
	 * Creates an async RSLib configuration function that determines build target from envMode.
	 *
	 * @remarks
	 * This is the primary entry point for using NodeLibraryBuilder. The returned function
	 * is passed to RSLib and called with environment parameters to generate the build config.
	 *
	 * @param options - Configuration options for the builder
	 * @returns An async function compatible with RSLib's config system
	 */
	static create(options: Partial<NodeLibraryBuilderOptions> = {}): RslibConfigAsyncFn {
		const mergedOptions = NodeLibraryBuilder.mergeOptions(options);

		return async ({ envMode }: { envMode?: string }): Promise<RslibConfig> => {
			// Use envMode to determine build target, default to "dev"
			const target = (envMode as BuildTarget) || "dev";

			// Validate target
			if (!NodeLibraryBuilder.VALID_TARGETS.includes(target)) {
				throw new Error(
					`Invalid env-mode: "${target}". Must be one of: ${NodeLibraryBuilder.VALID_TARGETS.join(", ")}\n` +
						`Example: rslib build --env-mode npm`,
				);
			}

			return NodeLibraryBuilder.createSingleTarget(target, mergedOptions);
		};
	}

	/**
	 * Creates a single-target build configuration.
	 *
	 * @remarks
	 * This method is called internally by {@link NodeLibraryBuilder.create} for each build target.
	 * It configures all plugins and RSLib options based on the target and user options.
	 *
	 * @param target - The build target ("dev" or "npm")
	 * @param opts - Configuration options (will be merged with defaults)
	 * @returns Promise resolving to the RSLib configuration
	 */
	static async createSingleTarget(target: BuildTarget, opts: NodeLibraryBuilderOptions): Promise<RslibConfig> {
		const options = NodeLibraryBuilder.mergeOptions(opts);

		const VERSION = await packageJsonVersion();

		// Create target-specific plugins
		const plugins: RsbuildPlugin[] = [];

		// Add TSDoc lint plugin if enabled (runs before build via onBeforeBuild)
		// Lint is enabled by default when apiModel is enabled
		const apiModelConfig = typeof options.apiModel === "object" ? options.apiModel : {};
		const tsdocConfig = apiModelConfig.tsdoc;
		const lintConfig = tsdocConfig?.lint;

		// Lint is enabled by default (unless explicitly set to false or apiModel is false)
		const lintEnabled = options.apiModel !== false && lintConfig !== false;

		if (lintEnabled) {
			// Build lint plugin options from tsdoc config + lint-specific options
			// Exclude `lint` property from tsdoc config to avoid circular reference
			const { lint: _lint, ...tsdocWithoutLint } = tsdocConfig ?? {};
			const lintOptions: TsDocLintPluginOptions = {
				// Pass parent tsdoc config (tagDefinitions, groups, etc.)
				...(tsdocConfig && Object.keys(tsdocWithoutLint).length > 0 && { tsdoc: tsdocWithoutLint }),
				// Add lint-specific options if provided
				...(typeof lintConfig === "object" ? lintConfig : {}),
			};
			plugins.push(TsDocLintPlugin(lintOptions));
		}

		// Add auto-entry plugin if no explicit entries provided
		if (!options.entry) {
			plugins.push(
				AutoEntryPlugin(options.exportsAsIndexes != null ? { exportsAsIndexes: options.exportsAsIndexes } : undefined),
			);
		}

		// Process package.json with pnpm + RSLib transformations
		// Wrap user's transform to provide target context
		const userTransform = options.transform;
		const transformFn = userTransform ? (pkg: PackageJson): PackageJson => userTransform({ target, pkg }) : undefined;

		// Get format (defaults to "esm")
		const libraryFormat = options.format ?? "esm";

		plugins.push(
			PackageJsonTransformPlugin({
				forcePrivate: target === "dev",
				bundle: true,
				target,
				format: libraryFormat,
				...(transformFn && { transform: transformFn }),
			}),
		);

		// Add files array plugin to manage package.json files array
		plugins.push(
			FilesArrayPlugin({
				target,
				...(options.transformFiles && { transformFiles: options.transformFiles }),
			}),
		);

		// Add user-provided plugins
		if (options.plugins) {
			plugins.push(...options.plugins);
		}

		// Build output configuration
		const outputDir = `dist/${target}`;

		const entry = options.entry;

		// Add our custom DTS plugin that uses tsgo and emits through asset pipeline
		// The plugin will generate the temp tsconfig itself since it needs access to api.context.rootPath
		// Only enable API model generation for npm target (not dev)
		const apiModelForTarget = target === "npm" ? options.apiModel : undefined;

		plugins.push(
			DtsPlugin({
				...(options.tsconfigPath && { tsconfigPath: options.tsconfigPath }),
				abortOnError: true,
				bundle: true,
				...(options.dtsBundledPackages && { bundledPackages: options.dtsBundledPackages }),
				buildTarget: target,
				format: libraryFormat,
				...(apiModelForTarget !== undefined && { apiModel: apiModelForTarget }),
			}),
		);

		const lib: LibConfig = {
			id: target,
			outBase: outputDir,
			output: {
				target: "node",
				module: true,
				cleanDistPath: true,
				sourceMap: target === "dev", // Only enable source maps for dev target
				distPath: {
					root: outputDir,
				},
				copy: {
					patterns: options.copyPatterns,
				},
				...(options.externals && options.externals.length > 0 && { externals: options.externals }),
			},
			format: libraryFormat,
			experiments: {
				advancedEsm: libraryFormat === "esm",
			},
			bundle: true,
			plugins,
			source: {
				// Don't set tsconfigPath here - DtsPlugin will generate and use its own temp config
				// RSLib will use its default tsconfig resolution for JS compilation
				...(options.tsconfigPath && { tsconfigPath: options.tsconfigPath }),
				...(entry && { entry }),
				define: {
					"process.env.__PACKAGE_VERSION__": JSON.stringify(VERSION),
					...options.define,
				},
			},
		};

		// TypeScript declarations are now handled by our custom DtsPlugin (added to plugins above)
		// which uses tsgo and emits through the asset pipeline instead of RSLib's default DTS plugin

		// Check if we have regular entries (from package.json exports or explicit entry option)
		const hasRegularEntries = options.entry !== undefined || NodeLibraryBuilder.packageHasExports();

		// Process virtual entries
		const virtualEntries = options.virtualEntries ?? {};
		const hasVirtualEntries = Object.keys(virtualEntries).length > 0;

		// Validate that we have at least some entries
		if (!hasRegularEntries && !hasVirtualEntries) {
			throw new Error(
				"No entry points configured. Provide package.json exports, explicit entry option, or virtualEntries.",
			);
		}

		// Build list of lib configs
		const libConfigs: LibConfig[] = [];

		// Add main lib config only if we have regular entries
		if (hasRegularEntries) {
			libConfigs.push(lib);
		}

		// Process virtual entries and create additional lib configs
		if (hasVirtualEntries) {
			// Group virtual entries by format
			const virtualByFormat = new Map<LibraryFormat, Map<string, string>>();

			for (const [outputName, config] of Object.entries(virtualEntries)) {
				const entryFormat = config.format ?? libraryFormat;
				if (!virtualByFormat.has(entryFormat)) {
					virtualByFormat.set(entryFormat, new Map());
				}
				// Strip extension from output name to get entry name
				const entryName = outputName.replace(/\.(c|m)?js$/, "");
				const formatMap = virtualByFormat.get(entryFormat);
				if (formatMap) {
					formatMap.set(entryName, config.source);
				}
			}

			// Create lib configs for each format group
			for (const [format, entries] of virtualByFormat) {
				const virtualEntryNames = new Set(entries.keys());
				const entryMap = Object.fromEntries(entries);

				const virtualLib: LibConfig = {
					id: `${target}-virtual-${format}`,
					format,
					bundle: true,
					output: {
						target: "node",
						cleanDistPath: false, // Don't clean - main lib already cleaned
						sourceMap: false, // No source maps for virtual entries
						distPath: {
							root: outputDir,
						},
						...(options.externals && options.externals.length > 0 && { externals: options.externals }),
					},
					source: {
						entry: entryMap,
					},
					plugins: [
						VirtualEntryPlugin({ virtualEntryNames }),
						// Minimal plugins for virtual entries - no DtsPlugin, no AutoEntryPlugin
						FilesArrayPlugin({ target }),
					],
				};

				libConfigs.push(virtualLib);
			}

			// Also expose virtual entry names to the main lib's DtsPlugin (if main lib exists)
			// This is done via a plugin that exposes the Set
			if (hasRegularEntries) {
				const allVirtualEntryNames = new Set<string>();
				for (const outputName of Object.keys(virtualEntries)) {
					const entryName = outputName.replace(/\.(c|m)?js$/, "");
					allVirtualEntryNames.add(entryName);
				}

				// Add a plugin to the main lib that exposes virtual entry names
				plugins.push({
					name: "virtual-entry-names-exposer",
					setup(api) {
						api.expose("virtual-entry-names", allVirtualEntryNames);
					},
				});

				// Update the main lib config with the new plugin
				lib.plugins = plugins;
			}
		}

		return defineConfig({
			lib: libConfigs,
			// RSLib will use its default tsconfig resolution for JS compilation
			// Declaration generation is handled by DtsPlugin
			...(options.tsconfigPath && { source: { tsconfigPath: options.tsconfigPath } }),
			performance: {
				buildCache: {
					cacheDirectory: `.rslib/cache/${target}`,
				},
			},
		});
	}

	/**
	 * Checks if the current package has exports defined in package.json.
	 * @internal
	 */
	private static packageHasExports(): boolean {
		try {
			const packageJsonPath = join(process.cwd(), "package.json");
			const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageJson;
			const { exports } = packageJson;
			return (
				exports !== undefined && exports !== null && typeof exports === "object" && Object.keys(exports).length > 0
			);
		} catch {
			return false;
		}
	}
}
