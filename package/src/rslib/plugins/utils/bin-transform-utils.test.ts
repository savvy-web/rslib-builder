import { describe, expect, it } from "vitest";
import type { PackageJson } from "../../../types/package-json.js";
import { applyFormatPrefixToBin, normalizeBinPaths, transformPackageBin } from "./package-json-transformer.js";

describe("bin-transform-utils", () => {
	describe("transformPackageBin", () => {
		it("should transform string bin field", () => {
			const result = transformPackageBin("./src/cli.ts");
			// Single TypeScript bin entry compiles to bin/cli.js (npm 11.x rejects leading ./)
			expect(result).toBe("bin/cli.js");
		});

		it("should transform object bin field", () => {
			const result = transformPackageBin({
				"my-cli": "./src/cli.ts",
				"my-tool": "./src/tool.ts",
			});
			// TypeScript bin entries are compiled to bin/{command}.js
			expect(result).toEqual({
				"my-cli": "bin/my-cli.js",
				"my-tool": "bin/my-tool.js",
			});
		});

		it("should handle bin field with undefined values", () => {
			const bin = {
				"my-cli": "./src/cli.ts",
				"my-tool": undefined,
			};

			const result = transformPackageBin(bin);

			expect(result).toEqual({
				"my-cli": "bin/my-cli.js",
			});
		});

		it("should strip leading ./ from preserved non-TypeScript bin entries", () => {
			const result = transformPackageBin({
				"my-cli": "./scripts/cli.sh",
				"my-tool": "./dist/tool.js",
			});
			// Non-TypeScript entries preserve path content but strip ./ for npm 11.x
			expect(result).toEqual({
				"my-cli": "scripts/cli.sh",
				"my-tool": "dist/tool.js",
			});
		});

		it("should strip leading ./ from string bin field with non-TypeScript file", () => {
			const result = transformPackageBin("./scripts/cli.sh");
			expect(result).toBe("scripts/cli.sh");
		});

		it("should strip leading ./ from string bin field with shell script", () => {
			const result = transformPackageBin("./bin/start.sh");
			expect(result).toBe("bin/start.sh");
		});

		it("should handle null/undefined bin field", () => {
			expect(transformPackageBin(null as unknown as PackageJson["bin"])).toBeNull();
			expect(transformPackageBin(undefined)).toBeUndefined();
		});

		it("should transform bin/ prefix TypeScript to bin/{command}.js", () => {
			const result = transformPackageBin("./bin/cli.ts");
			expect(result).toBe("bin/cli.js");
		});
	});

	describe("applyFormatPrefixToBin", () => {
		it("should prefix string bin path with ESM format directory", () => {
			const result = applyFormatPrefixToBin("./bin/cli.js", "esm");
			expect(result).toBe("esm/bin/cli.js");
		});

		it("should prefix object bin paths with ESM format directory", () => {
			const result = applyFormatPrefixToBin(
				{
					"my-cli": "./bin/my-cli.js",
					"my-tool": "./bin/my-tool.js",
				},
				"esm",
			);
			expect(result).toEqual({
				"my-cli": "esm/bin/my-cli.js",
				"my-tool": "esm/bin/my-tool.js",
			});
		});

		it("should preserve non-JS bin paths (stripped of ./)", () => {
			const result = applyFormatPrefixToBin(
				{
					"my-cli": "./bin/my-cli.js",
					"my-script": "./scripts/run.sh",
				},
				"esm",
			);
			expect(result).toEqual({
				"my-cli": "esm/bin/my-cli.js",
				"my-script": "scripts/run.sh",
			});
		});

		it("should preserve non-JS string bin path (stripped of ./)", () => {
			const result = applyFormatPrefixToBin("./scripts/run.sh", "esm");
			expect(result).toBe("scripts/run.sh");
		});

		it("should return null/undefined unchanged", () => {
			expect(applyFormatPrefixToBin(null as unknown as PackageJson["bin"], "esm")).toBeNull();
			expect(applyFormatPrefixToBin(undefined, "esm")).toBeUndefined();
		});

		it("should work with CJS format prefix", () => {
			const result = applyFormatPrefixToBin("./bin/cli.js", "cjs");
			expect(result).toBe("cjs/bin/cli.js");
		});
	});

	describe("normalizeBinPaths", () => {
		it("should strip leading ./ from string bin", () => {
			expect(normalizeBinPaths("./bin/cli.js")).toBe("bin/cli.js");
		});

		it("should leave string bin without ./ unchanged", () => {
			expect(normalizeBinPaths("bin/cli.js")).toBe("bin/cli.js");
		});

		it("should strip leading ./ from object bin values", () => {
			expect(
				normalizeBinPaths({
					"my-cli": "./bin/my-cli.js",
					"my-tool": "bin/my-tool.js",
				}),
			).toEqual({
				"my-cli": "bin/my-cli.js",
				"my-tool": "bin/my-tool.js",
			});
		});

		it("should preserve undefined values inside object bin (passes them through)", () => {
			expect(
				normalizeBinPaths({
					"my-cli": "./bin/my-cli.js",
					"my-tool": undefined,
				}),
			).toEqual({
				"my-cli": "bin/my-cli.js",
				"my-tool": undefined,
			});
		});

		it("should return null/undefined unchanged", () => {
			expect(normalizeBinPaths(null as unknown as PackageJson["bin"])).toBeNull();
			expect(normalizeBinPaths(undefined)).toBeUndefined();
		});
	});
});
