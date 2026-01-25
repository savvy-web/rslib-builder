import { dirname, isAbsolute, normalize, resolve } from "node:path";
import type { PackageJson } from "type-fest";
import ts from "typescript";
import { EntryExtractor } from "./entry-extractor.js";

/**
 * Options for configuring the ImportGraph analyzer.
 *
 * @remarks
 * These options control how the ImportGraph traverses and resolves
 * TypeScript module imports. The `rootDir` is required and serves as
 * the base for resolving relative paths and finding the tsconfig.json.
 *
 * @example
 * ```typescript
 * import type { ImportGraphOptions } from '@savvy-web/rslib-builder';
 *
 * const options: ImportGraphOptions = {
 *   rootDir: '/path/to/project',
 *   tsconfigPath: './tsconfig.build.json',
 * };
 * ```
 *
 * @public
 */
export interface ImportGraphOptions {
	/**
	 * The project root directory.
	 *
	 * @remarks
	 * All relative paths (entry points, tsconfig path) are resolved from this directory.
	 * This should typically be the package root containing your `package.json`.
	 */
	rootDir: string;

	/**
	 * Custom path to the TypeScript configuration file.
	 *
	 * @remarks
	 * If not provided, the analyzer searches for `tsconfig.json` starting from `rootDir`
	 * and walking up the directory tree. The tsconfig is used for module resolution
	 * settings including path aliases and module resolution strategy.
	 *
	 * @defaultValue Searches for tsconfig.json from rootDir
	 */
	tsconfigPath?: string;

	/**
	 * Custom TypeScript system for file operations.
	 *
	 * @remarks
	 * This is primarily used for testing to provide a mock filesystem.
	 * In production use, this defaults to `ts.sys` which uses the real filesystem.
	 *
	 * @defaultValue ts.sys
	 * @internal
	 */
	sys?: ts.System;
}

/**
 * Result of import graph analysis.
 *
 * @remarks
 * Contains the complete set of TypeScript source files discovered by tracing
 * imports from entry points. The analysis is non-fatal: errors are collected
 * and tracing continues for other paths even when some imports fail to resolve.
 *
 * @example
 * ```typescript
 * import type { ImportGraphResult } from '@savvy-web/rslib-builder';
 *
 * function processResult(result: ImportGraphResult): void {
 *   if (result.errors.length > 0) {
 *     console.warn('Some imports could not be resolved:', result.errors);
 *   }
 *   console.log(`Found ${result.files.length} files from ${result.entries.length} entries`);
 * }
 * ```
 *
 * @public
 */
export interface ImportGraphResult {
	/**
	 * All TypeScript source files reachable from the entry points.
	 *
	 * @remarks
	 * Paths are absolute, normalized, and sorted alphabetically.
	 * Test files (`.test.ts`, `.spec.ts`) and test directories (`__test__`, `__tests__`)
	 * are automatically filtered out from results.
	 */
	files: string[];

	/**
	 * The entry points that were traced.
	 *
	 * @remarks
	 * Paths are absolute and normalized. These are the starting points
	 * from which the import graph was traversed.
	 */
	entries: string[];

	/**
	 * Errors encountered during import graph analysis.
	 *
	 * @remarks
	 * These errors are non-fatal: tracing continues despite individual failures.
	 * Common errors include missing entry files, unresolvable imports,
	 * or tsconfig parsing failures.
	 */
	errors: string[];
}

/**
 * Analyzes TypeScript import relationships to discover all files
 * reachable from specified entry points.
 *
 * @remarks
 * This class uses the TypeScript compiler API to trace import statements
 * and discover all files that are part of the public API. It handles:
 *
 * - Static imports: `import { foo } from "./module"`
 * - Dynamic imports: `import("./module")`
 * - Re-exports: `export * from "./module"` and `export { foo } from "./module"`
 * - Circular imports (via visited set tracking)
 *
 * The class automatically filters out:
 * - Files in node_modules
 * - Declaration files (.d.ts)
 * - Test files (*.test.ts, *.spec.ts)
 * - Files in __test__ directories
 *
 * ## Static Methods vs Instance Methods
 *
 * For simple one-off analysis, use the static convenience methods:
 * - {@link ImportGraph.fromEntries} - Trace from explicit entry paths
 * - {@link ImportGraph.fromPackageExports} - Trace from package.json exports
 *
 * For repeated analysis or custom configuration, create an instance
 * and use the instance methods which reuse the TypeScript program.
 *
 * @example
 * Using static methods (recommended for most cases):
 * ```typescript
 * import { ImportGraph } from '@savvy-web/rslib-builder';
 *
 * // Trace from explicit entries
 * const result = ImportGraph.fromEntries(
 *   ['./src/index.ts', './src/cli.ts'],
 *   { rootDir: process.cwd() }
 * );
 *
 * // Trace from package.json exports
 * const result = ImportGraph.fromPackageExports(
 *   './package.json',
 *   { rootDir: process.cwd() }
 * );
 * ```
 *
 * @example
 * Using instance methods (for repeated analysis):
 * ```typescript
 * import { ImportGraph } from '@savvy-web/rslib-builder';
 *
 * const graph = new ImportGraph({ rootDir: '/path/to/project' });
 *
 * // Reuses the TypeScript program across multiple calls
 * const libResult = graph.traceFromEntries(['./src/index.ts']);
 * const cliResult = graph.traceFromEntries(['./src/cli.ts']);
 * ```
 *
 * @public
 */
export class ImportGraph {
	private readonly options: ImportGraphOptions;
	private readonly sys: ts.System;
	private program: ts.Program | null = null;
	private compilerOptions: ts.CompilerOptions | null = null;
	private moduleResolutionCache: ts.ModuleResolutionCache | null = null;

	constructor(options: ImportGraphOptions) {
		this.options = options;
		this.sys = options.sys ?? ts.sys;
	}

	/**
	 * Trace all imports from the given entry points.
	 *
	 * @param entryPaths - Paths to entry files (relative to rootDir or absolute)
	 * @returns Deduplicated list of all reachable TypeScript files
	 */
	traceFromEntries(entryPaths: string[]): ImportGraphResult {
		const errors: string[] = [];
		const visited = new Set<string>();
		const entries: string[] = [];

		// Initialize TypeScript program
		const initResult = this.initializeProgram();
		if (!initResult.success) {
			return {
				files: [],
				entries: [],
				errors: [initResult.error],
			};
		}

		// Resolve and trace each entry point
		for (const entryPath of entryPaths) {
			const absolutePath = this.resolveEntryPath(entryPath);

			if (!this.sys.fileExists(absolutePath)) {
				errors.push(`Entry file not found: ${entryPath}`);
				continue;
			}

			entries.push(absolutePath);
			this.traceImports(absolutePath, visited, errors);
		}

		// Filter results to only TypeScript source files
		const files = Array.from(visited).filter((file) => this.isSourceFile(file));

		return {
			files: files.sort(),
			entries,
			errors,
		};
	}

	/**
	 * Trace imports from package.json exports.
	 *
	 * @remarks
	 * Convenience method that extracts entry points from package.json
	 * using EntryExtractor, then traces all imports from those entries.
	 *
	 * @param packageJsonPath - Path to package.json (relative to rootDir or absolute)
	 * @returns Deduplicated list of all reachable TypeScript files
	 */
	traceFromPackageExports(packageJsonPath: string): ImportGraphResult {
		const absolutePath = this.resolveEntryPath(packageJsonPath);

		// Read and parse package.json using sys (allows testing with mock filesystem)
		let packageJson: PackageJson;
		try {
			const content = this.sys.readFile(absolutePath);
			if (!content) {
				return {
					files: [],
					entries: [],
					errors: [`Failed to read package.json: File not found at ${absolutePath}`],
				};
			}
			packageJson = JSON.parse(content) as PackageJson;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				files: [],
				entries: [],
				errors: [`Failed to read package.json: ${message}`],
			};
		}

		// Extract entry points
		const extractor = new EntryExtractor();
		const { entries } = extractor.extract(packageJson);

		// Convert entry paths to absolute paths
		const packageDir = dirname(absolutePath);
		const entryPaths = Object.values(entries).map((p) => resolve(packageDir, p));

		return this.traceFromEntries(entryPaths);
	}

	/**
	 * Initialize the TypeScript program for module resolution.
	 */
	private initializeProgram(): { success: true } | { success: false; error: string } {
		if (this.program) {
			return { success: true };
		}

		// Find tsconfig.json
		const configPath = this.findTsConfig();
		if (!configPath) {
			return {
				success: false,
				error: `No tsconfig.json found in ${this.options.rootDir}`,
			};
		}

		// Parse tsconfig.json
		const configFile = ts.readConfigFile(configPath, (path) => this.sys.readFile(path));
		if (configFile.error) {
			const message = ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n");
			return {
				success: false,
				error: `Failed to read tsconfig.json: ${message}`,
			};
		}

		const parsed = ts.parseJsonConfigFileContent(configFile.config, this.sys, dirname(configPath));

		if (parsed.errors.length > 0) {
			const messages = parsed.errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, "\n")).join("\n");
			return {
				success: false,
				error: `Failed to parse tsconfig.json: ${messages}`,
			};
		}

		this.compilerOptions = parsed.options;

		// Create module resolution cache
		this.moduleResolutionCache = ts.createModuleResolutionCache(
			this.options.rootDir,
			(fileName) => fileName.toLowerCase(),
			this.compilerOptions,
		);

		// Create a minimal program for module resolution
		const host = ts.createCompilerHost(this.compilerOptions, true);
		host.getCurrentDirectory = (): string => this.options.rootDir;

		// Start with an empty program - we'll resolve files as we trace
		this.program = ts.createProgram([], this.compilerOptions, host);

		return { success: true };
	}

	/**
	 * Find tsconfig.json path.
	 */
	private findTsConfig(): string | null {
		if (this.options.tsconfigPath) {
			const customPath = isAbsolute(this.options.tsconfigPath)
				? this.options.tsconfigPath
				: resolve(this.options.rootDir, this.options.tsconfigPath);

			if (this.sys.fileExists(customPath)) {
				return customPath;
			}
			return null;
		}

		// Search for tsconfig.json from rootDir upward
		const configPath = ts.findConfigFile(this.options.rootDir, (path) => this.sys.fileExists(path));

		return configPath ?? null;
	}

	/**
	 * Resolve entry path to absolute path.
	 */
	private resolveEntryPath(entryPath: string): string {
		if (isAbsolute(entryPath)) {
			return normalize(entryPath);
		}
		return normalize(resolve(this.options.rootDir, entryPath));
	}

	/**
	 * Recursively trace imports from a source file.
	 */
	private traceImports(filePath: string, visited: Set<string>, errors: string[]): void {
		const normalizedPath = normalize(filePath);

		// Skip if already visited
		if (visited.has(normalizedPath)) {
			return;
		}

		// Skip external modules
		if (this.isExternalModule(normalizedPath)) {
			return;
		}

		// Mark as visited
		visited.add(normalizedPath);

		// Read and parse the file
		const content = this.sys.readFile(normalizedPath);
		if (!content) {
			errors.push(`Failed to read file: ${normalizedPath}`);
			return;
		}

		// Create a source file for AST analysis
		const sourceFile = ts.createSourceFile(normalizedPath, content, ts.ScriptTarget.Latest, true);

		// Extract imports
		const imports = this.extractImports(sourceFile);

		// Resolve and trace each import
		for (const importPath of imports) {
			const resolved = this.resolveImport(importPath, normalizedPath);
			if (resolved) {
				this.traceImports(resolved, visited, errors);
			}
		}
	}

	/**
	 * Extract all import/export module specifiers from a source file.
	 */
	private extractImports(sourceFile: ts.SourceFile): string[] {
		const imports: string[] = [];

		const visit = (node: ts.Node): void => {
			// import declarations: import { foo } from "./module"
			if (ts.isImportDeclaration(node)) {
				const specifier = node.moduleSpecifier;
				if (ts.isStringLiteral(specifier)) {
					imports.push(specifier.text);
				}
			}

			// export declarations: export { foo } from "./module"
			else if (ts.isExportDeclaration(node)) {
				const specifier = node.moduleSpecifier;
				if (specifier && ts.isStringLiteral(specifier)) {
					imports.push(specifier.text);
				}
			}

			// dynamic imports: import("./module")
			else if (ts.isCallExpression(node)) {
				const expression = node.expression;
				if (expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0) {
					const arg = node.arguments[0];
					if (arg && ts.isStringLiteral(arg)) {
						imports.push(arg.text);
					}
				}
			}

			ts.forEachChild(node, visit);
		};

		visit(sourceFile);
		return imports;
	}

	/**
	 * Resolve a module specifier to an absolute file path.
	 */
	private resolveImport(specifier: string, fromFile: string): string | null {
		// Skip external packages (not relative or alias imports)
		if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
			// Could be a path alias - try to resolve via TS
			if (!this.compilerOptions?.paths || !Object.keys(this.compilerOptions.paths).length) {
				return null;
			}
		}

		if (!this.compilerOptions || !this.moduleResolutionCache) {
			return null;
		}

		// Use TypeScript module resolution
		const resolved = ts.resolveModuleName(
			specifier,
			fromFile,
			this.compilerOptions,
			this.sys,
			this.moduleResolutionCache,
		);

		if (resolved.resolvedModule) {
			const resolvedPath = resolved.resolvedModule.resolvedFileName;

			// Skip external modules and declaration files
			if (resolved.resolvedModule.isExternalLibraryImport) {
				return null;
			}

			// Convert .d.ts to .ts if we're looking at declaration files that have source
			if (resolvedPath.endsWith(".d.ts")) {
				const sourcePath = resolvedPath.replace(/\.d\.ts$/, ".ts");
				if (this.sys.fileExists(sourcePath)) {
					return sourcePath;
				}
				// No source file, skip declaration-only files
				return null;
			}

			return resolvedPath;
		}

		return null;
	}

	/**
	 * Check if a path is an external module (node_modules).
	 */
	private isExternalModule(filePath: string): boolean {
		return filePath.includes("/node_modules/") || filePath.includes("\\node_modules\\");
	}

	/**
	 * Check if a file should be included in results.
	 * Filters out test files and non-TypeScript files.
	 */
	private isSourceFile(filePath: string): boolean {
		// Must be TypeScript
		if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) {
			return false;
		}

		// Skip declaration files
		if (filePath.endsWith(".d.ts")) {
			return false;
		}

		// Skip test files
		if (filePath.includes(".test.") || filePath.includes(".spec.")) {
			return false;
		}

		// Skip test directories
		if (filePath.includes("/__test__/") || filePath.includes("\\__test__\\")) {
			return false;
		}
		if (filePath.includes("/__tests__/") || filePath.includes("\\__tests__\\")) {
			return false;
		}

		return true;
	}

	/**
	 * Traces TypeScript imports from entry points.
	 *
	 * @remarks
	 * Static convenience method that creates an ImportGraph instance
	 * and traces imports in one call. For repeated analysis where you want
	 * to reuse the TypeScript program, create an instance and use
	 * {@link ImportGraph.traceFromEntries} instead.
	 *
	 * @param entryPaths - Paths to entry files (relative to rootDir or absolute)
	 * @param options - Import graph configuration options
	 * @returns All TypeScript files reachable from the entries
	 *
	 * @example
	 * ```typescript
	 * import { ImportGraph } from '@savvy-web/rslib-builder';
	 *
	 * const result = ImportGraph.fromEntries(
	 *   ['./src/index.ts', './src/cli.ts'],
	 *   { rootDir: process.cwd() }
	 * );
	 * console.log('Found files:', result.files);
	 * ```
	 */
	static fromEntries(entryPaths: string[], options: ImportGraphOptions): ImportGraphResult {
		const graph = new ImportGraph(options);
		return graph.traceFromEntries(entryPaths);
	}

	/**
	 * Traces TypeScript imports from package.json exports.
	 *
	 * @remarks
	 * Static convenience method that extracts entry points from package.json exports
	 * and traces all imports to find public API files. For repeated analysis,
	 * create an instance and use {@link ImportGraph.traceFromPackageExports} instead.
	 *
	 * @param packageJsonPath - Path to package.json (relative to rootDir or absolute)
	 * @param options - Import graph configuration options
	 * @returns All TypeScript files reachable from the package exports
	 *
	 * @example
	 * ```typescript
	 * import { ImportGraph } from '@savvy-web/rslib-builder';
	 *
	 * const result = ImportGraph.fromPackageExports(
	 *   './package.json',
	 *   { rootDir: process.cwd() }
	 * );
	 * console.log('Public API files:', result.files);
	 * ```
	 */
	static fromPackageExports(packageJsonPath: string, options: ImportGraphOptions): ImportGraphResult {
		const graph = new ImportGraph(options);
		return graph.traceFromPackageExports(packageJsonPath);
	}
}
