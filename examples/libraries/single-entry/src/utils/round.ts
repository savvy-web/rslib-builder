/**
 * Rounds a number to a specified number of decimal places.
 *
 * @param value - The number to round
 * @param precision - Number of decimal places (default: 0)
 * @returns The rounded number
 *
 * @internal
 */
export function round(value: number, precision = 0): number {
	const factor = 10 ** precision;
	return Math.round(value * factor) / factor;
}
