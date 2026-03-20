import { describe, expect, it } from "vitest";
import { Calculator } from "../src/lib/calculator.js";

describe("Calculator", () => {
	describe("constructor", () => {
		it("should start at 0 by default", () => {
			const calc = new Calculator();
			expect(calc.value).toBe(0);
		});

		it("should accept an initial value", () => {
			const calc = new Calculator({ initialValue: 10 });
			expect(calc.value).toBe(10);
		});
	});

	describe("add", () => {
		it("should add a number", () => {
			const calc = new Calculator();
			calc.add(5);
			expect(calc.value).toBe(5);
		});

		it("should handle negative numbers", () => {
			const calc = new Calculator();
			calc.add(-3);
			expect(calc.value).toBe(-3);
		});
	});

	describe("subtract", () => {
		it("should subtract a number", () => {
			const calc = new Calculator({ initialValue: 10 });
			calc.subtract(3);
			expect(calc.value).toBe(7);
		});
	});

	describe("multiply", () => {
		it("should multiply by a number", () => {
			const calc = new Calculator({ initialValue: 4 });
			calc.multiply(3);
			expect(calc.value).toBe(12);
		});

		it("should handle multiplication by zero", () => {
			const calc = new Calculator({ initialValue: 99 });
			calc.multiply(0);
			expect(calc.value).toBe(0);
		});
	});

	describe("divide", () => {
		it("should divide by a number", () => {
			const calc = new Calculator({ initialValue: 10 });
			calc.divide(2);
			expect(calc.value).toBe(5);
		});

		it("should throw on division by zero", () => {
			const calc = new Calculator({ initialValue: 10 });
			expect(() => calc.divide(0)).toThrow("Cannot divide by zero");
		});
	});

	describe("chaining", () => {
		it("should support method chaining", () => {
			const result = new Calculator().add(10).multiply(3).subtract(5).divide(5).value;
			expect(result).toBe(5);
		});
	});

	describe("precision", () => {
		it("should round to specified decimal places", () => {
			const calc = new Calculator({ precision: 2 });
			calc.add(1).divide(3);
			expect(calc.value).toBe(0.33);
		});

		it("should not round when precision is undefined", () => {
			const calc = new Calculator();
			calc.add(1).divide(3);
			expect(calc.value).toBeCloseTo(1 / 3);
		});
	});

	describe("history", () => {
		it("should track operations", () => {
			const calc = new Calculator();
			calc.add(5).multiply(2);

			expect(calc.history).toEqual([
				{ operation: "add", operand: 5, result: 5 },
				{ operation: "multiply", operand: 2, result: 10 },
			]);
		});

		it("should return a copy (not a reference)", () => {
			const calc = new Calculator();
			calc.add(1);
			const history = calc.history;
			calc.add(2);
			expect(history).toHaveLength(1);
			expect(calc.history).toHaveLength(2);
		});

		it("should clear on reset", () => {
			const calc = new Calculator();
			calc.add(5).multiply(2).reset();
			expect(calc.history).toHaveLength(0);
			expect(calc.value).toBe(0);
		});
	});

	describe("reset", () => {
		it("should reset value to 0", () => {
			const calc = new Calculator({ initialValue: 100 });
			calc.add(50).reset();
			expect(calc.value).toBe(0);
		});

		it("should allow chaining after reset", () => {
			const result = new Calculator().add(100).reset().add(5).value;
			expect(result).toBe(5);
		});
	});
});
