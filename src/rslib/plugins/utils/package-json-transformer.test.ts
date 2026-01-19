import type { PackageJson } from "type-fest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackageJsonTransformer } from "#utils/package-json-transformer.js";

// Mock PnpmCatalog
vi.mock("#utils/pnpm-catalog.js", () => {
	return {
		PnpmCatalog: class MockPnpmCatalog {
			resolvePackageJson(pkg: PackageJson): Promise<PackageJson> {
				return Promise.resolve(pkg);
			}
		},
	};
});

describe("PackageJsonTransformer", () => {
	describe("transformExportPath", () => {
		it("should strip ./exports/ prefix", () => {
			const transformer = new PackageJsonTransformer();
			expect(transformer.transformExportPath("./exports/utils.ts")).toBe("./utils.js");
		});

		it("should strip ./public/ prefix", () => {
			const transformer = new PackageJsonTransformer();
			expect(transformer.transformExportPath("./public/config.ts")).toBe("./config.js");
		});

		it("should strip ./src/ prefix", () => {
			const transformer = new PackageJsonTransformer();
			expect(transformer.transformExportPath("./src/index.ts")).toBe("./index.js");
		});

		it("should convert .ts to .js extension", () => {
			const transformer = new PackageJsonTransformer();
			expect(transformer.transformExportPath("./utils.ts")).toBe("./utils.js");
		});

		it("should convert .tsx to .js extension", () => {
			const transformer = new PackageJsonTransformer();
			expect(transformer.transformExportPath("./component.tsx")).toBe("./component.js");
		});

		it("should not transform .d.ts files", () => {
			const transformer = new PackageJsonTransformer();
			expect(transformer.transformExportPath("./types.d.ts")).toBe("./types.d.ts");
		});

		it("should collapse index.ts when collapseIndex is true", () => {
			const transformer = new PackageJsonTransformer({ collapseIndex: true });
			expect(transformer.transformExportPath("./utils/index.ts")).toBe("./utils.js");
		});

		it("should collapse index.tsx when collapseIndex is true", () => {
			const transformer = new PackageJsonTransformer({ collapseIndex: true });
			expect(transformer.transformExportPath("./components/index.tsx")).toBe("./components.js");
		});

		it("should not collapse root ./index.ts when collapseIndex is true", () => {
			const transformer = new PackageJsonTransformer({ collapseIndex: true });
			expect(transformer.transformExportPath("./index.ts")).toBe("./index.js");
		});

		it("should not collapse root ./index.tsx when collapseIndex is true", () => {
			const transformer = new PackageJsonTransformer({ collapseIndex: true });
			expect(transformer.transformExportPath("./index.tsx")).toBe("./index.js");
		});

		it("should not transform when processTSExports is false", () => {
			const transformer = new PackageJsonTransformer({ processTSExports: false });
			expect(transformer.transformExportPath("./utils.ts")).toBe("./utils.ts");
		});

		it("should preserve bin/ prefix", () => {
			const transformer = new PackageJsonTransformer();
			expect(transformer.transformExportPath("./bin/cli.ts")).toBe("./bin/cli.js");
		});
	});

	describe("createTypePath", () => {
		it("should convert .js to .d.ts", () => {
			const transformer = new PackageJsonTransformer();
			expect(transformer.createTypePath("./index.js")).toBe("./index.d.ts");
		});

		it("should collapse nested index.js when collapseIndex is true", () => {
			const transformer = new PackageJsonTransformer({ collapseIndex: true });
			expect(transformer.createTypePath("./utils/index.js")).toBe("./utils.d.ts");
		});

		it("should not collapse root ./index.js", () => {
			const transformer = new PackageJsonTransformer({ collapseIndex: true });
			expect(transformer.createTypePath("./index.js")).toBe("./index.d.ts");
		});

		it("should append .d.ts to paths without known extensions", () => {
			const transformer = new PackageJsonTransformer();
			expect(transformer.createTypePath("./module")).toBe("./module.d.ts");
		});
	});

	describe("transformExports", () => {
		it("should transform string export to object with types and import", () => {
			const transformer = new PackageJsonTransformer();
			const result = transformer.transformExports("./src/index.ts", ".");

			expect(result).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});

		it("should transform .tsx export to object with types and import", () => {
			const transformer = new PackageJsonTransformer();
			const result = transformer.transformExports("./src/component.tsx", ".");

			expect(result).toEqual({
				types: "./component.d.ts",
				import: "./component.js",
			});
		});

		it("should transform nested object exports", () => {
			const transformer = new PackageJsonTransformer();
			const exports = {
				".": "./src/index.ts",
				"./utils": "./src/utils.ts",
			};

			const result = transformer.transformExports(exports);

			expect(result).toEqual({
				".": {
					types: "./index.d.ts",
					import: "./index.js",
				},
				"./utils": {
					types: "./utils.d.ts",
					import: "./utils.js",
				},
			});
		});

		it("should transform conditional exports object", () => {
			const transformer = new PackageJsonTransformer();
			const exports = {
				import: "./src/index.ts",
				require: "./dist/index.cjs",
			};

			const result = transformer.transformExports(exports);

			expect(result).toEqual({
				import: "./index.js",
				require: "./dist/index.cjs",
			});
		});

		it("should transform array exports", () => {
			const transformer = new PackageJsonTransformer({ processTSExports: false });
			const exports = ["./src/index.ts", "./src/fallback.ts"];

			const result = transformer.transformExports(exports);

			expect(result).toEqual(["./index.ts", "./fallback.ts"]);
		});

		it("should use entrypoints map when provided", () => {
			const entrypoints = new Map([["./utils", "./mapped-utils.js"]]);
			const transformer = new PackageJsonTransformer({ entrypoints, processTSExports: false });

			const result = transformer.transformExports("./src/utils.ts", "./utils");

			expect(result).toBe("./mapped-utils.js");
		});

		it("should use exportToOutputMap when provided", () => {
			const exportToOutputMap = new Map([["./api", "./api/index.js"]]);
			const transformer = new PackageJsonTransformer({ exportToOutputMap, processTSExports: false });

			const result = transformer.transformExports("./src/api.ts", "./api");

			expect(result).toBe("./api/index.js");
		});

		it("should return non-TS exports as transformed path", () => {
			const transformer = new PackageJsonTransformer();
			const result = transformer.transformExports("./package.json", "./package.json");

			expect(result).toBe("./package.json");
		});

		it("should return null/undefined values as-is", () => {
			const transformer = new PackageJsonTransformer();

			expect(transformer.transformExports(null as unknown as string)).toBe(null);
			expect(transformer.transformExports(undefined as unknown as string)).toBe(undefined);
		});

		it("should handle deeply nested conditional exports", () => {
			const transformer = new PackageJsonTransformer();
			const exports = {
				".": {
					node: {
						import: "./src/node.ts",
						require: "./dist/node.cjs",
					},
					default: "./src/index.ts",
				},
			};

			const result = transformer.transformExports(exports);

			expect(result).toEqual({
				".": {
					node: {
						import: "./node.js",
						require: "./dist/node.cjs",
					},
					default: "./index.js",
				},
			});
		});
	});

	describe("transformBin", () => {
		it("should transform string bin path", () => {
			const transformer = new PackageJsonTransformer();
			expect(transformer.transformBin("./src/cli.ts")).toBe("./cli.js");
		});

		it("should transform object bin paths", () => {
			const transformer = new PackageJsonTransformer();
			const bin = {
				cli: "./src/cli.ts",
				tool: "./bin/tool.ts",
			};

			const result = transformer.transformBin(bin);

			expect(result).toEqual({
				cli: "./cli.js",
				tool: "./bin/tool.js",
			});
		});

		it("should return undefined bin as-is", () => {
			const transformer = new PackageJsonTransformer();
			expect(transformer.transformBin(undefined)).toBeUndefined();
		});

		it("should skip undefined values in object bin", () => {
			const transformer = new PackageJsonTransformer();
			const bin = {
				cli: "./src/cli.ts",
				missing: undefined as unknown as string,
			};

			const result = transformer.transformBin(bin);

			expect(result).toEqual({
				cli: "./cli.js",
			});
		});
	});

	describe("transform", () => {
		let transformer: PackageJsonTransformer;

		beforeEach(() => {
			transformer = new PackageJsonTransformer();
		});

		it("should transform exports field", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				exports: "./src/index.ts",
			};

			const result = await transformer.transform(pkg);

			expect(result.exports).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});

		it("should transform bin field", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				bin: "./src/cli.ts",
			};

			const result = await transformer.transform(pkg);

			expect(result.bin).toBe("./cli.js");
		});

		it("should remove publishConfig and scripts", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				publishConfig: { access: "public" },
				scripts: { test: "vitest" },
			};

			const result = await transformer.transform(pkg);

			expect(result.publishConfig).toBeUndefined();
			expect(result.scripts).toBeUndefined();
		});

		it("should set private to false when publishConfig.access is public", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				publishConfig: { access: "public" },
			};

			const result = await transformer.transform(pkg);

			expect(result.private).toBe(false);
		});

		it("should set private to true by default", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			const result = await transformer.transform(pkg);

			expect(result.private).toBe(true);
		});

		it("should transform typesVersions", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				typesVersions: {
					"*": {
						utils: ["./src/utils.ts"],
					},
				},
			};

			const result = await transformer.transform(pkg);

			expect(result.typesVersions).toEqual({
				"*": {
					utils: ["./utils.js"],
				},
			});
		});

		it("should transform files array", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				files: ["./public/config.json", "dist"],
			};

			const result = await transformer.transform(pkg);

			expect(result.files).toEqual(["config.json", "dist"]);
		});

		it("should apply custom transform function", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				devDependencies: { vitest: "^1.0.0" },
			};

			const result = await transformer.transform(pkg, {
				customTransform: (p: PackageJson): PackageJson => {
					delete p.devDependencies;
					return p;
				},
			});

			expect(result.devDependencies).toBeUndefined();
		});

		it("should sort package.json fields", async () => {
			const pkg: PackageJson = {
				version: "1.0.0",
				name: "test",
				description: "A test package",
			};

			const result = await transformer.transform(pkg);

			const keys = Object.keys(result);
			expect(keys.indexOf("name")).toBeLessThan(keys.indexOf("version"));
		});

		it("should handle development mode (isProduction: false)", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				exports: "./src/index.ts",
			};

			const result = await transformer.transform(pkg, { isProduction: false });

			expect(result.exports).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});

		it("should handle production mode (isProduction: true)", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				exports: "./src/index.ts",
			};

			const result = await transformer.transform(pkg, { isProduction: true });

			expect(result.exports).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});
	});

	describe("constructor defaults", () => {
		it("should have correct defaults", () => {
			const transformer = new PackageJsonTransformer();

			// Test defaults through behavior
			expect(transformer.transformExportPath("./src/index.ts")).toBe("./index.js"); // processTSExports: true
			expect(transformer.transformExportPath("./utils/index.ts")).toBe("./utils/index.js"); // collapseIndex: false
		});

		it("should merge provided options with defaults", () => {
			const transformer = new PackageJsonTransformer({ collapseIndex: true });

			expect(transformer.transformExportPath("./utils/index.ts")).toBe("./utils.js"); // collapseIndex: true
			expect(transformer.transformExportPath("./src/index.ts")).toBe("./index.js"); // processTSExports: true (default)
		});
	});
});
