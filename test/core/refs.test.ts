import { describe, expect, it } from "vitest";
import { isSafeId } from "../../src/core/ids.js";
import { formatRef, parseRef, resolveRef } from "../../src/core/refs.js";

describe("isSafeId", () => {
	it("accepts simple ids", () => {
		expect(isSafeId("base")).toBe(true);
		expect(isSafeId("review-v2")).toBe(true);
		expect(isSafeId("gpt_5.2")).toBe(true);
	});

	it("rejects paths and traversal", () => {
		expect(isSafeId("../escape")).toBe(false);
		expect(isSafeId("a/b")).toBe(false);
		expect(isSafeId("a\\b")).toBe(false);
		expect(isSafeId(".hidden")).toBe(false);
		expect(isSafeId("")).toBe(false);
		expect(isSafeId("a..b")).toBe(false);
	});
});

describe("references", () => {
	it("parses explicit scopes", () => {
		expect(parseRef("global:base")).toEqual({ scope: "global", id: "base" });
		expect(parseRef("project:base")).toEqual({ scope: "project", id: "base" });
		expect(parseRef("local:base")).toBeUndefined();
		expect(parseRef("global:../x")).toBeUndefined();
	});

	it("normalizes a bare id inside a default scope", () => {
		expect(resolveRef("review", "project")).toEqual({
			scope: "project",
			id: "review",
		});
		expect(resolveRef("global:review", "project")).toEqual({
			scope: "global",
			id: "review",
		});
	});

	it("rejects an unknown scope or an unsafe id", () => {
		expect(resolveRef("weird:review", "global")).toBeUndefined();
		expect(resolveRef("a/b", "global")).toBeUndefined();
	});

	it("formats references", () => {
		expect(formatRef({ scope: "global", id: "base" })).toBe("global:base");
	});
});
