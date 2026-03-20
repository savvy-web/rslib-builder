import { describe, expect, it } from "vitest";
import type { PackageJson } from "../../../types/package-json.js";
import {
	addFormatDirPrefix,
	applyFormatConditions,
	buildPackageJson,
	toCjsPath,
	toCtsTypePath,
} from "./package-json-transformer.js";

describe("format condition utilities", () => {
	describe("toCjsPath", () => {
		it("should convert .js to .cjs", () => {
			expect(toCjsPath("./index.js")).toBe("./index.cjs");
		});

		it("should convert nested .js path to .cjs", () => {
			expect(toCjsPath("./utils/helpers.js")).toBe("./utils/helpers.cjs");
		});

		it("should return non-.js paths unchanged", () => {
			expect(toCjsPath("./index.ts")).toBe("./index.ts");
			expect(toCjsPath("./index.mjs")).toBe("./index.mjs");
		});

		it("should handle path without prefix", () => {
			expect(toCjsPath("index.js")).toBe("index.cjs");
		});
	});

	describe("toCtsTypePath", () => {
		it("should convert .d.ts to .d.cts", () => {
			expect(toCtsTypePath("./index.d.ts")).toBe("./index.d.cts");
		});

		it("should convert nested .d.ts path to .d.cts", () => {
			expect(toCtsTypePath("./utils/helpers.d.ts")).toBe("./utils/helpers.d.cts");
		});

		it("should return non-.d.ts paths unchanged", () => {
			expect(toCtsTypePath("./index.ts")).toBe("./index.ts");
			expect(toCtsTypePath("./index.d.mts")).toBe("./index.d.mts");
		});

		it("should handle path without prefix", () => {
			expect(toCtsTypePath("index.d.ts")).toBe("index.d.cts");
		});
	});

	describe("addFormatDirPrefix", () => {
		it("should add esm prefix to ./ path", () => {
			expect(addFormatDirPrefix("./index.js", "esm")).toBe("./esm/index.js");
		});

		it("should add cjs prefix to ./ path", () => {
			expect(addFormatDirPrefix("./index.js", "cjs")).toBe("./cjs/index.js");
		});

		it("should add prefix to path without ./ prefix", () => {
			expect(addFormatDirPrefix("index.js", "esm")).toBe("./esm/index.js");
		});

		it("should handle nested paths", () => {
			expect(addFormatDirPrefix("./utils/helpers.js", "esm")).toBe("./esm/utils/helpers.js");
		});
	});

	describe("applyFormatConditions", () => {
		it("should return non-object exports unchanged", () => {
			expect(applyFormatConditions("./index.js" as unknown as PackageJson.Exports, { format: "esm" })).toBe(
				"./index.js",
			);
		});

		it("should return null/undefined exports unchanged", () => {
			expect(applyFormatConditions(null as unknown as PackageJson.Exports, { format: "esm" })).toBeNull();
			expect(applyFormatConditions(undefined as unknown as PackageJson.Exports, { format: "esm" })).toBeUndefined();
		});

		it("should return array exports unchanged", () => {
			const arr = ["./index.js"] as unknown as PackageJson.Exports;
			expect(applyFormatConditions(arr, { format: "esm" })).toBe(arr);
		});

		it("should keep ESM entries unchanged when format is esm", () => {
			const exports: PackageJson.Exports = {
				".": { types: "./index.d.ts", import: "./index.js" },
			};
			const result = applyFormatConditions(exports, { format: "esm" });
			expect(result).toEqual({
				".": { types: "./index.d.ts", import: "./index.js" },
			});
		});

		describe("per-entry CJS overrides", () => {
			it("should convert specific entry to CJS conditions", () => {
				const exports: PackageJson.Exports = {
					".": { types: "./index.d.ts", import: "./index.js" },
					"./markdownlint": { types: "./markdownlint.d.ts", import: "./markdownlint.js" },
				};
				const result = applyFormatConditions(exports, {
					format: "esm",
					entryFormats: { "./markdownlint": "cjs" },
				});
				expect(result).toEqual({
					".": { types: "./index.d.ts", import: "./index.js" },
					"./markdownlint": { types: "./markdownlint.d.cts", require: "./markdownlint.cjs" },
				});
			});

			it("should handle multiple CJS overrides", () => {
				const exports: PackageJson.Exports = {
					".": { types: "./index.d.ts", import: "./index.js" },
					"./a": { types: "./a.d.ts", import: "./a.js" },
					"./b": { types: "./b.d.ts", import: "./b.js" },
				};
				const result = applyFormatConditions(exports, {
					format: "esm",
					entryFormats: { "./a": "cjs", "./b": "cjs" },
				});
				expect(result).toEqual({
					".": { types: "./index.d.ts", import: "./index.js" },
					"./a": { types: "./a.d.cts", require: "./a.cjs" },
					"./b": { types: "./b.d.cts", require: "./b.cjs" },
				});
			});

			it("should handle ESM override explicitly listed in entryFormats", () => {
				const exports: PackageJson.Exports = {
					".": { types: "./index.d.ts", import: "./index.js" },
					"./utils": { types: "./utils.d.ts", import: "./utils.js" },
				};
				const result = applyFormatConditions(exports, {
					format: "esm",
					entryFormats: { "./utils": "esm" },
				});
				expect(result).toEqual({
					".": { types: "./index.d.ts", import: "./index.js" },
					"./utils": { types: "./utils.d.ts", import: "./utils.js" },
				});
			});
		});

		describe("dual format", () => {
			it("should add both import and require conditions with dir prefixes", () => {
				const exports: PackageJson.Exports = {
					".": { types: "./index.d.ts", import: "./index.js" },
				};
				const result = applyFormatConditions(exports, {
					format: "esm",
					dualFormat: true,
				});
				expect(result).toEqual({
					".": {
						types: "./esm/index.d.ts",
						import: "./esm/index.js",
						require: "./cjs/index.cjs",
					},
				});
			});

			it("should handle multiple entries in dual format", () => {
				const exports: PackageJson.Exports = {
					".": { types: "./index.d.ts", import: "./index.js" },
					"./utils": { types: "./utils.d.ts", import: "./utils.js" },
				};
				const result = applyFormatConditions(exports, {
					format: "esm",
					dualFormat: true,
				});
				expect(result).toEqual({
					".": {
						types: "./esm/index.d.ts",
						import: "./esm/index.js",
						require: "./cjs/index.cjs",
					},
					"./utils": {
						types: "./esm/utils.d.ts",
						import: "./esm/utils.js",
						require: "./cjs/utils.cjs",
					},
				});
			});

			it("should respect explicit CJS override in dual format", () => {
				const exports: PackageJson.Exports = {
					".": { types: "./index.d.ts", import: "./index.js" },
					"./markdownlint": { types: "./markdownlint.d.ts", import: "./markdownlint.js" },
				};
				const result = applyFormatConditions(exports, {
					format: "esm",
					dualFormat: true,
					entryFormats: { "./markdownlint": "cjs" },
				});
				expect(result).toEqual({
					".": {
						types: "./esm/index.d.ts",
						import: "./esm/index.js",
						require: "./cjs/index.cjs",
					},
					// Explicit CJS override: not dual-formatted, just CJS
					"./markdownlint": { types: "./markdownlint.d.cts", require: "./markdownlint.cjs" },
				});
			});
		});

		it("should preserve non-condition objects", () => {
			const exports: PackageJson.Exports = {
				".": { types: "./index.d.ts", import: "./index.js" },
				"./package.json": "./package.json",
			};
			const result = applyFormatConditions(exports, {
				format: "esm",
				entryFormats: { "./markdownlint": "cjs" },
			});
			expect(result).toEqual({
				".": { types: "./index.d.ts", import: "./index.js" },
				"./package.json": "./package.json",
			});
		});

		it("should preserve objects without types+import condition pair", () => {
			const exports: PackageJson.Exports = {
				".": { node: "./node.js", browser: "./browser.js" },
			};
			const result = applyFormatConditions(exports, { format: "esm", dualFormat: true });
			expect(result).toEqual({
				".": { node: "./node.js", browser: "./browser.js" },
			});
		});

		it("should default format to esm when not specified", () => {
			const exports: PackageJson.Exports = {
				".": { types: "./index.d.ts", import: "./index.js" },
			};
			const result = applyFormatConditions(exports, {});
			expect(result).toEqual({
				".": { types: "./index.d.ts", import: "./index.js" },
			});
		});
	});

	describe("buildPackageJson dual-format bin handling", () => {
		it("should prefix bin paths with format directory in dual format mode", async () => {
			const pkg: PackageJson = {
				name: "test-pkg",
				version: "1.0.0",
				exports: {
					".": "./src/index.ts",
				},
				bin: {
					"my-cli": "./src/cli.ts",
				},
			};
			const result = await buildPackageJson(pkg, false, true, undefined, undefined, true, undefined, {
				format: "esm",
				dualFormat: true,
			});
			expect(result.bin).toEqual({
				"my-cli": "./esm/bin/my-cli.js",
			});
		});

		it("should not prefix bin paths when not in dual format mode", async () => {
			const pkg: PackageJson = {
				name: "test-pkg",
				version: "1.0.0",
				exports: {
					".": "./src/index.ts",
				},
				bin: {
					"my-cli": "./src/cli.ts",
				},
			};
			const result = await buildPackageJson(pkg, false, true, undefined, undefined, true, undefined, {
				format: "esm",
			});
			expect(result.bin).toEqual({
				"my-cli": "./bin/my-cli.js",
			});
		});
	});
});
