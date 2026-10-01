import fs from "node:fs";
import { atomicWriteFile, readTextIfExists, stripBom } from "../core/paths.js";
import type { ControlTextMode } from "../core/types.js";

export type RawConfig = Record<string, unknown>;

function messageOf(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Writes `profiles.<id>.controlText` into a raw config object. The `profiles`
 * object and the profile's metadata object are created only when missing, so
 * other profiles, their metadata and unknown top-level keys survive the
 * rewrite. `Object.hasOwn` is what makes `constructor`, `toString` or
 * `hasOwnProperty` valid profile ids here: a plain `profiles[id]` would reach
 * the inherited `Object.prototype` member and misread it as existing metadata.
 * A present but malformed container is refused instead of overwritten, because
 * replacing it would silently drop whatever the user wrote there.
 */
export function applyControlText(
	config: RawConfig,
	id: string,
	mode: ControlTextMode,
): void {
	const existingProfiles = config.profiles;
	if (existingProfiles !== undefined && !isRecord(existingProfiles)) {
		throw new Error(
			`profiles must be an object before profiles.${id}.controlText can be set.`,
		);
	}
	const profiles: Record<string, unknown> = existingProfiles ?? {};
	const existingMeta = Object.hasOwn(profiles, id) ? profiles[id] : undefined;
	if (existingMeta !== undefined && !isRecord(existingMeta)) {
		throw new Error(
			`profiles.${id} must be an object before its controlText can be set.`,
		);
	}
	profiles[id] = {
		...(isRecord(existingMeta) ? existingMeta : {}),
		controlText: mode,
	};
	config.profiles = profiles;
}

export interface ConfigSnapshot {
	config: RawConfig;
	exists: boolean;
	mtimeMs: number | undefined;
}

export function readRawConfig(filePath: string): ConfigSnapshot {
	const text = readTextIfExists(filePath);
	if (text === undefined) {
		return { config: { version: 1 }, exists: false, mtimeMs: undefined };
	}
	const parsed: unknown = (() => {
		try {
			return JSON.parse(stripBom(text));
		} catch (cause) {
			throw new Error(`${filePath}: invalid JSON (${messageOf(cause)}).`);
		}
	})();
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${filePath}: the root must be a JSON object`);
	}
	let mtimeMs: number | undefined;
	try {
		mtimeMs = fs.statSync(filePath).mtimeMs;
	} catch {
		mtimeMs = undefined;
	}
	return { config: parsed as RawConfig, exists: true, mtimeMs };
}

/**
 * Writes only when the file has not changed since it was read, so a concurrent
 * edit is reported instead of being overwritten. Unknown fields are preserved
 * because the whole object is rewritten.
 */
export function writeRawConfigIfUnchanged(
	filePath: string,
	snapshot: ConfigSnapshot,
	next: RawConfig,
): void {
	if (snapshot.exists) {
		const current = fs.statSync(filePath).mtimeMs;
		if (snapshot.mtimeMs !== undefined && current !== snapshot.mtimeMs) {
			throw new Error(
				`${filePath} changed on disk since it was read; reload and try again.`,
			);
		}
	} else if (fs.existsSync(filePath)) {
		throw new Error(
			`${filePath} appeared on disk since it was read; reload and try again.`,
		);
	}
	atomicWriteFile(filePath, `${JSON.stringify(next, null, "\t")}\n`);
}
