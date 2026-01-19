import { createExportableManifest } from "@pnpm/exportable-manifest";
import type { ProjectManifest } from "@pnpm/types";
import type { PackageJson } from "type-fest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalog } from "#utils/pnpm-catalog.js";
import { applyPnpmTransformations } from "#utils/pnpm-transform-utils.js";

// Mock dependencies
vi.mock("@pnpm/exportable-manifest");
vi.mock("#utils/pnpm-catalog.js");

describe("pnpm-transform-utils", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("applyPnpmTransformations", () => {
		it("should successfully resolve catalog dependencies", async () => {
			// Mock catalog
			vi.mocked(getCatalog).mockResolvedValue({
				react: "^18.2.0",
				"@types/node": "^20.0.0",
			});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react",
					lodash: "^4.17.21",
				},
			};

			const expectedOutput: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "^18.2.0",
					lodash: "^4.17.21",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(expectedOutput as ProjectManifest);

			const result = await applyPnpmTransformations(inputPackageJson);

			expect(result).toEqual(expectedOutput);
			expect(createExportableManifest).toHaveBeenCalledWith(process.cwd(), inputPackageJson as ProjectManifest, {
				catalogs: {
					default: {
						react: "^18.2.0",
						"@types/node": "^20.0.0",
					},
				},
			});
		});

		it("should successfully resolve workspace dependencies", async () => {
			vi.mocked(getCatalog).mockResolvedValue({});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					"@myorg/utils": "workspace:^1.0.0",
				},
			};

			const expectedOutput: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					"@myorg/utils": "^1.2.3",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(expectedOutput as ProjectManifest);

			const result = await applyPnpmTransformations(inputPackageJson);

			expect(result).toEqual(expectedOutput);
		});

		it("should resolve mixed catalog and workspace dependencies", async () => {
			vi.mocked(getCatalog).mockResolvedValue({
				typescript: "^5.0.0",
			});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					typescript: "catalog:typescript",
					"@myorg/shared": "workspace:*",
				},
				devDependencies: {
					"@myorg/config": "workspace:^",
				},
			};

			const expectedOutput: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					typescript: "^5.0.0",
					"@myorg/shared": "^2.0.0",
				},
				devDependencies: {
					"@myorg/config": "^1.0.0",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(expectedOutput as ProjectManifest);

			const result = await applyPnpmTransformations(inputPackageJson);

			expect(result).toEqual(expectedOutput);
		});

		it("should handle peerDependencies and optionalDependencies", async () => {
			vi.mocked(getCatalog).mockResolvedValue({
				react: "^18.0.0",
			});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				peerDependencies: {
					react: "catalog:react",
				},
				optionalDependencies: {
					"@myorg/plugin": "workspace:^1.0.0",
				},
			};

			const expectedOutput: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				peerDependencies: {
					react: "^18.0.0",
				},
				optionalDependencies: {
					"@myorg/plugin": "^1.0.0",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(expectedOutput as ProjectManifest);

			const result = await applyPnpmTransformations(inputPackageJson);

			expect(result).toEqual(expectedOutput);
		});

		it("should throw error when catalog dependencies exist but catalog is missing", async () => {
			vi.mocked(getCatalog).mockResolvedValue({});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react",
				},
			};

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow(
				"Package contains catalog: dependencies but catalog configuration is missing",
			);
		});

		it("should throw error when catalog resolution fails", async () => {
			vi.mocked(getCatalog).mockResolvedValue({
				react: "^18.0.0",
			});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react",
				},
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("catalog resolution failed: missing dependency"));

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow("Catalog resolution failed");
		});

		it("should throw error when workspace resolution fails", async () => {
			vi.mocked(getCatalog).mockResolvedValue({});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					"@myorg/utils": "workspace:^1.0.0",
				},
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("workspace package not found: @myorg/utils"));

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow("Workspace resolution failed");
		});

		it("should throw error when manifest processing fails", async () => {
			vi.mocked(getCatalog).mockResolvedValue({});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("manifest is invalid: syntax error"));

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow(
				"Manifest processing failed: manifest is invalid: syntax error",
			);
		});

		it("should throw error when unresolved catalog references remain", async () => {
			vi.mocked(getCatalog).mockResolvedValue({
				react: "^18.0.0",
			});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react",
				},
			};

			// Mock that transformation leaves catalog reference unresolved
			const incompleteOutput: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react", // Still unresolved!
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(incompleteOutput as ProjectManifest);

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow(
				"Transformation failed: unresolved catalog: references remain in package.json",
			);
		});

		it("should throw error when unresolved workspace references remain", async () => {
			vi.mocked(getCatalog).mockResolvedValue({});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					"@myorg/utils": "workspace:^1.0.0",
				},
			};

			// Mock that transformation leaves workspace reference unresolved
			const incompleteOutput: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					"@myorg/utils": "workspace:^1.0.0", // Still unresolved!
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(incompleteOutput as ProjectManifest);

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow(
				"Transformation failed: unresolved workspace: references remain in package.json",
			);
		});

		it("should throw error when both catalog and workspace references remain unresolved", async () => {
			vi.mocked(getCatalog).mockResolvedValue({
				react: "^18.0.0",
			});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react",
					"@myorg/utils": "workspace:^1.0.0",
				},
			};

			// Mock that transformation leaves both references unresolved
			const incompleteOutput: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react",
					"@myorg/utils": "workspace:^1.0.0",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(incompleteOutput as ProjectManifest);

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow(
				"Transformation failed: unresolved catalog: and workspace: references remain in package.json",
			);
		});

		it("should handle package.json without any dependencies", async () => {
			vi.mocked(getCatalog).mockResolvedValue({});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockResolvedValue(inputPackageJson as ProjectManifest);

			const result = await applyPnpmTransformations(inputPackageJson);

			expect(result).toEqual(inputPackageJson);
		});

		it("should handle custom directory parameter", async () => {
			vi.mocked(getCatalog).mockResolvedValue({});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockResolvedValue(inputPackageJson as ProjectManifest);

			const customDir = "/custom/path";
			await applyPnpmTransformations(inputPackageJson, customDir);

			expect(createExportableManifest).toHaveBeenCalledWith(customDir, inputPackageJson as ProjectManifest, {
				catalogs: { default: {} },
			});
		});

		it("should throw error for generic transformation failures", async () => {
			vi.mocked(getCatalog).mockResolvedValue({});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("Unknown error occurred"));

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow(
				"PNPM transformation failed: Unknown error occurred",
			);
		});

		it("should handle non-Error thrown objects", async () => {
			vi.mocked(getCatalog).mockResolvedValue({});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue("string error");

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow(
				"PNPM transformation failed: string error",
			);
		});

		it("should only detect catalog/workspace in dependency fields", async () => {
			vi.mocked(getCatalog).mockResolvedValue({});

			// Package.json with catalog:/workspace: in non-dependency fields
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				description: "Uses catalog: for dependencies",
				repository: {
					type: "git",
					url: "https://github.com/workspace:example",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(inputPackageJson as ProjectManifest);

			// Should not throw error about catalog dependencies
			const result = await applyPnpmTransformations(inputPackageJson);

			expect(result).toEqual(inputPackageJson);
		});

		it("should handle empty catalog when no catalog dependencies exist", async () => {
			vi.mocked(getCatalog).mockResolvedValue({});

			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "^18.0.0",
					lodash: "^4.17.21",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(inputPackageJson as ProjectManifest);

			const result = await applyPnpmTransformations(inputPackageJson);

			expect(result).toEqual(inputPackageJson);
		});
	});
});
