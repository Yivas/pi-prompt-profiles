import { describe, expect, it } from "vitest";
import {
	applySetting,
	effectiveSetting,
	parseSetting,
	readSettingValue,
	settingScopeError,
	settingSpec,
	unsetSetting,
} from "../../src/core/settings.js";
import type { ConfigV1 } from "../../src/core/types.js";

function parse(key: string, value: string) {
	const result = parseSetting(key, value);
	if (!result.ok) {
		throw new Error(`expected a valid setting: ${result.message}`);
	}
	return result.setting;
}

describe("parseSetting", () => {
	it("accepts every subagent policy", () => {
		for (const value of ["off", "bindings", "inherit"]) {
			expect(parse("subagents", value).value).toBe(value);
		}
	});

	it("accepts the key case-insensitively and trims the value", () => {
		expect(parse(" Subagents ", " off ").value).toBe("off");
	});

	it("treats selection.mode as the whole selection", () => {
		expect(settingSpec("selection.mode")?.key).toBe("selection");
		expect(parse("selection.mode", "off").spec.key).toBe("selection");
	});

	it("rejects unknown keys, including inherited object members", () => {
		for (const key of ["nope", "__proto__", "constructor", "toString"]) {
			const result = parseSetting(key, "x");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.message).toContain("Unknown setting");
			}
		}
	});

	it("rejects out-of-range values", () => {
		expect(parseSetting("subagents", "always").ok).toBe(false);
		expect(parseSetting("selection", "manual").ok).toBe(false);
		expect(parseSetting("inheritGlobalBindings", "yes").ok).toBe(false);
	});

	it("parses booleans for inheritGlobalBindings", () => {
		expect(parse("inheritGlobalBindings", "false").value).toBe(false);
		expect(parse("inheritGlobalBindings", "true").value).toBe(true);
	});

	it("keeps defaultProfile out of /sp set", () => {
		const result = parseSetting("defaultProfile", "global:base");
		expect(result.ok).toBe(false);
	});
});

describe("settingScopeError", () => {
	it("rejects inheritGlobalBindings in the global config", () => {
		const spec = settingSpec("inheritGlobalBindings");
		expect(spec && settingScopeError(spec, "global")).toContain(
			"--scope project",
		);
		expect(spec && settingScopeError(spec, "project")).toBeUndefined();
	});
});

describe("applySetting", () => {
	it("writes a scalar", () => {
		const config: Record<string, unknown> = { version: 1 };
		applySetting(config, parse("subagents", "off"));
		expect(config.subagents).toBe("off");
	});

	it("replaces the whole selection so a manual profile cannot survive", () => {
		const config: Record<string, unknown> = {
			version: 1,
			selection: { mode: "manual", profile: "global:base" },
		};
		applySetting(config, parse("selection", "auto"));
		expect(config.selection).toEqual({ mode: "auto" });
	});
});

describe("unsetSetting", () => {
	it("removes a present key", () => {
		const config: Record<string, unknown> = { version: 1, subagents: "off" };
		const result = unsetSetting(config, "subagents");
		expect(result.ok).toBe(true);
		expect("subagents" in config).toBe(false);
	});

	it("reports a missing key without touching the config", () => {
		const config: Record<string, unknown> = { version: 1 };
		const result = unsetSetting(config, "selection");
		expect(result.ok).toBe(false);
		expect(config).toEqual({ version: 1 });
	});
});

describe("readSettingValue", () => {
	it("reads present keys and ignores absent ones", () => {
		const config: ConfigV1 = {
			version: 1,
			subagents: "off",
			selection: { mode: "manual", profile: "global:base" },
		};
		expect(readSettingValue(config, "subagents")).toBe("off");
		expect(readSettingValue(config, "selection")).toBe("manual");
		expect(readSettingValue(config, "inheritGlobalBindings")).toBeUndefined();
		expect(readSettingValue(undefined, "subagents")).toBeUndefined();
	});
});

describe("effectiveSetting", () => {
	const key = "subagents" as const;

	it("prefers the project, then the global, then the default", () => {
		expect(
			effectiveSetting(
				{ global: undefined, project: undefined, projectActive: false },
				key,
			),
		).toEqual({ value: "bindings", origin: "default" });
		expect(
			effectiveSetting(
				{
					global: { version: 1, subagents: "off" },
					project: undefined,
					projectActive: false,
				},
				key,
			),
		).toEqual({ value: "off", origin: "global" });
		expect(
			effectiveSetting(
				{
					global: { version: 1, subagents: "off" },
					project: { version: 1, subagents: "inherit" },
					projectActive: true,
				},
				key,
			),
		).toEqual({ value: "inherit", origin: "project" });
	});

	it("ignores an untrusted project", () => {
		expect(
			effectiveSetting(
				{
					global: { version: 1, subagents: "off" },
					project: { version: 1, subagents: "inherit" },
					projectActive: false,
				},
				key,
			),
		).toEqual({ value: "off", origin: "global" });
	});

	it("keeps a stored false instead of the default true", () => {
		expect(
			effectiveSetting(
				{
					global: { version: 1, inheritGlobalBindings: false },
					project: undefined,
					projectActive: false,
				},
				"inheritGlobalBindings",
			),
		).toEqual({ value: false, origin: "global" });
	});
});
