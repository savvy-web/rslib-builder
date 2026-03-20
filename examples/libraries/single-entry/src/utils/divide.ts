/**
 * Divides the first number by the second.
 *
 * @param a - The dividend
 * @param b - The divisor
 * @returns The quotient
 * @throws {@link Error} when dividing by zero
 *
 * @internal
 */
export function divide(a: number, b: number): number {
	if (b === 0) {
		throw new Error("Cannot divide by zero");
	}
	return a / b;
}
