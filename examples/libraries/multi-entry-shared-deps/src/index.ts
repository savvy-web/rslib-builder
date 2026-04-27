/**
 * Main entry point.
 *
 * @packageDocumentation
 */

import { formatLabel, nowMs } from "./shared.js";

/**
 * Greet a user with a formatted label.
 *
 * @param name - The user name.
 * @returns The greeting line.
 *
 * @public
 */
export function greet(name: string): string {
	return `${formatLabel("greet")} hello ${name} at ${nowMs()}`;
}
