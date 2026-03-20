import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PackageJson } from "../../../types/package-json.js";

// Mock the workspace-catalog module
vi.mock("./workspace-catalog.js");

import { buildPackageJson } from "./package-json-transformer.js";
import { createWorkspaceCatalog } from "./workspace-catalog.js";

describe("package-json-builder-utils", () => {
	describe("buildPackageJson", () => {
		let mockResolvePackageJson: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			vi.clearAllMocks();
			// Create a mock for resolvePackageJson
			mockResolvePackageJson = vi.fn();
			vi.mocked(createWorkspaceCatalog).mockReturnValue({
				resolvePackageJson: mockResolvePackageJson,
				getCatalogs: vi.fn(),
				clearCache: vi.fn(),
			} as unknown as ReturnType<typeof createWorkspaceCatalog>);
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
				publishConfig: { access: "public" },
			};

			const pnpmTransformed: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "^18.0.0", // catalog resolved
				},
				exports: "./src/index.ts",
				publishConfig: { access: "public" },
			};

			mockResolvePackageJson.mockResolvedValue(pnpmTransformed);

			const result = await buildPackageJson(originalPackageJson, true, true);

			expect(mockResolvePackageJson).toHaveBeenCalledWith(originalPackageJson, process.cwd());
			// The result should have transformations applied
			expect(result.exports).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});

		it("should skip pnpm transformations for development", async () => {
			const originalPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react", // Should be preserved
				},
				exports: "./src/index.ts",
				publishConfig: { access: "public" },
			};

			const result = await buildPackageJson(originalPackageJson, false, true);

			// Should NOT call pnpm transformations for development
			expect(mockResolvePackageJson).not.toHaveBeenCalled();
			// The result should have transformations applied
			expect(result.exports).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});

		it("should handle pnpm transformation errors gracefully", async () => {
			const originalPackageJson: PackageJson = {
				name: "test-package",
				dependencies: {
					react: "catalog:react",
				},
			};

			mockResolvePackageJson.mockRejectedValue(new Error("Catalog resolution failed"));

			await expect(buildPackageJson(originalPackageJson, true)).rejects.toThrow("Catalog resolution failed");
		});

		it("should pass processTSExports parameter correctly", async () => {
			const originalPackageJson: PackageJson = {
				name: "test-package",
				exports: "./src/index.ts",
				publishConfig: { access: "public" },
			};

			const result = await buildPackageJson(originalPackageJson, false, false);

			// When processTSExports is false, the export path is NOT transformed
			expect(result.exports).toBe("./index.ts");
		});

		it("should handle production build with TypeScript processing disabled", async () => {
			const originalPackageJson: PackageJson = {
				name: "test-package",
				dependencies: {
					react: "catalog:react",
				},
				exports: "./src/index.ts",
				publishConfig: { access: "public" },
			};

			const pnpmTransformed: PackageJson = {
				name: "test-package",
				dependencies: {
					react: "^18.0.0",
				},
				exports: "./src/index.ts",
				publishConfig: { access: "public" },
			};

			mockResolvePackageJson.mockResolvedValue(pnpmTransformed);

			const result = await buildPackageJson(originalPackageJson, true, false);

			expect(mockResolvePackageJson).toHaveBeenCalledWith(originalPackageJson, process.cwd());
			// When processTSExports is false, the export path is NOT transformed
			expect(result.exports).toBe("./index.ts");
		});

		it("should apply custom transform function when provided", async () => {
			const originalPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				devDependencies: {
					typescript: "^5.0.0",
				},
			};

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

			expect(result.devDependencies).toBeUndefined();
		});
	});
});
