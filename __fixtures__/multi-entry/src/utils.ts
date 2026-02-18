/**
 * Utility functions for the multi-entry fixture.
 *
 * @packageDocumentation
 */

import type { User } from "./types.js";

// Re-export User type so consumers of this module can see it in the public API
export type { User };

/**
 * Formats a user's full name.
 *
 * @param user - The user object
 * @returns The formatted full name
 *
 * @example
 * ```typescript
 * const user = { firstName: "Jane", lastName: "Smith" };
 * console.log(formatName(user)); // "Jane Smith"
 * ```
 *
 * @public
 */
export function formatName(user: User): string {
	return `${user.firstName} ${user.lastName}`;
}

/**
 * Capitalizes the first letter of a string.
 *
 * @param str - The string to capitalize
 * @returns The capitalized string
 *
 * @public
 */
export function capitalize(str: string): string {
	if (!str) return str;
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Truncates a string to a maximum length.
 *
 * @param str - The string to truncate
 * @param maxLength - Maximum length
 * @returns The truncated string with ellipsis if needed
 *
 * @public
 */
export function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str;
	return `${str.slice(0, maxLength - 3)}...`;
}
