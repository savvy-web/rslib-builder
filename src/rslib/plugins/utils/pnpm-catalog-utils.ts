import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { getWorkspaceRoot } from "workspace-tools";
import { parse } from "yaml";
import { createEnvLogger } from "#utils/logger-utils.js";
import type { PnpmWorkspace } from "#utils/package-json-types-utils.js";

/**
 * Cache for the pnpm catalog to avoid repeated file I/O operations.
 *
 * @remarks
 * This cache stores the parsed catalog from pnpm-workspace.yaml along with the file's
 * modification time. The cache is invalidated when the workspace file is modified,
 * ensuring we always have fresh catalog data while avoiding unnecessary file reads.
 * The workspace root is also cached to avoid repeated filesystem operations.
 *
 * **Cache Lifetime:**
 * The cache persists for the entire Node.js process lifetime. This is efficient for
 * build pipelines but means changes to pnpm-workspace.yaml during long-running builds
 * are detected only when the file's modification time changes.
 *
 * **Testing:**
 * Use {@link clearCatalogCache} to reset the cache state between tests.
 */
let catalogCache: Record<string, string> | null = null;
let catalogCacheMtime: number | null = null;
let cachedWorkspaceRoot: string | undefined | null = null;

/**
 * Clears the catalog cache and workspace root cache.
 *
 * @remarks
 * This function is primarily useful in testing scenarios to ensure clean state
 * between tests. In production builds, the cache is managed automatically based
 * on file modification times.
 *
 * @example
 * ```typescript
 * // In test setup
 * beforeEach(() => {
 *   clearCatalogCache();
 * });
 * ```
 */
export function clearCatalogCache(): void {
	catalogCache = null;
	catalogCacheMtime = null;
	cachedWorkspaceRoot = null;
}

/**
 * Reads and caches the pnpm dependency catalog from pnpm-workspace.yaml.
 *
 * @remarks
 * This function loads the pnpm workspace configuration and extracts the catalog
 * section, which contains centralized dependency version definitions. The catalog
 * is cached based on file modification time to avoid repeated I/O operations.
 *
 * The function handles various error scenarios gracefully:
 * - Missing workspace file
 * - Invalid YAML syntax
 * - General I/O errors
 *
 * @returns The catalog object mapping dependency names to versions
 * @throws {Error} Critical errors are logged but the function returns an empty object
 *
 * @example
 * ```typescript
 * const catalog = getCatalog();
 * console.log(catalog);
 * // {
 * //   "react": "^18.0.0",
 * //   "@types/node": "^20.0.0",
 * //   "typescript": "^5.0.0"
 * // }
 * ```
 */
export async function getCatalog(): Promise<Record<string, string>> {
	try {
		// Cache workspace root to avoid repeated filesystem operations
		if (!cachedWorkspaceRoot) {
			cachedWorkspaceRoot = getWorkspaceRoot(process.cwd());
			if (!cachedWorkspaceRoot) {
				throw new Error("Could not find workspace root - ensure you're in a workspace");
			}
		}
		const workspaceFile = resolve(cachedWorkspaceRoot, "pnpm-workspace.yaml");
		const stats = await stat(workspaceFile);
		const currentMtime = stats.mtime.getTime();

		if (catalogCache !== null && catalogCacheMtime === currentMtime) {
			return catalogCache;
		}

		const content = await readFile(workspaceFile, "utf-8");
		const workspace = parse(content) as PnpmWorkspace;
		catalogCache = workspace.catalog ?? {};
		catalogCacheMtime = currentMtime;
		return catalogCache;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const logger = createEnvLogger("catalog");

		if (errorMessage.includes("ENOENT") && errorMessage.includes("pnpm-workspace.yaml")) {
			logger.error("Failed to read pnpm catalog: workspace configuration not found");
			logger.error("  → Ensure you're in a pnpm workspace with proper configuration");
		} else if (errorMessage.includes("YAML")) {
			logger.error("Failed to read pnpm catalog: Invalid YAML syntax in workspace configuration");
			logger.error("  → Check workspace configuration file syntax");
		} else {
			logger.error(`Failed to read pnpm catalog from pnpm-workspace.yaml: ${errorMessage}`);
		}

		return {};
	}
}
