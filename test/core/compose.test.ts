import { describe, expect, it } from "vitest";
import {
	applyManagedPrompt,
	composeManagedBlock,
	MANAGED_BEGIN,
	MANAGED_END,
	stripManagedBlocks,
} from "../../src/core/compose.js";
import { formatRef } from "../../src/core/refs.js";
import type { ResolvedProfile } from "../../src/core/types.js";

const profile: ResolvedProfile = {
	ref: { scope: "global", id: "review" },
	layers: [
		{ ref: { scope: "global", id: "review" }, content: "SPECIFIC", hash: "h1" },
		{ ref: { scope: "global", id: "base" }, content: "BASE", hash: "h2" },
	],
};

describe("composeManagedBlock", () => {
	it("declares the specific profile first and its base after", () => {
		const block = composeManagedBlock(profile);
		expect(block.indexOf("SPECIFIC")).toBeLessThan(block.indexOf("BASE"));
		expect(block.startsWith(MANAGED_BEGIN)).toBe(true);
		expect(block.endsWith(MANAGED_END)).toBe(true);
	});

	it("is stable for the same content", () => {
		expect(composeManagedBlock(profile)).toBe(composeManagedBlock(profile));
	});

	it("declares the profile the primary system instructions without naming the extension", () => {
		const block = composeManagedBlock(profile);
		expect(block).toContain("primary system instructions");
		expect(block).toContain("System instructions");
		expect(block).not.toContain("pi-prompt-profiles");
		expect(block).toContain("system-instructions:begin v1");
	});

	it("never writes the profile id, its scope or a heading into the prompt", () => {
		const block = composeManagedBlock(profile);
		for (const layer of profile.layers) {
			expect(block).not.toContain(formatRef(layer.ref));
		}
		expect(block).not.toContain("### Profile:");
		expect(block).not.toContain("### Inherited profile:");
	});
});

describe("applyManagedPrompt", () => {
	it("prepends the block and keeps the rest of the prompt", () => {
		const result = applyManagedPrompt("BASE PROMPT\nAGENTS CONTENT", profile);
		expect(result.systemPrompt.startsWith(MANAGED_BEGIN)).toBe(true);
		expect(result.systemPrompt).toContain("BASE PROMPT");
		expect(result.systemPrompt).toContain("AGENTS CONTENT");
	});

	it("is idempotent", () => {
		const once = applyManagedPrompt("BASE PROMPT", profile).systemPrompt;
		const twice = applyManagedPrompt(once, profile).systemPrompt;
		expect(twice).toBe(once);
		expect(twice.split(MANAGED_BEGIN)).toHaveLength(2);
	});

	it("does not leave a previous block when the profile is absent", () => {
		const once = applyManagedPrompt("BASE PROMPT", profile).systemPrompt;
		const cleared = applyManagedPrompt(once, undefined).systemPrompt;
		expect(cleared).not.toContain(MANAGED_BEGIN);
		expect(cleared).toContain("BASE PROMPT");
	});

	it("leaves markers that are not our leading block", () => {
		const base = `INTRO\n${MANAGED_BEGIN}\nquoted docs\n${MANAGED_END}\nNATIVE`;
		const stripped = stripManagedBlocks(base);
		expect(stripped.removed).toBe(0);
		expect(stripped.text).toBe(base);
		const result = applyManagedPrompt(base, profile);
		expect(result.systemPrompt).toContain("quoted docs");
		expect(result.systemPrompt).toContain("NATIVE");
	});

	it("does not remove a foreign block without our end marker", () => {
		const foreign = `${MANAGED_BEGIN}\nforeign text without end`;
		const result = stripManagedBlocks(foreign);
		expect(result.removed).toBe(0);
		expect(result.unterminated).toBe(true);
		expect(result.text).toBe(foreign);
	});
});
