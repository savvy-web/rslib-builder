import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { debugLogger } from "#utils/debug-utils.js";

// Mock console.log to capture output
const mockConsoleLog: MockInstance = vi.spyOn(console, "log").mockImplementation(() => {});

describe("debugLogger", () => {
	beforeEach(() => {
		mockConsoleLog.mockClear();
	});

	it("should log simple objects with inspect", () => {
		const testObj = { name: "test", value: 42 };
		debugLogger(testObj);

		expect(mockConsoleLog).toHaveBeenCalledOnce();
		const loggedOutput = mockConsoleLog.mock.calls[0][0];
		expect(loggedOutput).toContain("name");
		expect(loggedOutput).toContain("test");
		expect(loggedOutput).toContain("value");
		expect(loggedOutput).toContain("42");
	});

	it("should log arrays with inspect", () => {
		const testArray = [1, 2, 3];
		debugLogger(testArray);

		expect(mockConsoleLog).toHaveBeenCalledOnce();
		const loggedOutput = mockConsoleLog.mock.calls[0][0];
		expect(loggedOutput).toContain("1");
		expect(loggedOutput).toContain("2");
		expect(loggedOutput).toContain("3");
	});

	it("should log primitive values", () => {
		debugLogger("hello world");
		expect(mockConsoleLog).toHaveBeenCalledOnce();
		const loggedOutput = mockConsoleLog.mock.calls[0][0];
		expect(loggedOutput).toContain("hello world");

		mockConsoleLog.mockClear();
		debugLogger(42);
		expect(mockConsoleLog).toHaveBeenCalledOnce();
		const loggedNumber = mockConsoleLog.mock.calls[0][0];
		expect(loggedNumber).toContain("42");

		mockConsoleLog.mockClear();
		debugLogger(true);
		expect(mockConsoleLog).toHaveBeenCalledOnce();
		const loggedBoolean = mockConsoleLog.mock.calls[0][0];
		expect(loggedBoolean).toContain("true");
	});

	it("should log null and undefined", () => {
		debugLogger(null);
		expect(mockConsoleLog).toHaveBeenCalledOnce();
		const loggedNull = mockConsoleLog.mock.calls[0][0];
		expect(loggedNull).toContain("null");

		mockConsoleLog.mockClear();
		debugLogger(undefined);
		expect(mockConsoleLog).toHaveBeenCalledOnce();
		const loggedUndefined = mockConsoleLog.mock.calls[0][0];
		expect(loggedUndefined).toContain("undefined");
	});

	it("should log nested objects with full depth", () => {
		const nestedObj = {
			level1: {
				level2: {
					level3: {
						value: "deep",
					},
				},
			},
		};
		debugLogger(nestedObj);

		expect(mockConsoleLog).toHaveBeenCalledOnce();
		const loggedOutput = mockConsoleLog.mock.calls[0][0];
		expect(loggedOutput).toContain("level1");
		expect(loggedOutput).toContain("level2");
		expect(loggedOutput).toContain("level3");
		expect(loggedOutput).toContain("deep");
	});
});
