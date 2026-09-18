import { bench, describe } from "vitest";
import { resolveProfile, type ResolveSources } from "../src/core/resolve.js";
import type { ConfigV1 } from "../src/core/types.js";
import { catalog, sourceConfig } from "../test/helpers.js";

function buildSources(): ResolveSources {
	const bindings: ConfigV1["bindings"] = [];
	for (let index = 0; index < 50; index += 1) {
		bindings.push({
			id: `binding-${index}`,
			profile: "global:base",
			priority: index % 5,
			match: [
				{ provider: `provider-${index % 7}`, model: `family-${index}/*` },
			],
		});
	}
	const config: ConfigV1 = {
		version: 1,
		defaultProfile: "global:base",
		bindings,
	};
	return {
		global: sourceConfig("global", config),
		project: sourceConfig("project", { version: 1 }),
		globalProfiles: catalog("global", [
			{ id: "base", content: "BASE" },
			{ id: "review", content: "REVIEW" },
		]),
		projectProfiles: catalog("project", []),
		projectTrusted: false,
	};
}

const sources = buildSources();
const model = { provider: "provider-3", id: "family-3/chat" };

describe("resolveProfile", () => {
	bench("auto resolution over 50 bindings", () => {
		resolveProfile({ mode: "auto" }, model, sources);
	});
});
