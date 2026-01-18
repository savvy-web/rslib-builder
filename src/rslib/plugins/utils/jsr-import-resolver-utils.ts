import { access } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Resolves a TypeScript import path to the actual file location on the filesystem.
 *
 * @remarks
 * This function handles the complex mapping between import statements in TypeScript
 * files and their actual file locations. It's specifically designed for JSR
 * (JavaScript Registry) bundling where TypeScript files may import with `.js`
 * extensions but the actual files have `.ts` extensions.
 *
 * The resolution process follows this priority order:
 * 1. Direct `.ts` file match
 * 2. Direct `.tsx` file match
 * 3. `index.ts` file in a directory
 * 4. `index.tsx` file in a directory
 *
 * This mirrors TypeScript's module resolution strategy but focuses specifically
 * on TypeScript source files rather than compiled JavaScript.
 *
 * @param fromDir - The directory path of the file containing the import statement
 * @param importPath - The import path as written in the source code (may include .js extension)
 * @returns The absolute path to the resolved TypeScript file, or null if not found
 *
 * @example
 * ```typescript
 * // Resolving a relative import with .js extension to actual .ts file
 * const resolved = resolveImportPath('/project/src', './utils.js');
 * console.log(resolved); // '/project/src/utils.ts' (if exists)
 *
 * // Resolving to an index file
 * const indexResolved = resolveImportPath('/project/src', './components');
 * console.log(indexResolved); // '/project/src/components/index.ts' (if exists)
 *
 * // When no matching file is found
 * const notFound = resolveImportPath('/project/src', './nonexistent');
 * console.log(notFound); // null
 * ```
 *
 * @example
 * ```typescript
 * // Common usage in import processing
 * const importStatements = ['./utils.js', '../common', './types.ts'];
 * const currentDir = '/project/src/components';
 *
 * for (const importPath of importStatements) {
 *   const resolved = resolveImportPath(currentDir, importPath);
 *   if (resolved) {
 *     console.log(`${importPath} -> ${resolved}`);
 *     // Process the resolved TypeScript file
 *   } else {
 *     console.warn(`Could not resolve: ${importPath}`);
 *   }
 * }
 * ```
 *
 * @see {@link https://www.typescriptlang.org/docs/handbook/module-resolution.html} TypeScript Module Resolution
 */
export async function resolveImportPath(fromDir: string, importPath: string): Promise<string | null> {
	// Remove .js extension if present (we want .ts)
	let resolvedPath = importPath.replace(/\.js$/, "");

	// Resolve the path relative to the importing file's directory
	resolvedPath = resolve(fromDir, resolvedPath);

	// Try different extensions
	const extensions = [".ts", ".tsx", "/index.ts", "/index.tsx"];
	for (const ext of extensions) {
		const fullPath = resolvedPath.endsWith(".ts") || resolvedPath.endsWith(".tsx") ? resolvedPath : resolvedPath + ext;
		try {
			await access(fullPath);
			return fullPath;
		} catch {
			// File doesn't exist, continue to next extension
		}
	}

	return null;
}
