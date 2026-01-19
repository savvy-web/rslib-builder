import type { PackageJson } from "type-fest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPackageJson } from "#utils/package-json-builder-utils.js";

// Mock the transformation modules
vi.mock("#utils/pnpm-transform-utils.js");
vi.mock("#utils/rslib-transform-utils.js");

// Static imports after mocks are set up
import { applyPnpmTransformations } from "#utils/pnpm-transform-utils.js";
import { applyRslibTransformations } from "#utils/rslib-transform-utils.js";

const mockApplyPnpmTransformations: ReturnType<typeof vi.mocked<typeof applyPnpmTransformations>> =
	vi.mocked(applyPnpmTransformations);
const mockApplyRslibTransformations: ReturnType<typeof vi.mocked<typeof applyRslibTransformations>> =
	vi.mocked(applyRslibTransformations);

describe("package-json-builder-utils", () => {
	describe("buildPackageJson", () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should apply both pnpm and RSLib transformations for production", async () => {
			const originalPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react",
				},
				exports: "./src/index.ts",
			};

			const pnpmTransformed: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "^18.0.0", // catalog resolved
				},
				exports: "./src/index.ts",
			};

			const finalResult: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "^18.0.0",
				},
				exports: {
					types: "./index.d.ts",
					import: "./index.js",
				},
				private: true,
			};

			mockApplyPnpmTransformations.mockResolvedValue(pnpmTransformed);
			mockApplyRslibTransformations.mockReturnValue(finalResult);

			const result = await buildPackageJson(originalPackageJson, true, true);

			expect(applyPnpmTransformations).toHaveBeenCalledWith(originalPackageJson);
			expect(applyRslibTransformations).toHaveBeenCalledWith(
				pnpmTransformed,
				originalPackageJson,
				true,
				undefined,
				undefined,
				undefined,
			);
			expect(result).toEqual(finalResult);
		});

		it("should skip pnpm transformations for development", async () => {
			const originalPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react", // Should be preserved
				},
				exports: "./src/index.ts",
			};

			const finalResult: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react", // Preserved for development
				},
				exports: {
					types: "./index.d.ts",
					import: "./index.js",
				},
				private: true,
			};

			mockApplyRslibTransformations.mockReturnValue(finalResult);

			const result = await buildPackageJson(originalPackageJson, false, true);

			expect(applyPnpmTransformations).not.toHaveBeenCalled();
			expect(applyRslibTransformations).toHaveBeenCalledWith(
				originalPackageJson,
				originalPackageJson,
				true,
				undefined,
				undefined,
				undefined,
			);
			expect(result).toEqual(finalResult);
		});

		it("should handle pnpm transformation errors gracefully", async () => {
			const originalPackageJson: PackageJson = {
				name: "test-package",
				dependencies: {
					react: "catalog:react",
				},
			};

			mockApplyPnpmTransformations.mockRejectedValue(new Error("Catalog resolution failed"));

			await expect(buildPackageJson(originalPackageJson, true)).rejects.toThrow("Catalog resolution failed");
		});

		it("should pass processTSExports parameter correctly", async () => {
			const originalPackageJson: PackageJson = {
				name: "test-package",
				exports: "./src/index.ts",
			};

			const finalResult: PackageJson = {
				name: "test-package",
				exports: "./index.ts", // Not transformed when processTSExports=false
				private: true,
			};

			mockApplyRslibTransformations.mockReturnValue(finalResult);

			const result = await buildPackageJson(originalPackageJson, false, false);

			expect(applyRslibTransformations).toHaveBeenCalledWith(
				originalPackageJson,
				originalPackageJson,
				false,
				undefined,
				undefined,
				undefined,
			);
			expect(result).toEqual(finalResult);
		});

		it("should handle production build with TypeScript processing disabled", async () => {
			const originalPackageJson: PackageJson = {
				name: "test-package",
				dependencies: {
					react: "catalog:react",
				},
				exports: "./src/index.ts",
			};

			const pnpmTransformed: PackageJson = {
				name: "test-package",
				dependencies: {
					react: "^18.0.0",
				},
				exports: "./src/index.ts",
			};

			const finalResult: PackageJson = {
				name: "test-package",
				dependencies: {
					react: "^18.0.0",
				},
				exports: "./index.ts", // Not transformed when processTSExports=false
				private: true,
			};

			mockApplyPnpmTransformations.mockResolvedValue(pnpmTransformed);
			mockApplyRslibTransformations.mockReturnValue(finalResult);

			const result = await buildPackageJson(originalPackageJson, true, false);

			expect(applyPnpmTransformations).toHaveBeenCalledWith(originalPackageJson);
			expect(applyRslibTransformations).toHaveBeenCalledWith(
				pnpmTransformed,
				originalPackageJson,
				false,
				undefined,
				undefined,
				undefined,
			);
			expect(result).toEqual(finalResult);
		});

		it("should apply custom transform function when provided", async () => {
			const originalPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				devDependencies: {
					typescript: "^5.0.0",
				},
			};

			const rslibTransformed: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				devDependencies: {
					typescript: "^5.0.0",
				},
				private: true,
			};

			const finalResult: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				private: true,
				// devDependencies removed by custom transform
			};

			mockApplyRslibTransformations.mockReturnValue(rslibTransformed);

			// Custom transform that removes devDependencies
			const customTransform = (pkg: PackageJson): PackageJson => {
				const { devDependencies, ...rest } = pkg;
				return rest;
			};

			const result = await buildPackageJson(
				originalPackageJson,
				false,
				true,
				undefined,
				undefined,
				undefined,
				customTransform,
			);

			expect(result).toEqual(finalResult);
			expect(result.devDependencies).toBeUndefined();
		});
	});
});
