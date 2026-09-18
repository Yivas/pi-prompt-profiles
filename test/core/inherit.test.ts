import { describe, expect, it } from "vitest";
import { expandProfile, type InheritDeps } from "../../src/core/inherit.js";
import type {
	LoadedProfile,
	ProfileMeta,
	ProfileRef,
} from "../../src/core/types.js";

function deps(
	profiles: Record<string, string>,
	meta: Record<string, ProfileMeta> = {},
): InheritDeps {
	return {
		getProfile(ref: ProfileRef): LoadedProfile | undefined {
			const content = profiles[`${ref.scope}:${ref.id}`];
			if (content === undefined) {
				return undefined;
			}
			return {
				id: ref.id,
				scope: ref.scope,
				path: `${ref.scope}/${ref.id}.md`,
				content,
				hash: `hash-${ref.scope}-${ref.id}`,
			};
		},
		getMeta(ref: ProfileRef): ProfileMeta | undefined {
			return meta[`${ref.scope}:${ref.id}`];
		},
	};
}

describe("expandProfile", () => {
	it("orders the specific profile before its base", () => {
		const result = expandProfile(
			{ scope: "global", id: "review" },
			deps(
				{ "global:review": "specific", "global:base": "base" },
				{ "global:review": { extends: "base" } },
			),
		);
		expect(result.profile?.layers.map((layer) => layer.ref.id)).toEqual([
			"review",
			"base",
		]);
	});

	it("resolves a project profile into a global base", () => {
		const result = expandProfile(
			{ scope: "project", id: "local" },
			deps(
				{ "project:local": "local", "global:base": "base" },
				{ "project:local": { extends: "global:base" } },
			),
		);
		expect(result.profile?.layers.map((layer) => layer.ref.id)).toEqual([
			"local",
			"base",
		]);
	});

	it("detects cycles", () => {
		const result = expandProfile(
			{ scope: "global", id: "a" },
			deps(
				{ "global:a": "a", "global:b": "b" },
				{ "global:a": { extends: "b" }, "global:b": { extends: "a" } },
			),
		);
		expect(result.profile).toBeUndefined();
		expect(result.diagnostics[0]?.code).toBe("profile-cycle");
	});

	it("reports a missing parent", () => {
		const result = expandProfile(
			{ scope: "global", id: "review" },
			deps(
				{ "global:review": "specific" },
				{ "global:review": { extends: "ghost" } },
			),
		);
		expect(result.profile).toBeUndefined();
		expect(result.diagnostics[0]?.code).toBe("profile-missing");
	});

	it("enforces the depth limit", () => {
		const profiles = { "global:a": "a", "global:b": "b", "global:c": "c" };
		const meta = { "global:a": { extends: "b" }, "global:b": { extends: "c" } };
		const result = expandProfile(
			{ scope: "global", id: "a" },
			deps(profiles, meta),
			{ maxDepth: 2 },
		);
		expect(result.diagnostics[0]?.code).toBe("profile-depth");
	});

	it("enforces the total size limit", () => {
		const result = expandProfile(
			{ scope: "global", id: "a" },
			deps(
				{ "global:a": "aaaaaaaaaa", "global:b": "bbbbbbbbbb" },
				{ "global:a": { extends: "b" } },
			),
			{ maxTotalBytes: 15 },
		);
		expect(result.diagnostics[0]?.code).toBe("profile-total-size");
	});
});
