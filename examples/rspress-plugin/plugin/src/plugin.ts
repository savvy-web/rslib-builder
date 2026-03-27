// import path from "node:path";
// import { fileURLToPath } from "node:url";
import type { RspressPlugin, UserConfig } from "@rspress/core";

/**
 * Options for the hello plugin.
 *
 * @public
 */
export interface HelloPluginOptions {
	/** The greeting message to display during build. Default: `"Hello from @rspress/plugin!"` */
	message?: string | undefined;
}

/**
 * A minimal RSPress plugin that logs a greeting at build time
 * and injects a runtime component into the site.
 *
 * @param options - Plugin options
 * @returns An RSPress plugin
 *
 * @public
 */
export function HelloPlugin(options: HelloPluginOptions = {}): RspressPlugin {
	const message = options.message ?? "Hello from @rspress/plugin!";

	return {
		name: "rspress-plugin-hello",

		async config(config: UserConfig): Promise<UserConfig> {
			console.log(`[rspress-plugin-hello] ${message}`);

			// Ensure the runtime module is included for RSPress bundler resolution
			const updatedConfig = { ...config };
			if (!updatedConfig.builderConfig) {
				updatedConfig.builderConfig = {};
			}
			if (!updatedConfig.builderConfig.source) {
				updatedConfig.builderConfig.source = {};
			}
			const existingInclude = updatedConfig.builderConfig.source.include ?? [];
			updatedConfig.builderConfig.source.include = [...existingInclude, "@rspress/plugin/runtime"];

			return updatedConfig;
		},

		globalUIComponents: ["@rspress/plugin/runtime"],
	};
}
