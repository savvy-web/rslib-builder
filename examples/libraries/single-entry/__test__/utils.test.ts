import { describe, expect, it } from "vitest";
import { add } from "../src/utils/add.js";
import { divide } from "../src/utils/divide.js";
import { multiply } from "../src/utils/multiply.js";
import { round } from "../src/utils/round.js";
import { subtract } from "../src/utils/subtract.js";

describe("add", () => {
	it("should add two positive numbers", () => {
		expect(add(2, 3)).toBe(5);
	});

	it("should handle zero", () => {
		expect(add(5, 0)).toBe(5);
	});

	it("should handle negatives", () => {
		expect(add(-1, -2)).toBe(-3);
	});
});

describe("subtract", () => {
	it("should subtract two numbers", () => {
		expect(subtract(10, 3)).toBe(7);
	});

	it("should return negative when b > a", () => {
		expect(subtract(3, 10)).toBe(-7);
	});
});

describe("multiply", () => {
	it("should multiply two numbers", () => {
		expect(multiply(4, 5)).toBe(20);
	});

	it("should return zero when either operand is zero", () => {
		expect(multiply(100, 0)).toBe(0);
	});
});

describe("divide", () => {
	it("should divide two numbers", () => {
		expect(divide(10, 2)).toBe(5);
	});

	it("should handle decimal results", () => {
		expect(divide(1, 3)).toBeCloseTo(1 / 3);
	});

	it("should throw on division by zero", () => {
		expect(() => divide(1, 0)).toThrow("Cannot divide by zero");
	});
});

describe("round", () => {
	it("should round to 0 decimal places by default", () => {
		expect(round(3.7)).toBe(4);
	});

	it("should round to specified precision", () => {
		expect(round(3.456, 2)).toBe(3.46);
	});

	it("should handle negative numbers", () => {
		expect(round(-2.567, 1)).toBe(-2.6);
	});

	it("should return integers unchanged at precision 0", () => {
		expect(round(5, 0)).toBe(5);
	});
});
