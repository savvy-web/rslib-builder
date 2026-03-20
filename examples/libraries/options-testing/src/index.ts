/**
 * Main entry point with valid TSDoc comments.
 *
 * @remarks
 * This module provides example functions for testing NodeLibraryBuilder options.
 *
 * @packageDocumentation
 */

/**
 * Greets a user by name.
 *
 * @param name - The name of the user to greet
 * @returns A greeting message
 *
 * @example
 * ```typescript
 * const message = greet("World");
 * console.log(message); // "Hello, World!"
 * ```
 *
 * @public
 */
export function greet(name: string): string {
	return `Hello, ${name}!`;
}

/**
 * Adds two numbers together.
 *
 * @param a - The first number
 * @param b - The second number
 * @returns The sum of a and b
 *
 * @public
 */
export function add(a: number, b: number): number {
	return a + b;
}

// Re-export types for consumers
export type { Status, UserConfig } from "./types.js";
