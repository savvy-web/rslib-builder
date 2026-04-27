/**
 * Shared internal module imported by multiple entry points.
 *
 * @remarks
 * This module is what triggers rslib's chunk-extraction logic — without
 * a shared module, no anonymous chunk would be emitted regardless of
 * the runtime-chunk setting.
 *
 * @packageDocumentation
 */

/**
 * Shared formatting helper.
 *
 * @public
 */
export function formatLabel(label: string): string {
	return `[${label.toUpperCase()}]`;
}

/**
 * Shared timestamp helper.
 *
 * @public
 */
export function nowMs(): number {
	return Date.now();
}
