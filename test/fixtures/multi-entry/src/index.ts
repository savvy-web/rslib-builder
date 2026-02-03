/**
 * Main entry point for multi-entry fixture.
 *
 * @packageDocumentation
 */

import type { User } from "./types.js";
import { formatName } from "./utils.js";

/**
 * Greets a user by name.
 *
 * @param user - The user to greet
 * @returns A greeting message
 *
 * @example
 * ```typescript
 * const user = { firstName: "John", lastName: "Doe" };
 * console.log(greet(user)); // "Hello, John Doe!"
 * ```
 *
 * @public
 */
export function greet(user: User): string {
	return `Hello, ${formatName(user)}!`;
}

/**
 * Creates a new user object.
 *
 * @param firstName - The user's first name
 * @param lastName - The user's last name
 * @returns A new User object
 *
 * @public
 */
export function createUser(firstName: string, lastName: string): User {
	return { firstName, lastName };
}

// Re-export types for convenience
export type { User } from "./types.js";
