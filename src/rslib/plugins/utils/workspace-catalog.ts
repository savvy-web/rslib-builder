import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCatalogsFromWorkspaceManifest } from "@pnpm/catalogs.config";
import { parseCatalogProtocol } from "@pnpm/catalogs.protocol-parser";
import { createExportableManifest } from "@pnpm/exportable-manifest";
import type { CatalogSnapshots } from "@pnpm/lockfile.fs";
import { readWantedLockfile } from "@pnpm/lockfile.fs";
import type { ProjectManifest } from "@pnpm/types";
import { readWorkspaceManifest } from "@pnpm/workspace.read-manifest";
import type { WorkspaceManager, Catalogs as WorkspaceToolsCatalogs } from "workspace-tools";
import { getWorkspaceManagerAndRoot, getCatalogs as getWorkspaceToolsCatalogs } from "workspace-tools";
import type { PackageJson } from "../../../types/package-json.js";
import { createEnvLogger } from "./build-logger.js";

/**
 * Workspace manager and root directory info from workspace-tools.
 * @internal
 */
interface WorkspaceManagerAndRoot {
	manager: WorkspaceManager;
	root: string;
}

/**
 * Type for catalogs - mapping catalog names to their dependency-version mappings.
 * @internal
 */
type Catalogs = Record<string, Record<string, string>>;

/** Prefix for catalog references in dependency versions. */
const CATALOG_PREFIX = "catalog:" as const;
/** Prefix for workspace references in dependency versions. */
const WORKSPACE_PREFIX = "workspace:" as const;

/**
 * Manages workspace catalog resolution with caching.
 *
 * @remarks
 * This class handles the resolution of workspace-specific dependency references:
 * - `catalog:` references to centralized version definitions
 * - `workspace:` references to local workspace packages
 *
 * Supports multiple package managers:
 * - **pnpm**: Reads from workspace state file (primary, includes all configDependency catalogs),
 *   then `pnpm-lock.yaml`, then `pnpm-workspace.yaml`
 * - **yarn**: Uses workspace-tools to read from yarn's catalog configuration
 *
 * The class caches the catalog data to avoid repeated filesystem operations during builds.
 *
 * @example
 * ```typescript
 * import { WorkspaceCatalog } from './workspace-catalog.js';
 *
 * const catalog = new WorkspaceCatalog();
 *
 * // Get all catalogs
 * const catalogs = await catalog.getCatalogs();
 * console.log(catalogs);
 * // { default: { react: "^18.2.0" }, silk: { typescript: "^5.9.0" } }
 *
 * // Resolve package.json dependencies
 * const resolved = await catalog.resolvePackageJson(packageJson);
 * ```
 *
 * @internal
 */
export class WorkspaceCatalog {
	private catalogsCache: Catalogs | null = null;
	private cachedWorkspaceInfo: WorkspaceManagerAndRoot | null = null;

	/**
	 * Clears the cached catalog data.
	 *
	 * @remarks
	 * Useful in testing scenarios to ensure clean state between tests.
	 */
	clearCache(): void {
		this.catalogsCache = null;
		this.cachedWorkspaceInfo = null;
	}

	/**
	 * Gets all catalogs from the workspace, using the appropriate strategy for the package manager.
	 *
	 * @remarks
	 * - **pnpm**: Reads from workspace state file first (most complete, includes configDependency
	 *   catalogs like `catalog:silkPeers`), then `pnpm-lock.yaml`, then `pnpm-workspace.yaml`
	 * - **yarn**: Uses workspace-tools to read from yarn's catalog configuration
	 *
	 * @returns Mapping of catalog names to their dependency version mappings
	 */
	async getCatalogs(): Promise<Catalogs> {
		if (this.catalogsCache !== null) {
			return this.catalogsCache;
		}

		const workspaceInfo = this.getWorkspaceInfo();
		if (!workspaceInfo) {
			const logger = createEnvLogger("catalog");
			logger.error("Could not find workspace root - ensure you're in a workspace");
			return {};
		}

		const { manager, root } = workspaceInfo;

		if (manager === "pnpm") {
			// pnpm: Use lockfile first (for config dependency catalogs), then workspace manifest
			this.catalogsCache = await this.readPnpmCatalogs(root);
		} else if (manager === "yarn") {
			// yarn: Use workspace-tools getCatalogs
			this.catalogsCache = this.readYarnCatalogs(root);
		} else {
			// Other managers don't support catalogs
			this.catalogsCache = {};
		}

		return this.catalogsCache;
	}

	/**
	 * Resolves catalog: and workspace: references in a package.json.
	 *
	 * @param packageJson - The package.json to resolve
	 * @param dir - The directory containing the package (defaults to cwd)
	 * @returns The resolved package.json
	 *
	 * @throws When resolution fails for critical dependencies
	 */
	async resolvePackageJson(packageJson: PackageJson, dir: string = process.cwd()): Promise<PackageJson> {
		const workspaceInfo = this.getWorkspaceInfo();
		const loggerName = workspaceInfo?.manager === "yarn" ? "yarn" : "pnpm";
		const logger = createEnvLogger(loggerName);

		try {
			const catalogs = await this.getCatalogs();

			// Collect catalog dependencies with their catalog names
			const catalogDeps = this.collectCatalogDependencies(packageJson);
			const workspaceDeps = this.collectDependencies(packageJson, WORKSPACE_PREFIX);

			const hasCatalogDeps = catalogDeps.length > 0;
			const hasWorkspaceDeps = workspaceDeps.length > 0;

			// Validate all referenced catalogs exist
			if (hasCatalogDeps) {
				const missingCatalogs = this.findMissingCatalogs(catalogDeps, catalogs);
				if (missingCatalogs.size > 0) {
					const available = Object.keys(catalogs).join(", ") || "none";
					const error = `Catalog(s) not found: ${[...missingCatalogs].join(", ")}. Available: ${available}`;
					logger.error(error);
					logger.error("  -> Catalog dependencies found:");
					for (const { field, dependency, version, catalogName } of catalogDeps) {
						if (missingCatalogs.has(catalogName)) {
							logger.error(`    - ${field}.${dependency}: ${version}`);
						}
					}
					throw new Error(error);
				}
				logger.info(`Resolving ${catalogDeps.length} ${CATALOG_PREFIX} dependencies`);
			}
			if (hasWorkspaceDeps) {
				logger.info(`Resolving ${workspaceDeps.length} ${WORKSPACE_PREFIX} dependencies`);
			}

			const result = await createExportableManifest(dir, packageJson as unknown as ProjectManifest, { catalogs });

			// Log resolved dependencies
			if (hasCatalogDeps || hasWorkspaceDeps) {
				const allDeps = [
					...catalogDeps.map((d) => ({
						field: d.field,
						dependency: d.dependency,
						source: d.catalogName === "default" ? "catalog:" : `catalog:${d.catalogName}`,
					})),
					...workspaceDeps.map((d) => ({ field: d.field, dependency: d.dependency, source: "workspace:" })),
				];
				this.logResolvedDependencies(result as unknown as PackageJson, allDeps, logger);
			}

			// Validate no unresolved references remain
			this.validateNoUnresolvedReferences(result as unknown as PackageJson, logger);

			return result as unknown as PackageJson;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			// Re-throw specific validation errors
			if (errorMessage.startsWith("Transformation failed:") || errorMessage.startsWith("Catalog(s) not found:")) {
				throw error;
			}

			logger.error(`Failed to apply transformations for directory ${dir}: ${errorMessage}`);

			if (errorMessage.includes("catalog")) {
				logger.error(
					`  -> Catalog resolution failed - check workspace configuration and ${CATALOG_PREFIX} dependencies`,
				);
				throw new Error("Catalog resolution failed");
			}
			if (errorMessage.includes("workspace")) {
				logger.error(`  -> Workspace resolution failed - check ${WORKSPACE_PREFIX} dependencies and configuration`);
				throw new Error("Workspace resolution failed");
			}
			if (errorMessage.includes("manifest")) {
				logger.error("  -> Manifest processing failed - check package.json syntax");
				throw new Error(`Manifest processing failed: ${errorMessage}`);
			}

			logger.error("  -> Cannot proceed with invalid package.json transformations");
			throw new Error(`Transformation failed: ${errorMessage}`);
		}
	}

	/**
	 * Gets the workspace manager and root directory.
	 * Uses workspace-tools to detect the package manager and find the root.
	 */
	private getWorkspaceInfo(): WorkspaceManagerAndRoot | null {
		if (this.cachedWorkspaceInfo !== null) {
			return this.cachedWorkspaceInfo;
		}
		const info = getWorkspaceManagerAndRoot(process.cwd());
		this.cachedWorkspaceInfo = info ?? null;
		return this.cachedWorkspaceInfo;
	}

	/**
	 * Reads catalogs for pnpm workspaces.
	 * Primary: workspace state file (most complete, includes configDependency catalogs)
	 * Fallback 1: pnpm-lock.yaml
	 * Fallback 2: pnpm-workspace.yaml
	 */
	private async readPnpmCatalogs(workspaceRoot: string): Promise<Catalogs> {
		// Primary: workspace state (most complete, includes configDependency catalogs)
		const stateCatalogs = await this.readPnpmWorkspaceStateCatalogs(workspaceRoot);
		if (Object.keys(stateCatalogs).length > 0) {
			return stateCatalogs;
		}

		// Fallback: lockfile
		const lockfileCatalogs = await this.readPnpmLockfileCatalogs(workspaceRoot);
		if (Object.keys(lockfileCatalogs).length > 0) {
			return lockfileCatalogs;
		}

		// Last resort: workspace manifest
		return this.readPnpmWorkspaceCatalogs(workspaceRoot);
	}

	/**
	 * Reads catalogs from `node_modules/.pnpm-workspace-state-v1.json`.
	 *
	 * @remarks
	 * The workspace state file is the most complete source of catalog data because
	 * it includes catalogs from pnpm `configDependencies` plugins that may not appear
	 * in the lockfile (e.g., catalogs used only in `peerDependencies`).
	 */
	private async readPnpmWorkspaceStateCatalogs(workspaceRoot: string): Promise<Catalogs> {
		try {
			const statePath = join(workspaceRoot, "node_modules", ".pnpm-workspace-state-v1.json");
			const content = await readFile(statePath, "utf-8");
			const state: { settings?: { catalogs?: Catalogs } } = JSON.parse(content);
			return state.settings?.catalogs ?? {};
		} catch {
			return {};
		}
	}

	/**
	 * Reads catalogs from pnpm-lock.yaml.
	 */
	private async readPnpmLockfileCatalogs(workspaceRoot: string): Promise<Catalogs> {
		try {
			const lockfile = await readWantedLockfile(workspaceRoot, {
				ignoreIncompatible: true,
			});
			if (!lockfile?.catalogs) return {};
			return this.convertLockfileCatalogs(lockfile.catalogs);
		} catch {
			return {};
		}
	}

	/**
	 * Reads catalogs from pnpm-workspace.yaml.
	 */
	private async readPnpmWorkspaceCatalogs(workspaceRoot: string): Promise<Catalogs> {
		try {
			const manifest = await readWorkspaceManifest(workspaceRoot);
			return getCatalogsFromWorkspaceManifest(manifest);
		} catch {
			return {};
		}
	}

	/**
	 * Reads catalogs for yarn workspaces using workspace-tools.
	 */
	private readYarnCatalogs(workspaceRoot: string): Catalogs {
		const catalogs = getWorkspaceToolsCatalogs(workspaceRoot, "yarn");
		if (!catalogs) return {};
		return this.convertWorkspaceToolsCatalogs(catalogs);
	}

	/**
	 * Converts lockfile catalog snapshots to the flat Catalogs format.
	 */
	private convertLockfileCatalogs(snapshots: CatalogSnapshots): Catalogs {
		const result: Catalogs = {};
		for (const [name, entries] of Object.entries(snapshots)) {
			result[name] = {};
			for (const [dep, entry] of Object.entries(entries as Record<string, { specifier: string }>)) {
				result[name][dep] = entry.specifier;
			}
		}
		return result;
	}

	/**
	 * Converts workspace-tools Catalogs format to our flat Catalogs format.
	 */
	private convertWorkspaceToolsCatalogs(catalogs: WorkspaceToolsCatalogs): Catalogs {
		const result: Catalogs = {};

		// Add default catalog
		if (catalogs.default) {
			result.default = { ...catalogs.default };
		}

		// Add named catalogs
		if (catalogs.named) {
			for (const [name, catalog] of Object.entries(catalogs.named)) {
				result[name] = { ...catalog };
			}
		}

		return result;
	}

	/**
	 * Collects catalog: dependencies with their parsed catalog names.
	 */
	private collectCatalogDependencies(packageJson: PackageJson): Array<{
		field: string;
		dependency: string;
		version: string;
		catalogName: string;
	}> {
		const deps: Array<{ field: string; dependency: string; version: string; catalogName: string }> = [];
		const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

		for (const field of fields) {
			const fieldDeps = packageJson[field] as Record<string, string> | undefined;
			if (!fieldDeps) continue;

			for (const [dependency, version] of Object.entries(fieldDeps)) {
				if (typeof version !== "string" || !version.startsWith(CATALOG_PREFIX)) continue;

				// parseCatalogProtocol returns the catalog name (string) or null
				const catalogName = parseCatalogProtocol(version);
				if (catalogName) {
					deps.push({ field, dependency, version, catalogName });
				}
			}
		}
		return deps;
	}

	/**
	 * Finds catalog names referenced in dependencies that don't exist.
	 */
	private findMissingCatalogs(deps: Array<{ catalogName: string }>, catalogs: Catalogs): Set<string> {
		const missing = new Set<string>();
		for (const { catalogName } of deps) {
			if (!catalogs[catalogName]) {
				missing.add(catalogName);
			}
		}
		return missing;
	}

	/**
	 * Collects dependencies with a specific prefix (workspace:).
	 */
	private collectDependencies(
		packageJson: PackageJson,
		prefix: string,
	): Array<{ field: string; dependency: string; version: string }> {
		const deps: Array<{ field: string; dependency: string; version: string }> = [];
		const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

		for (const field of fields) {
			const fieldDeps = packageJson[field] as Record<string, string> | undefined;
			if (fieldDeps) {
				for (const [dependency, version] of Object.entries(fieldDeps)) {
					if (typeof version === "string" && version.startsWith(prefix)) {
						deps.push({ field, dependency, version });
					}
				}
			}
		}

		return deps;
	}

	/**
	 * Logs resolved dependencies in a formatted way.
	 */
	private logResolvedDependencies(
		resultPkg: PackageJson,
		originalDeps: Array<{ field: string; dependency: string; source: string }>,
		logger: ReturnType<typeof createEnvLogger>,
	): void {
		const allResolved: Record<string, Array<{ dependency: string; version: string; source: string }>> = {};

		for (const { field, dependency, source } of originalDeps) {
			const deps = resultPkg[field as keyof PackageJson] as Record<string, string> | undefined;
			if (deps?.[dependency]) {
				if (!allResolved[field]) {
					allResolved[field] = [];
				}
				allResolved[field].push({ dependency, version: deps[dependency], source });
			}
		}

		if (Object.keys(allResolved).length > 0) {
			logger.global.info("Resolved dependencies:");
			for (const [field, deps] of Object.entries(allResolved)) {
				logger.global.info(`- ${field}:`);
				for (const { dependency, version, source } of deps) {
					logger.global.info(`    ${dependency}: ${version} (${source})`);
				}
			}
		}
	}

	/**
	 * Validates that no unresolved catalog: or workspace: references remain.
	 */
	private validateNoUnresolvedReferences(resultPkg: PackageJson, logger: ReturnType<typeof createEnvLogger>): void {
		const unresolvedCatalog = this.collectCatalogDependencies(resultPkg);
		const unresolvedWorkspace = this.collectDependencies(resultPkg, WORKSPACE_PREFIX);
		const unresolvedDeps = [
			...unresolvedCatalog.map((d) => ({ field: d.field, dependency: d.dependency, version: d.version })),
			...unresolvedWorkspace,
		];

		if (unresolvedDeps.length > 0) {
			const catalogRefs = unresolvedDeps.filter((dep) => dep.version.startsWith(CATALOG_PREFIX));
			const workspaceRefs = unresolvedDeps.filter((dep) => dep.version.startsWith(WORKSPACE_PREFIX));

			const refTypes: string[] = [];
			if (catalogRefs.length > 0) refTypes.push(CATALOG_PREFIX);
			if (workspaceRefs.length > 0) refTypes.push(WORKSPACE_PREFIX);

			const error = `Transformation failed: unresolved ${refTypes.join(" and ")} references remain in package.json`;
			logger.error(error);
			logger.error("  -> This would result in invalid package.json being published to npm");
			logger.error("  -> Unresolved dependencies:");

			for (const { field, dependency, version } of unresolvedDeps) {
				logger.error(`    - ${field}.${dependency}: ${version}`);
			}

			throw new Error(error);
		}
	}
}

/**
 * Creates a new WorkspaceCatalog instance.
 *
 * @remarks
 * Factory function for creating WorkspaceCatalog instances.
 * Useful for dependency injection and testing.
 *
 * @returns A new WorkspaceCatalog instance
 * @internal
 */
export function createWorkspaceCatalog(): WorkspaceCatalog {
	return new WorkspaceCatalog();
}
