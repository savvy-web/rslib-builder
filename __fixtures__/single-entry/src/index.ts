/**
 * Adds two numbers together.
 *
 * @param a - The first number
 * @param b - The second number
 * @returns The sum of a and b
 *
 * @example
 * ```typescript
 * const result = add(2, 3);
 * console.log(result); // 5
 * ```
 *
 * @public
 */
export function add(a: number, b: number): number {
	return a + b;
}

/**
 * Subtracts the second number from the first.
 *
 * @param a - The number to subtract from
 * @param b - The number to subtract
 * @returns The difference
 *
 * @public
 */
export function subtract(a: number, b: number): number {
	return a - b;
}

/**
 * Configuration options for the calculator.
 *
 * @public
 */
export interface CalculatorOptions {
	/** Precision for decimal operations */
	precision?: number;
	/** Whether to round results */
	round?: boolean;
}
