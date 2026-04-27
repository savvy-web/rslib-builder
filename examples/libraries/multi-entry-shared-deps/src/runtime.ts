/**
 * Runtime entry point.
 *
 * @packageDocumentation
 */

import { formatLabel, nowMs } from "./shared.js";

/**
 * Log a runtime event.
 *
 * @param event - The event name.
 * @returns The formatted log line.
 *
 * @public
 */
export function logEvent(event: string): string {
	return `${formatLabel("runtime")} ${event} @ ${nowMs()}`;
}
