import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
	ExtensionUIContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MANAGED_BEGIN, MANAGED_END } from "../../src/core/compose.js";
import { extractSystemText } from "../../src/adapter/runtime.js";

// The override runs the same test against another existing Pi installation;
// it never installs packages or discovers ambient user resources.
const piPackage =
	process.env.PPP_TEST_PI_PACKAGE ??
	fileURLToPath(
		new URL(
			"../../node_modules/@earendil-works/pi-coding-agent",
			import.meta.url,
		),
	);
const load = (relative: string) =>
	import(pathToFileURL(path.join(piPackage, relative)).href);
const sdk = (await load(
	"dist/index.js",
)) as typeof import("@earendil-works/pi-coding-agent");
const loader = (await load(
	"dist/core/extensions/loader.js",
)) as typeof import("../../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js");
const aiPackage = [
	path.join(piPackage, "node_modules/@earendil-works/pi-ai"),
	path.join(piPackage, "../pi-ai"),
].find((candidate) => fs.existsSync(path.join(candidate, "dist/index.js")));
assert.ok(aiPackage);
const ai = (await import(
	pathToFileURL(path.join(aiPackage, "dist/index.js")).href
)) as typeof import("@earendil-works/pi-ai");
const compat = (await import(
	pathToFileURL(path.join(aiPackage, "dist/compat.js")).href
)) as typeof import("@earendil-works/pi-ai/compat");
const modern =
	Number(sdk.VERSION.split(".")[0]) > 1 ||
	(Number(sdk.VERSION.split(".")[0]) === 1 &&
		Number(sdk.VERSION.split(".")[1]) >= 4);
const entry = fileURLToPath(new URL("../../src/index.ts", import.meta.url));
const savedAgentDir = process.env.PI_CODING_AGENT_DIR;
const savedChild = process.env.PI_SUBAGENT_CHILD;
const roots: string[] = [];
const sessions: Array<{ dispose(): void }> = [];

afterEach(() => {
	for (const session of sessions.splice(0)) session.dispose();
	for (const root of roots.splice(0))
		fs.rmSync(root, { recursive: true, force: true });
	if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
	if (savedChild === undefined) delete process.env.PI_SUBAGENT_CHILD;
	else process.env.PI_SUBAGENT_CHILD = savedChild;
	vi.unstubAllGlobals();
});

type Payload = { system?: unknown; tools?: unknown; messages?: unknown };

async function harness(
	options: {
		mode?: "native" | "off" | "active";
		deltas?: boolean;
		foreign?: "first" | "last" | "sections";
		switchDuringRun?: boolean;
		retry?: boolean;
		persistent?: boolean;
		sessionFile?: string;
	} = {},
) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ppp-cache-"));
	roots.push(root);
	const agentDir = path.join(root, "agent");
	const cwd = path.join(root, "project");
	const profiles = path.join(agentDir, "system-prompts/profiles");
	fs.mkdirSync(profiles, { recursive: true });
	fs.mkdirSync(cwd);
	fs.writeFileSync(path.join(profiles, "base.md"), "PROFILE A");
	fs.writeFileSync(path.join(profiles, "review.md"), "PROFILE B");
	fs.writeFileSync(
		path.join(agentDir, "system-prompts/config.json"),
		JSON.stringify({
			version: 1,
			selection: { mode: options.mode === "off" ? "off" : "auto" },
			defaultProfile: "global:base",
		}),
	);
	process.env.PI_CODING_AGENT_DIR = agentDir;
	delete process.env.PI_SUBAGENT_CHILD;
	const network = vi.fn(async () => {
		throw new Error("Network forbidden in prompt-cache tests");
	});
	vi.stubGlobal("fetch", network);
	const loaded = await loader.loadExtensions(
		options.mode === "native" ? [] : [entry],
		cwd,
	);
	expect(loaded.errors).toEqual([]);
	if (options.foreign) {
		const foreign = await loader.loadExtensionFromFactory(
			(pi) => {
				pi.on("before_agent_start", (event) => {
					if (options.foreign === "sections") {
						(
							event.systemPromptOptions as { sections?: Record<string, string> }
						).sections = { synthetic_style: "SYNTHETIC STYLE" };
						return undefined;
					}
					return { systemPrompt: `${event.systemPrompt}\nFOREIGN APPEND` };
				});
			},
			cwd,
			sdk.createEventBus(),
			loaded.runtime,
			"<inline:foreign>",
		);
		if (options.foreign === "first") loaded.extensions.unshift(foreign);
		else loaded.extensions.push(foreign);
	}
	const resourceLoader = {
		getExtensions: () => loaded,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({
			agentsFiles: [
				{ path: "/synthetic/AGENTS.md", content: "NATIVE CONTEXT" },
			],
		}),
		getSystemPrompt: () => undefined,
		getSystemPromptSource: () => undefined,
		getAppendSystemPrompt: () => [],
		getAppendSystemPromptSources: () => [],
		extendResources() {},
		async reload() {},
	};
	const runtime = await sdk.ModelRuntime.create({
		credentials: new ai.InMemoryCredentialStore(),
		modelsPath: null,
		modelsStorePath: path.join(root, "models-store.json"),
		refreshOnCreate: false,
		allowModelNetwork: false,
	});
	await runtime.setRuntimeApiKey("anthropic", "synthetic-offline-key");
	const baseModel = compat.getModel("anthropic", "claude-sonnet-4-5");
	assert.ok(baseModel);
	const model = {
		...baseModel,
		compat: {
			supportsMidConvoSystemMessages: options.deltas ?? true,
			supportsMidConvoToolChanges: options.deltas ?? true,
		},
	} as typeof baseModel;
	let session: Awaited<ReturnType<typeof sdk.createAgentSession>>["session"];
	const tool = (name: string): ToolDefinition => ({
		name,
		label: name,
		description: name,
		parameters: {
			type: "object",
			properties: {},
		} as ToolDefinition["parameters"],
		execute: async () => {
			if (name === "switch_state") {
				session.setActiveToolsByName(["read", "switch_state", "lookup"]);
				fs.writeFileSync(path.join(profiles, "base.md"), "EDITED PROFILE A");
				await session.prompt("/sp use review");
				await session.prompt("/sp reload");
			}
			return {
				content: [{ type: "text", text: "SYNTHETIC TOOL RESULT" }],
				details: {},
			};
		},
	});
	({ session } = await sdk.createAgentSession({
		cwd,
		agentDir,
		modelRuntime: runtime,
		model,
		thinkingLevel: "off",
		resourceLoader,
		sessionManager: options.sessionFile
			? sdk.SessionManager.open(options.sessionFile)
			: options.persistent
				? sdk.SessionManager.create(cwd, path.join(root, "sessions"))
				: sdk.SessionManager.inMemory(cwd),
		settingsManager: sdk.SettingsManager.inMemory({
			compaction: { enabled: false },
			retry: { enabled: options.retry ?? false, maxRetries: 1, baseDelayMs: 1 },
			enableAnalytics: false,
			enableInstallTelemetry: false,
		}),
		customTools: [
			tool("switch_state"),
			{
				...tool("lookup"),
				promptSnippet: "NEW TOOL SNIPPET",
				promptGuidelines: ["NEW TOOL RULE"],
			},
		],
	}));
	sessions.push(session);
	const notices: string[] = [];
	const statuses: string[] = [];
	const errors: unknown[] = [];
	await session.bindExtensions({
		mode: "print",
		uiContext: {
			notify: (message: string) => notices.push(message),
			setStatus: (_key: string, text: string) => statuses.push(text),
		} as unknown as ExtensionUIContext,
		onError: (error) => errors.push(error),
	});
	session.setActiveToolsByName(["read", "switch_state"]);
	const captures: Payload[] = [];
	session.agent.streamFunction = async (
		requestModel,
		context,
		streamOptions,
	) => {
		const before = captures.length;
		const serialized = compat.streamSimple(requestModel, context, {
			...streamOptions,
			apiKey: "synthetic-offline-key",
			env: {},
			onPayload: async (payload) => {
				const outgoing = await streamOptions?.onPayload?.(
					payload,
					requestModel,
				);
				captures.push(structuredClone(outgoing ?? payload) as Payload);
				throw new Error("OFFLINE_PAYLOAD_CAPTURED");
			},
		});
		const captured = await serialized.result();
		expect(captures.length, captured.errorMessage).toBe(before + 1);
		expect(captured.errorMessage).toContain("OFFLINE_PAYLOAD_CAPTURED");
		const callsTool = options.switchDuringRun && before === 0;
		const fails = options.retry && before === 1;
		const message = {
			role: "assistant" as const,
			content: callsTool
				? [
						{
							type: "toolCall" as const,
							id: "synthetic-call",
							name: "switch_state",
							arguments: {},
						},
					]
				: [{ type: "text" as const, text: "SYNTHETIC RESPONSE" }],
			api: requestModel.api,
			provider: requestModel.provider,
			model: requestModel.id,
			stopReason: fails
				? ("error" as const)
				: callsTool
					? ("toolUse" as const)
					: ("stop" as const),
			...(fails ? { errorMessage: "429 rate limit: synthetic retry" } : {}),
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			timestamp: Date.now(),
		};
		const stream = ai.createAssistantMessageEventStream();
		stream.push({ type: "start", partial: message });
		if (fails) stream.push({ type: "error", reason: "error", error: message });
		else
			stream.push({
				type: "done",
				reason: callsTool ? "toolUse" : "stop",
				message,
			});
		stream.end();
		return stream;
	};
	return { session, captures, notices, statuses, errors, network };
}

const header = (payload: Payload | undefined) => ({
	system: payload?.system,
	tools: payload?.tools,
});
const text = (payload: Payload | undefined) => JSON.stringify(payload);

describe(`prompt cache through Pi ${sdk.VERSION}, real session and serializer`, () => {
	it("recognizes system text in common provider envelopes", () => {
		for (const payload of [
			{ system: "instructions" },
			{ system: [{ type: "text", text: "instructions" }] },
			{ instructions: "instructions" },
			{ messages: [{ role: "developer", content: "instructions" }] },
			{
				input: [
					{ role: "system", content: [{ type: "text", text: "instructions" }] },
				],
			},
		])
			expect(extractSystemText(payload)).toBe("instructions");
		expect(
			extractSystemText({
				instructions: "native",
				input: [{ role: "system", content: "profile" }],
			}),
		).toBe("native\n\nprofile");
		expect(
			extractSystemText({
				instructions: "",
				messages: [{ role: "system", content: "profile" }],
			}),
		).toBe("profile");
		expect(extractSystemText({ unknown: "instructions" })).toBeUndefined();
	});
	it.each([true, false])(
		"adds no header recomposition beyond native behavior (deltas=%s)",
		async (deltas) => {
			for (const mode of ["native", "off", "active"] as const) {
				const h = await harness({ mode, deltas });
				await h.session.prompt("FIRST");
				await h.session.prompt("STABLE");
				h.session.setActiveToolsByName(["read", "switch_state", "lookup"]);
				await h.session.prompt("AFTER ADD");
				expect(header(h.captures[1])).toEqual(header(h.captures[0]));
				if (modern && deltas)
					expect(header(h.captures[2])).toEqual(header(h.captures[0]));
				else expect(header(h.captures[2])).not.toEqual(header(h.captures[0]));
				expect(text(h.captures[2])).toContain("NEW TOOL SNIPPET");
				expect(text(h.captures[2])).toContain("NEW TOOL RULE");
				expect(text(h.captures[2])).toContain("NATIVE CONTEXT");
				for (const payload of h.captures)
					expect(text(payload).split(MANAGED_BEGIN).length - 1).toBe(
						mode === "active" ? 1 : 0,
					);
				if (modern)
					expect(
						JSON.stringify(h.session.sessionManager.getEntries()),
					).not.toContain(MANAGED_BEGIN);
				expect(h.errors).toEqual([]);
				expect(h.network).not.toHaveBeenCalled();
			}
		},
		60000,
	);

	it("freezes the profile within a run, then applies selection, reload and off", async () => {
		const h = await harness({ switchDuringRun: true, retry: true });
		await h.session.prompt("FIRST");
		expect(h.captures).toHaveLength(3);
		for (const payload of h.captures) {
			expect(text(payload)).toContain("PROFILE A");
			expect(text(payload)).not.toContain("EDITED PROFILE A");
			expect(text(payload)).not.toContain("PROFILE B");
		}
		if (modern) expect(text(h.captures[1])).toContain("NEW TOOL RULE");
		await h.session.prompt("NEXT");
		expect(text(h.captures.at(-1))).toContain("PROFILE B");
		await h.session.prompt("/sp off");
		await h.session.prompt("OFF");
		expect(text(h.captures.at(-1))).not.toContain(MANAGED_BEGIN);
		await h.session.prompt("/sp use base");
		await h.session.prompt("BACK");
		expect(text(h.captures.at(-1))).toContain("EDITED PROFILE A");
		expect(text(h.captures.at(-1)).split(MANAGED_END)).toHaveLength(2);
		expect(h.errors).toEqual([]);
		expect(h.network).not.toHaveBeenCalled();
	}, 30000);

	it.each(["first", "last"] as const)(
		"reports a foreign complete prompt in either load order (%s)",
		async (foreign) => {
			const h = await harness({ foreign, switchDuringRun: true });
			await h.session.prompt("FIRST");
			if (modern) {
				for (const payload of h.captures)
					expect(text(payload)).not.toContain(MANAGED_BEGIN);
				expect(
					h.notices.filter((notice) =>
						notice.includes("missing from this request"),
					),
				).toHaveLength(1);
				expect(
					h.statuses.some((status) => status.includes("not in payload")),
				).toBe(true);
			} else {
				for (const payload of h.captures)
					expect(text(payload)).toContain(MANAGED_BEGIN);
			}
			expect(h.errors).toEqual([]);
			expect(h.network).not.toHaveBeenCalled();
		},
		30000,
	);

	it.skipIf(!modern)(
		"keeps sections through tree navigation and resuming a compacted branch",
		async () => {
			const h = await harness({ foreign: "sections", persistent: true });
			await h.session.prompt("FIRST");
			expect(text(h.captures[0])).toContain("SYNTHETIC STYLE");
			expect(text(h.captures[0])).toContain(MANAGED_BEGIN);
			const firstLeaf = h.session.sessionManager.getLeafId();
			assert.ok(firstLeaf);
			await h.session.prompt("/sp use review");
			await h.session.prompt("SECOND");
			expect(text(h.captures.at(-1))).toContain("PROFILE B");
			await h.session.navigateTree(firstLeaf, { summarize: false });
			await h.session.prompt("BRANCHED");
			expect(text(h.captures.at(-1))).toContain("PROFILE A");
			expect(text(h.captures.at(-1))).not.toContain("PROFILE B");
			const kept = h.session.sessionManager
				.getBranch()
				.find(
					(entry) => entry.type === "message" && entry.message.role === "user",
				);
			assert.ok(kept);
			h.session.sessionManager.appendCompaction(
				"SYNTHETIC SUMMARY",
				kept.id,
				100,
			);
			const compactedLeaf = h.session.sessionManager.getLeafId();
			assert.ok(compactedLeaf);
			const sessionFile =
				h.session.sessionManager.createBranchedSession(compactedLeaf);
			assert.ok(sessionFile);
			h.session.dispose();
			sessions.splice(sessions.indexOf(h.session), 1);
			const resumed = await harness({ sessionFile });
			await resumed.session.prompt("RESUMED");
			expect(text(resumed.captures[0]).split(MANAGED_BEGIN)).toHaveLength(2);
			expect(text(resumed.captures[0])).toContain("SYNTHETIC SUMMARY");
			expect(text(resumed.captures[0])).toContain("PROFILE A");
			expect(
				JSON.stringify(resumed.session.sessionManager.getEntries()),
			).not.toContain(MANAGED_BEGIN);
			expect(resumed.errors).toEqual([]);
			expect(resumed.network).not.toHaveBeenCalled();
		},
		30000,
	);
});
