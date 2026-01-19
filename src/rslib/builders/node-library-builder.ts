import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RsbuildPlugin, SourceConfig } from "@rsbuild/core";
import type { ConfigParams, LibConfig, RslibConfig } from "@rslib/core";
import { defineConfig } from "@rslib/core";
import type { RawCopyPattern } from "@rspack/binding";
import type { PackageJson } from "type-fest";
import { packageJsonVersion } from "#utils/file-utils.js";
import { AutoEntryPlugin } from "../plugins/auto-entry-plugin.js";
import type { ApiModelOptions } from "../plugins/dts-plugin.js";
import { DtsPlugin } from "../plugins/dts-plugin.js";
import { FilesArrayPlugin } from "../plugins/files-array-plugin.js";
import { PackageJsonTransformPlugin } from "../plugins/package-json-transform-plugin.js";

/**
 * Async RSLib configuration function type.
 * @public
 */
export type RslibConfigAsyncFn = (env: ConfigParams) => Promise<RslibConfig>;

/**
 * @public
 */
export type BuildTarget = "dev" | "npm";

/**
 * @public
 */
export type TransformPackageJsonFn = (context: { target: BuildTarget; pkg: PackageJson }) => PackageJson;

/**
 * @public
 */
export interface NodeLibraryBuilderOptions {
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
	copyPatterns: (string | (Pick<RawCopyPattern, "from"> & Partial<Omit<RawCopyPattern, "from">>))[];
	/** Additional plugins */
	plugins: RsbuildPlugin[];
	define: SourceConfig["define"];
	/** Path to tsconfig for build (default: ./tsconfig.build.json) */
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
	 * NodeLibraryBuilder.create({
	 *   externals: ['@rslib/core', '@rsbuild/core']
	 * })
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
	 * Supports minimatch patterns (e.g., '@pnpm/**', 'picocolors')
	 *
	 * @example
	 * ```typescript
	 * NodeLibraryBuilder.create({
	 *   dtsBundledPackages: ['@pnpm/lockfile.types', '@pnpm/types', 'picocolors']
	 * })
	 * ```
	 */
	dtsBundledPackages?: string[];
	/**
	 * Optional callback to transform files after they're built but before the files array is finalized.
	 * Useful for copying/renaming files or adding additional files to the build output.
	 *
	 * @param context - Transform context containing compilation context and files set
	 * @param context.compilation - Rspack compilation object with assets
	 * @param context.filesArray - Set of files that will be included in package.json files field
	 * @param context.target - Current build target (dev/npm/jsr)
	 *
	 * @example
	 * ```typescript
	 * NodeLibraryBuilder.create({
	 *   transformFiles({ compilation, filesArray, target }) {
	 *     // Copy index.cjs to .pnpmfile.cjs
	 *     const indexAsset = compilation.assets['index.cjs'];
	 *     if (indexAsset) {
	 *       compilation.assets['.pnpmfile.cjs'] = indexAsset;
	 *       filesArray.add('.pnpmfile.cjs');
	 *     }
	 *   }
	 * })
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
	 * NodeLibraryBuilder.create({
	 *   transform({ target, pkg }) {
	 *     if (target === 'npm') {
	 *       // Mutation approach
	 *       delete pkg.devDependencies;
	 *       delete pkg.scripts;
	 *     }
	 *     return pkg;
	 *   }
	 * })
	 * ```
	 */
	transform?: TransformPackageJsonFn;
	/**
	 * Options for API model generation.
	 * When enabled, generates an api.model.json file in the dist directory.
	 * Only applies when target is "npm".
	 *
	 * @remarks
	 * The generated api.model.json file contains the full API documentation
	 * in a machine-readable format for use by documentation generators.
	 * A .npmignore file is also generated to exclude the API model from npm publish.
	 *
	 * @example
	 * ```typescript
	 * // Enable API model generation with defaults
	 * NodeLibraryBuilder.create({
	 *   apiModel: true,
	 * })
	 *
	 * // Enable with custom filename
	 * NodeLibraryBuilder.create({
	 *   apiModel: {
	 *     enabled: true,
	 *     filename: "my-package.api.json",
	 *   },
	 * })
	 * ```
	 */
	apiModel?: ApiModelOptions | boolean;
}

/**
 * @public
 * Node library builder class
 */
/* v8 ignore next -- @preserve */
// biome-ignore lint/complexity/noStaticOnlyClass: <This is a nicety for the API>
export class NodeLibraryBuilder {
	static DEFAULT_OPTIONS: NodeLibraryBuilderOptions = {
		entry: undefined,
		plugins: [],
		define: {},
		copyPatterns: [],
		targets: ["dev", "npm"],
		tsconfigPath: undefined,
		externals: [],
		dtsBundledPackages: undefined,
		transformFiles: undefined,
	};
	static mergeOptions(options: Partial<NodeLibraryBuilderOptions> = {}): NodeLibraryBuilderOptions {
		const merged = {
			...NodeLibraryBuilder.DEFAULT_OPTIONS,
			...options,
			// Deep copy arrays to avoid mutating DEFAULT_OPTIONS
			copyPatterns: [...(options.copyPatterns ?? NodeLibraryBuilder.DEFAULT_OPTIONS.copyPatterns)],
		};
		if (existsSync(join(process.cwd(), "public"))) {
			merged.copyPatterns.unshift({ from: "./public", to: "./", context: process.cwd() });
		}
		return merged;
	}
	/**
	 * Creates an async RSLib configuration function that determines build target from envMode.
	 * This provides a clean API where users don't need to handle environment logic.
	 */
	static create(options: Partial<NodeLibraryBuilderOptions> = {}): RslibConfigAsyncFn {
		const mergedOptions = NodeLibraryBuilder.mergeOptions(options);

		return async ({ envMode }: { envMode?: string }): Promise<RslibConfig> => {
			// Use envMode to determine build target, default to "dev"
			const target = (envMode as BuildTarget) || "dev";

			// Validate target
			const validTargets: BuildTarget[] = ["dev", "npm"];
			if (!validTargets.includes(target)) {
				throw new Error(
					`Invalid env-mode: "${target}". Must be one of: ${validTargets.join(", ")}\n` +
						`Example: rslib build --env-mode npm`,
				);
			}

			// Create target-specific configuration
			const targetConfig = await NodeLibraryBuilder.createSingleTarget(target, mergedOptions);

			return targetConfig;
		};
	}
	/**
	 * Creates a single-target build configuration.
	 * This allows proper plugin isolation per build target.
	 */
	static async createSingleTarget(target: BuildTarget, opts: NodeLibraryBuilderOptions): Promise<RslibConfig> {
		const options = NodeLibraryBuilder.mergeOptions(opts);

		const VERSION = await packageJsonVersion();

		// Create target-specific plugins
		const plugins: RsbuildPlugin[] = [];

		// Standard plugins for dev and npm targets
		if (target === "dev" || target === "npm") {
			// Add auto-entry plugin if no explicit entries provided
			if (!options.entry) {
				plugins.push(
					AutoEntryPlugin({
						exportsAsIndexes: options.exportsAsIndexes,
					}),
				);
			}

			// Process package.json with pnpm + RSLib transformations
			// Wrap user's transform to provide target context
			const userTransform = options.transform;
			const transformFn = userTransform ? (pkg: PackageJson): PackageJson => userTransform({ target, pkg }) : undefined;

			plugins.push(
				PackageJsonTransformPlugin({
					forcePrivate: target === "dev",
					bundle: true,
					target,
					transform: transformFn,
				}),
			);

			// Add files array plugin to manage package.json files array
			plugins.push(
				FilesArrayPlugin({
					target,
					transformFiles: options.transformFiles,
				}),
			);
		}

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
				tsconfigPath: options.tsconfigPath, // Pass through user's tsconfig if provided
				abortOnError: true,
				bundle: true,
				bundledPackages: options.dtsBundledPackages,
				buildTarget: target,
				apiModel: apiModelForTarget,
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
				externals: options.externals && options.externals.length > 0 ? options.externals : undefined,
			},
			format: "esm",
			experiments: {
				advancedEsm: true,
			},
			bundle: true,
			plugins,
			source: {
				// Don't set tsconfigPath here - DtsPlugin will generate and use its own temp config
				// RSLib will use its default tsconfig resolution for JS compilation
				tsconfigPath: options.tsconfigPath, // Only pass through if user explicitly provided one
				entry,
				define: {
					"process.env.__PACKAGE_VERSION__": JSON.stringify(VERSION),
					...options.define,
				},
			},
		};

		// TypeScript declarations are now handled by our custom DtsPlugin (added to plugins above)
		// which uses tsgo and emits through the asset pipeline instead of RSLib's default DTS plugin

		return defineConfig({
			lib: [lib],
			// RSLib will use its default tsconfig resolution for JS compilation
			// Declaration generation is handled by DtsPlugin
			source: {
				tsconfigPath: options.tsconfigPath, // Only pass through if user explicitly provided one
			},
			performance: {
				buildCache: {
					cacheDirectory: `.rslib/cache/${target}`,
				},
			},
		});
	}
}
