/// <reference types="@rslib/core/types" />

/**
 * Optional peer dependency — module declaration for type resolution.
 * The actual package is dynamically imported at runtime by RSPressPluginBuilder.
 */
declare module "@rsbuild/plugin-react" {
	import type { RsbuildPlugin } from "@rsbuild/core";
	export function pluginReact(): RsbuildPlugin;
}
