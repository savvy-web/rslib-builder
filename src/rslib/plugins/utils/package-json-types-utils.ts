import type { PackageJson } from "type-fest";

/**
 * Flexible type definition for package.json exports field that accommodates various export formats.
 *
 * @remarks
 * This type extends the standard PackageJson.Exports to allow for custom fields and nested
 * structures commonly found in complex package configurations. It supports:
 * - Standard exports objects with conditions
 * - Custom field exports
 * - Array-based exports (for fallbacks)
 * - Null/undefined values for conditional exports
 */
export type FlexibleExports = PackageJson.Exports | Record<string, unknown> | FlexibleExports[] | undefined | null;

/**
 * Configuration structure for pnpm workspace files (pnpm-workspace.yaml).
 *
 * @remarks
 * This interface defines the structure of pnpm-workspace.yaml files, which configure
 * workspace behavior including package locations, dependency catalogs, and build options.
 */
export interface PnpmWorkspace {
	/** Array of glob patterns defining workspace package locations */
	packages?: string[];
	/** Centralized dependency version catalog */
	catalog?: Record<string, string>;
	/** Dependencies that should only be built, not installed from registry */
	onlyBuiltDependencies?: string[];
	/** Patterns for dependencies that should be hoisted to workspace root */
	publicHoistPattern?: string[];
}

/**
 * Prefix used by pnpm to reference catalog-defined dependency versions.
 *
 * @remarks
 * Dependencies prefixed with "catalog:" are resolved using the catalog defined in
 * pnpm-workspace.yaml. This allows centralized version management across workspace packages.
 *
 * @example
 * ```json
 * {
 *   "dependencies": {
 *     "react": "catalog:react"
 *   }
 * }
 * ```
 */
export const CATALOG_PREFIX = "catalog:";

/**
 * Prefix used by pnpm to reference workspace package dependencies.
 *
 * @remarks
 * Dependencies prefixed with "workspace:" refer to other packages within the same
 * pnpm workspace. These are resolved to specific versions during publishing.
 *
 * @example
 * ```json
 * {
 *   "dependencies": {
 *     "@myorg/utils": "workspace:^1.0.0"
 *   }
 * }
 * ```
 */
export const WORKSPACE_PREFIX = "workspace:";
