import { add } from "../utils/add.js";
import { divide } from "../utils/divide.js";
import { multiply } from "../utils/multiply.js";
import { round } from "../utils/round.js";
import { subtract } from "../utils/subtract.js";

/**
 * Supported arithmetic operations.
 *
 * @public
 */
export type Operation = "add" | "subtract" | "multiply" | "divide";

/**
 * A single entry in the calculator's history.
 *
 * @public
 */
export interface HistoryEntry {
	/** The operation performed */
	operation: Operation;
	/** The operand used */
	operand: number;
	/** The result after the operation */
	result: number;
}

/**
 * Configuration options for the Calculator.
 *
 * @public
 */
export interface CalculatorOptions {
	/** Number of decimal places for rounding. When undefined, no rounding is applied. */
	precision?: number | undefined;
	/** Initial value for the calculator. Default: `0` */
	initialValue?: number | undefined;
}

/**
 * A simple calculator with chaining support and operation history.
 *
 * @example
 * ```typescript
 * const calc = new Calculator({ precision: 2 });
 * const result = calc
 *   .add(10)
 *   .multiply(3)
 *   .subtract(5)
 *   .value;
 * console.log(result); // 25
 * ```
 *
 * @public
 */
export class Calculator {
	private current: number;
	private readonly precision: number | undefined;
	private readonly entries: HistoryEntry[] = [];

	constructor(options: CalculatorOptions = {}) {
		this.current = options.initialValue ?? 0;
		this.precision = options.precision;
	}

	/** The current value. */
	get value(): number {
		return this.applyPrecision(this.current);
	}

	/** A copy of the operation history. */
	get history(): readonly HistoryEntry[] {
		return [...this.entries];
	}

	/**
	 * Adds a number to the current value.
	 *
	 * @param n - The number to add
	 * @returns This calculator instance for chaining
	 *
	 * @public
	 */
	add(n: number): this {
		this.current = add(this.current, n);
		this.record("add", n);
		return this;
	}

	/**
	 * Subtracts a number from the current value.
	 *
	 * @param n - The number to subtract
	 * @returns This calculator instance for chaining
	 *
	 * @public
	 */
	subtract(n: number): this {
		this.current = subtract(this.current, n);
		this.record("subtract", n);
		return this;
	}

	/**
	 * Multiplies the current value by a number.
	 *
	 * @param n - The multiplier
	 * @returns This calculator instance for chaining
	 *
	 * @public
	 */
	multiply(n: number): this {
		this.current = multiply(this.current, n);
		this.record("multiply", n);
		return this;
	}

	/**
	 * Divides the current value by a number.
	 *
	 * @param n - The divisor
	 * @returns This calculator instance for chaining
	 * @throws {@link Error} when dividing by zero
	 *
	 * @public
	 */
	divide(n: number): this {
		this.current = divide(this.current, n);
		this.record("divide", n);
		return this;
	}

	/**
	 * Resets the calculator to its initial state.
	 *
	 * @returns This calculator instance for chaining
	 *
	 * @public
	 */
	reset(): this {
		this.current = 0;
		this.entries.length = 0;
		return this;
	}

	private record(operation: Operation, operand: number): void {
		this.entries.push({
			operation,
			operand,
			result: this.applyPrecision(this.current),
		});
	}

	private applyPrecision(value: number): number {
		if (this.precision === undefined) {
			return value;
		}
		return round(value, this.precision);
	}
}
