import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfigFile } from "../../src/core/config.js";

const directories: string[] = [];

function writeConfig(contents: string | undefined): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ppp-config-"));
	directories.push(directory);
	const file = path.join(directory, "config.json");
	if (contents !== undefined) {
		fs.writeFileSync(file, contents);
	}
	return file;
}

afterEach(() => {
	for (const directory of directories) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
	directories.length = 0;
});

describe("loadConfigFile", () => {
	it("treats a missing file as normal", () => {
		const result = loadConfigFile(writeConfig(undefined), "global");
		expect(result.exists).toBe(false);
		expect(result.config).toBeUndefined();
		expect(result.diagnostics).toHaveLength(0);
	});

	it("parses a valid config and keeps references raw", () => {
		const result = loadConfigFile(
			writeConfig(
				JSON.stringify({
					version: 1,
					selection: { mode: "auto" },
					defaultProfile: "global:base",
					bindings: [
						{
							id: "ds",
							profile: "global:deepseek",
							priority: 1,
							match: [{ provider: "deepseek", model: "*" }],
						},
					],
				}),
			),
			"global",
		);
		expect(result.diagnostics).toHaveLength(0);
		expect(result.config?.bindings?.[0]?.id).toBe("ds");
	});

	it("handles a UTF-8 BOM", () => {
		const result = loadConfigFile(
			writeConfig(`\uFEFF${JSON.stringify({ version: 1 })}`),
			"global",
		);
		expect(result.config?.version).toBe(1);
		expect(result.diagnostics).toHaveLength(0);
	});

	it("reports invalid JSON", () => {
		const result = loadConfigFile(writeConfig("{ not json"), "global");
		expect(result.diagnostics[0]?.code).toBe("config-parse");
	});

	it("rejects an unsupported version", () => {
		const result = loadConfigFile(
			writeConfig(JSON.stringify({ version: 99 })),
			"global",
		);
		expect(result.config).toBeUndefined();
		expect(result.diagnostics[0]?.code).toBe("config-version");
	});

	it("rejects an invalid selection", () => {
		const result = loadConfigFile(
			writeConfig(
				JSON.stringify({ version: 1, selection: { mode: "sometimes" } }),
			),
			"global",
		);
		expect(result.diagnostics[0]?.code).toBe("config-selection");
	});

	it("drops a binding with an invalid profile reference", () => {
		const result = loadConfigFile(
			writeConfig(
				JSON.stringify({
					version: 1,
					bindings: [
						{ id: "x", profile: "../escape", match: [{ provider: "*" }] },
					],
				}),
			),
			"global",
		);
		expect(result.config?.bindings).toHaveLength(0);
		expect(
			result.diagnostics.some(
				(entry) => entry.code === "config-binding-profile",
			),
		).toBe(true);
	});

	it("warns that inheritGlobalBindings is project-only", () => {
		const result = loadConfigFile(
			writeConfig(JSON.stringify({ version: 1, inheritGlobalBindings: false })),
			"global",
		);
		expect(
			result.diagnostics.some((entry) => entry.code === "config-inherit"),
		).toBe(true);
	});
});
