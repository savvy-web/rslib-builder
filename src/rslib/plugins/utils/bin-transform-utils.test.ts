import type { PackageJson } from "type-fest";
import { describe, expect, it } from "vitest";
import { transformPackageBin } from "#utils/package-json-transformer.js";

describe("bin-transform-utils", () => {
	describe("transformPackageBin", () => {
		it("should transform string bin field", () => {
			const result = transformPackageBin("./src/cli.ts");
			expect(result).toBe("./cli.js");
		});

		it("should transform object bin field", () => {
			const result = transformPackageBin({
				"my-cli": "./src/cli.ts",
				"my-tool": "./src/tool.ts",
			});
			expect(result).toEqual({
				"my-cli": "./cli.js",
				"my-tool": "./tool.js",
			});
		});

		it("should handle bin field with undefined values", () => {
			const bin = {
				"my-cli": "./src/cli.ts",
				"my-tool": undefined,
			};

			const result = transformPackageBin(bin);

			expect(result).toEqual({
				"my-cli": "./cli.js",
			});
		});

		it("should handle bin field with only non-TypeScript files", () => {
			const result = transformPackageBin({
				"my-cli": "./scripts/cli.sh",
				"my-tool": "./dist/tool.js",
			});
			expect(result).toEqual({
				"my-cli": "./scripts/cli.sh",
				"my-tool": "./dist/tool.js",
			});
		});

		it("should handle string bin field with non-TypeScript file", () => {
			const result = transformPackageBin("./scripts/cli.sh");
			expect(result).toBe("./scripts/cli.sh");
		});

		it("should handle string bin field with shell script", () => {
			const result = transformPackageBin("./bin/start.sh");
			expect(result).toBe("./bin/start.sh");
		});

		it("should not transform when processTSExports is false", () => {
			const result = transformPackageBin("./src/cli.ts", false);
			expect(result).toBe("./cli.ts");
		});

		it("should not transform object bin when processTSExports is false", () => {
			const result = transformPackageBin(
				{
					"my-cli": "./src/cli.ts",
					"my-tool": "./src/tool.ts",
				},
				false,
			);
			expect(result).toEqual({
				"my-cli": "./cli.ts",
				"my-tool": "./tool.ts",
			});
		});

		it("should handle null/undefined bin field", () => {
			expect(transformPackageBin(null as unknown as PackageJson["bin"])).toBeNull();
			expect(transformPackageBin(undefined)).toBeUndefined();
		});

		it("should preserve bin/ prefix", () => {
			const result = transformPackageBin("./bin/cli.ts");
			expect(result).toBe("./bin/cli.js");
		});
	});
});
