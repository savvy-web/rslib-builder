import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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
import { EntryExtractor } from "../plugins/utils/entry-extractor.js";
import { packageJsonVersion } from "../plugins/utils/file-utils.js";
import { ImportGraph } from "../plugins/utils/import-graph.js";
import { VirtualEntryPlugin } from "../plugins/virtual-entry-plugin.js";

/**
 * Async RSLib configuration function type.
 * @public
 */
export type RslibConfigAsyncFn = (env: ConfigParams) => Promise<RslibConfig>;

/**
 * Build mode environment for library output.
 *
 * @remarks
 * Each mode produces different output optimizations:
 * - `"dev"`: Development build with source maps for debugging
 * - `"npm"`: Production build optimized for npm publishing
 *
 * @example
 * Specifying modes via CLI:
 * ```bash
 * rslib build --env-mode dev
 * rslib build --env-mode npm
 * ```
 *
 * @public
 */
export type BuildMode = "dev" | "npm";

/**
 * Publishing protocol for a publish target.
 *
 * @remarks
 * - `"npm"` - npm-compatible registries (npmjs, GitHub Packages, Verdaccio, etc.)
 * - `"jsr"` - JavaScript Registry (jsr.io)
 *
 * @public
 */
export type PublishProtocol = "npm" | "jsr";

/**
 * A resolved publish target from `publishConfig.targets`.
 *
 * @remarks
 * Aligns with `ResolvedTarget` from workflow-release-action,
 * minus authentication-specific fields.
 *
 * @public
 */
export interface PublishTarget {
	/** The publishing protocol. */
	protocol: PublishProtocol;
	/** The registry URL, or `null` for JSR targets. */
	registry: string | null;
	/** The absolute path to the output directory for this target. */
	directory: string;
	/** Package access level for scoped packages. */
	access: "public" | "restricted";
	/** Whether provenance attestations are configured. */
	provenance: boolean;
	/** The publish tag (e.g., "latest", "next", "beta"). */
	tag: string;
}

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
	 * If not specified, inherits from the primary format
	 * (first element when `format` is an array, or the single format value).
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
 *   - `mode`: The current build mode ("dev" or "npm")
 *   - `target`: The current publish target, or `undefined` when no targets are configured
 *   - `pkg`: The package.json object to transform
 * @returns The modified package.json object
 *
 * @example
 * ```typescript
 * import type { TransformPackageJsonFn } from '@savvy-web/rslib-builder';
 *
 * const transform: TransformPackageJsonFn = ({ mode, target, pkg }) => {
 *   if (mode === 'npm') {
 *     delete pkg.devDependencies;
 *     delete pkg.scripts;
 *   }
 *   return pkg;
 * };
 * ```
 * @public
 */
export type TransformPackageJsonFn = (context: {
	mode: BuildMode;
	target: PublishTarget | undefined;
	pkg: PackageJson;
}) => PackageJson;

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
	 * When an array is provided, the package is built in both formats.
	 * The first format in the array is the primary format (determines `type` field).
	 * Each format outputs to its own subdirectory (`dist/{target}/esm/`, `dist/{target}/cjs/`).
	 *
	 * @defaultValue `"esm"`
	 *
	 * @example
	 * Dual format output:
	 * ```typescript
	 * NodeLibraryBuilder.create({
	 *   format: ['esm', 'cjs'],
	 * })
	 * ```
	 */
	format?: LibraryFormat | LibraryFormat[];

	/**
	 * Per-entry format overrides.
	 * Maps export paths (matching package.json exports keys like `"./markdownlint"`)
	 * to a specific format. Entries not listed inherit the top-level `format`.
	 *
	 * @remarks
	 * When both `entryFormats` and array `format` are used, `entryFormats` takes precedence.
	 * An entry with a specific format override will only be built in that format,
	 * even if the global format is dual.
	 *
	 * @example
	 * ```typescript
	 * NodeLibraryBuilder.create({
	 *   format: 'esm',
	 *   entryFormats: {
	 *     './markdownlint': 'cjs',
	 *   },
	 * })
	 * ```
	 */
	entryFormats?: Record<string, LibraryFormat>;

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
	/** Build modes to include (default: ["dev", "npm"]) */
	targets?: BuildMode[];
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
	 *   - `mode`: Current build mode (dev/npm)
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
		/** Current build mode */
		mode: BuildMode;
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
	 *   transform({ mode, pkg }) {
	 *     if (mode === 'npm') {
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
	 * Only applies when mode is "npm".
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

	/**
	 * Whether to bundle JavaScript output into single files per entry point.
	 *
	 * @remarks
	 * - `true` (default): RSlib bundles JS into single files per entry (current behavior)
	 * - `false`: RSlib runs in bundleless mode, preserving file structure for JS output.
	 *   DTS is still bundled per entry via API Extractor (hybrid mode).
	 *   When `apiModel` is enabled with multiple entries, per-entry API models are
	 *   merged into a single `api.model.json` with multiple EntryPoint members.
	 *
	 * @defaultValue true
	 */
	bundle?: boolean;

	/**
	 * Enable CJS default export interop for CommonJS output files.
	 * When true, CJS files are patched so `require('module')` returns
	 * the default export directly instead of `{ default: value }`.
	 * Named exports are preserved as properties on the default value.
	 * Only affects CJS format output; ESM is unchanged.
	 * @defaultValue false
	 */
	cjsInterop?: boolean;
}

/**
 * CJS interop footer snippet injected into CommonJS output files.
 * Reassigns `module.exports` to the default export value so that
 * `require('module')` returns it directly. Named exports are copied
 * onto the default value as properties.
 * @internal
 */
const CJS_INTEROP_FOOTER = `
if (module.exports && module.exports.__esModule && 'default' in module.exports) {
  var _def = module.exports.default;
  if (_def !== null && _def !== undefined && (typeof _def === 'object' || typeof _def === 'function')) {
    var _keys = Object.keys(module.exports);
    for (var _i = 0; _i < _keys.length; _i++) {
      var _key = _keys[_i];
      if (_key !== 'default' && _key !== '__esModule' && !(_key in _def)) {
        _def[_key] = module.exports[_key];
      }
    }
  }
  module.exports = _def;
}`;

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
 *   transform({ mode, pkg }) {
 *     if (mode === 'npm') {
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
	/** Valid build modes for validation. */
	private static readonly VALID_MODES: readonly BuildMode[] = ["dev", "npm"];

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
		bundle: true,
		cjsInterop: false,
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
			bundle: options.bundle ?? NodeLibraryBuilder.DEFAULT_OPTIONS.bundle,
			cjsInterop: options.cjsInterop ?? NodeLibraryBuilder.DEFAULT_OPTIONS.cjsInterop,
			// Optional properties - only include if explicitly defined
			...(options.entry !== undefined && { entry: options.entry }),
			...(options.exportsAsIndexes !== undefined && { exportsAsIndexes: options.exportsAsIndexes }),
			...(options.dtsBundledPackages !== undefined && { dtsBundledPackages: options.dtsBundledPackages }),
			...(options.transformFiles !== undefined && { transformFiles: options.transformFiles }),
			...(options.transform !== undefined && { transform: options.transform }),
			...(options.virtualEntries !== undefined && { virtualEntries: options.virtualEntries }),
			...(options.entryFormats !== undefined && { entryFormats: options.entryFormats }),
		};

		return merged;
	}

	/**
	 * Creates an async RSLib configuration function that determines build mode from envMode.
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
			// Use envMode to determine build mode, default to "dev"
			const mode = (envMode as BuildMode) || "dev";

			// Validate mode
			if (!NodeLibraryBuilder.VALID_MODES.includes(mode)) {
				throw new Error(
					`Invalid env-mode: "${mode}". Must be one of: ${NodeLibraryBuilder.VALID_MODES.join(", ")}\n` +
						`Example: rslib build --env-mode npm`,
				);
			}

			return NodeLibraryBuilder.createSingleMode(mode, mergedOptions);
		};
	}

	/**
	 * Creates a single-mode build configuration.
	 *
	 * @remarks
	 * This method is called internally by {@link NodeLibraryBuilder.create} for each build mode.
	 * It configures all plugins and RSLib options based on the mode and user options.
	 *
	 * @param mode - The build mode ("dev" or "npm")
	 * @param opts - Configuration options (will be merged with defaults)
	 * @returns Promise resolving to the RSLib configuration
	 */
	static async createSingleMode(mode: BuildMode, opts: NodeLibraryBuilderOptions): Promise<RslibConfig> {
		const options = NodeLibraryBuilder.mergeOptions(opts);
		const bundle = options.bundle ?? true;

		const VERSION = await packageJsonVersion();

		// Create mode-specific plugins
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
			plugins.push(
				TsDocLintPlugin({
					...lintOptions,
					...(!bundle && { perEntry: true }),
				}),
			);
		}

		// Add auto-entry plugin if no explicit entries provided
		if (!options.entry) {
			plugins.push(
				AutoEntryPlugin({
					...(options.exportsAsIndexes != null && { exportsAsIndexes: options.exportsAsIndexes }),
					...(!bundle && { bundleless: true }),
				}),
			);
		}

		// Process package.json with pnpm + RSLib transformations
		// Wrap user's transform to provide mode context
		const userTransform = options.transform;
		const transformFn = userTransform
			? (pkg: PackageJson): PackageJson => userTransform({ mode, target: undefined, pkg })
			: undefined;

		// Normalize format: accept single or array, determine primary format
		const formatOption = options.format ?? "esm";
		const formats: LibraryFormat[] = Array.isArray(formatOption) ? formatOption : [formatOption];
		const primaryFormat = formats[0] ?? "esm";
		const isDualFormat = formats.length > 1;

		// Determine entry format overrides
		const entryFormats = options.entryFormats;
		const hasFormatOverrides = entryFormats !== undefined && Object.keys(entryFormats).length > 0;

		// collapseIndex: bundle || !exportsAsIndexes
		// In bundleless mode with exportsAsIndexes, keep ./foo/index.js paths
		// In bundleless mode without exportsAsIndexes, collapse ./foo/index.ts → ./foo.js
		const collapseIndex = bundle || !(options.exportsAsIndexes ?? false);

		// Build output configuration
		const baseOutputDir = `dist/${mode}`;

		// Only enable API model generation for npm mode (not dev)
		const apiModelForMode = mode === "npm" ? options.apiModel : undefined;

		// Shared config fragments for lib configs
		const sourceMap = mode === "dev";
		const externalsConfig = options.externals && options.externals.length > 0 ? { externals: options.externals } : {};
		const bundlelessOutput = !bundle ? { legalComments: "inline" as const } : {};
		const sourceDefine = {
			"process.env.__PACKAGE_VERSION__": JSON.stringify(VERSION),
			...options.define,
		};

		// In bundleless mode, compute traced entries from import graph so RSlib
		// receives them on the lib config (modifyRsbuildConfig is too late —
		// RSlib resolves entries before plugin hooks run)
		let entry = options.entry;
		if (!bundle && !entry) {
			const cwd = process.cwd();
			const packageJsonPath = join(cwd, "package.json");
			const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageJson;
			const { entries } = new EntryExtractor().extract(packageJson);
			const graph = new ImportGraph({ rootDir: cwd });
			const result = graph.traceFromEntries(Object.values(entries));
			const tracedEntries: Record<string, string> = {};
			for (const file of result.files) {
				const relPath = relative(cwd, file);
				tracedEntries[relPath] = `./${relPath}`;
			}
			entry = tracedEntries;
		}

		plugins.push(
			PackageJsonTransformPlugin({
				forcePrivate: mode === "dev",
				bundle: collapseIndex,
				mode,
				format: primaryFormat,
				...(transformFn && { transform: transformFn }),
				...(hasFormatOverrides && { entryFormats }),
				...(isDualFormat && { dualFormat: true }),
			}),
		);

		// Add files array plugin to manage package.json files array
		plugins.push(
			FilesArrayPlugin({
				mode,
				...(options.transformFiles && { transformFiles: options.transformFiles }),
				...(isDualFormat && { formatDirs: formats }),
			}),
		);

		// Add user-provided plugins
		plugins.push(...options.plugins);

		// Add our custom DTS plugin that uses tsgo and emits through asset pipeline
		// The plugin will generate the temp tsconfig itself since it needs access to api.context.rootPath
		plugins.push(
			DtsPlugin({
				...(options.tsconfigPath && { tsconfigPath: options.tsconfigPath }),
				abortOnError: true,
				bundle,
				...(options.dtsBundledPackages && { bundledPackages: options.dtsBundledPackages }),
				buildMode: mode,
				format: primaryFormat,
				...(apiModelForMode !== undefined && { apiModel: apiModelForMode }),
				...(isDualFormat && { dtsPathPrefix: primaryFormat }),
			}),
		);

		const lib: LibConfig = {
			id: isDualFormat ? `${mode}-${primaryFormat}` : mode,
			outBase: !bundle ? "src" : baseOutputDir,
			output: {
				target: "node",
				module: true,
				cleanDistPath: true,
				sourceMap,
				...bundlelessOutput,
				distPath: {
					root: baseOutputDir,
					...(isDualFormat && { js: primaryFormat }),
				},
				copy: {
					patterns: options.copyPatterns,
				},
				...externalsConfig,
			},
			format: primaryFormat,
			experiments: {
				advancedEsm: primaryFormat === "esm",
			},
			bundle,
			plugins,
			source: {
				...(options.tsconfigPath && { tsconfigPath: options.tsconfigPath }),
				...(entry && { entry }),
				define: sourceDefine,
			},
			...(options.cjsInterop &&
				primaryFormat === "cjs" && {
					footer: { js: CJS_INTEROP_FOOTER },
				}),
		};

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

			// Create additional LibConfigs for secondary formats (dual format)
			if (isDualFormat) {
				for (const secondaryFormat of formats.slice(1)) {
					const secondaryPlugins: RsbuildPlugin[] = [
						// No AutoEntryPlugin - entries are shared from primary
						// No PackageJsonTransformPlugin - primary handles package.json
						// No FilesArrayPlugin - primary uses directory entries to cover all formats
						// Strip metadata assets that RSlib auto-copies, so they don't overwrite
						// the primary's processed versions (package.json, README, LICENSE)
						{
							name: "strip-metadata-assets",
							setup(api) {
								api.processAssets({ stage: "additional" }, (context) => {
									for (const name of Object.keys(context.compilation.assets)) {
										if (name === "package.json" || name === "README.md" || name === "LICENSE") {
											delete context.compilation.assets[name];
										}
									}
								});
							},
						},
						// Strip bin entries from secondary format (bundle mode) — bins are only
						// built for the primary format. In bundle mode, AutoEntryPlugin sets
						// entries on all environments via modifyRsbuildConfig, so this plugin
						// runs after it to remove bin/* entries from the secondary environment.
						// The separate `secondaryEntry` filter below handles bundleless mode
						// where entries are set on the LibConfig directly.
						{
							name: "strip-bin-entries",
							setup(api) {
								api.modifyRsbuildConfig((config) => {
									const envKey = `${mode}-${secondaryFormat}`;
									const envConfig = config.environments?.[envKey];
									if (envConfig?.source?.entry) {
										const filtered: typeof envConfig.source.entry = {};
										for (const [name, value] of Object.entries(envConfig.source.entry)) {
											if (!name.startsWith("bin/")) {
												filtered[name] = value;
											}
										}
										envConfig.source.entry = filtered;
									}
									return config;
								});
							},
						},
						DtsPlugin({
							...(options.tsconfigPath && { tsconfigPath: options.tsconfigPath }),
							abortOnError: true,
							bundle,
							...(options.dtsBundledPackages && { bundledPackages: options.dtsBundledPackages }),
							buildMode: mode,
							format: secondaryFormat,
							dtsPathPrefix: secondaryFormat,
						}),
					];

					// Filter bin entries from secondary format (bundleless mode) — in
					// bundleless mode, entries are computed upfront and passed on the
					// LibConfig directly because RSlib resolves entries before plugin
					// hooks run (see line ~760). The strip-bin-entries plugin above
					// handles bundle mode where AutoEntryPlugin sets entries later.
					const secondaryEntry = entry
						? Object.fromEntries(Object.entries(entry).filter(([name]) => !name.startsWith("bin/")))
						: undefined;

					const secondaryLib: LibConfig = {
						id: `${mode}-${secondaryFormat}`,
						outBase: !bundle ? "src" : baseOutputDir,
						output: {
							target: "node",
							cleanDistPath: false,
							sourceMap,
							...bundlelessOutput,
							distPath: {
								root: baseOutputDir,
								js: secondaryFormat,
							},
							...externalsConfig,
						},
						format: secondaryFormat,
						experiments: {
							advancedEsm: secondaryFormat === "esm",
						},
						bundle,
						plugins: secondaryPlugins,
						source: {
							...(options.tsconfigPath && { tsconfigPath: options.tsconfigPath }),
							...(secondaryEntry && { entry: secondaryEntry }),
							define: sourceDefine,
						},
						...(options.cjsInterop &&
							secondaryFormat === "cjs" && {
								footer: { js: CJS_INTEROP_FOOTER },
							}),
					};

					libConfigs.push(secondaryLib);
				}
			}

			// Create additional LibConfigs for per-entry format overrides
			if (hasFormatOverrides && !isDualFormat) {
				// Read package.json to determine which entries need override format
				const cwd = process.cwd();
				const packageJsonPath = join(cwd, "package.json");
				const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageJson;
				const { entries: extractedEntries, exportPaths } = new EntryExtractor().extract(packageJson);

				// Group overridden entries by their override format (only formats different from primary)
				const overridesByFormat = new Map<LibraryFormat, Record<string, string>>();
				for (const [entryName, sourcePath] of Object.entries(extractedEntries)) {
					const exportPath = exportPaths[entryName];
					if (exportPath && entryFormats?.[exportPath] && entryFormats[exportPath] !== primaryFormat) {
						const overrideFormat = entryFormats[exportPath];
						let formatEntries = overridesByFormat.get(overrideFormat);
						if (!formatEntries) {
							formatEntries = {};
							overridesByFormat.set(overrideFormat, formatEntries);
						}
						formatEntries[entryName] = sourcePath;
					}
				}

				// Create LibConfig for each override format group
				for (const [overrideFormat, overrideEntries] of overridesByFormat) {
					const overridePlugins: RsbuildPlugin[] = [
						FilesArrayPlugin({ mode }),
						DtsPlugin({
							...(options.tsconfigPath && { tsconfigPath: options.tsconfigPath }),
							abortOnError: true,
							bundle,
							...(options.dtsBundledPackages && { bundledPackages: options.dtsBundledPackages }),
							buildMode: mode,
							format: overrideFormat,
						}),
					];

					const overrideLib: LibConfig = {
						id: `${mode}-${overrideFormat}`,
						outBase: !bundle ? "src" : baseOutputDir,
						output: {
							target: "node",
							cleanDistPath: false,
							sourceMap,
							...bundlelessOutput,
							distPath: {
								root: baseOutputDir,
							},
							...externalsConfig,
						},
						format: overrideFormat,
						experiments: {
							advancedEsm: overrideFormat === "esm",
						},
						bundle,
						plugins: overridePlugins,
						source: {
							entry: overrideEntries,
							...(options.tsconfigPath && { tsconfigPath: options.tsconfigPath }),
							define: sourceDefine,
						},
						...(options.cjsInterop &&
							overrideFormat === "cjs" && {
								footer: { js: CJS_INTEROP_FOOTER },
							}),
					};

					libConfigs.push(overrideLib);
				}
			}
		}

		// Process virtual entries and create additional lib configs
		if (hasVirtualEntries) {
			// Group virtual entries by format
			const virtualByFormat = new Map<LibraryFormat, Map<string, string>>();

			for (const [outputName, config] of Object.entries(virtualEntries)) {
				const entryFormat = config.format ?? primaryFormat;
				let formatMap = virtualByFormat.get(entryFormat);
				if (!formatMap) {
					formatMap = new Map();
					virtualByFormat.set(entryFormat, formatMap);
				}
				// Strip extension from output name to get entry name
				const entryName = outputName.replace(/\.(c|m)?js$/, "");
				formatMap.set(entryName, config.source);
			}

			// Create lib configs for each format group
			for (const [format, entries] of virtualByFormat) {
				const virtualEntryNames = new Set(entries.keys());
				const entryMap = Object.fromEntries(entries);

				const virtualLib: LibConfig = {
					id: `${mode}-virtual-${format}`,
					format,
					bundle: true,
					output: {
						target: "node",
						cleanDistPath: false,
						sourceMap: false,
						distPath: {
							root: baseOutputDir,
						},
						...externalsConfig,
					},
					source: {
						entry: entryMap,
					},
					plugins: [
						VirtualEntryPlugin({ virtualEntryNames }),
						// Minimal plugins for virtual entries - no DtsPlugin, no AutoEntryPlugin
						FilesArrayPlugin({ mode }),
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
					cacheDirectory: `.rslib/cache/${mode}`,
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
			return exports != null && typeof exports === "object" && Object.keys(exports).length > 0;
		} catch {
			return false;
		}
	}
}

/**
 * Known shorthand expansions for publish target strings.
 * Aligns with KNOWN_SHORTHANDS in workflow-release-action's resolve-targets.ts.
 * @internal
 */
const KNOWN_TARGET_SHORTHANDS: Record<
	string,
	{ protocol: PublishProtocol; registry: string | null; provenance: boolean }
> = {
	npm: { protocol: "npm", registry: "https://registry.npmjs.org/", provenance: true },
	github: { protocol: "npm", registry: "https://npm.pkg.github.com/", provenance: true },
	jsr: { protocol: "jsr", registry: null, provenance: false },
};

/**
 * Resolve publish targets from package.json's `publishConfig.targets`.
 *
 * @remarks
 * Expands shorthand strings (`"npm"`, `"github"`, `"jsr"`, or a URL) into
 * fully resolved {@link PublishTarget} objects. Mirrors the resolution logic
 * in workflow-release-action, but only produces the subset of fields
 * relevant to the build process.
 *
 * @param packageJson - The parsed package.json
 * @param cwd - The package root directory (for resolving relative directories)
 * @param outdir - The default output directory (used when no target directory is specified)
 * @returns Array of resolved publish targets (empty if none configured)
 *
 * @public
 */
export function resolvePublishTargets(packageJson: PackageJson, cwd: string, outdir: string): PublishTarget[] {
	const publishConfig = packageJson.publishConfig;
	const raw = publishConfig?.targets;
	if (!Array.isArray(raw) || raw.length === 0) return [];

	const defaultAccess = (publishConfig?.access as "public" | "restricted" | undefined) ?? "restricted";
	const defaultDirectory = publishConfig?.directory ? resolve(cwd, String(publishConfig.directory)) : outdir;

	return raw.map((entry): PublishTarget => {
		// Expand shorthand strings
		if (typeof entry === "string") {
			const shorthand = KNOWN_TARGET_SHORTHANDS[entry];
			if (shorthand) {
				return {
					protocol: shorthand.protocol,
					registry: shorthand.registry,
					directory: defaultDirectory,
					access: defaultAccess,
					provenance: shorthand.provenance,
					tag: "latest",
				};
			}
			// URL shorthand — treat as custom npm-compatible registry
			if (entry.startsWith("https://") || entry.startsWith("http://")) {
				return {
					protocol: "npm",
					registry: entry,
					directory: defaultDirectory,
					access: defaultAccess,
					provenance: false,
					tag: "latest",
				};
			}
			throw new Error(`Unknown publish target shorthand: ${entry}`);
		}

		// Full object target
		const protocol = entry.protocol === "jsr" ? "jsr" : "npm";
		const registry = protocol === "jsr" ? null : String(entry.registry ?? "https://registry.npmjs.org/");
		const directory = entry.directory ? resolve(cwd, String(entry.directory)) : defaultDirectory;
		const access = entry.access === "public" || entry.access === "restricted" ? entry.access : defaultAccess;
		const provenance = typeof entry.provenance === "boolean" ? entry.provenance : false;
		const tag = typeof entry.tag === "string" ? entry.tag : "latest";

		return { protocol, registry, directory, access, provenance, tag };
	});
}
