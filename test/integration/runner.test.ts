import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
	createEventBus,
	discoverAndLoadExtensions,
	type ExtensionActions,
	type ExtensionContextActions,
	ExtensionRunner,
	type ExtensionUIContext,
	type ModelRegistry,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { MANAGED_BEGIN } from "../../src/core/compose.js";
import { SELECTION_CUSTOM_TYPE } from "../../src/adapter/state.js";

const ENTRY = fileURLToPath(new URL("../../src/index.ts", import.meta.url));

const roots: string[] = [];
const savedAgentDir = process.env.PI_CODING_AGENT_DIR;
const savedSubagentChild = process.env.PI_SUBAGENT_CHILD;

afterEach(() => {
	for (const root of roots) {
		fs.rmSync(root, { recursive: true, force: true });
	}
	roots.length = 0;
	if (savedAgentDir === undefined) {
		delete process.env.PI_CODING_AGENT_DIR;
	} else {
		process.env.PI_CODING_AGENT_DIR = savedAgentDir;
	}
	if (savedSubagentChild === undefined) {
		delete process.env.PI_SUBAGENT_CHILD;
	} else {
		process.env.PI_SUBAGENT_CHILD = savedSubagentChild;
	}
});

interface Harness {
	runner: ExtensionRunner;
	cwd: string;
	agentDir: string;
	statuses: Map<string, string>;
	notices: string[];
	appended: Array<{ customType: string; data: unknown }>;
	selectCalls: string[][];
	setModel(model: Model<Api>): void;
}

interface HarnessOptions {
	order?: "ours-first" | "extra-first";
	extraSource?: string;
	projectTrusted?: boolean;
	selectAnswers?: string[];
	inputAnswers?: string[];
	editorAnswers?: string[];
	models?: Array<{ provider: string; id: string }>;
	config?: Record<string, unknown>;
	subagent?: boolean;
}

const DEFAULT_MODEL = {
	provider: "deepseek",
	id: "deepseek-chat",
} as unknown as Model<Api>;

async function setup(options: HarnessOptions = {}): Promise<Harness> {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ppp-it-"));
	roots.push(root);
	const cwd = path.join(root, "project");
	const agentDir = path.join(root, "agent");
	fs.mkdirSync(cwd, { recursive: true });
	const profilesDir = path.join(agentDir, "system-prompts", "profiles");
	fs.mkdirSync(profilesDir, { recursive: true });
	fs.writeFileSync(
		path.join(agentDir, "system-prompts", "config.json"),
		JSON.stringify(
			options.config ?? {
				version: 1,
				selection: { mode: "auto" },
				defaultProfile: "global:base",
			},
		),
	);
	fs.writeFileSync(path.join(profilesDir, "base.md"), "BASE PROFILE BODY");
	fs.writeFileSync(path.join(profilesDir, "review.md"), "REVIEW PROFILE BODY");
	process.env.PI_CODING_AGENT_DIR = agentDir;

	const files: string[] = [];
	if (options.extraSource) {
		const extra = path.join(root, "extra.ts");
		fs.writeFileSync(extra, options.extraSource);
		files.push(extra);
	}
	files.push(ENTRY);
	if (options.order === "ours-first" && options.extraSource) {
		files.reverse();
	}

	const eventBus = createEventBus();
	const loaded = await discoverAndLoadExtensions(
		files,
		cwd,
		agentDir,
		eventBus,
	);
	expect(loaded.errors).toEqual([]);

	const sessionManager = SessionManager.inMemory(cwd);
	const models = options.models ?? [];
	const modelRegistry = {
		getAvailable: () => models.map((entry) => ({ ...entry })),
	} as unknown as ModelRegistry;
	const runner = new ExtensionRunner(
		loaded.extensions,
		loaded.runtime,
		cwd,
		sessionManager,
		modelRegistry,
	);

	const statuses = new Map<string, string>();
	const notices: string[] = [];
	const appended: Array<{ customType: string; data: unknown }> = [];
	const selectCalls: string[][] = [];
	const trusted = options.projectTrusted ?? false;
	let model: Model<Api> | undefined = DEFAULT_MODEL;

	const actions: ExtensionActions = {
		sendMessage: () => {},
		sendUserMessage: () => {},
		appendEntry: (customType, data) => {
			appended.push({ customType, data });
		},
		setSessionName: () => {},
		getSessionName: () => undefined,
		setLabel: () => {},
		getActiveTools: () => [],
		getAllTools: () => [],
		setActiveTools: () => {},
		refreshTools: () => {},
		getCommands: () => [],
		setModel: async () => true,
		getThinkingLevel: () => "medium",
		setThinkingLevel: () => {},
	};

	const contextActions: ExtensionContextActions = {
		getModel: () => model,
		getScopedModels: () => [],
		isIdle: () => true,
		isProjectTrusted: () => trusted,
		getSignal: () => undefined,
		abort: () => {},
		hasPendingMessages: () => false,
		shutdown: () => {},
		getContextUsage: () => undefined,
		compact: () => {},
		getSystemPrompt: () => "NATIVE PROMPT",
		getSystemPromptOptions: () => ({ cwd }),
	};

	runner.bindCore(actions, contextActions);
	const selectQueue = [...(options.selectAnswers ?? [])];
	const inputQueue = [...(options.inputAnswers ?? [])];
	const editorQueue = [...(options.editorAnswers ?? [])];
	const ui = {
		select: async (_title: string, options: string[]) => {
			selectCalls.push(options);
			const wanted = selectQueue.shift();
			if (wanted === undefined) {
				return undefined;
			}
			return (
				options.find((option) => option === wanted) ??
				options.find((option) => option.startsWith(wanted)) ??
				options.find((option) => option.includes(wanted)) ??
				wanted
			);
		},
		confirm: async () => false,
		input: async () => inputQueue.shift(),
		editor: async () => editorQueue.shift(),
		notify: (message: string) => {
			notices.push(message);
		},
		onTerminalInput: () => () => {},
		setStatus: (key: string, text: string | undefined) => {
			if (text === undefined) {
				statuses.delete(key);
			} else {
				statuses.set(key, text);
			}
		},
	} as unknown as ExtensionUIContext;
	runner.setUIContext(ui, "print");

	// Hermetic: the ambient environment must not decide whether this is a child.
	if (options.subagent) {
		process.env.PI_SUBAGENT_CHILD = "1";
	} else {
		delete process.env.PI_SUBAGENT_CHILD;
	}

	await runner.emit({ type: "session_start", reason: "startup" });

	return {
		runner,
		cwd,
		agentDir,
		statuses,
		notices,
		appended,
		selectCalls,
		setModel(next) {
			model = next;
		},
	};
}

const BASE_PROMPT =
	"NATIVE PROMPT\n<project_context>AGENTS CONTENT</project_context>";

describe("extension integration (real runner, simulated transport)", () => {
	it("prepends one managed block before the prompt Pi composed", async () => {
		const harness = await setup();
		const result = await harness.runner.emitBeforeAgentStart(
			"hello",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		const prompt = result?.systemPrompt ?? "";
		expect(prompt.startsWith(MANAGED_BEGIN)).toBe(true);
		expect(prompt.split(MANAGED_BEGIN)).toHaveLength(2);
		expect(prompt).toContain("BASE PROFILE BODY");
		expect(prompt).toContain("NATIVE PROMPT");
		expect(prompt).toContain("AGENTS CONTENT");
		expect(prompt.indexOf(MANAGED_BEGIN)).toBeLessThan(
			prompt.indexOf("NATIVE PROMPT"),
		);
	});

	it("does not modify the prompt when the manager is off", async () => {
		const harness = await setup();
		const command = harness.runner.getCommand("sp");
		expect(command).toBeDefined();
		await command?.handler("off", harness.runner.createCommandContext());
		const result = await harness.runner.emitBeforeAgentStart(
			"hello",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(result?.systemPrompt).toBeUndefined();
		expect(
			harness.appended.some(
				(entry) => entry.customType === SELECTION_CUSTOM_TYPE,
			),
		).toBe(true);
	});

	it("applies a manually pinned profile and preserves the base prompt", async () => {
		const harness = await setup();
		const command = harness.runner.getCommand("sp");
		await command?.handler("use review", harness.runner.createCommandContext());
		const result = await harness.runner.emitBeforeAgentStart(
			"hello",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		const prompt = result?.systemPrompt ?? "";
		expect(prompt).toContain("REVIEW PROFILE BODY");
		expect(prompt).toContain("NATIVE PROMPT");
		expect(prompt.split(MANAGED_BEGIN)).toHaveLength(2);
	});

	it("keeps the text of an extension that appends before this one", async () => {
		const appender = `export default function (pi) { pi.on("before_agent_start", async (event) => ({ systemPrompt: event.systemPrompt + "\\nEXTRA APPENDED" })); }\n`;
		const harness = await setup({
			order: "extra-first",
			extraSource: appender,
		});
		const result = await harness.runner.emitBeforeAgentStart(
			"hello",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		const prompt = result?.systemPrompt ?? "";
		expect(prompt).toContain("EXTRA APPENDED");
		expect(prompt).toContain("BASE PROFILE BODY");
		expect(prompt.indexOf(MANAGED_BEGIN)).toBeLessThan(
			prompt.indexOf("EXTRA APPENDED"),
		);
	});

	it("documents that a later full replacement discards the managed block", async () => {
		const replacer = `export default function (pi) { pi.on("before_agent_start", async () => ({ systemPrompt: "REPLACED EVERYTHING" })); }\n`;
		const harness = await setup({ order: "ours-first", extraSource: replacer });
		const result = await harness.runner.emitBeforeAgentStart(
			"hello",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(result?.systemPrompt).toBe("REPLACED EVERYTHING");
		expect(result?.systemPrompt ?? "").not.toContain(MANAGED_BEGIN);
	});

	it("observes the provider payload without rewriting it", async () => {
		const harness = await setup();
		await harness.runner.emitBeforeAgentStart("hello", undefined, BASE_PROMPT, {
			cwd: harness.cwd,
		});
		const seen = await harness.runner.emitBeforeProviderRequest({
			system: `${MANAGED_BEGIN}\n...\n`,
			messages: [{ role: "user", content: "hi" }],
		});
		expect(seen).toEqual({
			system: `${MANAGED_BEGIN}\n...\n`,
			messages: [{ role: "user", content: "hi" }],
		});
	});

	it("drives the interactive menu to pin a profile", async () => {
		const harness = await setup({
			selectAnswers: ["Choose a profile for this session", "global:review"],
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("", harness.runner.createCommandContext());
		const result = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(result?.systemPrompt ?? "").toContain("REVIEW PROFILE BODY");
	});

	it("creates a profile and writes its prompt body from the interactive menu", async () => {
		const harness = await setup({
			selectAnswers: ["Create a new profile", "Global (all projects)"],
			inputAnswers: ["fresh"],
			editorAnswers: ["You write tests before code."],
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("", harness.runner.createCommandContext());
		const file = path.join(
			harness.agentDir,
			"system-prompts",
			"profiles",
			"fresh.md",
		);
		expect(fs.readFileSync(file, "utf8")).toBe(
			"You write tests before code.\n",
		);
	});

	it("shows the folder of each profile in the interactive picker", async () => {
		const harness = await setup({
			selectAnswers: ["Choose a profile for this session"],
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("", harness.runner.createCommandContext());
		const profilesDir = path.join(
			harness.agentDir,
			"system-prompts",
			"profiles",
		);
		expect(
			harness.selectCalls.some((options) =>
				options.some((option) => option.includes(profilesDir)),
			),
		).toBe(true);
	});

	it("binds a profile to a model from the interactive menu", async () => {
		const harness = await setup({
			models: [{ provider: "deepseek", id: "deepseek-chat" }],
			selectAnswers: [
				"Manage model bindings",
				"Add a binding to a model",
				"global:base",
				"deepseek",
				"deepseek-chat",
			],
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("", harness.runner.createCommandContext());
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(config.bindings?.[0]?.profile).toBe("global:base");
		expect(config.bindings?.[0]?.match?.[0]).toEqual({
			provider: "deepseek",
			model: "deepseek-chat",
		});
	});

	it("binds to any model from the any-provider step", async () => {
		const harness = await setup({
			models: [{ provider: "deepseek", id: "deepseek-chat" }],
			selectAnswers: [
				"Manage model bindings",
				"Add a binding to a model",
				"global:base",
				"(any provider)",
				"(any model)",
			],
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("", harness.runner.createCommandContext());
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(config.bindings?.[0]?.match?.[0]).toEqual({
			provider: "*",
			model: "*",
		});
	});

	it("binds to one model of any provider from the any-provider step", async () => {
		const harness = await setup({
			models: [
				{ provider: "deepseek", id: "deepseek-chat" },
				{ provider: "openrouter", id: "zeta" },
			],
			selectAnswers: [
				"Manage model bindings",
				"Add a binding to a model",
				"global:base",
				"(any provider)",
				"zeta",
			],
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("", harness.runner.createCommandContext());
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(config.bindings?.[0]?.match?.[0]).toEqual({
			provider: "openrouter",
			model: "zeta",
		});
	});

	it("binds to every model of a provider from the interactive picker", async () => {
		const harness = await setup({
			models: [
				{ provider: "deepseek", id: "deepseek-chat" },
				{ provider: "deepseek", id: "deepseek-reasoner" },
			],
			selectAnswers: [
				"Manage model bindings",
				"Add a binding to a model",
				"global:base",
				"deepseek",
				"(any model of deepseek)",
			],
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("", harness.runner.createCommandContext());
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(config.bindings?.[0]?.match?.[0]).toEqual({
			provider: "deepseek",
			model: "*",
		});
	});

	it("pages a long model list and shows the binding context", async () => {
		const models = Array.from({ length: 12 }, (_value, index) => ({
			provider: "deepseek",
			id: `model-${String(index + 1).padStart(2, "0")}`,
		}));
		const harness = await setup({
			models,
			selectAnswers: [
				"Manage model bindings",
				"Add a binding to a model",
				"global:base",
				"deepseek",
				"More…",
				"model-11",
			],
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("", harness.runner.createCommandContext());
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(config.bindings?.[0]?.match?.[0]).toEqual({
			provider: "deepseek",
			model: "model-11",
		});
		const modelOptions = harness.selectCalls.at(-1) ?? [];
		expect(modelOptions.length).toBeLessThanOrEqual(11);
	});

	it("removes a binding from the interactive menu", async () => {
		const harness = await setup({
			config: {
				version: 1,
				selection: { mode: "auto" },
				defaultProfile: "global:base",
				bindings: [
					{
						id: "ds",
						profile: "global:review",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
				],
			},
			selectAnswers: ["Manage model bindings", "Remove a binding", "ds"],
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("", harness.runner.createCommandContext());
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(config.bindings ?? []).toEqual([]);
		expect(
			harness.notices.some((notice) => notice.includes('Removed binding "ds"')),
		).toBe(true);
	});

	it("lists every binding of both configs from the bindings menu", async () => {
		const harness = await setup({
			projectTrusted: true,
			config: {
				version: 1,
				selection: { mode: "auto" },
				defaultProfile: "global:base",
				bindings: [
					{
						id: "ds",
						profile: "global:review",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
						priority: 3,
					},
				],
			},
			selectAnswers: ["Manage model bindings", "List bindings"],
		});
		const projectFile = path.join(
			harness.cwd,
			".pi",
			"system-prompts",
			"config.json",
		);
		fs.mkdirSync(path.dirname(projectFile), { recursive: true });
		fs.writeFileSync(
			projectFile,
			JSON.stringify({
				version: 1,
				bindings: [
					{
						id: "local",
						profile: "global:base",
						match: [{ provider: "openrouter", model: "*" }],
					},
				],
			}),
		);
		const command = harness.runner.getCommand("sp");
		// The project config lands after setup's session_start, so the cached
		// state must be refreshed before the menu can list it.
		await command?.handler("reload", harness.runner.createCommandContext());
		await command?.handler("", harness.runner.createCommandContext());
		const notice = harness.notices.find((entry) =>
			entry.includes("global:ds — global:review"),
		);
		expect(notice ?? "").toContain(
			"project:local — global:base ← openrouter/*",
		);
		expect(notice ?? "").toContain(
			"global:ds — global:review ← deepseek/deepseek-chat (priority 3)",
		);
		expect((notice ?? "").indexOf("project:local")).toBeLessThan(
			(notice ?? "").indexOf("global:ds"),
		);
	});

	it("returns to the main menu from the bindings menu", async () => {
		const harness = await setup({
			selectAnswers: [
				"Manage model bindings",
				"Back to the main menu",
				"Show status",
			],
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("", harness.runner.createCommandContext());
		expect(
			harness.notices.some((notice) => notice.includes("mode: auto")),
		).toBe(true);
	});

	it("unbinds without --scope from the global config", async () => {
		const harness = await setup({
			config: {
				version: 1,
				selection: { mode: "auto" },
				defaultProfile: "global:base",
				bindings: [
					{
						id: "ds",
						profile: "global:review",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
				],
			},
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("unbind ds", harness.runner.createCommandContext());
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(config.bindings ?? []).toEqual([]);
	});

	it("unbinds without --scope from the project config", async () => {
		const harness = await setup({ projectTrusted: true });
		const projectFile = path.join(
			harness.cwd,
			".pi",
			"system-prompts",
			"config.json",
		);
		fs.mkdirSync(path.dirname(projectFile), { recursive: true });
		fs.writeFileSync(
			projectFile,
			JSON.stringify({
				version: 1,
				bindings: [
					{
						id: "ds",
						profile: "global:review",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
				],
			}),
		);
		const command = harness.runner.getCommand("sp");
		await command?.handler("unbind ds", harness.runner.createCommandContext());
		expect(
			JSON.parse(fs.readFileSync(projectFile, "utf8")).bindings ?? [],
		).toEqual([]);
		expect(
			harness.notices.some((notice) => notice.includes("project config")),
		).toBe(true);
	});

	it("keeps the trust error for an explicit --scope project", async () => {
		const harness = await setup({ projectTrusted: false });
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"unbind ds --scope project",
			harness.runner.createCommandContext(),
		);
		expect(
			harness.notices.some((notice) => notice.includes("not trusted")),
		).toBe(true);
	});

	it("unbinds the same id from both configs in one pass", async () => {
		const harness = await setup({
			projectTrusted: true,
			config: {
				version: 1,
				bindings: [
					{
						id: "ds",
						profile: "global:review",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
				],
			},
		});
		const projectFile = path.join(
			harness.cwd,
			".pi",
			"system-prompts",
			"config.json",
		);
		fs.mkdirSync(path.dirname(projectFile), { recursive: true });
		fs.writeFileSync(
			projectFile,
			JSON.stringify({
				version: 1,
				bindings: [
					{
						id: "ds",
						profile: "global:review",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
				],
			}),
		);
		const command = harness.runner.getCommand("sp");
		await command?.handler("unbind ds", harness.runner.createCommandContext());
		const globalConfig = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(globalConfig.bindings ?? []).toEqual([]);
		expect(
			JSON.parse(fs.readFileSync(projectFile, "utf8")).bindings ?? [],
		).toEqual([]);
		expect(
			harness.notices.some((notice) =>
				notice.includes("project and global config"),
			),
		).toBe(true);
	});

	it("reports the half-done removal when the second config fails", async () => {
		const harness = await setup({
			projectTrusted: true,
			config: { version: 99 },
		});
		const projectFile = path.join(
			harness.cwd,
			".pi",
			"system-prompts",
			"config.json",
		);
		fs.mkdirSync(path.dirname(projectFile), { recursive: true });
		fs.writeFileSync(
			projectFile,
			JSON.stringify({
				version: 1,
				bindings: [
					{
						id: "ds",
						profile: "global:review",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
				],
			}),
		);
		const command = harness.runner.getCommand("sp");
		// The project config is written after setup's session_start, so the
		// cached state must be refreshed before it can bind anything.
		await command?.handler("reload", harness.runner.createCommandContext());
		const before = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(before?.systemPrompt ?? "").toContain("REVIEW PROFILE BODY");
		await command?.handler("unbind ds", harness.runner.createCommandContext());
		expect(
			JSON.parse(fs.readFileSync(projectFile, "utf8")).bindings ?? [],
		).toEqual([]);
		expect(
			harness.notices.some((notice) => notice.includes("again to finish")),
		).toBe(true);
		const after = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(after?.systemPrompt).toBeUndefined();
	});

	it("switches to the bound profile when the model changes", async () => {
		const harness = await setup({
			config: {
				version: 1,
				selection: { mode: "auto" },
				defaultProfile: "global:base",
				bindings: [
					{
						id: "ds",
						profile: "global:review",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
				],
			},
		});
		const bound = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(bound?.systemPrompt ?? "").toContain("REVIEW PROFILE BODY");
		harness.setModel({
			provider: "openrouter",
			id: "zeta",
		} as unknown as Model<Api>);
		const other = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(other?.systemPrompt ?? "").toContain("BASE PROFILE BODY");
		expect(other?.systemPrompt ?? "").not.toContain("REVIEW PROFILE BODY");
	});

	it("warns when a binding is written under a pinned selection", async () => {
		const harness = await setup();
		const command = harness.runner.getCommand("sp");
		await command?.handler("use review", harness.runner.createCommandContext());
		await command?.handler(
			"bind base --provider deepseek --model deepseek-chat",
			harness.runner.createCommandContext(),
		);
		expect(
			harness.notices.some((notice) =>
				notice.includes("bindings apply only in auto mode"),
			),
		).toBe(true);
	});

	it("warns when the new binding does not match the current model", async () => {
		const harness = await setup();
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"bind base --provider openrouter --model zeta",
			harness.runner.createCommandContext(),
		);
		expect(
			harness.notices.some((notice) =>
				notice.includes("does not match the current model"),
			),
		).toBe(true);
	});

	it("keeps the default profile out of a subagent", async () => {
		const harness = await setup({ subagent: true });
		const result = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(result?.systemPrompt ?? "").not.toContain(MANAGED_BEGIN);
	});

	it("applies an explicit binding inside a subagent", async () => {
		const harness = await setup({
			subagent: true,
			config: {
				version: 1,
				selection: { mode: "auto" },
				defaultProfile: "global:base",
				bindings: [
					{
						id: "ds",
						profile: "global:review",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
				],
			},
		});
		const result = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(result?.systemPrompt ?? "").toContain("REVIEW PROFILE BODY");
	});

	it("applies nothing inside a subagent when subagents is off", async () => {
		const harness = await setup({
			subagent: true,
			config: {
				version: 1,
				selection: { mode: "auto" },
				defaultProfile: "global:base",
				subagents: "off",
				bindings: [
					{
						id: "ds",
						profile: "global:review",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
				],
			},
		});
		const result = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(result?.systemPrompt ?? "").not.toContain(MANAGED_BEGIN);
	});

	it("inherits the normal resolution inside a subagent when asked", async () => {
		const harness = await setup({
			subagent: true,
			config: {
				version: 1,
				selection: { mode: "auto" },
				defaultProfile: "global:base",
				subagents: "inherit",
			},
		});
		const result = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(result?.systemPrompt ?? "").toContain("BASE PROFILE BODY");
	});

	it("keeps an explicit off inside a subagent in bindings mode", async () => {
		const harness = await setup({
			subagent: true,
			config: {
				version: 1,
				selection: { mode: "off" },
				defaultProfile: "global:base",
				bindings: [
					{
						id: "ds",
						profile: "global:review",
						match: [{ provider: "deepseek", model: "deepseek-chat" }],
					},
				],
			},
		});
		const result = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(result?.systemPrompt ?? "").not.toContain(MANAGED_BEGIN);
	});

	it("keeps the normal resolution outside a subagent whatever the policy", async () => {
		const harness = await setup({
			config: {
				version: 1,
				selection: { mode: "auto" },
				defaultProfile: "global:base",
				subagents: "off",
			},
		});
		const result = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(result?.systemPrompt ?? "").toContain("BASE PROFILE BODY");
	});

	it("changes a setting from the command line", async () => {
		const harness = await setup();
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"set subagents off --scope global",
			harness.runner.createCommandContext(),
		);
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(config.subagents).toBe("off");
	});

	it("rejects an invalid value without writing", async () => {
		const harness = await setup();
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"set subagents always",
			harness.runner.createCommandContext(),
		);
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(config.subagents).toBeUndefined();
		expect(
			harness.notices.some((notice) => notice.includes("must be one of")),
		).toBe(true);
	});

	it("rejects inheritGlobalBindings in the global config", async () => {
		const harness = await setup();
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"set inheritGlobalBindings false --scope global",
			harness.runner.createCommandContext(),
		);
		expect(
			harness.notices.some((notice) => notice.includes("--scope project")),
		).toBe(true);
	});

	it("rejects --scope without a value", async () => {
		const harness = await setup();
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"set subagents off --scope",
			harness.runner.createCommandContext(),
		);
		expect(
			harness.notices.some((notice) => notice.includes("Invalid --scope")),
		).toBe(true);
	});

	it("applies a stored selection to the current session", async () => {
		const harness = await setup();
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"set selection off --scope global",
			harness.runner.createCommandContext(),
		);
		const result = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(result?.systemPrompt).toBeUndefined();
	});

	it("does not lie about a stored selection when a session pin is active", async () => {
		const harness = await setup();
		const command = harness.runner.getCommand("sp");
		await command?.handler("use review", harness.runner.createCommandContext());
		await command?.handler(
			"set selection off --scope global",
			harness.runner.createCommandContext(),
		);
		expect(
			harness.notices.some((notice) =>
				notice.includes("keeps its own selection"),
			),
		).toBe(true);
		const result = await harness.runner.emitBeforeAgentStart(
			"hi",
			undefined,
			BASE_PROMPT,
			{ cwd: harness.cwd },
		);
		expect(result?.systemPrompt ?? "").toContain("REVIEW PROFILE BODY");
	});

	it("removes a setting and refuses to write when it is absent", async () => {
		const harness = await setup({ config: { version: 1, subagents: "off" } });
		const file = path.join(harness.agentDir, "system-prompts", "config.json");
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"unset subagents --scope global",
			harness.runner.createCommandContext(),
		);
		expect(JSON.parse(fs.readFileSync(file, "utf8")).subagents).toBeUndefined();
		const before = fs.readFileSync(file, "utf8");
		await command?.handler(
			"unset subagents --scope global",
			harness.runner.createCommandContext(),
		);
		expect(fs.readFileSync(file, "utf8")).toBe(before);
		expect(
			harness.notices.some((notice) => notice.includes("is not set")),
		).toBe(true);
	});

	it("shows the configuration and the effective values", async () => {
		const harness = await setup();
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"config --scope global",
			harness.runner.createCommandContext(),
		);
		expect(
			harness.notices.some(
				(notice) =>
					notice.includes('"version": 1') && notice.includes("subagents ="),
			),
		).toBe(true);
	});

	it("refuses to write the project config without trust", async () => {
		const harness = await setup({ projectTrusted: false });
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"set subagents off --scope project",
			harness.runner.createCommandContext(),
		);
		expect(
			harness.notices.some((notice) => notice.includes("not trusted")),
		).toBe(true);
		expect(
			fs.existsSync(
				path.join(harness.cwd, ".pi", "system-prompts", "config.json"),
			),
		).toBe(false);
	});

	it("writes the project config when trusted", async () => {
		const harness = await setup({ projectTrusted: true });
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"set subagents inherit --scope project",
			harness.runner.createCommandContext(),
		);
		const projectConfig = JSON.parse(
			fs.readFileSync(
				path.join(harness.cwd, ".pi", "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(projectConfig.subagents).toBe("inherit");
	});

	it("changes a setting from the interactive menu", async () => {
		const harness = await setup({
			selectAnswers: [
				"Change a setting",
				"Global (all projects)",
				"subagents",
				"off",
			],
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("", harness.runner.createCommandContext());
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(config.subagents).toBe("off");
	});

	it("refuses to write a config whose version is not 1", async () => {
		const harness = await setup({ config: { version: 99 } });
		const file = path.join(harness.agentDir, "system-prompts", "config.json");
		const before = fs.readFileSync(file, "utf8");
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"set subagents off --scope global",
			harness.runner.createCommandContext(),
		);
		expect(fs.readFileSync(file, "utf8")).toBe(before);
		expect(
			harness.notices.some((notice) => notice.includes("unsupported version")),
		).toBe(true);
	});

	it("removes defaultProfile", async () => {
		const harness = await setup();
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"unset defaultProfile --scope global",
			harness.runner.createCommandContext(),
		);
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect(config.defaultProfile).toBeUndefined();
	});

	it("removes selection without leaving an empty object", async () => {
		const harness = await setup({
			config: { version: 1, selection: { mode: "off" } },
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"unset selection --scope global",
			harness.runner.createCommandContext(),
		);
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect("selection" in config).toBe(false);
	});

	it("removes inheritGlobalBindings even from the global config", async () => {
		const harness = await setup({
			config: { version: 1, inheritGlobalBindings: false },
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler(
			"unset inheritGlobalBindings --scope global",
			harness.runner.createCommandContext(),
		);
		const config = JSON.parse(
			fs.readFileSync(
				path.join(harness.agentDir, "system-prompts", "config.json"),
				"utf8",
			),
		);
		expect("inheritGlobalBindings" in config).toBe(false);
	});

	it("shows the configuration from the interactive menu", async () => {
		const harness = await setup({
			selectAnswers: ["Show configuration", "Global (all projects)"],
		});
		const command = harness.runner.getCommand("sp");
		await command?.handler("", harness.runner.createCommandContext());
		expect(
			harness.notices.some((notice) => notice.includes('"version": 1')),
		).toBe(true);
	});
});
