import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MANAGED_END } from "../../src/core/markers.js";
import { loadProfiles } from "../../src/core/profiles.js";

const directories: string[] = [];

function makeRoot(files: Record<string, string>): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ppp-profiles-"));
	directories.push(root);
	const profiles = path.join(root, "profiles");
	fs.mkdirSync(profiles, { recursive: true });
	for (const [name, content] of Object.entries(files)) {
		fs.writeFileSync(path.join(profiles, name), content);
	}
	return root;
}

afterEach(() => {
	for (const directory of directories) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
	directories.length = 0;
});

describe("loadProfiles", () => {
	it("uses the file name as the id and keeps the body verbatim", () => {
		const root = makeRoot({ "base.md": "\uFEFFline one\r\nline two\r\n" });
		const catalog = loadProfiles(root, "global", undefined);
		expect([...catalog.profiles.keys()]).toEqual(["base"]);
		expect(catalog.profiles.get("base")?.content).toBe(
			"line one\r\nline two\r\n",
		);
	});

	it("skips a body that contains a reserved managed marker", () => {
		const root = makeRoot({ "evil.md": `text ${MANAGED_END} more` });
		const catalog = loadProfiles(root, "global", undefined);
		expect(catalog.profiles.size).toBe(0);
		expect(
			catalog.createDiagnostics.some(
				(entry) => entry.code === "profile-marker",
			),
		).toBe(true);
	});

	it("skips a file whose name is not a safe id", () => {
		const root = makeRoot({ "not a profile.md": "x" });
		const catalog = loadProfiles(root, "global", undefined);
		expect(catalog.profiles.size).toBe(0);
		expect(
			catalog.createDiagnostics.some((entry) => entry.code === "profile-id"),
		).toBe(true);
	});

	it("skips an oversized profile", () => {
		const root = makeRoot({ "big.md": "a".repeat(100) });
		const catalog = loadProfiles(root, "global", undefined, 10);
		expect(catalog.profiles.size).toBe(0);
		expect(
			catalog.createDiagnostics.some(
				(entry) => entry.code === "profile-too-large",
			),
		).toBe(true);
	});

	it("returns an empty catalog when the directory is absent", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "ppp-empty-"));
		directories.push(root);
		const catalog = loadProfiles(root, "global", undefined);
		expect(catalog.profiles.size).toBe(0);
		expect(catalog.createDiagnostics).toHaveLength(0);
	});
});
