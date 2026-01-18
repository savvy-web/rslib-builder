import { access, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import { resolveImportPath } from "#utils/jsr-import-resolver-utils.js";
import { createEnvLogger } from "#utils/logger-utils.js";

interface ImportGraphNode {
	path: string;
	imports: Set<string>;
	isEntry: boolean;
}

/**
 * @public
 */
export interface JSRBundlelessPluginOptions {
	/** JSR scope name override. If not provided, uses the package name */
	name?: string;
}

/**
 * Plugin to copy only used TypeScript source files for JSR without bundling
 * This preserves the original file structure while excluding unused code
 * @public
 */
/* v8 ignore next @preserve */
export const JSRBundlelessPlugin = (options: JSRBundlelessPluginOptions = {}): RsbuildPlugin => {
	return {
		name: "jsr-bundleless",
		setup(api: RsbuildPluginAPI): void {
			// Get entrypoints discovered by auto-entry-plugin
			let entrypoints = api.useExposed<Map<string, string>>("entrypoints");
			if (!entrypoints) {
				entrypoints = new Map<string, string>();
				api.expose("entrypoints", entrypoints);
			}

			api.processAssets(
				{
					stage: "optimize-inline",
				},
				async (compiler) => {
					const envId = compiler.compilation?.name || "unknown";
					const log = createEnvLogger(envId);

					try {
						// Early validation: Check if package.json has exports field
						// JSR requires actual module exports, not just bin entries
						const packageJsonAsset = compiler.assets["package.json"];
						if (packageJsonAsset) {
							const packageJsonContent = packageJsonAsset.source().toString();
							const packageJson = JSON.parse(packageJsonContent);

							if (!packageJson.exports) {
								throw new Error(
									"JSR publishing requires an 'exports' field in package.json. " +
										"Packages with only 'bin' entries cannot be published to JSR.",
								);
							}
						}
						// Build import graph starting from entry points
						const importGraph = new Map<string, ImportGraphNode>();
						const processedFiles = new Set<string>();

						// Recursive function to analyze imports
						async function analyzeImports(filePath: string, isEntry: boolean = false): Promise<void> {
							const absolutePath = resolve(filePath);

							if (processedFiles.has(absolutePath)) return;
							processedFiles.add(absolutePath);

							try {
								await access(absolutePath);
							} catch {
								// File not found, skip silently
								return;
							}

							const content = await readFile(absolutePath, "utf-8");
							const dir = dirname(absolutePath);
							const node: ImportGraphNode = {
								path: absolutePath,
								imports: new Set(),
								isEntry,
							};

							// Extract import statements
							const importRegex =
								/^import\s+(?:type\s+)?(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)?(?:\s*,\s*(?:\{[^}]+\}|\w+))?\s*from\s+["'](.+?)["'];?$/gm;
							const exportFromRegex = /^export\s+(?:\*|\{[^}]+\})\s+from\s+["'](.+?)["'];?$/gm;

							let match: RegExpExecArray | null;

							// Process imports
							importRegex.lastIndex = 0;
							match = importRegex.exec(content);
							while (match !== null) {
								const importPath = match[1];
								if (importPath.startsWith(".")) {
									const resolvedPath = await resolveImportPath(dir, importPath);
									if (resolvedPath) {
										node.imports.add(resolvedPath);
										await analyzeImports(resolvedPath);
									}
								}
								match = importRegex.exec(content);
							}

							// Process re-exports
							exportFromRegex.lastIndex = 0;
							match = exportFromRegex.exec(content);
							while (match !== null) {
								const importPath = match[1];
								if (importPath.startsWith(".")) {
									const resolvedPath = await resolveImportPath(dir, importPath);
									if (resolvedPath) {
										node.imports.add(resolvedPath);
										await analyzeImports(resolvedPath);
									}
								}
								match = exportFromRegex.exec(content);
							}

							importGraph.set(absolutePath, node);
						}

						// Analyze all entry points
						for (const [_outputName, sourcePath] of entrypoints) {
							// Skip JSON entries
							if (sourcePath.endsWith(".json")) continue;

							const fullPath = join(process.cwd(), sourcePath);
							await analyzeImports(fullPath, true);
						}

						// Now emit only the files that are in the import graph
						const rootDir = process.cwd();

						for (const [absolutePath] of importGraph) {
							// Calculate relative path from root
							const relativePath = relative(rootDir, absolutePath);

							// Skip files outside the project
							if (relativePath.startsWith("..")) continue;

							// Read the file content
							const content = await readFile(absolutePath, "utf-8");

							// Strip the 'src/' prefix for JSR output to match package.json exports
							// This assumes all source files are in the src/ directory
							let outputPath = relativePath;
							if (outputPath.startsWith("src/")) {
								outputPath = outputPath.slice(4); // Remove 'src/' prefix
							}

							// Emit the file at the root level without src/ prefix
							const source = new compiler.sources.OriginalSource(content, outputPath);
							compiler.compilation.emitAsset(outputPath, source);
						}

						// Update package.json to include all TypeScript files
						if (packageJsonAsset) {
							try {
								const packageJsonContent = packageJsonAsset.source().toString();
								const packageJson = JSON.parse(packageJsonContent);

								if (!packageJson.files) {
									packageJson.files = [];
								}

								// Add all emitted TypeScript and JSON files to the files array
								const filesToAdd: string[] = [];
								for (const assetName of Object.keys(compiler.assets)) {
									// Include TypeScript files and JSON files (but not package.json itself)
									if (
										(assetName.endsWith(".ts") || (assetName.endsWith(".json") && assetName !== "package.json")) &&
										!packageJson.files.includes(assetName)
									) {
										filesToAdd.push(assetName);
									}
								}

								if (filesToAdd.length > 0) {
									packageJson.files.push(...filesToAdd);
									packageJson.files.sort();

									const updatedPackageJsonContent = JSON.stringify(packageJson, null, 2);
									const updatedSource = new compiler.sources.OriginalSource(updatedPackageJsonContent, "package.json");
									compiler.compilation.updateAsset("package.json", updatedSource);

									log.success(`Added ${filesToAdd.length} files to package.json`);
								}
							} catch (error) {
								log.error("Failed to update package.json:", error);
							}
						}

						// Generate jsr.json file for JSR configuration
						// Reuse the packageJsonAsset from earlier validation
						if (packageJsonAsset) {
							try {
								const packageJsonContent = packageJsonAsset.source().toString();
								const packageJson = JSON.parse(packageJsonContent);

								// Determine the JSR package name
								let jsrName = options.name || packageJson.name;

								// Ensure the name has a scope (starts with @)
								if (!jsrName.startsWith("@")) {
									// If no scope, use the package name as scope
									const parts = jsrName.split("/");
									if (parts.length === 1) {
										// Convert package-name to @package-name/package-name
										jsrName = `@${jsrName}/${jsrName}`;
									} else {
										// Already has a slash, just add @
										jsrName = `@${jsrName}`;
									}
								}

								// Collect all files that should be included in the publish
								// This includes all assets except jsr.json itself
								const publishIncludeFiles: string[] = [];
								for (const assetName of Object.keys(compiler.assets)) {
									// Include everything except jsr.json (which we're creating now)
									if (assetName !== "jsr.json") {
										publishIncludeFiles.push(assetName);
									}
								}

								// Validate required fields
								if (!packageJson.version) {
									throw new Error("package.json must have a version field for JSR publishing");
								}
								if (!packageJson.exports) {
									throw new Error("package.json must have an exports field for JSR publishing");
								}

								// Build the jsr.json configuration with publish.include
								const jsrConfig = {
									name: jsrName,
									version: packageJson.version,
									exports: packageJson.exports,
									publish: {
										include: publishIncludeFiles.sort(),
									},
								};

								// Create the jsr.json content
								const jsrJsonContent = JSON.stringify(jsrConfig, null, 2);
								const jsrJsonSource = new compiler.sources.OriginalSource(jsrJsonContent, "jsr.json");
								compiler.compilation.emitAsset("jsr.json", jsrJsonSource);

								log.success(`Generated jsr.json with name: ${jsrName}`);
							} catch (error) {
								log.error("Failed to generate jsr.json:", error);
							}
						}

						// Remove any JavaScript files that might have been generated
						const jsFilesToRemove: string[] = [];
						for (const assetName of Object.keys(compiler.assets)) {
							if (assetName.endsWith(".js") && assetName !== "_dummy.js") {
								jsFilesToRemove.push(assetName);
							}
						}

						for (const assetName of jsFilesToRemove) {
							delete compiler.assets[assetName];
						}

						// Remove the dummy entry
						if (compiler.assets["_dummy.js"]) {
							delete compiler.assets["_dummy.js"];
						}

						log.success(`JSR bundleless: included ${importGraph.size} TypeScript files`);
					} catch (error) {
						log.error("Failed to process TypeScript files for JSR:", error);
						throw error;
					}
				},
			);
		},
	};
};
