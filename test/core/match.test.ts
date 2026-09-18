import { describe, expect, it } from "vitest";
import { globMatch, matchRule, ruleSpecificity } from "../../src/core/match.js";

describe("globMatch", () => {
	it("matches exact strings only", () => {
		expect(globMatch("deepseek", "deepseek")).toBe(true);
		expect(globMatch("deepseek", "deepseek-chat")).toBe(false);
		expect(globMatch("deepseek", "deep")).toBe(false);
	});

	it("treats a lone star as everything", () => {
		expect(globMatch("*", "anything/with/slashes")).toBe(true);
	});

	it("lets the star cross slashes in a model id", () => {
		expect(globMatch("deepseek/*", "deepseek/chat")).toBe(true);
		expect(globMatch("deepseek/*", "deepseek/a/b")).toBe(true);
		expect(globMatch("deepseek/*", "deepseek")).toBe(false);
	});

	it("escapes regular-expression characters", () => {
		expect(globMatch("gpt-5.2", "gpt-5.2")).toBe(true);
		expect(globMatch("gpt-5.2", "gpt-5x2")).toBe(false);
		expect(globMatch("a+b", "a+b")).toBe(true);
		expect(globMatch("a+b", "aab")).toBe(false);
	});
});

describe("ruleSpecificity", () => {
	it("ranks exact fields above wildcards", () => {
		expect(
			ruleSpecificity({ provider: "openrouter", model: "deepseek/r1" }),
		).toBe(3);
		expect(ruleSpecificity({ model: "deepseek/r1" })).toBe(2);
		expect(ruleSpecificity({ provider: "openrouter" })).toBe(1);
		expect(ruleSpecificity({})).toBe(0);
	});

	it("combines provider and model with AND", () => {
		expect(
			matchRule(
				{ provider: "openrouter", model: "deepseek/r1" },
				{ provider: "openrouter", id: "deepseek/r1" },
			),
		).toBe(true);
		expect(
			matchRule(
				{ provider: "openrouter", model: "deepseek/r1" },
				{ provider: "deepseek", id: "deepseek/r1" },
			),
		).toBe(false);
	});
});
