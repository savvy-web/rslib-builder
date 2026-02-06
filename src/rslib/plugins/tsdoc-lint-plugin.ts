import type { PathLike } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import { logger } from "@rsbuild/core";
import type { ESLint as ESLintNamespace, Linter } from "eslint";
import color from "picocolors";
import type { PackageJson } from "../../types/package-json.js";
import type { TsDocLintErrorBehavior, TsDocOptions } from "./dts-plugin.js";
import { TsDocConfigBuilder } from "./dts-plugin.js";
import { EntryExtractor } from "./utils/entry-extractor.js";
import type { ImportGraphError } from "./utils/import-graph.js";
import { ImportGraph } from "./utils/import-graph.js";

/**
 * Helper interface for handling ESM/CJS module format differences.
 * Some modules export default, others export directly.
 */
interface ESModuleExport<T> {
	default?: T;
}

/**
 * Options for the TSDoc lint plugin.
 *
 * @remarks
 * This plugin validates TSDoc comments in your source files before the build
 * starts using ESLint with `eslint-plugin-tsdoc`. It helps catch documentation
 * errors early in the development cycle.
 *
 * @example
 * Enable with defaults (throws in CI, errors locally):
 * ```typescript
 * import { TsDocLintPlugin } from '@savvy-web/rslib-builder';
 *
 * export default defineConfig({
 *   plugins: [TsDocLintPlugin()],
 * });
 * ```
 *
 * @example
 * Custom configuration:
 * ```typescript
 * import { TsDocLintPlugin } from '@savvy-web/rslib-builder';
 *
 * export default defineConfig({
 *   plugins: [
 *     TsDocLintPlugin({
 *       tsdoc: {
 *         tagDefinitions: [{ tagName: '@error', syntaxKind: 'block' }],
 *       },
 *       onError: 'throw',
 *       persistConfig: true,
 *     }),
 *   ],
 * });
 * ```
 *
 * @public
 */
export interface TsDocLintPluginOptions {
	/**
	 * Whether to enable TSDoc linting.
	 * @defaultValue true
	 */
	enabled?: boolean;

	/**
	 * TSDoc configuration for custom tag definitions.
	 * Uses the same options as the DtsPlugin's apiModel.tsdoc option.
	 *
	 * @remarks
	 * By default, all standard tag groups (core, extended, discretionary) are
	 * enabled. Custom tags defined in `tagDefinitions` are automatically
	 * supported.
	 */
	tsdoc?: TsDocOptions;

	/**
	 * Override automatic file discovery with explicit file paths or glob patterns.
	 *
	 * @remarks
	 * By default, TsDocLintPlugin uses import graph analysis to discover files
	 * from your package's exports. This ensures only public API files are linted.
	 *
	 * Use this option only when you need to lint specific files that aren't
	 * part of the export graph, or to override the automatic discovery.
	 *
	 * When specified as glob patterns, test files and `__test__` directories
	 * are still excluded unless explicitly included.
	 *
	 * @example
	 * ```typescript
	 * // Explicit patterns override automatic discovery
	 * TsDocLintPlugin({
	 *   include: ["src/**\/*.ts", "!**\/*.test.ts"],
	 * })
	 * ```
	 */
	include?: string[];

	/**
	 * How to handle TSDoc lint errors.
	 * - `"warn"`: Log warnings but continue the build
	 * - `"error"`: Log errors but continue the build
	 * - `"throw"`: Fail the build with an error
	 *
	 * @defaultValue `"throw"` in CI environments, `"error"` locally
	 */
	onError?: TsDocLintErrorBehavior;

	/**
	 * Persist tsdoc.json to disk for tool integration (ESLint, IDEs).
	 * - `true`: Write to project root as "tsdoc.json" (or validate in CI)
	 * - `PathLike`: Write to specified path (or validate in CI)
	 * - `false`: Clean up after linting (not recommended)
	 *
	 * @remarks
	 * In CI environments (`CI` or `GITHUB_ACTIONS` env vars set to "true"),
	 * the config file is validated instead of written. If the existing file
	 * doesn't match the expected configuration, the build fails with an error
	 * instructing the developer to regenerate the file locally.
	 *
	 * @defaultValue `true`
	 */
	persistConfig?: boolean | PathLike;

	/**
	 * Whether to run lint per entry point individually with per-entry logging.
	 *
	 * @remarks
	 * When enabled, each entry point is linted separately and results are
	 * logged per entry for better visibility in bundleless mode.
	 *
	 * @defaultValue false
	 */
	perEntry?: boolean;
}

/**
 * Result of a single lint message from ESLint.
 * @internal
 */
export interface LintMessage {
	/** The file path relative to the project root */
	filePath: string;
	/** Line number (1-indexed) */
	line: number;
	/** Column number (1-indexed) */
	column: number;
	/** The lint message */
	message: string;
	/** The ESLint rule ID */
	ruleId: string | null;
	/** Severity: 1 = warning, 2 = error */
	severity: 1 | 2;
}

/**
 * Result of running TSDoc lint.
 * @internal
 */
export interface LintResult {
	/** Total number of errors */
	errorCount: number;
	/** Total number of warnings */
	warningCount: number;
	/** All lint messages */
	messages: LintMessage[];
}

/**
 * Formats lint results for console output.
 *
 * @param results - The lint results to format
 * @param cwd - The current working directory for relative paths
 * @returns Formatted string for console output
 *
 * @internal
 */
export function formatLintResults(results: LintResult, cwd: string): string {
	if (results.messages.length === 0) {
		return "";
	}

	const lines: string[] = [];

	// Group messages by file
	const messagesByFile = new Map<string, LintMessage[]>();
	for (const msg of results.messages) {
		const existing = messagesByFile.get(msg.filePath) ?? [];
		existing.push(msg);
		messagesByFile.set(msg.filePath, existing);
	}

	for (const [filePath, messages] of messagesByFile) {
		lines.push(color.underline(color.cyan(relative(cwd, filePath))));

		for (const msg of messages) {
			const location = color.dim(`${msg.line}:${msg.column}`);
			const severityColor = msg.severity === 2 ? color.red : color.yellow;
			const severityLabel = msg.severity === 2 ? "error" : "warning";
			const rule = msg.ruleId ? color.dim(`(${msg.ruleId})`) : "";
			lines.push(`  ${location}  ${severityColor(severityLabel)}  ${msg.message} ${rule}`);
		}

		lines.push(""); // Empty line between files
	}

	// Summary line
	const errorText = results.errorCount === 1 ? "error" : "errors";
	const warningText = results.warningCount === 1 ? "warning" : "warnings";
	const summary =
		results.errorCount > 0
			? color.red(`${results.errorCount} ${errorText}`)
			: color.yellow(`${results.warningCount} ${warningText}`);
	lines.push(summary);

	return lines.join("\n");
}

/**
 * Result of file discovery for TSDoc linting.
 * @internal
 */
interface FileDiscoveryResult {
	/** Files to lint (absolute paths or glob patterns depending on isGlobPattern) */
	files: string[];
	/** Errors encountered during discovery (non-fatal) */
	errors: ImportGraphError[];
	/** Whether files contains glob patterns (true) or absolute paths (false) */
	isGlobPattern: boolean;
}

/**
 * Discovers files to lint using import graph analysis or explicit patterns.
 *
 * @remarks
 * When no explicit `include` patterns are provided, this function uses
 * {@link ImportGraph} to trace imports from package.json exports. This ensures
 * only public API files are linted, avoiding internal implementation details.
 *
 * @param options - Plugin options containing optional include patterns
 * @param cwd - The project root directory
 * @returns Discovery result with files to lint and any errors encountered
 *
 * @internal
 */
export function discoverFilesToLint(options: TsDocLintPluginOptions, cwd: string): FileDiscoveryResult {
	// If user provided explicit patterns, use those
	if (options.include && options.include.length > 0) {
		return {
			files: options.include,
			errors: [],
			isGlobPattern: true,
		};
	}

	// Default: discover files from package.json exports using import graph
	const graph = new ImportGraph({ rootDir: cwd });
	const packageJsonPath = join(cwd, "package.json");
	const result = graph.traceFromPackageExports(packageJsonPath);

	return {
		files: result.files,
		errors: result.errors,
		isGlobPattern: false,
	};
}

/**
 * Discovers files to lint per entry point using import graph analysis.
 *
 * @param cwd - The project root directory
 * @returns Map of entry name to discovery result, plus aggregated errors
 *
 * @internal
 */
/* v8 ignore start -- Integration function using ImportGraph and fs */
export function discoverFilesToLintPerEntry(cwd: string): {
	perEntry: Map<string, FileDiscoveryResult>;
	errors: ImportGraphError[];
} {
	const packageJsonPath = join(cwd, "package.json");
	let packageJson: PackageJson;
	try {
		packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageJson;
	} catch {
		return { perEntry: new Map(), errors: [] };
	}

	const { entries } = new EntryExtractor().extract(packageJson);

	const graph = new ImportGraph({ rootDir: cwd });
	const perEntry = new Map<string, FileDiscoveryResult>();
	const allErrors: ImportGraphError[] = [];

	for (const [entryName, sourcePath] of Object.entries(entries)) {
		// Skip bin entries
		if (entryName.startsWith("bin/")) continue;

		const resolvedPath = sourcePath.startsWith(".") ? resolve(cwd, sourcePath) : sourcePath;

		const result = graph.traceFromEntries([resolvedPath]);

		perEntry.set(entryName, {
			files: result.files,
			errors: result.errors,
			isGlobPattern: false,
		});

		allErrors.push(...result.errors);
	}

	return { perEntry, errors: allErrors };
}
/* v8 ignore stop */

/**
 * Result of running TSDoc lint via ESLint.
 * @internal
 */
interface TsDocLintRunResult {
	/** The lint results containing errors, warnings, and messages */
	results: LintResult;
	/** Path to the persisted tsdoc.json file (undefined if not persisted) */
	tsdocConfigPath?: string;
	/** Errors from file discovery (undefined if no errors) */
	discoveryErrors?: ImportGraphError[];
}

/**
 * Runs TSDoc lint using ESLint programmatically.
 *
 * @remarks
 * This function dynamically imports ESLint and its plugins, generates a tsdoc.json
 * configuration file, discovers files to lint, and runs ESLint with the
 * `eslint-plugin-tsdoc` plugin.
 *
 * @param options - Plugin options for configuring TSDoc linting
 * @param cwd - The project root directory
 * @returns Promise resolving to lint results and configuration paths
 *
 * @internal
 */
export async function runTsDocLint(options: TsDocLintPluginOptions, cwd: string): Promise<TsDocLintRunResult> {
	// Generate tsdoc.json config file
	const tsdocOptions = options.tsdoc ?? {};
	const persistConfig = options.persistConfig;
	const shouldPersist = TsDocConfigBuilder.shouldPersist(persistConfig);
	const tsdocConfigOutputPath = TsDocConfigBuilder.getConfigPath(persistConfig, cwd);

	// Skip CI validation when persistConfig is explicitly false
	const skipCIValidation = persistConfig === false;
	const tsdocConfigPath = await TsDocConfigBuilder.writeConfigFile(
		tsdocOptions,
		dirname(tsdocConfigOutputPath),
		skipCIValidation,
	);

	// Dynamic import ESLint and plugins
	const eslintModule = await import("eslint");
	const tsParserModule = await import("@typescript-eslint/parser");
	const tsdocPluginModule = await import("eslint-plugin-tsdoc");

	const { ESLint } = eslintModule;

	// Handle both ESM and CJS module formats
	const tsParser = (tsParserModule as ESModuleExport<Linter.Parser>).default ?? (tsParserModule as Linter.Parser);
	const tsdocPlugin =
		(tsdocPluginModule as ESModuleExport<ESLintNamespace.Plugin>).default ??
		(tsdocPluginModule as ESLintNamespace.Plugin);

	// Discover files to lint
	const discovery = discoverFilesToLint(options, cwd);

	// If no files discovered, return early with empty results
	if (discovery.files.length === 0) {
		return {
			results: { errorCount: 0, warningCount: 0, messages: [] },
			...(shouldPersist && { tsdocConfigPath }),
			...(discovery.errors.length > 0 && { discoveryErrors: discovery.errors }),
		};
	}

	// Create ESLint instance with inline config
	let eslintConfig: Linter.Config[];
	let filesToLint: string[];

	if (discovery.isGlobPattern) {
		// User provided glob patterns
		const includePatterns = discovery.files;
		filesToLint = includePatterns.filter((p) => !p.startsWith("!"));

		eslintConfig = [
			{
				ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
			},
			{
				files: filesToLint,
				ignores: includePatterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1)),
				languageOptions: {
					parser: tsParser as Linter.Parser,
				},
				plugins: { tsdoc: tsdocPlugin as ESLintNamespace.Plugin },
				rules: {
					"tsdoc/syntax": "error",
				},
			},
		];
	} else {
		// ImportGraph discovered absolute file paths
		filesToLint = discovery.files;

		eslintConfig = [
			{
				ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
			},
			{
				files: ["**/*.ts", "**/*.tsx"],
				languageOptions: {
					parser: tsParser as Linter.Parser,
				},
				plugins: { tsdoc: tsdocPlugin as ESLintNamespace.Plugin },
				rules: {
					"tsdoc/syntax": "error",
				},
			},
		];
	}

	const eslint = new ESLint({
		cwd,
		overrideConfigFile: true,
		overrideConfig: eslintConfig,
	});

	// Run ESLint on source files
	const eslintResults = await eslint.lintFiles(filesToLint);

	// Convert ESLint results to our format
	const messages: LintMessage[] = [];
	let errorCount = 0;
	let warningCount = 0;

	for (const result of eslintResults) {
		for (const msg of result.messages) {
			messages.push({
				filePath: result.filePath,
				line: msg.line,
				column: msg.column,
				message: msg.message,
				ruleId: msg.ruleId,
				severity: msg.severity as 1 | 2,
			});

			if (msg.severity === 2) {
				errorCount++;
			} else {
				warningCount++;
			}
		}
	}

	return {
		results: { errorCount, warningCount, messages },
		...(shouldPersist && { tsdocConfigPath }),
		...(discovery.errors.length > 0 && { discoveryErrors: discovery.errors }),
	};
}

/**
 * Runs TSDoc lint per entry point, providing per-entry logging visibility.
 *
 * @param options - Plugin options for configuring TSDoc linting
 * @param cwd - The project root directory
 * @returns Promise resolving to aggregated lint results and configuration paths
 *
 * @internal
 */
/* v8 ignore start -- Integration function using ESLint programmatically */
export async function runTsDocLintPerEntry(options: TsDocLintPluginOptions, cwd: string): Promise<TsDocLintRunResult> {
	// Generate tsdoc.json config file
	const tsdocOptions = options.tsdoc ?? {};
	const persistConfig = options.persistConfig;
	const shouldPersist = TsDocConfigBuilder.shouldPersist(persistConfig);
	const tsdocConfigOutputPath = TsDocConfigBuilder.getConfigPath(persistConfig, cwd);

	const skipCIValidation = persistConfig === false;
	const tsdocConfigPath = await TsDocConfigBuilder.writeConfigFile(
		tsdocOptions,
		dirname(tsdocConfigOutputPath),
		skipCIValidation,
	);

	// Dynamic import ESLint and plugins
	const eslintModule = await import("eslint");
	const tsParserModule = await import("@typescript-eslint/parser");
	const tsdocPluginModule = await import("eslint-plugin-tsdoc");

	const { ESLint } = eslintModule;

	const tsParser = (tsParserModule as ESModuleExport<Linter.Parser>).default ?? (tsParserModule as Linter.Parser);
	const tsdocPlugin =
		(tsdocPluginModule as ESModuleExport<ESLintNamespace.Plugin>).default ??
		(tsdocPluginModule as ESLintNamespace.Plugin);

	// Discover files per entry
	const { perEntry, errors: allErrors } = discoverFilesToLintPerEntry(cwd);

	if (perEntry.size === 0) {
		return {
			results: { errorCount: 0, warningCount: 0, messages: [] },
			...(shouldPersist && { tsdocConfigPath }),
			...(allErrors.length > 0 && { discoveryErrors: allErrors }),
		};
	}

	// Create ESLint instance (shared across entries)
	const eslint = new ESLint({
		cwd,
		overrideConfigFile: true,
		overrideConfig: [
			{
				ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
			},
			{
				files: ["**/*.ts", "**/*.tsx"],
				languageOptions: {
					parser: tsParser as Linter.Parser,
				},
				plugins: { tsdoc: tsdocPlugin as ESLintNamespace.Plugin },
				rules: {
					"tsdoc/syntax": "error",
				},
			},
		],
	});

	// Aggregated results
	const allMessages: LintMessage[] = [];
	let totalErrors = 0;
	let totalWarnings = 0;

	// Lint per entry
	for (const [entryName, discovery] of perEntry) {
		if (discovery.files.length === 0) {
			continue;
		}

		const exportKey = entryName === "index" ? "." : `./${entryName}`;
		logger.info(
			`${color.dim("[tsdoc-lint]")} Validating "${exportKey}" (${discovery.files.length} file${discovery.files.length === 1 ? "" : "s"})...`,
		);

		const eslintResults = await eslint.lintFiles(discovery.files);

		let entryErrors = 0;
		let entryWarnings = 0;

		for (const result of eslintResults) {
			for (const msg of result.messages) {
				allMessages.push({
					filePath: result.filePath,
					line: msg.line,
					column: msg.column,
					message: msg.message,
					ruleId: msg.ruleId,
					severity: msg.severity as 1 | 2,
				});

				if (msg.severity === 2) {
					entryErrors++;
					totalErrors++;
				} else {
					entryWarnings++;
					totalWarnings++;
				}
			}
		}

		if (entryErrors === 0 && entryWarnings === 0) {
			logger.info(`${color.dim("[tsdoc-lint]")} ${color.green(`\u2713 "${exportKey}" - All TSDoc comments valid`)}`);
		} else {
			const errorText = entryErrors === 1 ? "error" : "errors";
			const warningText = entryWarnings === 1 ? "warning" : "warnings";
			const parts: string[] = [];
			if (entryErrors > 0) parts.push(`${entryErrors} ${errorText}`);
			if (entryWarnings > 0) parts.push(`${entryWarnings} ${warningText}`);
			logger.warn(`${color.dim("[tsdoc-lint]")} ${color.red(`\u2717 "${exportKey}" - ${parts.join(", ")} found`)}`);
		}
	}

	return {
		results: { errorCount: totalErrors, warningCount: totalWarnings, messages: allMessages },
		...(shouldPersist && { tsdocConfigPath }),
		...(allErrors.length > 0 && { discoveryErrors: allErrors }),
	};
}
/* v8 ignore stop */

/**
 * Cleans up the tsdoc.json config file.
 *
 * @param configPath - Path to the config file to delete
 *
 * @internal
 */
export async function cleanupTsDocConfig(configPath: string | undefined): Promise<void> {
	if (!configPath) return;

	try {
		const { unlink } = await import("node:fs/promises");
		await unlink(configPath);
	} catch {
		// Ignore cleanup errors
	}
}

/**
 * Creates a plugin to validate TSDoc comments before build using ESLint with eslint-plugin-tsdoc.
 *
 * @remarks
 * This plugin runs TSDoc validation during the `onBeforeBuild` hook, ensuring that
 * documentation errors are caught before compilation begins. It generates a virtual
 * `tsdoc.json` configuration file that can be persisted for IDE and tool integration.
 *
 * ## Features
 *
 * - Programmatic ESLint execution with `eslint-plugin-tsdoc`
 * - Configurable error handling (warn, error, throw)
 * - Automatic CI detection for stricter defaults
 * - Optional tsdoc.json persistence for tool integration
 * - Automatic file discovery via import graph analysis
 * - Customizable file patterns when needed
 *
 * ## Error Handling
 *
 * | Environment | Default Behavior | On Lint Errors |
 * |-------------|------------------|----------------|
 * | Local       | `"error"`        | Log and continue |
 * | CI          | `"throw"`        | Fail the build |
 *
 * ## Dependencies
 *
 * This plugin uses ESLint programmatically with the following packages:
 * - `eslint`
 * - `@typescript-eslint/parser`
 * - `eslint-plugin-tsdoc`
 *
 * @param options - Plugin configuration options
 * @returns An Rsbuild plugin that validates TSDoc comments before the build
 *
 * @example
 * ```typescript
 * import { TsDocLintPlugin } from '@savvy-web/rslib-builder';
 *
 * export default defineConfig({
 *   plugins: [
 *     TsDocLintPlugin({
 *       onError: 'throw',
 *       persistConfig: true,
 *     }),
 *   ],
 * });
 * ```
 *
 * @public
 */
/* v8 ignore start -- Integration plugin factory called by Rsbuild */
export const TsDocLintPlugin = (options: TsDocLintPluginOptions = {}): RsbuildPlugin => {
	const { enabled = true } = options;

	// State for cleanup
	let tempTsDocConfigPath: string | undefined;

	return {
		name: "tsdoc-lint-plugin",
		setup(api: RsbuildPluginAPI): void {
			if (!enabled) {
				return;
			}

			// Run TSDoc linting before the build starts
			api.onBeforeBuild(async () => {
				const cwd = api.context.rootPath;
				const isCI = TsDocConfigBuilder.isCI();

				// Determine error behavior
				const onError = options.onError ?? (isCI ? "throw" : "error");

				logger.info(`${color.dim("[tsdoc-lint]")} Validating TSDoc comments...`);

				try {
					const { results, tsdocConfigPath, discoveryErrors } = options.perEntry
						? await runTsDocLintPerEntry(options, cwd)
						: await runTsDocLint(options, cwd);

					// Log any discovery warnings
					if (discoveryErrors && discoveryErrors.length > 0) {
						for (const error of discoveryErrors) {
							logger.warn(`${color.dim("[tsdoc-lint]")} ${error.message}`);
						}
					}

					// Store for potential cleanup later
					if (!TsDocConfigBuilder.shouldPersist(options.persistConfig)) {
						tempTsDocConfigPath = tsdocConfigPath;
					}

					if (results.errorCount === 0 && results.warningCount === 0) {
						logger.info(`${color.dim("[tsdoc-lint]")} ${color.green("All TSDoc comments are valid")}`);
						return;
					}

					// Format and log results
					const formatted = formatLintResults(results, cwd);

					if (results.errorCount > 0) {
						if (onError === "throw") {
							throw new Error(`TSDoc validation failed:\n${formatted}`);
						} else if (onError === "error") {
							logger.error(`${color.dim("[tsdoc-lint]")} TSDoc validation errors:\n${formatted}`);
						} else {
							logger.warn(`${color.dim("[tsdoc-lint]")} TSDoc validation warnings:\n${formatted}`);
						}
					} else if (results.warningCount > 0) {
						logger.warn(`${color.dim("[tsdoc-lint]")} TSDoc validation warnings:\n${formatted}`);
					}
				} catch (error) {
					// Clean up temp config on error
					await cleanupTsDocConfig(tempTsDocConfigPath);
					throw error;
				}
			});

			// Clean up temp tsdoc.json after build completes
			api.onCloseBuild(async () => {
				await cleanupTsDocConfig(tempTsDocConfigPath);
			});
		},
	};
};
/* v8 ignore stop */
