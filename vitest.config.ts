import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for @savvy-web/rslib-builder
 * @see https://vitest.dev/config/
 */
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/__test__/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "text-summary", "html", "lcov"],
			include: ["src/rslib/**/*.ts"],
			exclude: ["**/*.test.ts", "**/__test__/**", "**/types/**", "**/*.d.ts"],
		},
	},
	resolve: {
		alias: {
			"#utils": fileURLToPath(new URL("./src/rslib/plugins/utils", import.meta.url)),
			"#types": fileURLToPath(new URL("./src/types", import.meta.url)),
		},
		extensions: [".ts", ".js", ".json"],
	},
});
