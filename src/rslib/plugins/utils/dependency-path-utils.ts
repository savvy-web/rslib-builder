import { existsSync } from "node:fs";
import { join } from "node:path";
import { getWorkspaceRoot } from "workspace-tools";

/**
 * Gets the path to the @microsoft/api-extractor package.
 * Uses workspace-tools to find the workspace root and searches for the package.
 * Supports npm, pnpm, yarn, rush, and lerna workspaces.
 * @returns The absolute path to the api-extractor package directory
 * @throws Error if the package is not found
 */
export function getApiExtractorPath(): string {
	const cwd = process.cwd();

	// First, try the current package's node_modules
	const localApiExtractor = join(cwd, "node_modules", "@microsoft", "api-extractor");
	if (existsSync(localApiExtractor)) {
		return localApiExtractor;
	}

	// If not found locally, use workspace-tools to find the workspace root
	// This handles pnpm, npm, yarn, rush, and lerna workspaces
	const workspaceRoot = getWorkspaceRoot(cwd);
	if (workspaceRoot) {
		const workspaceApiExtractor = join(workspaceRoot, "node_modules", "@microsoft", "api-extractor");
		if (existsSync(workspaceApiExtractor)) {
			return workspaceApiExtractor;
		}
	}

	// If not found, throw a clear error
	throw new Error(
		"API Extractor bundling requires @microsoft/api-extractor to be installed.\n" +
			"Install it with: pnpm add -D @microsoft/api-extractor",
	);
}
