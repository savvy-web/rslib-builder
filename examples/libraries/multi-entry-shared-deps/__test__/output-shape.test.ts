import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const distDevDir = join(import.meta.dirname, "..", "dist", "dev");

describe("multi-entry-shared-deps build output shape", () => {
	it("dist/dev exists (build has run)", () => {
		expect(existsSync(distDevDir)).toBe(true);
	});

	it("emits no __webpack_require__ symbol in any chunk", () => {
		// Issue #158: chunks both imported AND declared __webpack_require__,
		// causing Node to throw SyntaxError. With disableSharedChunks setting
		// optimization.runtimeChunk = false, the symbol must not appear in
		// any emitted JS file — neither as a declaration nor as an import.
		const jsFiles = readdirSync(distDevDir).filter((f) => f.endsWith(".js"));
		const offenders: string[] = [];
		for (const file of jsFiles) {
			const content = readFileSync(join(distDevDir, file), "utf-8");
			if (content.includes("__webpack_require__")) {
				offenders.push(file);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("emits valid ESM entry files that re-export from shared chunks", () => {
		// Both entries must be present and use ESM import syntax (not webpack
		// runtime). This is a sanity check that the chunks are loadable as
		// regular ESM by Node.
		const indexJs = readFileSync(join(distDevDir, "index.js"), "utf-8");
		const runtimeJs = readFileSync(join(distDevDir, "runtime.js"), "utf-8");
		expect(indexJs).toMatch(/export\s*\{/);
		expect(runtimeJs).toMatch(/export\s*\{/);
	});
});
