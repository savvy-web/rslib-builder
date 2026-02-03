import { expect } from "vitest";
import type { BuildFixtureResult } from "./build-fixture.js";

/**
 * Assertions for output files.
 */
export interface FileAssertions {
	/** Assert file exists (default: true) */
	exists?: boolean;

	/** Assert file contains these strings */
	contains?: string | string[];

	/** Assert file does NOT contain these strings */
	notContains?: string | string[];

	/** Assert file matches this regex */
	matches?: RegExp;
}

/**
 * Assert properties of an output file.
 *
 * @param result - Build result
 * @param filename - File to assert on
 * @param assertions - Assertions to make
 */
export function assertOutputFile(result: BuildFixtureResult, filename: string, assertions: FileAssertions = {}): void {
	const { exists = true, contains, notContains, matches } = assertions;
	const content = result.outputs.get(filename);

	if (exists) {
		expect(content, `Expected file "${filename}" to exist in output`).toBeDefined();
	} else {
		expect(content, `Expected file "${filename}" to NOT exist in output`).toBeUndefined();
		return;
	}

	if (!content) return;

	if (contains) {
		const containsArr = Array.isArray(contains) ? contains : [contains];
		for (const str of containsArr) {
			expect(content, `Expected "${filename}" to contain "${str}"`).toContain(str);
		}
	}

	if (notContains) {
		const notContainsArr = Array.isArray(notContains) ? notContains : [notContains];
		for (const str of notContainsArr) {
			expect(content, `Expected "${filename}" to NOT contain "${str}"`).not.toContain(str);
		}
	}

	if (matches) {
		expect(content, `Expected "${filename}" to match ${matches}`).toMatch(matches);
	}
}

/**
 * Assertions for package.json.
 */
export interface PackageJsonAssertions {
	/** Assert export path exists */
	hasExport?: string;

	/** Assert types field exists for export */
	hasTypes?: string;

	/** Assert file is in files array */
	hasFile?: string;

	/** Assert file is NOT in files array */
	notHasFile?: string;

	/** Assert field equals value */
	fieldEquals?: Record<string, unknown>;
}

/**
 * Assert properties of the built package.json.
 *
 * @param result - Build result
 * @param assertions - Assertions to make
 */
export function assertPackageJson(result: BuildFixtureResult, assertions: PackageJsonAssertions): void {
	const content = result.outputs.get("package.json");
	expect(content, "Expected package.json to exist in output").toBeDefined();
	if (!content) return; // For type narrowing after the expect assertion

	const pkg = JSON.parse(content) as Record<string, unknown>;

	if (assertions.hasExport) {
		const exports = pkg.exports as Record<string, unknown>;
		expect(exports, "Expected package.json to have exports").toBeDefined();
		expect(exports[assertions.hasExport], `Expected export "${assertions.hasExport}" to exist`).toBeDefined();
	}

	if (assertions.hasTypes) {
		const exports = pkg.exports as Record<string, { types?: string }>;
		const exp = exports[assertions.hasTypes];
		expect(exp, `Expected export "${assertions.hasTypes}" to exist`).toBeDefined();
		expect(exp?.types, `Expected export "${assertions.hasTypes}" to have types field`).toBeDefined();
	}

	if (assertions.hasFile) {
		const files = pkg.files as string[];
		expect(files, "Expected package.json to have files array").toBeDefined();
		expect(files, `Expected files array to include "${assertions.hasFile}"`).toContain(assertions.hasFile);
	}

	if (assertions.notHasFile) {
		const files = pkg.files as string[];
		expect(files, "Expected package.json to have files array").toBeDefined();
		expect(files, `Expected files array to NOT include "${assertions.notHasFile}"`).not.toContain(
			assertions.notHasFile,
		);
	}

	if (assertions.fieldEquals) {
		for (const [field, value] of Object.entries(assertions.fieldEquals)) {
			expect(pkg[field], `Expected package.json.${field} to equal ${JSON.stringify(value)}`).toEqual(value);
		}
	}
}

/**
 * Assert the build succeeded.
 */
export function assertBuildSucceeded(result: BuildFixtureResult): void {
	expect(result.exitCode, `Build failed with exit code ${result.exitCode}:\n${result.stderr}`).toBe(0);
}

/**
 * Assert the build failed.
 */
export function assertBuildFailed(result: BuildFixtureResult): void {
	expect(result.exitCode, "Expected build to fail but it succeeded").not.toBe(0);
}
