/**
 * Type definitions for the multi-entry fixture.
 *
 * @packageDocumentation
 */

/**
 * Represents a user in the system.
 *
 * @public
 */
export interface User {
	/** The user's first name */
	firstName: string;

	/** The user's last name */
	lastName: string;

	/** Optional email address */
	email?: string;
}

/**
 * Status of an operation.
 *
 * @public
 */
export type Status = "pending" | "active" | "completed" | "failed";

/**
 * Result of an async operation.
 *
 * @typeParam T - The type of the result data
 *
 * @public
 */
export interface Result<T> {
	/** Whether the operation succeeded */
	success: boolean;

	/** The result data (if successful) */
	data?: T;

	/** Error message (if failed) */
	error?: string;
}

/**
 * Configuration options.
 *
 * @public
 */
export interface Config {
	/** Enable debug mode */
	debug?: boolean;

	/** API endpoint URL */
	apiUrl?: string;

	/** Request timeout in milliseconds */
	timeout?: number;
}
