/**
 * Data structure for tracking external import information during TypeScript bundling.
 *
 * @remarks
 * This interface is used to organize and deduplicate external imports when bundling
 * TypeScript files. It separates different types of imports (named, namespace, default, types)
 * to enable proper reconstruction of consolidated import statements.
 *
 * @example
 * ```typescript
 * const importData: ExternalImportData = {
 *   named: new Set(['useState', 'useEffect']),
 *   namespaceImports: new Set(['React']),
 *   defaultImports: new Set(['lodash']),
 *   types: new Set(['FC', 'ComponentProps'])
 * };
 * ```
 */
export interface ExternalImportData {
	/** Named imports like `{ useState, useEffect }` */
	named: Set<string>;
	/** Namespace imports like `* as React` */
	namespaceImports: Set<string>;
	/** Default imports like `React` or `lodash` */
	defaultImports: Set<string>;
	/** Type-only imports like `type { FC }` */
	types: Set<string>;
}

/**
 * Parsed representation of a TypeScript import statement.
 *
 * @remarks
 * This interface represents the structured data extracted from a TypeScript import
 * statement using regular expression parsing. It handles various import syntaxes
 * including mixed imports with both default and named imports.
 *
 * @example
 * ```typescript
 * // For: import React, { useState } from 'react';
 * const parsed: ParsedImport = {
 *   defaultImport: 'React',
 *   namedImports1: ' useState ',
 *   importPath: 'react'
 * };
 * ```
 */
export interface ParsedImport {
	/** The 'type' keyword if present in type-only imports */
	typeKeyword?: string;
	/** Named imports before comma in mixed imports */
	namedImports1?: string;
	/** Namespace name from `* as Name` imports */
	namespaceName?: string;
	/** Default import name */
	defaultImport?: string;
	/** Named imports after comma in mixed imports */
	namedImports2?: string;
	/** Second default import in complex mixed imports */
	defaultImport2?: string;
	/** The module path being imported from */
	importPath: string;
}

/**
 * Regular expression for parsing TypeScript import statements.
 *
 * @remarks
 * This regex handles complex import patterns including:
 * - Type-only imports: `import type { FC } from 'react'`
 * - Named imports: `import { useState } from 'react'`
 * - Namespace imports: `import * as React from 'react'`
 * - Default imports: `import React from 'react'`
 * - Mixed imports: `import React, { useState } from 'react'`
 *
 * The regex uses capture groups to extract different parts of the import statement
 * for structured parsing.
 */
export const IMPORT_REGEX: RegExp =
	/^import\s+(?:(type)\s+)?(?:\{([^}]+)\}|(\*\s+as\s+(\w+))|(\w+))?\s*(?:,\s*(?:\{([^}]+)\}|(\w+)))?\s*from\s+["'](.+?)["'];?$/gm;

/**
 * Regular expression for parsing TypeScript export-all statements.
 *
 * @remarks
 * Matches statements like `export * from './module'` which re-export all exports
 * from another module. Used during bundling to identify re-export relationships.
 */
export const EXPORT_REGEX: RegExp = /^export\s+\*\s+from\s+["'](.+?)["'];?$/gm;

/**
 * Regular expression for parsing named export statements with source.
 *
 * @remarks
 * Matches statements like `export { foo, bar } from './module'` which re-export
 * specific named exports from another module. Used during bundling to track
 * re-export relationships.
 */
export const NAMED_EXPORT_REGEX: RegExp = /^export\s+\{\s*([^}]+)\s*\}\s+from\s+["'](.+?)["'];?$/gm;

/**
 * Parses a TypeScript import statement into structured data.
 *
 * @remarks
 * This function takes the result of a regex match against an import statement
 * and extracts the various components into a structured format. It handles
 * complex import patterns including mixed imports with both default and named imports.
 *
 * @param importMatch - The regex match array from executing IMPORT_REGEX
 * @returns Structured import data, or null if the match is invalid
 *
 * @example
 * ```typescript
 * const regex = new RegExp(IMPORT_REGEX.source, 'gm');
 * const match = regex.exec("import React, { useState } from 'react';");
 * if (match) {
 *   const parsed = parseImportStatement(match);
 *   console.log(parsed?.defaultImport); // "React"
 *   console.log(parsed?.namedImports1); // " useState "
 *   console.log(parsed?.importPath); // "react"
 * }
 * ```
 *
 * @see {@link IMPORT_REGEX} for the regex pattern used to generate matches
 */
export function parseImportStatement(importMatch: RegExpExecArray): ParsedImport | null {
	const [
		,
		typeKeyword, // 'type' keyword if present
		namedImports1,
		,
		// Named imports before comma
		// namespaceImport not used
		namespaceName, // the 'something' in * as something
		defaultImport, // Default import
		namedImports2, // Named imports after comma
		defaultImport2, // Default import after comma
		importPath, // The module path
	] = importMatch;

	return {
		typeKeyword,
		namedImports1,
		namespaceName,
		defaultImport,
		namedImports2,
		defaultImport2,
		importPath,
	};
}

/**
 * Determines if an import path references a relative (local) module.
 *
 * @remarks
 * This function is used during TypeScript bundling to distinguish between
 * local modules (which should be inlined) and external modules (which should
 * be preserved as imports). Relative imports start with "." or ".." and refer
 * to files within the same project.
 *
 * @param importPath - The import path to check
 * @returns True if the path is relative (starts with "."), false otherwise
 *
 * @example
 * ```typescript
 * console.log(isRelativeImport('./utils')); // true
 * console.log(isRelativeImport('../common')); // true
 * console.log(isRelativeImport('react')); // false
 * console.log(isRelativeImport('@types/node')); // false
 * ```
 */
export function isRelativeImport(importPath: string): boolean {
	return importPath.startsWith(".");
}

/**
 * Creates an empty external import data structure.
 *
 * @remarks
 * This factory function creates a new {@link ExternalImportData} object with
 * all Sets initialized to empty. It's used when starting to track external
 * imports during the TypeScript bundling process.
 *
 * @returns A new ExternalImportData object with empty Sets
 *
 * @example
 * ```typescript
 * const importData = createExternalImportData();
 * importData.named.add('useState');
 * importData.defaultImports.add('React');
 * ```
 *
 * @see {@link ExternalImportData} for the structure definition
 */
export function createExternalImportData(): ExternalImportData {
	return {
		named: new Set(),
		namespaceImports: new Set(),
		defaultImports: new Set(),
		types: new Set(),
	};
}

/**
 * Parses a named imports string into an array of import names.
 *
 * @remarks
 * This function handles the parsing of named import lists from import statements,
 * properly handling alias syntax (`foo as bar`) by extracting the original names.
 * It splits on commas, trims whitespace, and filters out empty strings.
 *
 * @param namedImportsString - The string containing named imports (e.g., " foo, bar as baz ")
 * @returns Array of original import names, or empty array if input is empty
 *
 * @example
 * ```typescript
 * console.log(parseNamedImports("foo, bar")); // ["foo", "bar"]
 * console.log(parseNamedImports("foo as F, bar")); // ["foo", "bar"]
 * console.log(parseNamedImports(" useState , useEffect as effect ")); // ["useState", "useEffect"]
 * console.log(parseNamedImports("")); // []
 * ```
 */
export function parseNamedImports(namedImportsString: string): string[] {
	if (!namedImportsString) return [];

	return namedImportsString
		.split(",")
		.map((item) => {
			const trimmed = item.trim();
			// Handle "foo as bar" syntax - we want the original name "foo"
			const asIndex = trimmed.indexOf(" as ");
			return asIndex !== -1 ? trimmed.substring(0, asIndex).trim() : trimmed;
		})
		.filter(Boolean);
}
