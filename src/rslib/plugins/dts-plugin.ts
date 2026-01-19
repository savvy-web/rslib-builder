import { spawn } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import { logger } from "@rsbuild/core";
import color from "picocolors";
import type { PackageJson } from "type-fest";
import type { Diagnostic, ParsedCommandLine } from "typescript";
import {
	createCompilerHost,
	findConfigFile,
	formatDiagnostic,
	parseJsonConfigFileContent,
	readConfigFile,
	sys,
} from "typescript";
import { getWorkspaceRoot } from "workspace-tools";
import { createEnvLogger } from "#utils/build-logger.js";
import { getApiExtractorPath } from "#utils/file-utils.js";
import { TSConfigs } from "../../tsconfig/index.js";

/**
 * Options for API model generation.
 * When enabled, generates an api.model.json file using API Extractor.
 * @public
 */
export interface ApiModelOptions {
	/**
	 * Whether to enable API model generation.
	 * @defaultValue false
	 */
	enabled?: boolean;

	/**
	 * Filename for the generated API model file.
	 * @defaultValue "api.model.json"
	 */
	filename?: string;

	/**
	 * Whether to add a .npmignore file that excludes the API model file.
	 * This is useful when the API model is for internal tooling only.
	 * @defaultValue true
	 */
	npmIgnore?: boolean;

	/**
	 * Local paths to copy the API model and package.json to.
	 * Used for local testing with documentation systems.
	 *
	 * @remarks
	 * Each path must be a directory. The parent directory must exist,
	 * but the final directory will be created if it doesn't exist.
	 * Both api.model.json and the processed package.json will be copied.
	 *
	 * @example
	 * ```typescript
	 * apiModel: {
	 *   enabled: true,
	 *   localPaths: ["../docs-site/lib/packages/my-package"],
	 * }
	 * ```
	 */
	localPaths?: string[];
}

/**
 * Options for configuring the DTS plugin.
 * @public
 */
export interface DtsPluginOptions {
	/**
	 * Path to TypeScript configuration file.
	 * If not specified, uses the tsconfigPath from Rsbuild config or searches for tsconfig.json.
	 */
	tsconfigPath?: string;

	/**
	 * Custom output directory for declaration files relative to dist root.
	 * If not specified, uses the declarationDir from tsconfig.json or falls back to dist root.
	 */
	distPath?: string;

	/**
	 * Whether to abort the build on TypeScript errors.
	 * @defaultValue true
	 */
	abortOnError?: boolean;

	/**
	 * Custom file extension for declaration files.
	 * @defaultValue ".d.ts"
	 */
	dtsExtension?: string;

	/**
	 * Whether to bundle declaration files using API Extractor.
	 * When true, generates a single .d.ts file per entry point.
	 * @defaultValue false
	 */
	bundle?: boolean;

	/**
	 * Packages whose types should be bundled (inlined) into the output .d.ts files.
	 * Only applies when bundle is true.
	 * Supports glob patterns (e.g., '@commitlint/*', 'type-fest')
	 * @defaultValue []
	 */
	bundledPackages?: string[];

	/**
	 * Banner text to add at the top of bundled declaration files.
	 * Only applies when bundle is true.
	 */
	banner?: string;

	/**
	 * Footer text to add at the bottom of bundled declaration files.
	 * Only applies when bundle is true.
	 */
	footer?: string;

	/**
	 * Build target (dev, npm).
	 * Used to generate the correct temp tsconfig when tsconfigPath is not provided.
	 */
	buildTarget?: "dev" | "npm";

	/**
	 * Options for API model generation.
	 * When enabled, generates an api.model.json file in the dist directory.
	 * Only applies when bundle is true.
	 */
	apiModel?: ApiModelOptions | boolean;
}

/**
 * Gets the path to the tsgo (TypeScript native compiler) executable.
 * Uses workspace-tools to find the workspace root and searches for tsgo binary.
 * Supports npm, pnpm, yarn, rush, and lerna workspaces.
 * @returns The absolute path to the tsgo binary
 * @internal
 */
export function getTsgoBinPath(): string {
	const cwd = process.cwd();

	// First, try the current package's node_modules
	const localTsgoBin = join(cwd, "node_modules", ".bin", "tsgo");
	if (existsSync(localTsgoBin)) {
		return localTsgoBin;
	}

	// If not found locally, use workspace-tools to find the workspace root
	// This handles pnpm, npm, yarn, rush, and lerna workspaces
	const workspaceRoot = getWorkspaceRoot(cwd);
	/* v8 ignore start -- Workspace fallback difficult to test without mocking workspace-tools */
	if (workspaceRoot) {
		const workspaceTsgoBin = join(workspaceRoot, "node_modules", ".bin", "tsgo");
		if (existsSync(workspaceTsgoBin)) {
			return workspaceTsgoBin;
		}
	}
	/* v8 ignore stop */

	// Fallback to current directory (will error with a clear message if not found)
	return localTsgoBin;
}

/**
 * Generates command-line arguments for tsgo.
 *
 * @public
 */
export function generateTsgoArgs(options: {
	configPath: string;
	declarationDir: string;
	rootDir?: string;
	tsBuildInfoFile?: string;
}): string[] {
	const { configPath, declarationDir, rootDir, tsBuildInfoFile } = options;

	const args = [
		"--project",
		configPath,
		"--declaration",
		"--emitDeclarationOnly",
		"--declarationMap",
		"--declarationDir",
		declarationDir,
	];

	if (rootDir) {
		args.push("--rootDir", rootDir);
	}

	if (tsBuildInfoFile) {
		args.push("--tsBuildInfoFile", tsBuildInfoFile);
	}

	return args;
}

/**
 * Recursively collects all .d.ts and .d.ts.map files from a directory.
 *
 * @public
 */
export async function collectDtsFiles(
	dir: string,
	baseDir: string = dir,
): Promise<Array<{ path: string; relativePath: string }>> {
	const files: Array<{ path: string; relativePath: string }> = [];

	async function walk(currentDir: string): Promise<void> {
		const entries = await readdir(currentDir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);

			if (entry.isDirectory()) {
				await walk(fullPath);
			} else if (entry.name.endsWith(".d.ts") || entry.name.endsWith(".d.ts.map")) {
				const relativePath = relative(baseDir, fullPath);
				files.push({ path: fullPath, relativePath });
			}
		}
	}

	await walk(dir);
	return files;
}

/**
 * Result of bundling declaration files.
 */
interface BundleDtsResult {
	/** Map of entry names to their bundled file paths in temp */
	bundledFiles: Map<string, string>;
	/** Path to the generated API model file (if apiModel was enabled) */
	apiModelPath?: string;
}

/**
 * Bundles TypeScript declaration files using API Extractor.
 * Writes bundled output to a temporary directory (not dist).
 * Returns a map of entry names to their bundled file paths in temp.
 * @internal
 */
/* v8 ignore start -- Integration function requiring API Extractor */
async function bundleDtsFiles(options: {
	cwd: string;
	tempDtsDir: string;
	tempOutputDir: string;
	tsconfigPath: string;
	bundledPackages: string[];
	entryPoints: Map<string, string>;
	banner?: string;
	footer?: string;
	apiModel?: ApiModelOptions | boolean;
}): Promise<BundleDtsResult> {
	const { cwd, tempDtsDir, tempOutputDir, tsconfigPath, bundledPackages, entryPoints, banner, footer, apiModel } =
		options;

	const bundledFiles = new Map<string, string>();
	let apiModelPath: string | undefined;

	// Normalize apiModel options
	const apiModelEnabled = apiModel === true || (typeof apiModel === "object" && apiModel.enabled !== false);
	const apiModelFilename = typeof apiModel === "object" && apiModel.filename ? apiModel.filename : "api.model.json";

	// Validate that API Extractor is installed before attempting import
	getApiExtractorPath();

	const { Extractor, ExtractorConfig } = await import("@microsoft/api-extractor");

	// Process each entry point
	for (const [entryName, sourcePath] of entryPoints) {
		// Determine the .d.ts file path for this entry in temp directory
		// When tsgo runs with --rootDir, it generates files relative to that root
		// Example: sourcePath = "./src/rslib/index.ts" -> try "rslib/index.d.ts" (without src/)
		const normalizedSourcePath = sourcePath.replace(/^\.\//, "");
		const dtsFileName = normalizedSourcePath.replace(/\.(tsx?|jsx?)$/, ".d.ts");
		let tempDtsPath = join(tempDtsDir, dtsFileName);

		// Check if the file exists; if not, try stripping common prefixes like "src/"
		try {
			await access(tempDtsPath, constants.F_OK);
		} catch {
			// File doesn't exist at the direct path, try stripping "src/" prefix
			const withoutSrc = dtsFileName.replace(/^src\//, "");
			if (withoutSrc !== dtsFileName) {
				const alternativePath = join(tempDtsDir, withoutSrc);
				try {
					await access(alternativePath, constants.F_OK);
					// File exists at alternative path, use it
					tempDtsPath = alternativePath;
				} catch {
					// File doesn't exist at either path, use original
					// Will error in API Extractor with a clear message
				}
			}
		}

		// Output path for the bundled .d.ts file in temp directory
		// Always use flat structure: index.d.ts, hooks.d.ts, rslib/index.d.ts
		const outputFileName = `${entryName}.d.ts`;
		const tempBundledPath = join(tempOutputDir, outputFileName);

		// Only generate API model for the main "index" entry
		const generateApiModel = apiModelEnabled && entryName === "index";
		const tempApiModelPath = generateApiModel ? join(tempOutputDir, apiModelFilename) : undefined;

		// Create API Extractor configuration
		const extractorConfig = ExtractorConfig.prepare({
			configObject: {
				projectFolder: cwd,
				mainEntryPointFilePath: tempDtsPath,
				compiler: {
					tsconfigFilePath: tsconfigPath,
				},
				dtsRollup: {
					enabled: true,
					untrimmedFilePath: tempBundledPath,
				},
				docModel: generateApiModel
					? {
							enabled: true,
							apiJsonFilePath: tempApiModelPath,
						}
					: undefined,
				bundledPackages: bundledPackages,
			},
			packageJsonFullPath: join(cwd, "package.json"),
			configObjectFullPath: undefined,
		});

		// Run API Extractor
		const extractorResult = Extractor.invoke(extractorConfig, {
			localBuild: true,
			showVerboseMessages: false,
			messageCallback: (message: { text?: string; logLevel?: string }) => {
				// Suppress TypeScript version mismatch warnings
				if (
					message.text?.includes("Analysis will use the bundled TypeScript version") ||
					message.text?.includes("The target project appears to use TypeScript")
				) {
					message.logLevel = "none";
					return;
				}

				// Suppress API signature change warnings
				if (message.text?.includes("You have changed the public API signature")) {
					message.logLevel = "none";
				}
			},
		});

		if (!extractorResult.succeeded) {
			throw new Error(`API Extractor failed for entry "${entryName}"`);
		}

		// Store the API model path if generated
		if (generateApiModel && tempApiModelPath) {
			apiModelPath = tempApiModelPath;
		}

		// Apply banner/footer if specified
		if (banner || footer) {
			let content = await readFile(tempBundledPath, "utf-8");
			if (banner) content = `${banner}\n${content}`;
			if (footer) content = `${content}\n${footer}`;
			await writeFile(tempBundledPath, content, "utf-8");
		}

		// Store the bundled file path
		bundledFiles.set(entryName, tempBundledPath);
	}

	return { bundledFiles, apiModelPath };
}
/* v8 ignore stop */

/**
 * Strips sourceMappingURL comment from declaration file content.
 * This removes comments like: `//# source` + `MappingURL=index.d.ts.map`
 *
 * @remarks
 * Source maps are preserved in the temp directory for API Extractor documentation
 * but are excluded from the final dist output to reduce package size.
 *
 * @public
 */
export function stripSourceMapComment(content: string): string {
	return content.replace(/\/\/# sourceMappingURL=.+\.d\.ts\.map\s*$/gm, "").trim();
}

/**
 * Ensures a temp directory exists for declaration file generation.
 * @internal
 */
export async function ensureTempDeclarationDir(cwd: string, name: string): Promise<string> {
	const dir = join(cwd, ".rslib", "declarations", name);

	// Clean the directory at the start of the build to remove stale files
	// but preserve it after the build for API Extractor documentation generation
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	return dir;
}

/**
 * Finds the TypeScript config file.
 * @internal
 */
export function findTsConfig(cwd: string, tsconfigPath?: string): string | null {
	// If a path is provided and it's absolute or exists, use it directly
	if (tsconfigPath) {
		const { isAbsolute } = require("node:path");
		if (isAbsolute(tsconfigPath) && sys.fileExists(tsconfigPath)) {
			return tsconfigPath;
		}
	}
	// Otherwise, search for the config file starting from cwd
	return findConfigFile(cwd, sys.fileExists.bind(sys), tsconfigPath) ?? null;
}

/**
 * Loads and parses a TypeScript config file.
 * @internal
 */
/* v8 ignore start -- Integration function with TypeScript compiler API */
function loadTsConfig(configPath: string): ParsedCommandLine {
	const configContent = readConfigFile(configPath, sys.readFile.bind(sys));

	if (configContent.error) {
		throw new Error(`Failed to read tsconfig: ${formatDiagnostic(configContent.error, createCompilerHost({}, true))}`);
	}

	const parsedConfig = parseJsonConfigFileContent(configContent.config, sys, dirname(configPath), {}, configPath);

	if (parsedConfig.errors.length > 0) {
		throw new Error(
			`Failed to parse tsconfig: ${parsedConfig.errors.map((err: Diagnostic) => formatDiagnostic(err, createCompilerHost({}, true))).join("\n")}`,
		);
	}

	return parsedConfig;
}
/* v8 ignore stop */

/**
 * Runs tsgo to generate declaration files.
 * @internal
 */
/* v8 ignore start -- Integration function spawning external process */
function runTsgo(options: {
	configPath: string;
	declarationDir: string;
	rootDir?: string;
	tsBuildInfoFile?: string;
	name: string;
}): Promise<{ success: boolean; output: string }> {
	const { configPath, declarationDir, rootDir, tsBuildInfoFile, name } = options;

	const tsgoBinPath = getTsgoBinPath();
	const args = generateTsgoArgs({ configPath, declarationDir, rootDir, tsBuildInfoFile });

	return new Promise((resolve) => {
		// Spawn tsgo directly (it's a shell script in node_modules/.bin)
		const child = spawn(tsgoBinPath, args, {
			stdio: ["inherit", "pipe", "pipe"],
			shell: false,
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (data: Buffer) => {
			const text = data.toString();
			stdout += text;
			logger.info(`${color.dim(`[${name}]`)} ${text.trim()}`);
		});

		child.stderr?.on("data", (data: Buffer) => {
			const text = data.toString();
			stderr += text;
			logger.error(`${color.dim(`[${name}]`)} ${color.red(text.trim())}`);
		});

		child.on("close", (code) => {
			const output = stdout + stderr;
			resolve({
				success: code === 0,
				output,
			});
		});

		child.on("error", (err) => {
			logger.error(`Failed to spawn tsgo: ${err.message}`);
			resolve({
				success: false,
				output: err.message,
			});
		});
	});
}
/* v8 ignore stop */

/**
 * Plugin to generate TypeScript declaration files using tsgo and emit them through Rslib's asset pipeline.
 *
 * @remarks
 * This plugin uses tsgo (@typescript/native-preview) for faster declaration file generation
 * and integrates with Rslib's build system by emitting generated files as compilation assets.
 *
 * ## Features
 *
 * - Uses tsgo exclusively for .d.ts generation (faster than tsc)
 * - Emits .d.ts and .d.ts.map files through Rslib's asset pipeline
 * - Optional bundling with API Extractor for rollup mode
 * - Supports watch mode
 * - Integrates seamlessly with other Rslib plugins
 * - Respects tsconfig.json settings
 *
 * ## Build Workflow
 *
 * 1. **Config Phase** (`modifyRsbuildConfig`):
 *    - Finds and loads tsconfig.json
 *    - Creates temp directory for .d.ts generation
 *    - Validates configuration
 *
 * 2. **Asset Processing Phase** (`processAssets`):
 *    - Cleans temp directory at start of build (to remove stale files)
 *    - Spawns tsgo to generate .d.ts files to temp directory
 *    - Recursively collects all generated .d.ts and .d.ts.map files
 *    - If bundling: uses API Extractor to bundle declarations per entry point
 *    - Emits files through compilation.emitAsset()
 *    - Adds .d.ts files (not .d.ts.map) to the files array for npm publishing
 *    - Preserves temp directory after build for API Extractor documentation generation
 *
 * @param options - Plugin configuration options
 *
 * @example
 * ```typescript
 * import { DtsPlugin } from "@savvy-web/shared/rslib";
 *
 * export default {
 *   plugins: [
 *     DtsPlugin({
 *       abortOnError: true,
 *       bundle: true,
 *       bundledPackages: ['type-fest', '@commitlint/*']
 *     })
 *   ]
 * };
 * ```
 *
 * @public
 */
/* v8 ignore next -- @preserve */
export const DtsPlugin = (options: DtsPluginOptions = {}): RsbuildPlugin => {
	const { abortOnError = true, dtsExtension = ".d.ts" } = options;

	// State shared across hooks
	const state: {
		tsconfigPath: string | null;
		parsedConfig: Awaited<ReturnType<typeof loadTsConfig>> | null;
	} = {
		tsconfigPath: null,
		parsedConfig: null,
	};

	return {
		name: "dts-plugin",
		setup(api: RsbuildPluginAPI): void {
			// Phase 1: Prepare configuration

			api.modifyRsbuildConfig(async (config) => {
				const log = createEnvLogger("dts");
				const cwd = api.context.rootPath;

				try {
					// Use explicitly provided tsconfigPath first, then fall back to config
					let configTsconfigPath = options.tsconfigPath || config.source?.tsconfigPath;

					// If no tsconfig provided and we have a buildTarget, generate a temp config
					if (!configTsconfigPath && options.buildTarget) {
						// Import TSConfigs dynamically to avoid circular dependencies

						// Change working directory temporarily to package root so process.cwd() works correctly
						const originalCwd = process.cwd();
						try {
							process.chdir(cwd);
							configTsconfigPath = TSConfigs.node.ecma.lib.writeBundleTempConfig(options.buildTarget);
							log.global.info(`Using tsconfig: ${configTsconfigPath}`);
						} finally {
							// Restore original working directory
							process.chdir(originalCwd);
						}
					}

					// Find tsconfig
					state.tsconfigPath = findTsConfig(cwd, configTsconfigPath);

					if (!state.tsconfigPath) {
						const error = new Error(
							`Failed to resolve tsconfig file ${color.cyan(`"${config.source?.tsconfigPath ?? "tsconfig.json"}"`)} from ${color.cyan(cwd)}. Please ensure that the file exists.`,
						);
						error.stack = "";
						throw error;
					}

					// Load and parse tsconfig
					state.parsedConfig = loadTsConfig(state.tsconfigPath);

					log.global.info(`Using tsconfig: ${color.cyan(relative(cwd, state.tsconfigPath))}`);
				} catch (error) {
					log.global.error("Failed to initialize DTS plugin:", error);
					throw error;
				}

				return config;
			});

			// Phase 2: Generate and emit declaration files
			api.processAssets(
				{
					stage: "pre-process",
				},
				async (context) => {
					if (!state.tsconfigPath || !state.parsedConfig) {
						logger.warn("DTS plugin not properly initialized, skipping declaration generation");
						return;
					}

					const envId = context.compilation?.name || "unknown";
					const log = createEnvLogger(envId);
					const cwd = api.context.rootPath;

					// Create temp directory for this environment
					const tempDtsDir = await ensureTempDeclarationDir(cwd, envId);

					// Get files array for adding .d.ts files (but not .d.ts.map)
					const filesArray = api.useExposed("files-array") as Set<string> | undefined;

					try {
						logger.info(`${color.dim(`[${envId}]`)} Generating declaration files...`);

						// Run tsgo to generate .d.ts files
						const { success, output } = await runTsgo({
							configPath: state.tsconfigPath,
							declarationDir: tempDtsDir,
							rootDir: state.parsedConfig.options.rootDir,
							tsBuildInfoFile: state.parsedConfig.options.tsBuildInfoFile,
							name: envId,
						});

						if (!success) {
							const errorMsg = `TypeScript declaration generation failed:\n${output}`;
							if (abortOnError) {
								throw new Error(errorMsg);
							}
							log.global.error(errorMsg);
							log.global.warn(
								"With `abortOnError` disabled, type errors will not fail the build, but proper type declaration output cannot be guaranteed.",
							);
							return;
						}

						// Collect all generated .d.ts and .d.ts.map files
						const allDtsFiles = await collectDtsFiles(tempDtsDir);

						// Check if API report plugin created a temp api-extractor file
						const apiExtractorMapping = api.useExposed("api-extractor-temp-mapping") as
							| { tempPath: string; originalPath: string }
							| undefined;

						if (apiExtractorMapping) {
							// The temp api-extractor file was created in src/ and compiled by the main tsgo run
							// Find the generated declaration and rename it to match the original path

							// Get the relative path of the temp file from package root
							const tempFileRelative = relative(cwd, apiExtractorMapping.tempPath);

							for (const file of allDtsFiles) {
								// The temp file is like src/api-extractor-abc123.ts
								// which generates src/api-extractor-abc123.d.ts
								const expectedPath = tempFileRelative.replace(/\.ts$/, ".d.ts");
								const expectedMapPath = `${expectedPath}.map`;

								if (file.relativePath === expectedPath || file.relativePath === expectedMapPath) {
									// This is a declaration from the temp file - rename it to the original path
									const ext = file.relativePath.endsWith(".map") ? ".d.ts.map" : ".d.ts";
									const originalDtsPath = apiExtractorMapping.originalPath.replace(/\.ts$/, ext);
									const newPath = join(tempDtsDir, originalDtsPath);

									// Ensure the directory exists
									await mkdir(dirname(newPath), { recursive: true });

									// Copy the file to the new location
									await copyFile(file.path, newPath);
									log.global.info(`Renamed ${file.relativePath} -> ${originalDtsPath} (from temp api-extractor)`);

									// Delete the original temp-named file
									await unlink(file.path);
								}
							}

							// Re-collect files after renaming
							allDtsFiles.length = 0;
							allDtsFiles.push(...(await collectDtsFiles(tempDtsDir)));
						}

						// Filter out test files - we don't want to distribute these
						const dtsFiles = allDtsFiles.filter((file) => {
							const path = file.relativePath;
							return !path.includes("__test__/") && !path.includes(".test.d.ts");
						});

						if (dtsFiles.length === 0) {
							log.global.warn("No declaration files were generated");
							return;
						}

						// Check if we should bundle declarations with API Extractor
						if (options.bundle) {
							try {
								// Read package.json to discover entry points
								// First check if api-report-plugin exposed a modified version
								const exposedPackageJson = api.useExposed<PackageJson>("api-extractor-package-json");

								let packageJson: PackageJson;
								if (!exposedPackageJson) {
									// No modified version, read from disk
									const packageJsonPath = join(cwd, "package.json");
									const packageJsonContent = await readFile(packageJsonPath, "utf-8");
									packageJson = JSON.parse(packageJsonContent);
								} else {
									log.global.info("Using in-memory package.json from api-report-plugin");
									packageJson = exposedPackageJson;
								}

								// Only process the main export (".") for API Extractor bundling
								const entryPoints = new Map<string, string>();

								if (packageJson.exports) {
									const exports = packageJson.exports as Record<string, unknown>;
									const mainExport = exports["."];

									if (mainExport) {
										// Handle both string and object export values
										const sourcePath =
											typeof mainExport === "string" ? mainExport : (mainExport as { default?: string })?.default;

										if (sourcePath && typeof sourcePath === "string") {
											// Only process TypeScript source files (skip JSON, CSS, declaration files, etc.)
											if (sourcePath.match(/\.(ts|mts|cts|tsx)$/)) {
												// Skip test files
												if (!sourcePath.includes(".test.") && !sourcePath.includes("__test__")) {
													// Skip files outside the package root (e.g., temp files in /tmp/)
													const resolvedSourcePath = sourcePath.startsWith(".") ? join(cwd, sourcePath) : sourcePath;
													if (resolvedSourcePath.startsWith(cwd)) {
														// If this is the temp api-extractor file, use the original path instead
														let finalSourcePath = sourcePath;
														if (apiExtractorMapping && resolvedSourcePath === apiExtractorMapping.tempPath) {
															finalSourcePath = apiExtractorMapping.originalPath;
															log.global.info(`Using original path for api-extractor: ${finalSourcePath}`);
														}

														// Store main export as "index" entry
														entryPoints.set("index", finalSourcePath);
													} else {
														log.global.info(`Skipping main export (source outside package: ${sourcePath})`);
													}
												}
											}
										}
									}
								}

								if (entryPoints.size === 0) {
									log.global.warn("No main export found in package.json exports, skipping bundling");
								} else {
									// Create temp directory for bundled output
									const tempBundledDir = join(tempDtsDir, "bundled");
									await mkdir(tempBundledDir, { recursive: true });

									// Bundle declarations using API Extractor (writes to temp directory)
									const { bundledFiles, apiModelPath } = await bundleDtsFiles({
										cwd,
										tempDtsDir,
										tempOutputDir: tempBundledDir,
										tsconfigPath: state.tsconfigPath,
										bundledPackages: options.bundledPackages || [],
										entryPoints,
										banner: options.banner,
										footer: options.footer,
										apiModel: options.apiModel,
									});

									// Emit bundled .d.ts files from temp directory through asset pipeline
									let emittedCount = 0;
									for (const [entryName, tempBundledPath] of bundledFiles) {
										// Determine final output file name
										// Always use flat structure: index.d.ts, hooks.d.ts, foo/bar.d.ts
										const bundledFileName = `${entryName}.d.ts`;

										// Read from temp and strip sourceMappingURL comment before emitting
										let content = await readFile(tempBundledPath, "utf-8");
										content = stripSourceMapComment(content);
										const source = new context.sources.OriginalSource(content, bundledFileName);
										context.compilation.emitAsset(bundledFileName, source);
										emittedCount++;

										// Add .d.ts file to files array (but not .d.ts.map files)
										if (filesArray) {
											filesArray.add(bundledFileName);
										}
									}

									logger.info(
										`${color.dim(`[${envId}]`)} Emitted ${emittedCount} bundled declaration file${emittedCount === 1 ? "" : "s"} through asset pipeline`,
									);

									// Emit API model file if generated
									if (apiModelPath) {
										const apiModelFilename =
											typeof options.apiModel === "object" && options.apiModel.filename
												? options.apiModel.filename
												: "api.model.json";
										const apiModelContent = await readFile(apiModelPath, "utf-8");
										const apiModelSource = new context.sources.OriginalSource(apiModelContent, apiModelFilename);
										context.compilation.emitAsset(apiModelFilename, apiModelSource);

										// Add to files array (the file will be in dist, but .npmignore will exclude from publish)
										if (filesArray) {
											filesArray.add(apiModelFilename);
										}

										logger.info(`${color.dim(`[${envId}]`)} Emitted API model: ${apiModelFilename}`);

										// Emit .npmignore file to exclude api.model.json from npm publish
										const shouldAddNpmIgnore =
											options.apiModel === true ||
											(typeof options.apiModel === "object" && options.apiModel.npmIgnore !== false);

										if (shouldAddNpmIgnore) {
											const npmIgnoreContent = `# Exclude API model from npm publish (used by internal tooling)\n${apiModelFilename}\n`;
											const npmIgnoreSource = new context.sources.OriginalSource(npmIgnoreContent, ".npmignore");
											context.compilation.emitAsset(".npmignore", npmIgnoreSource);

											if (filesArray) {
												filesArray.add(".npmignore");
											}

											logger.info(`${color.dim(`[${envId}]`)} Emitted .npmignore to exclude ${apiModelFilename}`);
										}

										// Copy API model and package.json to local paths if specified
										// Skip in CI environments (GITHUB_ACTIONS or CI env vars)
										const isCI = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";
										const localPaths = typeof options.apiModel === "object" ? options.apiModel.localPaths : undefined;

										if (localPaths && localPaths.length > 0 && !isCI) {
											for (const localPath of localPaths) {
												const resolvedPath = join(cwd, localPath);
												const parentDir = dirname(resolvedPath);

												// Validate parent directory exists
												if (!existsSync(parentDir)) {
													logger.warn(
														`${color.dim(`[${envId}]`)} Skipping local path: parent directory does not exist: ${parentDir}`,
													);
													continue;
												}

												// Create the target directory if it doesn't exist
												await mkdir(resolvedPath, { recursive: true });

												// Copy api.model.json
												const apiModelDestPath = join(resolvedPath, apiModelFilename);
												await writeFile(apiModelDestPath, apiModelContent, "utf-8");

												// Get package.json from compilation assets and copy it
												const packageJsonAsset = context.compilation.assets["package.json"];
												if (packageJsonAsset) {
													const rawContent =
														typeof packageJsonAsset.source === "function"
															? packageJsonAsset.source()
															: packageJsonAsset.source;
													// Convert to string if it's a Buffer
													const packageJsonContent =
														typeof rawContent === "string"
															? rawContent
															: rawContent instanceof Buffer
																? rawContent.toString("utf-8")
																: String(rawContent);
													const packageJsonDestPath = join(resolvedPath, "package.json");
													await writeFile(packageJsonDestPath, packageJsonContent, "utf-8");
												}

												logger.info(`${color.dim(`[${envId}]`)} Copied API model and package.json to: ${localPath}`);
											}
										}
									}

									// Remove .d.ts.map files that Rspack auto-generates for our emitted .d.ts assets
									// We keep .d.ts.map files in the declarations directory for API Extractor, but dont want them in dist
									for (const [entryName] of bundledFiles) {
										const bundledFileName = `${entryName}.d.ts`;
										const mapFileName = `${bundledFileName}.map`;

										// Remove .d.ts.map files that Rspack auto-generates for our emitted .d.ts assets
										// We keep .d.ts.map files in the declarations directory for API Extractor, but dont want them in dist
										for (const file of dtsFiles) {
											if (file.relativePath.endsWith(".d.ts.map")) {
												continue;
											}
											let outputPath = file.relativePath;
											if (outputPath.startsWith("src/")) {
												outputPath = outputPath.slice(4);
											}
											if (dtsExtension !== ".d.ts" && outputPath.endsWith(".d.ts")) {
												outputPath = outputPath.replace(/\.d\.ts$/, dtsExtension);
											}
											const mapFileName = `${outputPath}.map`;
											if (context.compilation.assets[mapFileName]) {
												delete context.compilation.assets[mapFileName];
											}
										}

										if (context.compilation.assets[mapFileName]) {
											delete context.compilation.assets[mapFileName];
										}
									}
								}
							} catch (error) {
								log.global.error("Failed to bundle declaration files:", error);
								if (abortOnError) {
									throw error;
								}
							}
						} else {
							// Emit each file individually through the asset pipeline
							let emittedCount = 0;
							for (const file of dtsFiles) {
								// Skip .d.ts.map files - keep them only in temp directory for API Extractor
								if (file.relativePath.endsWith(".d.ts.map")) {
									continue;
								}

								let content = await readFile(file.path, "utf-8");

								// Determine output path relative to dist
								// Strip 'src/' prefix if present since tsgo preserves source directory structure
								let outputPath = file.relativePath;
								if (outputPath.startsWith("src/")) {
									outputPath = outputPath.slice(4); // Remove 'src/'
								}

								// Apply custom extension if specified and different from default
								if (dtsExtension !== ".d.ts" && outputPath.endsWith(".d.ts")) {
									outputPath = outputPath.replace(/\.d\.ts$/, dtsExtension);
								}

								// Strip sourceMappingURL comment before emitting to dist
								content = stripSourceMapComment(content);

								// Create source and emit asset
								const source = new context.sources.OriginalSource(content, outputPath);
								context.compilation.emitAsset(outputPath, source);
								emittedCount++;

								// Add .d.ts files to files array
								if (filesArray && outputPath.endsWith(".d.ts")) {
									filesArray.add(outputPath);
								}
							}

							logger.info(
								`${color.dim(`[${envId}]`)} Emitted ${emittedCount} declaration file${emittedCount === 1 ? "" : "s"} through asset pipeline`,
							);
						}
					} catch (error) {
						log.global.error("Failed to generate declaration files:", error);
						if (abortOnError) {
							throw error;
						}
					}
				},
			);
			// Add another hook at a later stage to:
			// 1. Strip sourceMappingURL comments from .d.ts files
			// 2. Remove .d.ts.map files that Rspack auto-generates
			api.processAssets(
				{
					stage: "summarize",
				},
				async (compiler) => {
					const assetsToDelete: string[] = [];

					// Process all .d.ts files to strip sourceMappingURL comments
					for (const assetName in compiler.compilation.assets) {
						if (assetName.endsWith(".d.ts")) {
							const asset = compiler.compilation.assets[assetName];
							const content = asset.source().toString();

							// Strip sourceMappingURL comment
							const strippedContent = stripSourceMapComment(content);

							// Only update if content changed
							if (strippedContent !== content) {
								const source = new compiler.sources.OriginalSource(strippedContent, assetName);
								compiler.compilation.assets[assetName] = source;
							}
						} else if (assetName.endsWith(".d.ts.map")) {
							// Mark .d.ts.map files for deletion
							// We keep these files in the declarations directory for API Extractor documentation
							assetsToDelete.push(assetName);
						}
					}

					// Delete .d.ts.map files
					for (const assetName of assetsToDelete) {
						delete compiler.compilation.assets[assetName];
					}
				},
			);
		},
	};
};
