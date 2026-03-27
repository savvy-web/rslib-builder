#!/usr/bin/env node
/**
 * Hard reset script for all build artifacts.
 * Cleans package, example libraries, and RSPress plugin/site
 * so a full rebuild from scratch is possible.
 * Run from root: pnpm reset
 */

import { readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "../..");
let removedCount = 0;

function remove(targetPath: string): void {
	try {
		statSync(targetPath);
		rmSync(targetPath, { recursive: true, force: true });
		const rel = targetPath.replace(`${rootDir}/`, "");
		console.log(`  removed ${rel}`);
		removedCount++;
	} catch {
		// already gone
	}
}

function getDirs(parentDir: string): string[] {
	try {
		return readdirSync(parentDir).filter((entry) => {
			try {
				return statSync(join(parentDir, entry)).isDirectory();
			} catch {
				return false;
			}
		});
	} catch {
		return [];
	}
}

// --- Root ---
console.log("\nCleaning root");
remove(join(rootDir, ".turbo"));
remove(join(rootDir, "pnpm-lock.yaml"));
remove(join(rootDir, "node_modules"));

// --- Main package (package/) ---
console.log("\nCleaning package/");
remove(join(rootDir, "package", "dist"));
remove(join(rootDir, "package", ".rslib"));
remove(join(rootDir, "package", ".turbo"));
remove(join(rootDir, "package", "node_modules"));

// --- Example libraries (examples/libraries/*) ---
const librariesDir = join(rootDir, "examples", "libraries");
for (const lib of getDirs(librariesDir)) {
	const libDir = join(librariesDir, lib);
	console.log(`\nCleaning examples/libraries/${lib}/`);
	remove(join(libDir, "dist"));
	remove(join(libDir, ".rslib"));
	remove(join(libDir, ".turbo"));
	remove(join(libDir, "node_modules"));
}

// --- RSPress plugin (examples/rspress-plugin/plugin/) ---
const pluginDir = join(rootDir, "examples", "rspress-plugin", "plugin");
console.log("\nCleaning examples/rspress-plugin/plugin/");
remove(join(pluginDir, "dist"));
remove(join(pluginDir, ".rslib"));
remove(join(pluginDir, ".turbo"));
remove(join(pluginDir, "node_modules"));

// --- RSPress site (examples/rspress-plugin/site/) ---
const siteDir = join(rootDir, "examples", "rspress-plugin", "site");
console.log("\nCleaning examples/rspress-plugin/site/");
remove(join(siteDir, "dist"));
remove(join(siteDir, ".rspress"));
remove(join(siteDir, ".turbo"));
remove(join(siteDir, "node_modules"));

console.log(`\nDone. Removed ${removedCount} items.\n`);
