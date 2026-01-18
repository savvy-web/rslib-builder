import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RsbuildPlugin, RsbuildPluginAPI, SourceConfig } from "@rsbuild/core";
import type { ConfigParams, LibConfig, RslibConfig } from "@rslib/core";
import { defineConfig } from "@rslib/core";
import type { RawCopyPattern } from "@rspack/binding";
import type { PackageJson } from "type-fest";
import { packageJsonVersion } from "#utils/file-utils.js";
import { getJSRVirtualDummyEntry } from "#utils/jsr-dummy-entry-utils.js";
import { ApiReportPlugin } from "../plugins/api-report-plugin.js";
import { AutoEntryPlugin } from "../plugins/auto-entry-plugin.js";
import { BundlelessPlugin } from "../plugins/bundleless-plugin.js";
import { DtsPlugin } from "../plugins/dts-plugin.js";
import { FilesArrayPlugin } from "../plugins/files-array-plugin.js";
import { JSRBundlelessPlugin } from "../plugins/jsr-bundleless-plugin.js";
import { PackageJsonTransformPlugin } from "../plugins/package-json-transform-plugin.js";

/**
 * Async RSLib configuration function type.
 * @public
 */
export type RslibConfigAsyncFn = (env: ConfigParams) => Promise<RslibConfig>;

/**
 * @public
 */
export type BuildTarget = "dev" | "npm" | "jsr";
/**
 * @public
 */
export type OutputFormat = "esm" | "cjs";

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
	/** Whether to bundle the output (default: true) */
	bundle: boolean;
	/**
	 * Output format - 'esm' for ECMAScript modules or 'cjs' for CommonJS (default: 'esm')
	 */
	format?: OutputFormat;
	/**
	 * When enabled, each export path will generate an index.js file in a directory
	 * structure matching the export path, rather than using the export name as the filename.
	 *
	 * @remarks
	 * This option is only relevant for bundled builds.
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
	/** JSR scope for the JSR build target. Can be a string or true to use package name */
	jsr: string | true;
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
	 *   bundle: true,
	 *   externals: ['@rslib/core', '@rsbuild/core']
	 * })
	 * ```
	 */
	externals?: (string | RegExp)[];
	/**
	 * Packages whose type declarations should be bundled into the output .d.ts files.
	 * Only applies when bundle is true.
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
	 *   bundle: true,
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
	 *   bundle: true,
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
	 *   bundle: true,
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
	 * Enable API report generation for packages without a default export.
	 * Only applicable when bundle is true.
	 *
	 * @remarks
	 * When enabled, the plugin will:
	 * - Check if the package has no "." export in package.json
	 * - Look for a magic file `src/api-extractor.ts` containing `@packageDocumentation`
	 * - Generate consolidated exports for API Extractor
	 *
	 * @defaultValue false
	 */
	apiReports?: boolean;
}

/**
 * @public
 */
export interface BundledNodeLibraryBuilderOptions extends Partial<NodeLibraryBuilderOptions> {
	/** {@inheritDoc NodeLibraryBuilderOptions.bundle} */
	bundle: true;
}

/**
 * @public
 */
export interface BundlelessNodeLibraryBuilderOptions
	extends Omit<Partial<NodeLibraryBuilderOptions>, "exportsAsIndexes"> {
	/** {@inheritDoc NodeLibraryBuilderOptions.bundle} */
	bundle: false;
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
		bundle: true,
		format: "esm",
		plugins: [],
		define: {},
		copyPatterns: [],
		targets: ["dev", "npm"],
		tsconfigPath: undefined,
		jsr: true,
		externals: [],
		dtsBundledPackages: undefined,
		transformFiles: undefined,
		apiReports: false,
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
	static create(options: Partial<BundledNodeLibraryBuilderOptions>): RslibConfigAsyncFn;
	static create(options: Partial<BundlelessNodeLibraryBuilderOptions>): RslibConfigAsyncFn;
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
			const validTargets: BuildTarget[] = ["dev", "npm", "jsr"];
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
			// Add API Report plugin for npm builds only
			if (target === "npm" && options.apiReports && options.bundle) {
				plugins.push(ApiReportPlugin({ enabled: true }));
			}

			// Add auto-entry plugin if no explicit entries provided and bundling is enabled
			// For bundleless mode, we handle entry differently

			if (!options.entry && options.bundle) {
				plugins.push(
					AutoEntryPlugin({
						exportsAsIndexes: options.exportsAsIndexes,
					}),
				);
			}

			if (options.bundle === false) {
				// For bundleless mode, compile all TS files in src/
				options.entry = {
					index: ["src/**/*.ts"],
				};
				plugins.push(BundlelessPlugin());
			}

			// Wrap user's transform to provide target context and handle format
			const transformFn = (pkg: PackageJson): PackageJson => {
				// Apply format-specific transformations first
				if (options.format === "cjs") {
					pkg.type = "commonjs";
				}

				// Then apply user's custom transform if provided
				if (options.transform) {
					return options.transform({ target, pkg });
				}
				return pkg;
			};

			// Process package.json with pnpm + RSLib transformations
			plugins.push(
				PackageJsonTransformPlugin({
					forcePrivate: target === "dev",
					bundle: options.bundle,
					format: options.format ?? "esm",
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

		// JSR-specific plugins
		if (target === "jsr") {
			// Always add auto-entry plugin for JSR builds since JSRTypeScriptBundlerPlugin depends on it
			plugins.push(
				AutoEntryPlugin({
					exportsAsIndexes: options.exportsAsIndexes,
				}),
			);

			// Wrap user's transform to provide target context and handle format
			const transformFn = (pkg: PackageJson): PackageJson => {
				// Apply format-specific transformations first
				if (options.format === "cjs") {
					pkg.type = "commonjs";
				}

				// Then apply user's custom transform if provided
				if (options.transform) {
					return options.transform({ target, pkg });
				}
				return pkg;
			};

			// Process package.json with JSR-specific options
			plugins.push(
				PackageJsonTransformPlugin({
					name: typeof options.jsr === "string" ? options.jsr : undefined,
					processTSExports: false,
					bundle: options.bundle,
					format: options.format ?? "esm",
					target,
					transform: transformFn,
				}),
			);

			// Add files array plugin for consistency
			plugins.push(
				FilesArrayPlugin({
					target,
					transformFiles: options.transformFiles,
				}),
			);

			// Add JSR cleanup plugin to remove unwanted JS files
			plugins.push({
				name: "jsr-cleanup-plugin",
				setup(api: RsbuildPluginAPI): void {
					api.processAssets(
						{
							stage: "optimize-inline", // Run after JSR bundler
						},
						// biome-ignore lint/suspicious/noExplicitAny: Rsbuild internal API type not exported
						async (compiler: any) => {
							const envId = compiler.compilation?.name || "unknown";
							if (envId !== "jsr") return;

							// Remove JS files that shouldn't be in JSR output
							const assetsToRemove: string[] = [];
							for (const assetName of Object.keys(compiler.assets)) {
								if (assetName.endsWith(".js") && assetName !== "_dummy.js") {
									assetsToRemove.push(assetName);
								}
							}

							// Remove the assets
							for (const assetName of assetsToRemove) {
								delete compiler.assets[assetName];
							}
						},
					);
				},
			});

			// Use bundleless plugin for JSR to preserve file structure
			// This excludes unused files through import graph analysis
			plugins.push(
				JSRBundlelessPlugin({
					name: typeof options.jsr === "string" ? options.jsr : undefined,
				}),
			);
		}

		// Add user-provided plugins
		if (options.plugins) {
			plugins.push(...options.plugins);
		}

		// Build output configuration
		const outputDir = `dist/${target}`;

		let entry = options.entry;
		if (target === "jsr") {
			// For JSR, use a virtual dummy entry since actual bundling is handled by JSRBundlelessPlugin
			entry = { _dummy: getJSRVirtualDummyEntry() };
		}

		const format = options.format ?? "esm";

		// For bundleless mode, outBase should be the source directory so RSLib
		// knows to strip the source prefix from output paths
		const outBase = options.bundle === false ? "src" : outputDir;

		// Add our custom DTS plugin that uses tsgo and emits through asset pipeline
		// The plugin will generate the temp tsconfig itself since it needs access to api.context.rootPath
		plugins.push(
			DtsPlugin({
				tsconfigPath: options.tsconfigPath, // Pass through user's tsconfig if provided
				abortOnError: true,
				bundle: options.bundle,
				bundledPackages: options.dtsBundledPackages,
				// Pass target and bundle mode so the plugin can generate the correct temp config
				buildTarget: target,
			}),
		);

		const lib: LibConfig = {
			id: target,
			outBase,
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
			format,
			experiments: {
				advancedEsm: true,
			},
			bundle: options.bundle ?? true,
			plugins,
			source: {
				// Don't set tsconfigPath here - DtsPlugin will generate and use its own temp config
				// RSLib will use its default tsconfig resolution for JS compilation
				tsconfigPath: options.tsconfigPath, // Only pass through if user explicitly provided one
				entry, // Only set entry if it has values, otherwise rslib won't compile anything in bundleless mode
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
