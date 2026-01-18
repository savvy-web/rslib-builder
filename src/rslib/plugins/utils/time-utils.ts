/**
 * Formats elapsed time in milliseconds to a human-readable string with appropriate units.
 *
 * @remarks
 * This utility function formats time durations consistently with RSLib's output format.
 * It automatically chooses the most appropriate unit (milliseconds or seconds) based
 * on the magnitude of the input value.
 *
 * **Formatting Rules:**
 * - Values less than 1000ms are displayed as milliseconds (e.g., "250ms")
 * - Values 1000ms and above are displayed as seconds with 2 decimal places (e.g., "1.25s")
 *
 * @param ms - The time duration in milliseconds to format
 * @returns A formatted string representation of the time duration
 *
 * @example
 * ```typescript
 * console.log(formatTime(150));    // "150ms"
 * console.log(formatTime(999));    // "999ms"
 * console.log(formatTime(1000));   // "1.00s"
 * console.log(formatTime(1250));   // "1.25s"
 * console.log(formatTime(45000));  // "45.00s"
 * ```
 *
 * @see {@link createTimer} for measuring execution time that can be formatted with this function
 */
export const formatTime = (ms: number): string => {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	return `${(ms / 1000).toFixed(2)}s`;
};

/**
 * Creates a high-precision timer for measuring execution time and performance monitoring.
 *
 * @remarks
 * This function creates a timer object that captures the current timestamp and provides
 * methods to measure elapsed time. The timer uses `Date.now()` for millisecond precision
 * and is ideal for performance monitoring in build processes and plugin execution.
 *
 * The returned timer object provides two methods:
 * - `elapsed()`: Returns raw milliseconds for calculations or comparisons
 * - `format()`: Returns a formatted string suitable for user-facing output
 *
 * @returns A timer object with methods to measure and format elapsed time
 * @returns timer.elapsed - Function that returns elapsed time in milliseconds
 * @returns timer.format - Function that returns formatted elapsed time string
 *
 * @example
 * ```typescript
 * // Basic usage for performance monitoring
 * const timer = createTimer();
 *
 * // Simulate some work
 * await someAsyncOperation();
 *
 * console.log(`Operation took: ${timer.format()}`);
 * // Output: "Operation took: 1.25s"
 *
 * console.log(`Raw milliseconds: ${timer.elapsed()}`);
 * // Output: "Raw milliseconds: 1250"
 * ```
 *
 * @example
 * ```typescript
 * // Using in build processes
 * const buildTimer = createTimer();
 *
 * await buildProject();
 *
 * const elapsed = buildTimer.elapsed();
 * if (elapsed > 10000) {
 *   console.warn(`Build took longer than expected: ${buildTimer.format()}`);
 * } else {
 *   console.log(`Build completed in ${buildTimer.format()}`);
 * }
 * ```
 *
 * @see {@link formatTime} for the formatting function used internally
 */
export const createTimer = (): {
	elapsed: () => number;
	format: () => string;
} => {
	const start = Date.now();
	return {
		elapsed: () => Date.now() - start,
		format: () => formatTime(Date.now() - start),
	};
};
