import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NodeEcmaLib, transformStringsDeep } from "./index.js";

describe("transformStringsDeep", () => {
	const toUpper = (s: string): string => s.toUpperCase();

	it("should return null unchanged", () => {
		expect(transformStringsDeep(null, toUpper)).toBeNull();
	});

	it("should return undefined unchanged", () => {
		expect(transformStringsDeep(undefined, toUpper)).toBeUndefined();
	});

	it("should transform a string value", () => {
		expect(transformStringsDeep("hello", toUpper)).toBe("HELLO");
	});

	it("should return numbers unchanged", () => {
		expect(transformStringsDeep(42, toUpper)).toBe(42);
	});

	it("should return booleans unchanged", () => {
		expect(transformStringsDeep(true, toUpper)).toBe(true);
		expect(transformStringsDeep(false, toUpper)).toBe(false);
	});

	it("should transform strings in a flat object", () => {
		const input = { name: "alice", age: 30 };
		const result = transformStringsDeep(input, toUpper);
		expect(result).toEqual({ name: "ALICE", age: 30 });
	});

	it("should transform strings in an array", () => {
		const input = ["hello", "world"];
		const result = transformStringsDeep(input, toUpper);
		expect(result).toEqual(["HELLO", "WORLD"]);
	});

	it("should transform strings in a mixed array", () => {
		const input = ["hello", 42, true, null];
		const result = transformStringsDeep(input, toUpper);
		expect(result).toEqual(["HELLO", 42, true, null]);
	});

	it("should transform strings deeply in nested objects", () => {
		const input = {
			level1: {
				level2: {
					value: "deep",
				},
				name: "shallow",
			},
			count: 5,
		};
		const result = transformStringsDeep(input, toUpper);
		expect(result).toEqual({
			level1: {
				level2: {
					value: "DEEP",
				},
				name: "SHALLOW",
			},
			count: 5,
		});
	});

	it("should transform strings in nested arrays within objects", () => {
		const input = {
			tags: ["alpha", "beta"],
			nested: { items: ["one", "two"] },
		};
		const result = transformStringsDeep(input, toUpper);
		expect(result).toEqual({
			tags: ["ALPHA", "BETA"],
			nested: { items: ["ONE", "TWO"] },
		});
	});

	it("should transform strings in arrays containing objects", () => {
		const input = [{ name: "alice" }, { name: "bob" }];
		const result = transformStringsDeep(input, toUpper);
		expect(result).toEqual([{ name: "ALICE" }, { name: "BOB" }]);
	});

	it("should apply a path replacement transform", () => {
		const input = {
			compilerOptions: {
				outDir: "/original/path/dist",
				lib: ["/original/path/lib.d.ts"],
			},
		};
		const result = transformStringsDeep(input, (s) => s.replace("/original/path", "/new/path"));
		expect(result).toEqual({
			compilerOptions: {
				outDir: "/new/path/dist",
				lib: ["/new/path/lib.d.ts"],
			},
		});
	});
});

describe("LibraryTSConfigFile.writeBundleTempConfig", () => {
	function readTempConfig(path: string): Record<string, unknown> {
		return JSON.parse(readFileSync(path, "utf-8"));
	}

	it("should default types to ['node'] when no types provided", () => {
		const tempPath = NodeEcmaLib.writeBundleTempConfig("npm");
		const config = readTempConfig(tempPath);
		const compilerOptions = config.compilerOptions as Record<string, unknown>;
		expect(compilerOptions.types).toEqual(["node"]);
	});

	it("should forward provided types to the temp config", () => {
		const tempPath = NodeEcmaLib.writeBundleTempConfig("npm", { types: ["node", "jest"] });
		const config = readTempConfig(tempPath);
		const compilerOptions = config.compilerOptions as Record<string, unknown>;
		expect(compilerOptions.types).toEqual(["node", "jest"]);
	});

	it("should use default types when options object is provided without types", () => {
		const tempPath = NodeEcmaLib.writeBundleTempConfig("npm", {});
		const config = readTempConfig(tempPath);
		const compilerOptions = config.compilerOptions as Record<string, unknown>;
		expect(compilerOptions.types).toEqual(["node"]);
	});
});
