/**
 * Type definitions for the options-testing fixture.
 *
 * @packageDocumentation
 */

/**
 * Configuration options for a user.
 *
 * @public
 */
export interface UserConfig {
	/** The user's display name */
	name: string;
	/** Whether the user is active */
	active?: boolean;
	/** User roles */
	roles?: string[];
}

/**
 * Status of an operation.
 *
 * @public
 */
export type Status = "pending" | "active" | "completed" | "failed";

/**
 * Result of an operation.
 *
 * @typeParam T - The type of data returned on success
 *
 * @public
 */
export interface Result<T> {
	/** Whether the operation succeeded */
	success: boolean;
	/** The result data (only present on success) */
	data?: T;
	/** Error message (only present on failure) */
	error?: string;
}
