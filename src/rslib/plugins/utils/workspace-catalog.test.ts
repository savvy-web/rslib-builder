import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PackageJson } from "../../../types/package-json.js";

// Mock external dependencies before importing the module
vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));
vi.mock("workspace-tools", () => ({
	getWorkspaceManagerAndRoot: vi.fn(),
	getCatalogs: vi.fn(),
}));
vi.mock("@pnpm/lockfile.fs", () => ({
	readWantedLockfile: vi.fn(),
}));
vi.mock("@pnpm/workspace.read-manifest", () => ({
	readWorkspaceManifest: vi.fn(),
}));
vi.mock("@pnpm/catalogs.config", () => ({
	getCatalogsFromWorkspaceManifest: vi.fn(),
}));
vi.mock("@pnpm/catalogs.protocol-parser", () => ({
	// parseCatalogProtocol returns the catalog name as a string, or null
	parseCatalogProtocol: vi.fn((spec: string) => {
		if (!spec.startsWith("catalog:")) return null;
		return spec.slice(8) || "default";
	}),
}));
vi.mock("@pnpm/exportable-manifest", () => ({
	createExportableManifest: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { getCatalogsFromWorkspaceManifest } from "@pnpm/catalogs.config";
import { createExportableManifest } from "@pnpm/exportable-manifest";
import { readWantedLockfile } from "@pnpm/lockfile.fs";
import { readWorkspaceManifest } from "@pnpm/workspace.read-manifest";
import { getWorkspaceManagerAndRoot, getCatalogs as getWorkspaceToolsCatalogs } from "workspace-tools";
import { WorkspaceCatalog } from "./workspace-catalog.js";

describe("WorkspaceCatalog", () => {
	let catalog: WorkspaceCatalog;

	beforeEach(() => {
		vi.clearAllMocks();
		catalog = new WorkspaceCatalog();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("getCatalogs", () => {
		it("should return empty object when workspace root is not found", async () => {
			vi.mocked(getWorkspaceManagerAndRoot).mockReturnValue(undefined);

			const result = await catalog.getCatalogs();

			expect(result).toEqual({});
		});

		describe("pnpm workspaces", () => {
			beforeEach(() => {
				vi.mocked(getWorkspaceManagerAndRoot).mockReturnValue({
					manager: "pnpm",
					root: "/test/workspace",
				});
				// Default: workspace state file not found (so fallback sources are tested)
				vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
			});

			describe("workspace state file (primary source)", () => {
				it("should read catalogs from workspace state file when available", async () => {
					vi.mocked(readFile).mockResolvedValue(
						JSON.stringify({
							settings: {
								catalogs: {
									default: { react: "^18.0.0" },
									silk: { typescript: "^5.9.0" },
									silkPeers: { "react-dom": "^18.0.0" },
								},
							},
						}),
					);

					const result = await catalog.getCatalogs();

					expect(result).toEqual({
						default: { react: "^18.0.0" },
						silk: { typescript: "^5.9.0" },
						silkPeers: { "react-dom": "^18.0.0" },
					});
					expect(readFile).toHaveBeenCalledWith("/test/workspace/node_modules/.pnpm-workspace-state-v1.json", "utf-8");
					expect(readWantedLockfile).not.toHaveBeenCalled();
					expect(readWorkspaceManifest).not.toHaveBeenCalled();
				});

				it("should include catalogs missing from lockfile (core bug scenario)", async () => {
					// Workspace state has both silk and silkPeers
					vi.mocked(readFile).mockResolvedValue(
						JSON.stringify({
							settings: {
								catalogs: {
									silk: { typescript: "^5.9.0" },
									silkPeers: { "react-dom": "^18.0.0" },
								},
							},
						}),
					);

					const result = await catalog.getCatalogs();

					// Both catalogs returned - silkPeers would be missing from lockfile
					expect(result).toEqual({
						silk: { typescript: "^5.9.0" },
						silkPeers: { "react-dom": "^18.0.0" },
					});
				});

				it("should fall back to lockfile when workspace state has empty catalogs", async () => {
					vi.mocked(readFile).mockResolvedValue(JSON.stringify({ settings: { catalogs: {} } }));
					vi.mocked(readWantedLockfile).mockResolvedValue({
						lockfileVersion: "9.0",
						importers: {},
						catalogs: {
							default: { react: { specifier: "^18.0.0", version: "18.2.0" } },
						},
					});

					const result = await catalog.getCatalogs();

					expect(result).toEqual({ default: { react: "^18.0.0" } });
				});

				it("should fall back to lockfile when workspace state has no settings", async () => {
					vi.mocked(readFile).mockResolvedValue(JSON.stringify({}));
					vi.mocked(readWantedLockfile).mockResolvedValue({
						lockfileVersion: "9.0",
						importers: {},
						catalogs: {
							default: { lodash: { specifier: "^4.17.21", version: "4.17.21" } },
						},
					});

					const result = await catalog.getCatalogs();

					expect(result).toEqual({ default: { lodash: "^4.17.21" } });
				});

				it("should handle malformed workspace state JSON gracefully", async () => {
					vi.mocked(readFile).mockResolvedValue("not valid json{");
					vi.mocked(readWantedLockfile).mockResolvedValue({
						lockfileVersion: "9.0",
						importers: {},
						catalogs: {
							default: { react: { specifier: "^18.0.0", version: "18.2.0" } },
						},
					});

					const result = await catalog.getCatalogs();

					expect(result).toEqual({ default: { react: "^18.0.0" } });
				});
			});

			it("should read catalogs from lockfile when workspace state is unavailable", async () => {
				vi.mocked(readWantedLockfile).mockResolvedValue({
					lockfileVersion: "9.0",
					importers: {},
					catalogs: {
						default: { react: { specifier: "^18.0.0", version: "18.2.0" } },
						silk: { typescript: { specifier: "^5.9.0", version: "5.9.3" } },
					},
				});

				const result = await catalog.getCatalogs();

				expect(result).toEqual({
					default: { react: "^18.0.0" },
					silk: { typescript: "^5.9.0" },
				});
				expect(readWorkspaceManifest).not.toHaveBeenCalled();
			});

			it("should fall back to workspace manifest when lockfile has no catalogs", async () => {
				vi.mocked(readWantedLockfile).mockResolvedValue(null);
				vi.mocked(readWorkspaceManifest).mockResolvedValue({
					packages: ["packages/*"],
					catalog: { react: "^18.0.0" },
				});
				vi.mocked(getCatalogsFromWorkspaceManifest).mockReturnValue({
					default: { react: "^18.0.0" },
				});

				const result = await catalog.getCatalogs();

				expect(result).toEqual({ default: { react: "^18.0.0" } });
				expect(readWorkspaceManifest).toHaveBeenCalled();
			});

			it("should fall back to workspace manifest when lockfile read fails", async () => {
				vi.mocked(readWantedLockfile).mockRejectedValue(new Error("ENOENT"));
				vi.mocked(readWorkspaceManifest).mockResolvedValue({
					packages: ["packages/*"],
					catalog: { lodash: "^4.17.21" },
				});
				vi.mocked(getCatalogsFromWorkspaceManifest).mockReturnValue({
					default: { lodash: "^4.17.21" },
				});

				const result = await catalog.getCatalogs();

				expect(result).toEqual({ default: { lodash: "^4.17.21" } });
			});

			it("should return empty object when no catalogs found", async () => {
				vi.mocked(readWantedLockfile).mockResolvedValue(null);
				vi.mocked(getCatalogsFromWorkspaceManifest).mockReturnValue({});

				const result = await catalog.getCatalogs();

				expect(result).toEqual({});
			});

			it("should cache catalogs after first read", async () => {
				vi.mocked(readFile).mockResolvedValue(
					JSON.stringify({
						settings: {
							catalogs: {
								default: { lodash: "^4.17.21" },
							},
						},
					}),
				);

				// First call
				const result1 = await catalog.getCatalogs();
				expect(result1).toEqual({ default: { lodash: "^4.17.21" } });

				// Clear mock call count
				vi.mocked(readFile).mockClear();

				// Second call - should use cache
				const result2 = await catalog.getCatalogs();
				expect(result2).toEqual({ default: { lodash: "^4.17.21" } });
				expect(readFile).not.toHaveBeenCalled();
			});

			it("should handle empty lockfile catalogs", async () => {
				vi.mocked(readWantedLockfile).mockResolvedValue({
					lockfileVersion: "9.0",
					importers: {},
					catalogs: {},
				});
				vi.mocked(getCatalogsFromWorkspaceManifest).mockReturnValue({
					default: { react: "^18.0.0" },
				});

				const result = await catalog.getCatalogs();

				// Empty catalogs object falls through to workspace manifest
				expect(result).toEqual({ default: { react: "^18.0.0" } });
			});
		});

		describe("yarn workspaces", () => {
			beforeEach(() => {
				vi.mocked(getWorkspaceManagerAndRoot).mockReturnValue({
					manager: "yarn",
					root: "/test/workspace",
				});
			});

			it("should use workspace-tools getCatalogs for yarn", async () => {
				vi.mocked(getWorkspaceToolsCatalogs).mockReturnValue({
					default: { react: "^18.0.0" },
					named: {
						build: { typescript: "^5.0.0" },
					},
				});

				const result = await catalog.getCatalogs();

				expect(result).toEqual({
					default: { react: "^18.0.0" },
					build: { typescript: "^5.0.0" },
				});
				expect(getWorkspaceToolsCatalogs).toHaveBeenCalledWith("/test/workspace", "yarn");
				expect(readWantedLockfile).not.toHaveBeenCalled();
			});

			it("should return empty object when yarn has no catalogs", async () => {
				vi.mocked(getWorkspaceToolsCatalogs).mockReturnValue(undefined);

				const result = await catalog.getCatalogs();

				expect(result).toEqual({});
			});

			it("should handle yarn catalogs with only default", async () => {
				vi.mocked(getWorkspaceToolsCatalogs).mockReturnValue({
					default: { lodash: "^4.17.21" },
				});

				const result = await catalog.getCatalogs();

				expect(result).toEqual({ default: { lodash: "^4.17.21" } });
			});

			it("should handle yarn catalogs with only named", async () => {
				vi.mocked(getWorkspaceToolsCatalogs).mockReturnValue({
					named: {
						dev: { vitest: "^4.0.0" },
						build: { esbuild: "^0.20.0" },
					},
				});

				const result = await catalog.getCatalogs();

				expect(result).toEqual({
					dev: { vitest: "^4.0.0" },
					build: { esbuild: "^0.20.0" },
				});
			});
		});

		describe("other package managers", () => {
			it("should return empty object for npm workspaces", async () => {
				vi.mocked(getWorkspaceManagerAndRoot).mockReturnValue({
					manager: "npm",
					root: "/test/workspace",
				});

				const result = await catalog.getCatalogs();

				expect(result).toEqual({});
			});

			it("should return empty object for lerna workspaces", async () => {
				vi.mocked(getWorkspaceManagerAndRoot).mockReturnValue({
					manager: "lerna",
					root: "/test/workspace",
				});

				const result = await catalog.getCatalogs();

				expect(result).toEqual({});
			});
		});
	});

	describe("clearCache", () => {
		it("should clear the cached catalogs", async () => {
			vi.mocked(getWorkspaceManagerAndRoot).mockReturnValue({
				manager: "pnpm",
				root: "/test/workspace",
			});
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					settings: { catalogs: { default: { express: "^4.18.0" } } },
				}),
			);

			// First call populates cache
			await catalog.getCatalogs();

			// Clear cache
			catalog.clearCache();

			// Update mock to return different data
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					settings: { catalogs: { default: { express: "^4.19.0" } } },
				}),
			);

			// Should read from workspace state again
			const result = await catalog.getCatalogs();
			expect(result).toEqual({ default: { express: "^4.19.0" } });
		});
	});

	describe("resolvePackageJson", () => {
		beforeEach(() => {
			vi.mocked(getWorkspaceManagerAndRoot).mockReturnValue({
				manager: "pnpm",
				root: "/test/workspace",
			});
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					settings: {
						catalogs: {
							default: { react: "^18.2.0", typescript: "^5.0.0" },
						},
					},
				}),
			);
		});

		it("should resolve catalog: dependencies", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "catalog:",
				},
			};

			const resolvedPkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "^18.2.0",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(resolvedPkg as never);

			const result = await catalog.resolvePackageJson(pkg);

			expect(result).toEqual(resolvedPkg);
			expect(createExportableManifest).toHaveBeenCalledWith(process.cwd(), pkg, {
				catalogs: { default: { react: "^18.2.0", typescript: "^5.0.0" } },
			});
		});

		it("should resolve named catalog references", async () => {
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					settings: { catalogs: { silk: { typescript: "^5.9.0" } } },
				}),
			);
			catalog.clearCache();

			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				devDependencies: {
					typescript: "catalog:silk",
				},
			};

			const resolvedPkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				devDependencies: {
					typescript: "^5.9.0",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(resolvedPkg as never);

			const result = await catalog.resolvePackageJson(pkg);

			expect(result.devDependencies?.typescript).toBe("^5.9.0");
			expect(createExportableManifest).toHaveBeenCalledWith(expect.any(String), pkg, {
				catalogs: { silk: { typescript: "^5.9.0" } },
			});
		});

		it("should resolve workspace: dependencies", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					"@my/lib": "workspace:*",
				},
			};

			const resolvedPkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					"@my/lib": "^1.0.0",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(resolvedPkg as never);

			const result = await catalog.resolvePackageJson(pkg);

			expect(result).toEqual(resolvedPkg);
		});

		it("should use custom directory when provided", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockResolvedValue(pkg as never);

			await catalog.resolvePackageJson(pkg, "/custom/dir");

			expect(createExportableManifest).toHaveBeenCalledWith("/custom/dir", pkg, expect.any(Object));
		});

		it("should error when referenced catalog does not exist", async () => {
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					settings: { catalogs: { default: { react: "^18.0.0" } } },
				}),
			);
			catalog.clearCache();

			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				devDependencies: {
					typescript: "catalog:silk",
				},
			};

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("Catalog(s) not found: silk. Available: default");
		});

		it("should error when no catalogs exist but catalog deps present", async () => {
			vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
			vi.mocked(readWantedLockfile).mockResolvedValue(null);
			vi.mocked(getCatalogsFromWorkspaceManifest).mockReturnValue({});
			catalog.clearCache();

			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "catalog:",
				},
			};

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("Catalog(s) not found: default. Available: none");
		});

		it("should throw error when unresolved catalog: references remain", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "catalog:",
				},
			};

			// Return package with unresolved reference
			vi.mocked(createExportableManifest).mockResolvedValue(pkg as never);

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow(
				"Transformation failed: unresolved catalog: references remain in package.json",
			);
		});

		it("should throw error when unresolved workspace: references remain", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					"@my/lib": "workspace:*",
				},
			};

			// Return package with unresolved reference
			vi.mocked(createExportableManifest).mockResolvedValue(pkg as never);

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow(
				"Transformation failed: unresolved workspace: references remain in package.json",
			);
		});

		it("should collect dependencies from all dependency fields", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "catalog:",
				},
				devDependencies: {
					typescript: "catalog:",
				},
				peerDependencies: {
					"react-dom": "catalog:",
				},
				optionalDependencies: {
					fsevents: "workspace:*",
				},
			};

			const resolvedPkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "^18.2.0",
				},
				devDependencies: {
					typescript: "^5.0.0",
				},
				peerDependencies: {
					"react-dom": "^18.2.0",
				},
				optionalDependencies: {
					fsevents: "^2.3.0",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(resolvedPkg as never);

			const result = await catalog.resolvePackageJson(pkg);

			expect(result).toEqual(resolvedPkg);
		});

		it("should re-throw validation errors", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "catalog:",
				},
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("Transformation failed: some validation error"));

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("Transformation failed: some validation error");
		});

		it("should throw catalog resolution error when error contains 'catalog'", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("catalog reference not found"));

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("Catalog resolution failed");
		});

		it("should throw workspace resolution error when error contains 'workspace'", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("workspace package not found"));

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("Workspace resolution failed");
		});

		it("should throw manifest processing error when error contains 'manifest'", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("Invalid manifest format"));

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("Manifest processing failed");
		});

		it("should throw generic transformation error for unknown errors", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("Unknown error occurred"));

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("Transformation failed: Unknown error occurred");
		});

		it("should handle non-Error thrown objects in resolvePackageJson", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue("string error thrown");

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("Transformation failed: string error thrown");
		});

		it("should pass through packages without catalog or workspace references", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					lodash: "^4.17.21",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(pkg as never);

			const result = await catalog.resolvePackageJson(pkg);

			expect(result).toEqual(pkg);
		});
	});

	describe("instance isolation", () => {
		it("should maintain separate caches for different instances", async () => {
			const catalog1 = new WorkspaceCatalog();
			const catalog2 = new WorkspaceCatalog();

			vi.mocked(getWorkspaceManagerAndRoot).mockReturnValue({
				manager: "pnpm",
				root: "/test/workspace",
			});
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					settings: { catalogs: { default: { lodash: "^4.17.21" } } },
				}),
			);

			// Populate catalog1's cache
			await catalog1.getCatalogs();

			// Clear only catalog1's cache
			catalog1.clearCache();

			// Update mock
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					settings: { catalogs: { default: { lodash: "^4.18.0" } } },
				}),
			);

			// catalog1 should read new data
			const result1 = await catalog1.getCatalogs();
			expect(result1).toEqual({ default: { lodash: "^4.18.0" } });

			// catalog2 should also read (it has its own empty cache)
			const result2 = await catalog2.getCatalogs();
			expect(result2).toEqual({ default: { lodash: "^4.18.0" } });
		});
	});

	describe("named catalogs", () => {
		beforeEach(() => {
			vi.mocked(getWorkspaceManagerAndRoot).mockReturnValue({
				manager: "pnpm",
				root: "/test/workspace",
			});
			vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
		});

		it("should support multiple named catalogs from workspace state", async () => {
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					settings: {
						catalogs: {
							default: { react: "^18.0.0" },
							silk: { typescript: "^5.9.0", eslint: "^9.0.0" },
							tools: { vitest: "^4.0.0" },
						},
					},
				}),
			);

			const result = await catalog.getCatalogs();

			expect(result).toEqual({
				default: { react: "^18.0.0" },
				silk: { typescript: "^5.9.0", eslint: "^9.0.0" },
				tools: { vitest: "^4.0.0" },
			});
		});

		it("should resolve dependencies from multiple catalogs", async () => {
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					settings: {
						catalogs: {
							default: { react: "^18.0.0" },
							silk: { typescript: "^5.9.0" },
						},
					},
				}),
			);
			catalog.clearCache();

			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "catalog:",
				},
				devDependencies: {
					typescript: "catalog:silk",
				},
			};

			const resolvedPkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "^18.0.0",
				},
				devDependencies: {
					typescript: "^5.9.0",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(resolvedPkg as never);

			const result = await catalog.resolvePackageJson(pkg);

			expect(result).toEqual(resolvedPkg);
		});
	});
});
