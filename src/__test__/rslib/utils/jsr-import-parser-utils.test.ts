import { describe, expect, it } from "vitest";
import {
	IMPORT_REGEX,
	createExternalImportData,
	isRelativeImport,
	parseImportStatement,
	parseNamedImports,
} from "#utils/jsr-import-parser-utils.js";

describe("jsr-import-parser-utils", () => {
	describe("isRelativeImport", () => {
		it("should return true for relative imports", () => {
			expect(isRelativeImport("./utils")).toBe(true);
			expect(isRelativeImport("../common")).toBe(true);
			expect(isRelativeImport("./index.js")).toBe(true);
		});

		it("should return false for absolute imports", () => {
			expect(isRelativeImport("lodash")).toBe(false);
			expect(isRelativeImport("@types/node")).toBe(false);
			expect(isRelativeImport("react")).toBe(false);
		});
	});

	describe("createExternalImportData", () => {
		it("should create empty external import data structure", () => {
			const result = createExternalImportData();

			expect(result.named).toBeInstanceOf(Set);
			expect(result.namespaceImports).toBeInstanceOf(Set);
			expect(result.defaultImports).toBeInstanceOf(Set);
			expect(result.types).toBeInstanceOf(Set);

			expect(result.named.size).toBe(0);
			expect(result.namespaceImports.size).toBe(0);
			expect(result.defaultImports.size).toBe(0);
			expect(result.types.size).toBe(0);
		});
	});

	describe("parseNamedImports", () => {
		it("should parse simple named imports", () => {
			const result = parseNamedImports("foo, bar");

			expect(result).toEqual(["foo", "bar"]);
		});

		it("should parse named imports with aliases", () => {
			const result = parseNamedImports("foo as baz, bar");

			expect(result).toEqual(["foo", "bar"]);
		});

		it("should handle empty string", () => {
			const result = parseNamedImports("");

			expect(result).toEqual([]);
		});

		it("should handle whitespace", () => {
			const result = parseNamedImports(" foo , bar ");

			expect(result).toEqual(["foo", "bar"]);
		});

		it("should handle complex aliases", () => {
			const result = parseNamedImports("foo as F, bar as B, baz");

			expect(result).toEqual(["foo", "bar", "baz"]);
		});
	});

	describe("parseImportStatement", () => {
		it("should parse default import", () => {
			const regex = new RegExp(IMPORT_REGEX.source, "gm");
			const match = regex.exec("import React from 'react';");

			expect(match).not.toBeNull();
			const result = parseImportStatement(match as RegExpExecArray);

			expect(result).toEqual({
				typeKeyword: undefined,
				namedImports1: undefined,
				namespaceName: undefined,
				defaultImport: "React",
				namedImports2: undefined,
				defaultImport2: undefined,
				importPath: "react",
			});
		});

		it("should parse named imports", () => {
			const regex = new RegExp(IMPORT_REGEX.source, "gm");
			const match = regex.exec("import { useState, useEffect } from 'react';");

			expect(match).not.toBeNull();
			const result = parseImportStatement(match as RegExpExecArray);

			expect(result).toEqual({
				typeKeyword: undefined,
				namedImports1: " useState, useEffect ",
				namespaceName: undefined,
				defaultImport: undefined,
				namedImports2: undefined,
				defaultImport2: undefined,
				importPath: "react",
			});
		});

		it("should parse namespace import", () => {
			const regex = new RegExp(IMPORT_REGEX.source, "gm");
			const match = regex.exec("import * as React from 'react';");

			expect(match).not.toBeNull();
			const result = parseImportStatement(match as RegExpExecArray);

			expect(result).toEqual({
				typeKeyword: undefined,
				namedImports1: undefined,
				namespaceName: "React",
				defaultImport: undefined,
				namedImports2: undefined,
				defaultImport2: undefined,
				importPath: "react",
			});
		});

		it("should parse type import", () => {
			const regex = new RegExp(IMPORT_REGEX.source, "gm");
			const match = regex.exec("import type { FC } from 'react';");

			expect(match).not.toBeNull();
			const result = parseImportStatement(match as RegExpExecArray);

			expect(result).toEqual({
				typeKeyword: "type",
				namedImports1: " FC ",
				namespaceName: undefined,
				defaultImport: undefined,
				namedImports2: undefined,
				defaultImport2: undefined,
				importPath: "react",
			});
		});
	});
});
