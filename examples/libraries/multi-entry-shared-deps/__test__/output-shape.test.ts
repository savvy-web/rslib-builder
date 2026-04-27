import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const exampleDir = join(import.meta.dirname, "..");
const distDevDir = join(exampleDir, "dist", "dev");

describe("multi-entry-shared-deps build output shape", () => {
	beforeAll(() => {
		// Build the example before assertions. Turbo's cache makes repeat
		// runs near-free, but the build must run at least once so dist/dev
		// exists in fresh checkouts and CI (where `pnpm ci:test` runs vitest
		// without a prior `pnpm build`).
		execSync("pnpm turbo run build:dev --filter=@libraries/multi-entry-shared-deps", {
			cwd: exampleDir,
			stdio: "pipe",
		});
	}, 60_000);

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

	it("loads both entries via Node ESM dynamic import", async () => {
		// Sanity check that the chunks are valid, loadable ESM. Loading the
		// entries exercises the cross-chunk import to the shared sibling
		// (e.g. `./512.js`); a Node SyntaxError or ENOENT here would mean
		// the regression has returned.
		const indexUrl = pathToFileURL(join(distDevDir, "index.js")).href;
		const runtimeUrl = pathToFileURL(join(distDevDir, "runtime.js")).href;
		const indexMod = await import(indexUrl);
		const runtimeMod = await import(runtimeUrl);
		expect(typeof indexMod.greet).toBe("function");
		expect(typeof runtimeMod.logEvent).toBe("function");
		expect(indexMod.greet("world")).toContain("hello world");
		expect(runtimeMod.logEvent("ready")).toContain("ready");
	});
});
