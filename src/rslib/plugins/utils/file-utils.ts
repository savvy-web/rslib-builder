import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Asynchronously checks if a file exists in the current working directory.
 *
 * @remarks
 * This function safely checks file existence without throwing errors for missing files.
 * It uses the Node.js `fs.stat()` method internally and catches any filesystem errors.
 * The file path is resolved relative to the current working directory using `process.cwd()`.
 *
 * @param assetName - The relative path to the file from the current working directory
 * @returns A promise that resolves to `true` if the file exists, `false` otherwise
 *
 * @example
 * ```typescript
 * // Check if package.json exists in the current directory
 * const exists = await fileExistAsync('package.json');
 * console.log(exists); // true or false
 *
 * // Check if a nested file exists
 * const nestedExists = await fileExistAsync('src/index.ts');
 * console.log(nestedExists); // true or false
 * ```
 *
 * @see {@link https://nodejs.org/api/fs.html#fspromisesstatpath-options | Node.js fs.stat documentation}
 */
export async function fileExistAsync(assetName: string): Promise<{
	assetName: string;
	assetPath: string;
	assetExists: boolean;
}> {
	const assetPath = join(process.cwd(), assetName);
	const assetExists = !!(await stat(assetPath).catch(() => false));
	return {
		assetName,
		assetPath,
		assetExists,
	};
}

export async function packageJsonVersion(): Promise<string> {
	const { assetExists, assetPath } = await fileExistAsync("package.json");
	if (!assetExists) {
		throw new Error("package.json not found in project root");
	}
	try {
		const json = await readFile(assetPath, "utf-8");
		const { version } = JSON.parse(json);
		return version;
	} catch {
		throw new Error("Failed to read version from package.json");
	}
}
