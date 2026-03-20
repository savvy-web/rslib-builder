import { defineConfig } from "@rspress/core";
import { HelloPlugin } from "rspress-plugin-fixture";

export default defineConfig({
	root: "docs",
	outDir: "dist",
	title: "RSPress Plugin Test Site",
	plugins: [HelloPlugin({ message: "RSPress plugin builder is working!" })],
});
