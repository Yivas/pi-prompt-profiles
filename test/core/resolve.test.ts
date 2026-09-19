import { describe, expect, it } from "vitest";
import { resolveProfile, type ResolveSources } from "../../src/core/resolve.js";
import type {
	ConfigV1,
	ProfileCatalog,
	SourceConfig,
} from "../../src/core/types.js";
import { catalog, sourceConfig } from "../helpers.js";

function build(options: {
	globalConfig?: ConfigV1;
	projectConfig?: ConfigV1;
	projectTrusted?: boolean;
	globalProfiles?: ProfileCatalog;
	projectProfiles?: ProfileCatalog;
}): ResolveSources {
	const global: SourceConfig = sourceConfig("global", options.globalConfig);
	const project: SourceConfig = sourceConfig("project", options.projectConfig);
	return {
		global,
		project,
		globalProfiles: options.globalProfiles ?? catalog("global", []),
		projectProfiles: options.projectProfiles ?? catalog("project", []),
		projectTrusted: options.projectTrusted ?? false,
	};
}

const model = { provider: "deepseek", id: "deepseek-chat" };

describe("resolveProfile", () => {
	it("returns off without touching profiles", () => {
		const resolution = resolveProfile({ mode: "off" }, model, build({}));
		expect(resolution.mode).toBe("off");
		expect(resolution.profile).toBeUndefined();
	});

	it("uses the global default when nothing else matches", () => {
		const sources = build({
			globalConfig: {
				version: 1,
				selection: { mode: "auto" },
				defaultProfile: "global:base",
			},
			globalProfiles: catalog("global", [{ id: "base", content: "BASE" }]),
		});
		const resolution = resolveProfile({ mode: "auto" }, model, sources);
		expect(resolution.profile?.ref).toEqual({ scope: "global", id: "base" });
	});

	it("prefers an explicit binding over a default", () => {
		const sources = build({
			globalConfig: {
				version: 1,
				defaultProfile: "global:base",
				bindings: [
					{
						id: "ds",
						profile: "global:deepseek",
						match: [{ provider: "deepseek", model: "*" }],
					},
				],
			},
			globalProfiles: catalog("global", [
				{ id: "base", content: "BASE" },
				{ id: "deepseek", content: "DS" },
			]),
		});
		const resolution = resolveProfile({ mode: "auto" }, model, sources);
		expect(resolution.profile?.ref.id).toBe("deepseek");
		expect(resolution.binding?.binding.id).toBe("ds");
	});

	it("lets a project binding win over a global binding", () => {
		const sources = build({
			projectTrusted: true,
			globalConfig: {
				version: 1,
				bindings: [
					{ id: "g", profile: "global:base", match: [{ provider: "*" }] },
				],
			},
			projectConfig: {
				version: 1,
				bindings: [
					{ id: "p", profile: "project:local", match: [{ provider: "*" }] },
				],
			},
			globalProfiles: catalog("global", [{ id: "base", content: "BASE" }]),
			projectProfiles: catalog("project", [{ id: "local", content: "LOCAL" }]),
		});
		expect(
			resolveProfile({ mode: "auto" }, model, sources).profile?.ref.id,
		).toBe("local");
	});

	it("ignores project resources when the project is untrusted", () => {
		const sources = build({
			projectTrusted: false,
			globalConfig: {
				version: 1,
				bindings: [
					{ id: "g", profile: "global:base", match: [{ provider: "*" }] },
				],
			},
			projectConfig: {
				version: 1,
				bindings: [
					{ id: "p", profile: "project:local", match: [{ provider: "*" }] },
				],
			},
			globalProfiles: catalog("global", [{ id: "base", content: "BASE" }]),
			projectProfiles: catalog("project", [{ id: "local", content: "LOCAL" }]),
		});
		expect(
			resolveProfile({ mode: "auto" }, model, sources).profile?.ref.id,
		).toBe("base");
	});

	it("breaks ties by specificity", () => {
		const sources = build({
			globalConfig: {
				version: 1,
				bindings: [
					{
						id: "provider-only",
						profile: "global:base",
						match: [{ provider: "deepseek" }],
					},
					{
						id: "model-only",
						profile: "global:ds",
						match: [{ model: "deepseek-chat" }],
					},
				],
			},
			globalProfiles: catalog("global", [
				{ id: "base", content: "BASE" },
				{ id: "ds", content: "DS" },
			]),
		});
		expect(
			resolveProfile({ mode: "auto" }, model, sources).profile?.ref.id,
		).toBe("ds");
	});

	it("lets priority beat specificity", () => {
		const sources = build({
			globalConfig: {
				version: 1,
				bindings: [
					{
						id: "specific",
						profile: "global:ds",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
					{
						id: "priority",
						priority: 5,
						profile: "global:base",
						match: [{ provider: "*" }],
					},
				],
			},
			globalProfiles: catalog("global", [
				{ id: "base", content: "BASE" },
				{ id: "ds", content: "DS" },
			]),
		});
		expect(
			resolveProfile({ mode: "auto" }, model, sources).profile?.ref.id,
		).toBe("base");
	});

	it("reports a conflict instead of choosing by order", () => {
		const sources = build({
			globalConfig: {
				version: 1,
				bindings: [
					{
						id: "a",
						profile: "global:x",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
					{
						id: "b",
						profile: "global:y",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
				],
			},
			globalProfiles: catalog("global", [
				{ id: "x", content: "X" },
				{ id: "y", content: "Y" },
			]),
		});
		const resolution = resolveProfile({ mode: "auto" }, model, sources);
		expect(resolution.profile).toBeUndefined();
		expect(
			resolution.diagnostics.some((entry) => entry.code === "binding-conflict"),
		).toBe(true);
	});

	it("does not fall back to global bindings when project rules conflict", () => {
		const sources = build({
			projectTrusted: true,
			globalConfig: {
				version: 1,
				bindings: [
					{ id: "g", profile: "global:base", match: [{ provider: "*" }] },
				],
			},
			projectConfig: {
				version: 1,
				bindings: [
					{
						id: "a",
						profile: "project:x",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
					{
						id: "b",
						profile: "project:y",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
				],
			},
			globalProfiles: catalog("global", [{ id: "base", content: "BASE" }]),
			projectProfiles: catalog("project", [
				{ id: "x", content: "X" },
				{ id: "y", content: "Y" },
			]),
		});
		const resolution = resolveProfile({ mode: "auto" }, model, sources);
		expect(resolution.profile).toBeUndefined();
		expect(
			resolution.diagnostics.some((entry) => entry.code === "binding-conflict"),
		).toBe(true);
	});

	it("honors inheritGlobalBindings: false", () => {
		const sources = build({
			projectTrusted: true,
			globalConfig: {
				version: 1,
				bindings: [
					{ id: "g", profile: "global:base", match: [{ provider: "*" }] },
				],
			},
			projectConfig: {
				version: 1,
				inheritGlobalBindings: false,
				defaultProfile: "project:local",
			},
			globalProfiles: catalog("global", [{ id: "base", content: "BASE" }]),
			projectProfiles: catalog("project", [{ id: "local", content: "LOCAL" }]),
		});
		expect(
			resolveProfile({ mode: "auto" }, model, sources).profile?.ref.id,
		).toBe("local");
	});

	it("matches a slash inside a model id", () => {
		const sources = build({
			globalConfig: {
				version: 1,
				bindings: [
					{
						id: "ds",
						profile: "global:ds",
						match: [{ provider: "openrouter", model: "deepseek/*" }],
					},
				],
			},
			globalProfiles: catalog("global", [{ id: "ds", content: "DS" }]),
		});
		const resolution = resolveProfile(
			{ mode: "auto" },
			{ provider: "openrouter", id: "deepseek/r1" },
			sources,
		);
		expect(resolution.profile?.ref.id).toBe("ds");
	});

	it("uses a manual selection regardless of the model", () => {
		const sources = build({
			globalProfiles: catalog("global", [{ id: "review", content: "REVIEW" }]),
		});
		const resolution = resolveProfile(
			{ mode: "manual", profile: "global:review" },
			{ provider: "x", id: "y" },
			sources,
		);
		expect(resolution.mode).toBe("manual");
		expect(resolution.profile?.ref.id).toBe("review");
	});

	it("returns native when nothing matches", () => {
		const sources = build({ globalConfig: { version: 1 } });
		const resolution = resolveProfile({ mode: "auto" }, model, sources);
		expect(resolution.profile).toBeUndefined();
		expect(resolution.mode).toBe("auto");
	});

	it("waits instead of failing when no model is selected", () => {
		const resolution = resolveProfile({ mode: "auto" }, undefined, build({}));
		expect(resolution.profile).toBeUndefined();
		expect(
			resolution.diagnostics.some((entry) => entry.code === "auto-no-model"),
		).toBe(true);
	});

	it("skips the default profile when only bindings count", () => {
		const sources = build({
			globalConfig: { version: 1, defaultProfile: "global:base" },
			globalProfiles: catalog("global", [{ id: "base", content: "BASE" }]),
		});
		expect(
			resolveProfile({ mode: "auto" }, model, sources).profile?.ref.id,
		).toBe("base");
		expect(
			resolveProfile({ mode: "auto" }, model, sources, { bindingsOnly: true })
				.profile,
		).toBeUndefined();
	});

	it("still applies an explicit binding when only bindings count", () => {
		const sources = build({
			globalConfig: {
				version: 1,
				defaultProfile: "global:base",
				bindings: [
					{
						id: "ds",
						profile: "global:deepseek",
						match: [{ provider: "deepseek", model: "deepseek-*" }],
					},
				],
			},
			globalProfiles: catalog("global", [
				{ id: "base", content: "BASE" },
				{ id: "deepseek", content: "DS" },
			]),
		});
		const resolution = resolveProfile({ mode: "auto" }, model, sources, {
			bindingsOnly: true,
		});
		expect(resolution.profile?.ref.id).toBe("deepseek");
	});
});
