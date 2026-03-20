import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RsbuildPlugin, SourceConfig } from "@rsbuild/core";
import type { LibConfig, RslibConfig } from "@rslib/core";
import { defineConfig } from "@rslib/core";
import { TSConfigs } from "../../tsconfig/index.js";
import type { PackageJson } from "../../types/package-json.js";
import type { ApiModelOptions } from "../plugins/dts-plugin.js";
import { DtsPlugin } from "../plugins/dts-plugin.js";
import { FilesArrayPlugin } from "../plugins/files-array-plugin.js";
import { PackageJsonTransformPlugin } from "../plugins/package-json-transform-plugin.js";
import { PublishTargetPlugin } from "../plugins/publish-target-plugin.js";
import type { TsDocLintPluginOptions } from "../plugins/tsdoc-lint-plugin.js";
import { TsDocLintPlugin } from "../plugins/tsdoc-lint-plugin.js";
import type {
	BuildMode,
	CopyPatternConfig,
	PublishTarget,
	RslibConfigAsyncFn,
	TransformPackageJsonFn,
} from "./node-library-builder.js";
import { resolvePublishTargets } from "./node-library-builder.js";

/**
 * Options for an individual RSPress plugin bundle (plugin or runtime).
 * @public
 */
export interface RSPressPluginBundleOptions {
	/** Entry point path. Plugin default: `"./src/index.ts"`, runtime default: `"./src/runtime/index.tsx"` */
	entry?: string;
	/** Additional externals merged with built-in RSPress externals. */
	externals?: (string | RegExp)[];
	/** Additional Rsbuild plugins. `pluginReact()` is auto-added on runtime. */
	plugins?: RsbuildPlugin[];
	/** Additional define constants merged with `{ "import.meta.env": "import.meta.env" }`. */
	define?: SourceConfig["define"];
}

/**
 * Options for RSPressPluginBuilder.
 * @public
 */
export interface RSPressPluginBuilderOptions {
	/** Plugin bundle configuration. Always generated. */
	plugin?: RSPressPluginBundleOptions;
	/** Runtime bundle configuration. Auto-detected from `src/runtime/index.tsx`, or `false` to disable. */
	runtime?: RSPressPluginBundleOptions | false;
	/** API model generation options. Default: `true`. */
	apiModel?: ApiModelOptions | boolean;
	/** Packages to bundle in TypeScript declarations. */
	dtsBundledPackages?: string[];
	/** Custom package.json transform function. */
	transform?: TransformPackageJsonFn;
	/** Path to custom tsconfig.json. Overrides the default RSPress plugin preset. */
	tsconfigPath?: string;
	/** Build modes to produce. Default: `["dev", "npm"]`. */
	modes?: BuildMode[];
	/** Static files to copy to output (e.g., i18n JSON). */
	copyPatterns?: (string | CopyPatternConfig)[];
}

/** Built-in externals for RSPress plugin bundles. */
export const RSPRESS_PLUGIN_EXTERNALS: readonly string[] = ["@rspress/core"];

/** Built-in externals for RSPress runtime bundles. */
export const RSPRESS_RUNTIME_EXTERNALS: readonly string[] = [
	"react",
	"react/jsx-runtime",
	"react/jsx-dev-runtime",
	"@rspress/core",
	"@theme",
];

/** Default runtime entry file path. */
const DEFAULT_RUNTIME_ENTRY = "./src/runtime/index.tsx";

/**
 * Builder for RSPress plugin packages with dual-bundle architecture.
 *
 * @remarks
 * Produces up to two RSlib lib configs:
 * - **Plugin lib**: The main RSPress plugin entry (always generated)
 * - **Runtime lib**: React components for the RSPress theme (auto-detected or explicit)
 *
 * @public
 */
/* v8 ignore next -- @preserve */
// biome-ignore lint/complexity/noStaticOnlyClass: <This is a nicety for the API>
export class RSPressPluginBuilder {
	private static readonly VALID_MODES: readonly BuildMode[] = ["dev", "npm"] as const;

	/**
	 * Merges user-provided options with defaults.
	 *
	 * @param options - Partial configuration options to merge
	 * @returns Merged options with defaults applied
	 */
	static mergeOptions(options: Partial<RSPressPluginBuilderOptions> = {}): RSPressPluginBuilderOptions {
		return {
			...(options.plugin !== undefined && { plugin: options.plugin }),
			...(options.runtime !== undefined && { runtime: options.runtime }),
			apiModel: options.apiModel ?? true,
			modes: options.modes ?? ["dev", "npm"],
			copyPatterns: options.copyPatterns ?? [],
			...(options.dtsBundledPackages !== undefined && { dtsBundledPackages: options.dtsBundledPackages }),
			...(options.transform !== undefined && { transform: options.transform }),
			...(options.tsconfigPath !== undefined && { tsconfigPath: options.tsconfigPath }),
		};
	}

	/**
	 * Creates an async RSLib configuration function for RSPress plugin packages.
	 *
	 * @param options - Configuration options for the builder
	 * @returns An async function compatible with RSLib's config system
	 */
	static create(options: Partial<RSPressPluginBuilderOptions> = {}): RslibConfigAsyncFn {
		const mergedOptions = RSPressPluginBuilder.mergeOptions(options);

		return async ({ envMode }: { envMode?: string }): Promise<RslibConfig> => {
			const mode = (envMode as BuildMode) || "dev";

			if (!RSPressPluginBuilder.VALID_MODES.includes(mode)) {
				throw new Error(
					`Invalid env-mode: "${mode}". Must be one of: ${RSPressPluginBuilder.VALID_MODES.join(", ")}\n` +
						`Example: rslib build --env-mode npm`,
				);
			}

			return RSPressPluginBuilder.createSingleMode(mode, mergedOptions);
		};
	}

	/**
	 * Creates a single-mode build configuration with plugin and optional runtime libs.
	 *
	 * @param mode - The build mode ("dev" or "npm")
	 * @param options - Configuration options
	 * @returns Promise resolving to the RSLib configuration
	 */
	static async createSingleMode(mode: BuildMode, options: RSPressPluginBuilderOptions): Promise<RslibConfig> {
		const cwd = process.cwd();
		const packageJsonPath = join(cwd, "package.json");
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageJson;

		// Auto-detect runtime
		const runtimeEnabled = RSPressPluginBuilder.shouldEnableRuntime(options, cwd);

		// Resolve publish targets (npm mode only)
		const baseOutputDir = `dist/${mode}`;
		const publishTargets = mode === "npm" ? resolvePublishTargets(packageJson, cwd, resolve(cwd, baseOutputDir)) : [];
		const hasTargets = publishTargets.length > 0;

		// Build lib configs
		const libConfigs: LibConfig[] = [];

		// Plugin lib (always)
		libConfigs.push(RSPressPluginBuilder.createPluginLib(mode, options, hasTargets, publishTargets));

		// Runtime lib (conditional)
		if (runtimeEnabled) {
			const runtimeOpts = typeof options.runtime === "object" ? options.runtime : {};
			const runtimeLib = await RSPressPluginBuilder.createRuntimeLib(mode, runtimeOpts, options);
			libConfigs.push(runtimeLib);
		}

		return defineConfig({
			lib: libConfigs,
			...(options.tsconfigPath && { source: { tsconfigPath: options.tsconfigPath } }),
			performance: {
				buildCache: {
					cacheDirectory: `.rslib/cache/${mode}`,
				},
			},
		});
	}

	/**
	 * Determines whether the runtime bundle should be enabled.
	 */
	private static shouldEnableRuntime(options: RSPressPluginBuilderOptions, cwd: string): boolean {
		// Explicitly disabled
		if (options.runtime === false) {
			return false;
		}

		// Explicitly configured with options (including custom entry)
		if (typeof options.runtime === "object") {
			return true;
		}

		// Auto-detect: check if default runtime entry exists
		return existsSync(join(cwd, "src/runtime/index.tsx"));
	}

	/**
	 * Creates the plugin lib configuration.
	 */
	private static createPluginLib(
		mode: BuildMode,
		options: RSPressPluginBuilderOptions,
		hasTargets: boolean,
		publishTargets: PublishTarget[],
	): LibConfig {
		const pluginOpts = options.plugin ?? {};
		const sourceMap = mode === "dev";
		const baseOutputDir = `dist/${mode}`;

		// Build plugins list
		const plugins: RsbuildPlugin[] = [];

		// 1. TsDocLintPlugin (if apiModel enabled)
		const apiModelConfig = typeof options.apiModel === "object" ? options.apiModel : {};
		const tsdocConfig = apiModelConfig.tsdoc;
		const lintConfig = tsdocConfig?.lint;
		const lintEnabled = options.apiModel !== false && lintConfig !== false;

		if (lintEnabled) {
			const { lint: _lint, ...tsdocWithoutLint } = tsdocConfig ?? {};
			const lintOptions: TsDocLintPluginOptions = {
				...(tsdocConfig && Object.keys(tsdocWithoutLint).length > 0 && { tsdoc: tsdocWithoutLint }),
				...(typeof lintConfig === "object" ? lintConfig : {}),
			};
			plugins.push(TsDocLintPlugin(lintOptions));
		}

		// 2. PackageJsonTransformPlugin (plugin lib only)
		const userTransform = options.transform;
		const transformFn =
			!hasTargets && userTransform
				? (pkg: PackageJson): PackageJson => userTransform({ mode, target: undefined, pkg })
				: undefined;

		// bundle: false prevents collapseIndex from converting ./runtime/index.tsx
		// to ./runtime.js — the runtime lib outputs to its own subdirectory, so
		// the export should map to ./runtime/index.js, not ./runtime.js.
		plugins.push(
			PackageJsonTransformPlugin({
				forcePrivate: mode === "dev",
				bundle: false,
				mode,
				format: "esm",
				...(transformFn && { transform: transformFn }),
			}),
		);

		// 3. FilesArrayPlugin
		plugins.push(FilesArrayPlugin({ mode }));

		// 4. DtsPlugin
		plugins.push(
			DtsPlugin({
				...(options.tsconfigPath
					? { tsconfigPath: options.tsconfigPath }
					: { tsconfigPreset: TSConfigs.rspress.plugin }),
				abortOnError: true,
				bundle: true,
				...(options.dtsBundledPackages && { bundledPackages: options.dtsBundledPackages }),
				buildMode: mode,
				format: "esm",
				...(options.apiModel !== undefined && { apiModel: options.apiModel }),
			}),
		);

		// 5. User plugins
		if (pluginOpts.plugins) {
			plugins.push(...pluginOpts.plugins);
		}

		// 6. PublishTargetPlugin (npm mode only, when targets exist)
		if (hasTargets) {
			const cwd = process.cwd();
			plugins.push(
				PublishTargetPlugin({
					targets: publishTargets,
					stagingDir: resolve(cwd, baseOutputDir),
					mode,
					...(userTransform && { transform: userTransform }),
				}),
			);
		}

		// Merge externals
		const externals: (string | RegExp)[] = [...RSPRESS_PLUGIN_EXTERNALS, ...(pluginOpts.externals ?? [])];

		// Merge define
		const sourceDefine = {
			"import.meta.env": "import.meta.env",
			...pluginOpts.define,
		};

		return {
			id: `${mode}-plugin`,
			output: {
				target: "node",
				module: true,
				cleanDistPath: true,
				sourceMap,
				distPath: {
					root: baseOutputDir,
				},
				copy: {
					patterns: options.copyPatterns ?? [],
				},
				externals,
			},
			format: "esm",
			bundle: true,
			experiments: {
				advancedEsm: true,
			},
			plugins,
			source: {
				...(options.tsconfigPath && { tsconfigPath: options.tsconfigPath }),
				entry: { index: pluginOpts.entry ?? "./src/index.ts" },
				define: sourceDefine,
			},
		};
	}

	/**
	 * Creates the runtime lib configuration.
	 */
	private static async createRuntimeLib(
		mode: BuildMode,
		runtimeOpts: RSPressPluginBundleOptions,
		options: RSPressPluginBuilderOptions,
	): Promise<LibConfig> {
		// Dynamic import of pluginReact
		let pluginReact: () => RsbuildPlugin;
		try {
			const reactPlugin = await import("@rsbuild/plugin-react");
			pluginReact = reactPlugin.pluginReact;
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") {
				throw new Error(
					"@rsbuild/plugin-react is required for RSPress runtime bundles. " +
						"Install it as a dev dependency: pnpm add -D @rsbuild/plugin-react",
				);
			}
			throw err;
		}

		const sourceMap = mode === "dev";
		const runtimeOutputDir = `dist/${mode}/runtime`;

		// Build plugins list
		const plugins: RsbuildPlugin[] = [];

		// DtsPlugin for runtime types — outputs to dist/<mode>/runtime/ alongside JS/CSS.
		// API model is explicitly disabled: React components are excluded from the
		// plugin's public API model (only the plugin entry contributes to .api.json).
		plugins.push(
			DtsPlugin({
				...(options.tsconfigPath
					? { tsconfigPath: options.tsconfigPath }
					: { tsconfigPreset: TSConfigs.rspress.plugin }),
				abortOnError: true,
				bundle: true,
				...(options.dtsBundledPackages && { bundledPackages: options.dtsBundledPackages }),
				buildMode: mode,
				format: "esm",
				apiModel: false,
			}),
		);

		// pluginReact
		plugins.push(pluginReact());

		// User plugins
		if (runtimeOpts.plugins) {
			plugins.push(...runtimeOpts.plugins);
		}

		// Merge externals
		const externals: (string | RegExp)[] = [...RSPRESS_RUNTIME_EXTERNALS, ...(runtimeOpts.externals ?? [])];

		// Merge define
		const sourceDefine = {
			"import.meta.env": "import.meta.env",
			...runtimeOpts.define,
		};

		return {
			id: `${mode}-runtime`,
			output: {
				target: "web",
				cleanDistPath: false,
				sourceMap,
				distPath: {
					root: runtimeOutputDir,
				},
				externals,
				cssModules: {
					namedExport: false,
					exportLocalsConvention: "camelCaseOnly",
				},
			},
			format: "esm",
			bundle: true,
			experiments: {
				advancedEsm: true,
			},
			plugins,
			source: {
				...(options.tsconfigPath && { tsconfigPath: options.tsconfigPath }),
				entry: { index: runtimeOpts.entry ?? DEFAULT_RUNTIME_ENTRY },
				define: sourceDefine,
			},
			tools: {
				rspack(config, { rspack }) {
					config.plugins ??= [];
					config.plugins.push(
						new rspack.BannerPlugin({
							banner: 'import "./index.css";',
							raw: true,
							include: /index\.js$/,
						}),
					);
				},
			},
		};
	}
}
