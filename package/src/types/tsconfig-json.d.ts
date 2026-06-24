import type { TsConfigJson } from "type-fest";

/**
 * Base tsconfig.json shape, re-exported from type-fest so it carries a release
 * tag in the rolled-up declarations.
 *
 * @internal
 */
export type TsConfigJsonBase = TsConfigJson;

/**
 * TypeScript configuration with JSON schema support.
 *
 * @remarks
 * Extends type-fest's TsConfigJson to include the $schema property
 * for JSON schema validation in editors.
 *
 * @internal
 */
export interface TSConfigJsonWithSchema extends TsConfigJsonBase {
	/**
	 * JSON schema URL for tsconfig.json validation.
	 *
	 * @example
	 * "https://json.schemastore.org/tsconfig.json"
	 */
	$schema?: string;
}
