import { describe, expect, it } from "vitest";
import type { PackageJson } from "../../types/package-json.js";
import { resolvePublishTargets } from "./node-library-builder.js";

const CWD = "/project";
const OUTDIR = "/project/dist/npm";

describe("resolvePublishTargets", () => {
	describe("no targets configured", () => {
		it("should return empty array when publishConfig is undefined", () => {
			const pkg: PackageJson = { name: "test" };
			expect(resolvePublishTargets(pkg, CWD, OUTDIR)).toEqual([]);
		});

		it("should return empty array when publishConfig has no targets", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { access: "public" },
			};
			expect(resolvePublishTargets(pkg, CWD, OUTDIR)).toEqual([]);
		});

		it("should return empty array when targets is empty array", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: [] },
			};
			expect(resolvePublishTargets(pkg, CWD, OUTDIR)).toEqual([]);
		});
	});

	describe("shorthand strings", () => {
		it("should resolve 'npm' shorthand", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: ["npm"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target).toEqual({
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: OUTDIR,
				access: "restricted",
				provenance: true,
				tag: "latest",
			});
		});

		it("should resolve 'github' shorthand", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: ["github"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target).toEqual({
				protocol: "npm",
				registry: "https://npm.pkg.github.com/",
				directory: OUTDIR,
				access: "restricted",
				provenance: true,
				tag: "latest",
			});
		});

		it("should resolve 'jsr' shorthand", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: ["jsr"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target).toEqual({
				protocol: "jsr",
				registry: null,
				directory: OUTDIR,
				access: "restricted",
				provenance: false,
				tag: "latest",
			});
		});

		it("should resolve URL shorthand as custom npm registry", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: ["https://custom.registry.io/"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target).toEqual({
				protocol: "npm",
				registry: "https://custom.registry.io/",
				directory: OUTDIR,
				access: "restricted",
				provenance: false,
				tag: "latest",
			});
		});

		it("should resolve http URL shorthand", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: ["http://localhost:4873/"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target?.protocol).toBe("npm");
			expect(target?.registry).toBe("http://localhost:4873/");
		});

		it("should throw on unknown shorthand string", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: ["unknown"] },
			};
			expect(() => resolvePublishTargets(pkg, CWD, OUTDIR)).toThrow("Unknown publish target shorthand: unknown");
		});
	});

	describe("full object targets", () => {
		it("should resolve npm target with all fields", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: {
					targets: [
						{
							protocol: "npm",
							registry: "https://registry.npmjs.org/",
							directory: "dist/npm",
							access: "public",
							provenance: true,
							tag: "next",
						},
					],
				},
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target).toEqual({
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/project/dist/npm",
				access: "public",
				provenance: true,
				tag: "next",
			});
		});

		it("should resolve JSR target with null registry", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: [{ protocol: "jsr" }] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target?.protocol).toBe("jsr");
			expect(target?.registry).toBeNull();
		});

		it("should default protocol to npm when not specified", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: {
					targets: [{ registry: "https://custom.reg/" }],
				},
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target?.protocol).toBe("npm");
		});

		it("should default registry to npmjs.org for npm protocol", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: [{ protocol: "npm" }] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target?.registry).toBe("https://registry.npmjs.org/");
		});

		it("should default provenance to false", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: [{ protocol: "npm" }] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target?.provenance).toBe(false);
		});

		it("should default tag to 'latest'", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: [{ protocol: "npm" }] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target?.tag).toBe("latest");
		});
	});

	describe("defaults from publishConfig", () => {
		it("should inherit access from publishConfig", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { access: "public", targets: ["npm"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target?.access).toBe("public");
		});

		it("should use publishConfig.directory as default directory", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { directory: "dist/custom", targets: ["npm"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target?.directory).toBe("/project/dist/custom");
		});

		it("should allow target directory to override publishConfig.directory", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: {
					directory: "dist/default",
					targets: [{ protocol: "npm", directory: "dist/override" }],
				},
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target?.directory).toBe("/project/dist/override");
		});

		it("should fall back to outdir when no directory specified", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: ["npm"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target?.directory).toBe(OUTDIR);
		});

		it("should allow target access to override publishConfig.access", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: {
					access: "restricted",
					targets: [{ protocol: "npm", access: "public" }],
				},
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target?.access).toBe("public");
		});
	});

	describe("multiple targets", () => {
		it("should resolve mixed shorthand and object targets", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: {
					access: "public",
					targets: ["npm", "github", { protocol: "jsr" }],
				},
			};
			const result = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(result).toHaveLength(3);
			const [npm, github, jsr] = result;
			expect(npm?.registry).toBe("https://registry.npmjs.org/");
			expect(github?.registry).toBe("https://npm.pkg.github.com/");
			expect(jsr?.protocol).toBe("jsr");
			expect(jsr?.registry).toBeNull();
		});
	});
});
