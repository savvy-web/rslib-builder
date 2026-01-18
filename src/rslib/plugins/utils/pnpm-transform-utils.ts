import { createExportableManifest } from "@pnpm/exportable-manifest";
import type { ProjectManifest } from "@pnpm/types";
import type { PackageJson } from "type-fest";
import { createEnvLogger } from "#utils/logger-utils.js";
import { CATALOG_PREFIX, WORKSPACE_PREFIX } from "#utils/package-json-types-utils.js";
import { getCatalog } from "#utils/pnpm-catalog-utils.js";

/**
 * Applies pnpm-specific transformations to package.json for publishing compatibility.
 *
 * @remarks
 * This function performs the first stage of package.json transformation by leveraging
 * pnpm's exportable-manifest utility. It handles critical pnpm-specific features that
 * need to be resolved before publishing to npm:
 *
 * **Key Transformations:**
 * - **Catalog Resolution**: Resolves `catalog:` dependency references to actual versions
 * - **Workspace Resolution**: Resolves `workspace:` dependency references to published versions
 * - **PublishConfig Processing**: Applies publishConfig overrides for publication
 * - **Dependency Validation**: Ensures no unresolved references remain
 *
 * **Error Handling:**
 * The function validates that all pnpm-specific references are properly resolved, as
 * unresolved references would result in invalid package.json files being published to npm.
 *
 * @param packageJson - The source package.json to transform
 * @param dir - The directory containing the package (defaults to current working directory)
 * @returns Promise resolving to the transformed package.json
 * @throws {Error} When catalog/workspace resolution fails or unresolved references remain
 *
 * @example
 * ```typescript
 * const originalPkg = {
 *   name: "my-package",
 *   dependencies: {
 *     "react": "catalog:react",
 *     "@myorg/utils": "workspace:^1.0.0"
 *   }
 * };
 *
 * const transformed = await applyPnpmTransformations(originalPkg);
 * console.log(transformed.dependencies);
 * // {
 * //   "react": "^18.2.0",
 * //   "@myorg/utils": "^1.2.3"
 * // }
 * ```
 *
 * @see {@link applyRslibTransformations} for the second stage of transformations
 * @see {@link buildPackageJson} for the complete transformation pipeline
 */
export async function applyPnpmTransformations(
	packageJson: PackageJson,
	dir: string = process.cwd(),
): Promise<PackageJson> {
	const logger = createEnvLogger("pnpm");

	try {
		const catalog = await getCatalog();

		// Check if we have catalog or workspace dependencies that need resolution
		// Use targeted detection to avoid false positives from other fields like description, URL, etc.
		const catalogDeps: Array<{ field: string; dependency: string; version: string }> = [];
		const workspaceDeps: Array<{ field: string; dependency: string; version: string }> = [];

		["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].forEach((field) => {
			const deps = packageJson[field as keyof PackageJson] as Record<string, string> | undefined;
			if (deps) {
				Object.entries(deps).forEach(([dependency, version]) => {
					if (typeof version === "string") {
						if (version.startsWith(CATALOG_PREFIX)) {
							catalogDeps.push({ field, dependency, version });
						} else if (version.startsWith(WORKSPACE_PREFIX)) {
							workspaceDeps.push({ field, dependency, version });
						}
					}
				});
			}
		});

		const hasCatalogDeps = catalogDeps.length > 0;
		const hasWorkspaceDeps = workspaceDeps.length > 0;

		// For production npm packages, catalog/workspace dependencies must be resolved
		// If we have them but no catalog, this is a critical error that should not be ignored
		if (hasCatalogDeps && Object.keys(catalog).length === 0) {
			const error = `Package contains ${CATALOG_PREFIX} dependencies but catalog configuration is missing`;
			logger.error(error);
			logger.error("  → Catalog dependencies found:");
			catalogDeps.forEach(({ field, dependency, version }) => {
				logger.error(`    - ${field}.${dependency}: ${version}`);
			});
			throw new Error(error);
		}

		// Pre-transformation: Just log that we're resolving them (simplified)
		if (hasCatalogDeps) {
			logger.info(`Resolving ${catalogDeps.length} ${CATALOG_PREFIX} dependencies`);
		}
		if (hasWorkspaceDeps) {
			logger.info(`Resolving ${workspaceDeps.length} ${WORKSPACE_PREFIX} dependencies`);
		}

		const result = await createExportableManifest(dir, packageJson as ProjectManifest, {
			catalogs: { default: catalog },
			// Don't include readme by default - can be added if needed
		});

		// After resolution, log what they were resolved to in a prettier format
		if (hasCatalogDeps || hasWorkspaceDeps) {
			const resultPkg = result as PackageJson;
			const allResolved: Record<string, Array<{ dependency: string; version: string }>> = {};

			// Collect all resolved dependencies by field
			[...catalogDeps, ...workspaceDeps].forEach(({ field, dependency }) => {
				const deps = resultPkg[field as keyof PackageJson] as Record<string, string> | undefined;
				if (deps?.[dependency]) {
					if (!allResolved[field]) allResolved[field] = [];
					allResolved[field].push({ dependency, version: deps[dependency] });
				}
			});

			if (Object.keys(allResolved).length > 0) {
				logger.info("Resolved dependencies:");
				Object.entries(allResolved).forEach(([field, deps]) => {
					logger.info(`- ${field}:`);
					deps.forEach(({ dependency, version }) => {
						logger.info(`    ${dependency}: ${version}`);
					});
				});
			}
		}

		// Validate that no unresolved references remain after transformation
		// Use targeted detection to avoid false positives from other fields like description, URL, etc.
		const resultAsPackageJson = result as PackageJson;
		const unresolvedDependencies: Array<{ field: string; dependency: string; version: string }> = [];

		// Collect all unresolved dependencies with detailed information
		["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].forEach((field) => {
			const deps = resultAsPackageJson[field as keyof PackageJson] as Record<string, string> | undefined;
			if (deps) {
				Object.entries(deps).forEach(([dependency, version]) => {
					if (
						typeof version === "string" &&
						(version.startsWith(CATALOG_PREFIX) || version.startsWith(WORKSPACE_PREFIX))
					) {
						unresolvedDependencies.push({ field, dependency, version });
					}
				});
			}
		});

		if (unresolvedDependencies.length > 0) {
			// Group by reference type for better error reporting
			const catalogRefs = unresolvedDependencies.filter((dep) => dep.version.startsWith(CATALOG_PREFIX));
			const workspaceRefs = unresolvedDependencies.filter((dep) => dep.version.startsWith(WORKSPACE_PREFIX));

			const refTypes = [];
			if (catalogRefs.length > 0) refTypes.push(CATALOG_PREFIX);
			if (workspaceRefs.length > 0) refTypes.push(WORKSPACE_PREFIX);

			const error = `Transformation failed: unresolved ${refTypes.join(" and ")} references remain in package.json`;
			logger.error(error);
			logger.error("  → This would result in invalid package.json being published to npm");

			// Log specific unresolved dependencies for debugging
			logger.error("  → Unresolved dependencies:");
			unresolvedDependencies.forEach(({ field, dependency, version }) => {
				logger.error(`    - ${field}.${dependency}: ${version}`);
			});

			throw new Error(error);
		}

		return result as PackageJson;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Re-throw specific validation errors as-is to preserve detailed information
		if (
			errorMessage.startsWith("Transformation failed:") ||
			errorMessage.includes(`Package contains ${CATALOG_PREFIX} dependencies`)
		) {
			throw error;
		}

		logger.error(`Failed to apply pnpm transformations for directory ${dir}: ${errorMessage}`);

		// Provide specific error information and throw for critical issues
		if (errorMessage.includes("catalog")) {
			logger.error(`  → Catalog resolution failed - check workspace configuration and ${CATALOG_PREFIX} dependencies`);
			// Critical: Always throw for catalog errors - these must not be ignored in production
			throw new Error("Catalog resolution failed");
		} else if (errorMessage.includes("workspace")) {
			logger.error(`  → Workspace resolution failed - check ${WORKSPACE_PREFIX} dependencies and configuration`);
			// Critical: Always throw for workspace errors - these must not be ignored in production
			throw new Error("Workspace resolution failed");
		} else if (errorMessage.includes("manifest")) {
			logger.error("  → Manifest processing failed - check package.json syntax");
			// Critical: Manifest errors indicate serious issues
			throw new Error(`Manifest processing failed: ${errorMessage}`);
		} else {
			// For other errors, throw to ensure we don't silently continue with broken state
			logger.error("  → Cannot proceed with invalid package.json transformations");
			throw new Error(`PNPM transformation failed: ${errorMessage}`);
		}
	}
}
