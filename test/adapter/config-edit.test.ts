import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	applyControlText,
	readRawConfig,
	type RawConfig,
	writeRawConfigIfUnchanged,
} from "../../src/adapter/config-edit.js";

const directories: string[] = [];

function tempFile(contents?: string): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ppp-edit-"));
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

describe("readRawConfig", () => {
	it("treats a missing file as an empty version-1 config", () => {
		const snapshot = readRawConfig(tempFile());
		expect(snapshot.exists).toBe(false);
		expect(snapshot.config).toEqual({ version: 1 });
	});

	it("reports invalid JSON with the file path", () => {
		const file = tempFile("{ not json");
		expect(() => readRawConfig(file)).toThrow(file);
		expect(() => readRawConfig(file)).toThrow(/invalid JSON/);
	});
});

describe("writeRawConfigIfUnchanged", () => {
	it("writes and preserves unknown fields", () => {
		const file = tempFile(JSON.stringify({ version: 1, custom: true }));
		const snapshot = readRawConfig(file);
		snapshot.config.subagents = "off";
		writeRawConfigIfUnchanged(file, snapshot, snapshot.config);
		expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({
			version: 1,
			custom: true,
			subagents: "off",
		});
	});

	it("creates a missing file", () => {
		const file = tempFile();
		const snapshot = readRawConfig(file);
		snapshot.config.subagents = "off";
		writeRawConfigIfUnchanged(file, snapshot, snapshot.config);
		expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({
			version: 1,
			subagents: "off",
		});
	});

	it("aborts when the file changed on disk", () => {
		const file = tempFile(JSON.stringify({ version: 1 }));
		const snapshot = readRawConfig(file);
		fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
		expect(() =>
			writeRawConfigIfUnchanged(file, snapshot, snapshot.config),
		).toThrow(/changed on disk/);
	});

	it("aborts when a missing file appears before the write", () => {
		const file = tempFile();
		const snapshot = readRawConfig(file);
		fs.writeFileSync(file, JSON.stringify({ version: 1 }));
		expect(() =>
			writeRawConfigIfUnchanged(file, snapshot, snapshot.config),
		).toThrow(/appeared on disk/);
	});
});

describe("applyControlText", () => {
	it("creates the profiles object and the metadata when missing", () => {
		const config: RawConfig = { version: 1 };
		applyControlText(config, "base", "none");
		expect(config.profiles).toEqual({ base: { controlText: "none" } });
	});

	it("preserves other profiles, their metadata and unknown keys", () => {
		const config: RawConfig = {
			version: 1,
			custom: true,
			profiles: {
				base: { controlText: "full", description: "General." },
				review: { extends: "base" },
			},
		};
		applyControlText(config, "base", "none");
		expect(config).toEqual({
			version: 1,
			custom: true,
			profiles: {
				base: { controlText: "none", description: "General." },
				review: { extends: "base" },
			},
		});
	});

	it("refuses a malformed profiles container without mutating it", () => {
		const config: RawConfig = { version: 1, profiles: [] };
		expect(() => applyControlText(config, "base", "none")).toThrow(
			/profiles must be an object/,
		);
		expect(config.profiles).toEqual([]);
	});

	it("refuses malformed profile metadata without mutating it", () => {
		const config: RawConfig = { version: 1, profiles: { base: "oops" } };
		expect(() => applyControlText(config, "base", "none")).toThrow(
			/profiles\.base must be an object/,
		);
		expect(config.profiles).toEqual({ base: "oops" });
	});

	it("creates metadata for ids that shadow Object members", () => {
		for (const id of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
			const config: RawConfig = { version: 1 };
			applyControlText(config, id, "none");
			expect(config.profiles).toEqual({ [id]: { controlText: "none" } });
		}
	});

	it("keeps the metadata of an existing profile whose id shadows Object", () => {
		const config: RawConfig = {
			version: 1,
			profiles: { constructor: { description: "Ctor." } },
		};
		applyControlText(config, "constructor", "none");
		expect(config.profiles).toEqual({
			constructor: { description: "Ctor.", controlText: "none" },
		});
	});
});
