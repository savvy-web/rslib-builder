import { describe, expect, it } from "vitest";
import {
	createParentPrefix,
	detectSourceDirectory,
	getDistPathRoot,
	getPathDepth,
} from "../../../rslib/plugins/bundleless-plugin.js";

describe("BundlelessPlugin Helper Functions", () => {
	describe("getDistPathRoot", () => {
		it("should return string path as-is", () => {
			expect(getDistPathRoot("dist")).toBe("dist");
			expect(getDistPathRoot("build")).toBe("build");
			expect(getDistPathRoot("dist/npm")).toBe("dist/npm");
			expect(getDistPathRoot("output/production")).toBe("output/production");
		});

		it("should extract root from object config", () => {
			expect(getDistPathRoot({ root: "dist" })).toBe("dist");
			expect(getDistPathRoot({ root: "dist/npm" })).toBe("dist/npm");
			expect(getDistPathRoot({ root: "build/prod", js: "js" } as { root?: string })).toBe("build/prod");
		});

		it("should return undefined for object without root", () => {
			expect(getDistPathRoot({})).toBeUndefined();
			expect(getDistPathRoot({ js: "javascript" } as { root?: string })).toBeUndefined();
		});

		it("should return undefined for undefined input", () => {
			expect(getDistPathRoot(undefined)).toBeUndefined();
		});

		it("should handle empty string", () => {
			expect(getDistPathRoot("")).toBe("");
		});

		it("should handle object with empty root string", () => {
			expect(getDistPathRoot({ root: "" })).toBe("");
		});
	});

	describe("getPathDepth", () => {
		it("should return correct depth for single level paths", () => {
			expect(getPathDepth("dist")).toBe(1);
			expect(getPathDepth("build")).toBe(1);
			expect(getPathDepth("output")).toBe(1);
		});

		it("should return correct depth for multi-level paths", () => {
			expect(getPathDepth("dist/npm")).toBe(2);
			expect(getPathDepth("build/production")).toBe(2);
			expect(getPathDepth("foo/bar/baz")).toBe(3);
			expect(getPathDepth("a/b/c/d/e")).toBe(5);
		});

		it("should handle paths with leading/trailing slashes", () => {
			expect(getPathDepth("/dist/")).toBe(1);
			expect(getPathDepth("//dist/npm//")).toBe(2);
			expect(getPathDepth("/foo/bar/baz/")).toBe(3);
		});

		it("should return 0 for empty or root paths", () => {
			expect(getPathDepth("")).toBe(0);
			expect(getPathDepth("/")).toBe(0);
			expect(getPathDepth("//")).toBe(0);
		});

		it("should handle complex path patterns", () => {
			expect(getPathDepth("public/assets/js")).toBe(3);
			expect(getPathDepth("src/../dist")).toBe(3); // Counts literal segments: src, .., dist
		});
	});

	describe("createParentPrefix", () => {
		it("should create correct parent prefixes", () => {
			expect(createParentPrefix(0)).toBe("");
			expect(createParentPrefix(1)).toBe("../");
			expect(createParentPrefix(2)).toBe("../../");
			expect(createParentPrefix(3)).toBe("../../../");
			expect(createParentPrefix(5)).toBe("../../../../../");
		});

		it("should handle edge case with zero value", () => {
			expect(createParentPrefix(0)).toBe("");
		});

		it("should handle large values", () => {
			const result = createParentPrefix(10);
			expect(result).toBe("../".repeat(10));
			expect(result.split("../")).toHaveLength(11); // split creates n+1 elements
		});
	});

	describe("detectSourceDirectory", () => {
		it("should detect consistent source directory", () => {
			const paths = ["../../src/index.js", "../../src/utils.js", "../../src/components/Button.js"];
			expect(detectSourceDirectory(paths, "../../")).toBe("src");

			const pathsLib = ["../lib/main.js", "../lib/helpers.js"];
			expect(detectSourceDirectory(pathsLib, "../")).toBe("lib");
		});

		it("should detect different source directory names", () => {
			const pathsSource = ["../../source/index.js", "../../source/utils.js"];
			expect(detectSourceDirectory(pathsSource, "../../")).toBe("source");

			const pathsApp = ["../app/main.js", "../app/config.js"];
			expect(detectSourceDirectory(pathsApp, "../")).toBe("app");
		});

		it("should return null when files are at root level", () => {
			const paths = ["../../index.js", "../../utils.js"];
			expect(detectSourceDirectory(paths, "../../")).toBeNull();

			const mixedPaths = ["../../index.js", "../../src/utils.js"];
			expect(detectSourceDirectory(mixedPaths, "../../")).toBeNull();
		});

		it("should return null when multiple different source directories exist", () => {
			const paths = ["../../src/index.js", "../../lib/utils.js", "../../test/spec.js"];
			expect(detectSourceDirectory(paths, "../../")).toBeNull();
		});

		it("should return null when no paths match the prefix", () => {
			const paths = ["../src/index.js", "../lib/utils.js"];
			expect(detectSourceDirectory(paths, "../../")).toBeNull();
		});

		it("should return null for empty input", () => {
			expect(detectSourceDirectory([], "../../")).toBeNull();
		});

		it("should handle single file correctly", () => {
			expect(detectSourceDirectory(["../../src/index.js"], "../../")).toBe("src");
			expect(detectSourceDirectory(["../../index.js"], "../../")).toBeNull();
		});

		it("should handle nested directory structures", () => {
			const paths = ["../../src/components/ui/Button.js", "../../src/utils/helpers.js", "../../src/index.js"];
			expect(detectSourceDirectory(paths, "../../")).toBe("src");
		});

		it("should handle edge case with empty string after prefix", () => {
			const paths = ["../../.js"]; // Edge case
			expect(detectSourceDirectory(paths, "../../")).toBeNull();
		});

		it("should be case sensitive", () => {
			const paths = ["../../Src/index.js", "../../src/utils.js"];
			expect(detectSourceDirectory(paths, "../../")).toBeNull(); // Different cases
		});
	});
});
