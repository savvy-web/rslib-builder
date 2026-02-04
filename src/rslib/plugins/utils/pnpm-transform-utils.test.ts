import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PackageJson } from "../../../types/package-json.js";

// Mock the workspace-catalog module
vi.mock("./workspace-catalog.js");

import { applyPnpmTransformations } from "./package-json-transformer.js";
import { createWorkspaceCatalog } from "./workspace-catalog.js";

describe("pnpm-transform-utils", () => {
	let mockResolvePackageJson: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create a mock for resolvePackageJson
		mockResolvePackageJson = vi.fn();

		// Mock createWorkspaceCatalog to return our mock instance
		vi.mocked(createWorkspaceCatalog).mockReturnValue({
			resolvePackageJson: mockResolvePackageJson,
			getCatalogs: vi.fn(),
			clearCache: vi.fn(),
		} as unknown as ReturnType<typeof createWorkspaceCatalog>);
	});

	describe("applyPnpmTransformations", () => {
		it("should delegate to WorkspaceCatalog.resolvePackageJson", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react",
				},
			};

			const expectedOutput: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "^18.2.0",
				},
			};

			mockResolvePackageJson.mockResolvedValue(expectedOutput);

			const result = await applyPnpmTransformations(inputPackageJson);

			expect(result).toEqual(expectedOutput);
			expect(createWorkspaceCatalog).toHaveBeenCalledOnce();
			expect(mockResolvePackageJson).toHaveBeenCalledWith(inputPackageJson, process.cwd());
		});

		it("should pass custom directory to WorkspaceCatalog.resolvePackageJson", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			mockResolvePackageJson.mockResolvedValue(inputPackageJson);

			const customDir = "/custom/path";
			await applyPnpmTransformations(inputPackageJson, customDir);

			expect(mockResolvePackageJson).toHaveBeenCalledWith(inputPackageJson, customDir);
		});

		it("should propagate errors from WorkspaceCatalog.resolvePackageJson", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react",
				},
			};

			mockResolvePackageJson.mockRejectedValue(
				new Error("Package contains catalog: dependencies but catalog configuration is missing"),
			);

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow(
				"Package contains catalog: dependencies but catalog configuration is missing",
			);
		});

		it("should propagate catalog resolution errors", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			mockResolvePackageJson.mockRejectedValue(new Error("Catalog resolution failed"));

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow("Catalog resolution failed");
		});

		it("should propagate workspace resolution errors", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			mockResolvePackageJson.mockRejectedValue(new Error("Workspace resolution failed"));

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow("Workspace resolution failed");
		});

		it("should propagate unresolved reference errors", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			mockResolvePackageJson.mockRejectedValue(
				new Error("Transformation failed: unresolved catalog: references remain in package.json"),
			);

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow(
				"Transformation failed: unresolved catalog: references remain in package.json",
			);
		});

		it("should use default directory when not provided", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			mockResolvePackageJson.mockResolvedValue(inputPackageJson);

			await applyPnpmTransformations(inputPackageJson);

			expect(mockResolvePackageJson).toHaveBeenCalledWith(inputPackageJson, process.cwd());
		});

		it("should use provided catalog instance instead of creating new one", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			const injectedMockResolve = vi.fn().mockResolvedValue(inputPackageJson);
			const injectedCatalog = {
				resolvePackageJson: injectedMockResolve,
				getCatalogs: vi.fn(),
				clearCache: vi.fn(),
			} as unknown as ReturnType<typeof createWorkspaceCatalog>;

			await applyPnpmTransformations(inputPackageJson, process.cwd(), injectedCatalog);

			// Should NOT create a new catalog
			expect(createWorkspaceCatalog).not.toHaveBeenCalled();
			// Should use the injected catalog
			expect(injectedMockResolve).toHaveBeenCalledWith(inputPackageJson, process.cwd());
		});
	});
});
