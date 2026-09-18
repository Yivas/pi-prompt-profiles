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
		JSON.stringify({
			version: 1,
			selection: { mode: "auto" },
			defaultProfile: "global:base",
		}),
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
				"Bind a profile to a model",
				"global:base",
				"deepseek/deepseek-chat",
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
});
