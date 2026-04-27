import type { Rspack } from "@rsbuild/core";
import { describe, expect, it } from "vitest";
import { disableSharedChunks } from "./disable-shared-chunks.js";

describe("disableSharedChunks", () => {
	it("sets optimization.runtimeChunk to false on a config without optimization", () => {
		const config: Rspack.Configuration = {};
		disableSharedChunks(config);
		expect(config.optimization?.runtimeChunk).toBe(false);
	});

	it("sets optimization.splitChunks to false on a config without optimization", () => {
		const config: Rspack.Configuration = {};
		disableSharedChunks(config);
		expect(config.optimization?.splitChunks).toBe(false);
	});

	it("overrides existing optimization.runtimeChunk", () => {
		const config: Rspack.Configuration = {
			optimization: { runtimeChunk: { name: "runtime" } },
		};
		disableSharedChunks(config);
		expect(config.optimization?.runtimeChunk).toBe(false);
	});

	it("overrides existing optimization.splitChunks", () => {
		const config: Rspack.Configuration = {
			optimization: { splitChunks: { chunks: "async" } },
		};
		disableSharedChunks(config);
		expect(config.optimization?.splitChunks).toBe(false);
	});

	it("preserves other optimization fields", () => {
		const config: Rspack.Configuration = {
			optimization: { moduleIds: "named", concatenateModules: false },
		};
		disableSharedChunks(config);
		expect(config.optimization?.moduleIds).toBe("named");
		expect(config.optimization?.concatenateModules).toBe(false);
	});
});
