import { describe, expect, it } from "vitest";
import {
	allModels,
	filterItems,
	modelsOfProvider,
	providerNames,
	visibleWindow,
} from "../../src/core/picker.js";
import type { ModelIdentity } from "../../src/core/types.js";

const models: ModelIdentity[] = [
	{ provider: "openrouter", id: "zeta" },
	{ provider: "deepseek", id: "deepseek-chat" },
	{ provider: "deepseek", id: "deepseek-reasoner" },
	{ provider: "openrouter", id: "alpha" },
];

describe("providerNames", () => {
	it("returns unique sorted providers", () => {
		expect(providerNames(models)).toEqual(["deepseek", "openrouter"]);
	});
});

describe("modelsOfProvider", () => {
	it("keeps one provider and sorts by id", () => {
		expect(
			modelsOfProvider(models, "deepseek").map((model) => model.id),
		).toEqual(["deepseek-chat", "deepseek-reasoner"]);
		expect(modelsOfProvider(models, "missing")).toEqual([]);
	});
});

describe("allModels", () => {
	it("sorts every model by provider then id", () => {
		expect(allModels(models)).toEqual([
			{ provider: "deepseek", id: "deepseek-chat" },
			{ provider: "deepseek", id: "deepseek-reasoner" },
			{ provider: "openrouter", id: "alpha" },
			{ provider: "openrouter", id: "zeta" },
		]);
	});
});

describe("filterItems", () => {
	const items = [
		{ value: "a", label: "deepseek-chat" },
		{ value: "b", label: "openrouter/alpha" },
	];

	it("returns every item for an empty query", () => {
		expect(filterItems(items, "  ")).toEqual(items);
	});

	it("matches case-insensitively on label or value", () => {
		expect(filterItems(items, "DEEP")).toEqual([items[0]]);
		expect(filterItems(items, "b")).toEqual([items[1]]);
		expect(filterItems(items, "zzz")).toEqual([]);
	});
});

describe("visibleWindow", () => {
	it("shows everything when the list fits", () => {
		expect(visibleWindow(4, 2, 10)).toEqual({ start: 0, end: 4 });
	});

	it("keeps the selection inside a centered window", () => {
		expect(visibleWindow(50, 25, 10)).toEqual({ start: 20, end: 30 });
	});

	it("clamps at both ends", () => {
		expect(visibleWindow(50, 0, 10)).toEqual({ start: 0, end: 10 });
		expect(visibleWindow(50, 49, 10)).toEqual({ start: 40, end: 50 });
	});
});
