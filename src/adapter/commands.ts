import fs from "node:fs";
import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { composeManagedBlock, stripManagedBlocks } from "../core/compose.js";
import { isSafeId } from "../core/ids.js";
import {
	atomicWriteFile,
	configPath,
	globalRoot,
	projectRoot,
} from "../core/paths.js";
import { formatRef, parseRef } from "../core/refs.js";
import type { Binding, Diagnostic, ProfileRef, Scope } from "../core/types.js";
import {
	readRawConfig,
	type RawConfig,
	writeRawConfigIfUnchanged,
} from "./config-edit.js";
import { messageOf, type Runtime } from "./runtime.js";

const COMMAND_NAME = "sp";

interface ParsedArgs {
	positional: string[];
	flags: Record<string, string | boolean>;
}

export function parseArgs(input: string): ParsedArgs {
	const tokens = input.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
	const positional: string[] = [];
	const flags: Record<string, string | boolean> = {};
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index] ?? "";
		if (token.startsWith("--")) {
			const equals = token.indexOf("=");
			if (equals > 0) {
				flags[token.slice(2, equals)] = token.slice(equals + 1);
				continue;
			}
			const key = token.slice(2);
			const next = tokens[index + 1];
			if (next !== undefined && !next.startsWith("--")) {
				flags[key] = next;
				index += 1;
			} else {
				flags[key] = true;
			}
			continue;
		}
		positional.push(token.replace(/^['"]|['"]$/g, ""));
	}
	return { positional, flags };
}

function flagString(
	flags: Record<string, string | boolean>,
	name: string,
): string | undefined {
	const value = flags[name];
	return typeof value === "string" ? value : undefined;
}

function flagNumber(
	flags: Record<string, string | boolean>,
	name: string,
): number | undefined {
	const value = flagString(flags, name);
	if (value === undefined) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function notify(
	ctx: ExtensionCommandContext,
	message: string,
	type: "info" | "warning" | "error" = "info",
): void {
	ctx.ui.notify(message, type);
}

function scopeFromFlag(
	flags: Record<string, string | boolean>,
): Scope | undefined {
	const value = flagString(flags, "scope");
	if (value === undefined) {
		return undefined;
	}
	return value === "global" || value === "project" ? value : undefined;
}

function formatDiagnostics(diagnostics: Diagnostic[]): string {
	return diagnostics
		.map((entry) => `${entry.level}: ${entry.message}`)
		.join("\n");
}

function findProfileRef(runtime: Runtime, input: string): ProfileRef | string {
	const explicit = parseRef(input);
	if (explicit) {
		return explicit;
	}
	if (!isSafeId(input)) {
		return `"${input}" is not a valid profile id.`;
	}
	const loaded = runtime.loaded;
	if (loaded?.projectTrusted && loaded.projectProfiles.profiles.has(input)) {
		return { scope: "project", id: input };
	}
	if (loaded?.globalProfiles.profiles.has(input)) {
		return { scope: "global", id: input };
	}
	return `Profile "${input}" was not found.`;
}

function profileExists(runtime: Runtime, ref: ProfileRef): boolean {
	const loaded = runtime.loaded;
	if (!loaded) {
		return false;
	}
	if (ref.scope === "project") {
		return loaded.projectTrusted && loaded.projectProfiles.profiles.has(ref.id);
	}
	return loaded.globalProfiles.profiles.has(ref.id);
}

function configRootFor(
	runtime: Runtime,
	ctx: ExtensionCommandContext,
	scope: Scope,
): string {
	return scope === "project"
		? projectRoot(ctx.cwd, runtime.configDirName)
		: globalRoot(runtime.agentDir);
}

function editConfig(
	runtime: Runtime,
	ctx: ExtensionCommandContext,
	scope: Scope,
	mutate: (config: RawConfig) => void,
): void {
	if (scope === "project" && !ctx.isProjectTrusted()) {
		throw new Error(
			"This project is not trusted, so its config cannot be modified.",
		);
	}
	const filePath = configPath(configRootFor(runtime, ctx, scope));
	const snapshot = readRawConfig(filePath);
	mutate(snapshot.config);
	writeRawConfigIfUnchanged(filePath, snapshot, snapshot.config);
}

function listProfiles(runtime: Runtime, scope: Scope | undefined): string[] {
	const loaded = runtime.loaded;
	if (!loaded) {
		return [];
	}
	const lines: string[] = [];
	const add = (catalog: typeof loaded.globalProfiles) => {
		for (const profile of catalog.profiles.values()) {
			const suffix = profile.description ? ` — ${profile.description}` : "";
			lines.push(
				`${formatRef({ scope: profile.scope, id: profile.id })}${suffix}`,
			);
		}
	};
	if (scope !== "project") {
		add(loaded.globalProfiles);
	}
	if (scope !== "global" && loaded.projectTrusted) {
		add(loaded.projectProfiles);
	}
	return lines;
}

async function interactiveSelect(
	runtime: Runtime,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const loaded = runtime.loaded;
	if (!loaded) {
		return;
	}
	const entries: Array<{ label: string; ref: ProfileRef }> = [];
	if (loaded.projectTrusted) {
		for (const profile of loaded.projectProfiles.profiles.values()) {
			entries.push({
				label: `project:${profile.id}${profile.description ? ` — ${profile.description}` : ""}`,
				ref: { scope: "project", id: profile.id },
			});
		}
	}
	for (const profile of loaded.globalProfiles.profiles.values()) {
		entries.push({
			label: `global:${profile.id}${profile.description ? ` — ${profile.description}` : ""}`,
			ref: { scope: "global", id: profile.id },
		});
	}
	if (entries.length === 0) {
		notify(
			ctx,
			"No profiles found. Use /sp new <id> --scope global to create one.",
			"warning",
		);
		return;
	}
	const labels = [
		"(auto) Resolve from bindings and defaults",
		...entries.map((entry) => entry.label),
		"(off) Disable the manager",
	];
	const choice = await ctx.ui.select("Select a system prompt profile", labels);
	if (choice === undefined) {
		return;
	}
	if (choice === labels[0]) {
		runtime.setSessionSelection(ctx, { mode: "auto" }, "session");
		notify(ctx, "Selection: auto.");
		return;
	}
	if (choice === labels[labels.length - 1]) {
		runtime.setSessionSelection(ctx, { mode: "off" }, "session");
		notify(ctx, "Selection: off.");
		return;
	}
	const entry = entries.find((candidate) => candidate.label === choice);
	if (!entry) {
		return;
	}
	runtime.setSessionSelection(
		ctx,
		{ mode: "manual", profile: formatRef(entry.ref) },
		"session",
	);
	notify(ctx, `Selection: ${formatRef(entry.ref)}.`);
}

function statusText(runtime: Runtime, ctx: ExtensionCommandContext): string {
	const resolution = runtime.resolve(ctx);
	const model = ctx.model;
	const lines = [
		`mode: ${runtime.selection.mode}`,
		`origin: ${runtime.origin}`,
		`model: ${model ? `${model.provider}/${model.id}` : "none"}`,
	];
	if (runtime.selection.profile) {
		lines.push(`selection: ${runtime.selection.profile}`);
	}
	if (resolution?.profile) {
		lines.push(`profile: ${formatRef(resolution.profile.ref)}`);
		lines.push(
			`layers: ${resolution.profile.layers.map((layer) => formatRef(layer.ref)).join(" -> ")}`,
		);
	}
	if (resolution?.binding) {
		lines.push(
			`binding: ${resolution.binding.scope}:${resolution.binding.binding.id}`,
		);
	}
	const observed = runtime.observed;
	lines.push(
		observed
			? `last payload: ${observed.blockPresent ? "managed block present" : "managed block not found"}; ${observed.note}`
			: "last payload: not observed yet",
	);
	return lines.join("\n");
}

async function handleList(
	runtime: Runtime,
	ctx: ExtensionCommandContext,
	args: ParsedArgs,
): Promise<void> {
	const scope = scopeFromFlag(args.flags);
	const lines = listProfiles(runtime, scope);
	notify(ctx, lines.length > 0 ? lines.join("\n") : "No profiles found.");
}

async function handleUse(
	runtime: Runtime,
	ctx: ExtensionCommandContext,
	args: ParsedArgs,
): Promise<void> {
	const input = args.positional[0];
	if (!input) {
		notify(ctx, "Usage: /sp use <profile>", "warning");
		return;
	}
	const ref = findProfileRef(runtime, input);
	if (typeof ref === "string") {
		notify(ctx, ref, "error");
		return;
	}
	if (!profileExists(runtime, ref)) {
		notify(ctx, `Profile ${formatRef(ref)} was not found.`, "error");
		return;
	}
	runtime.setSessionSelection(
		ctx,
		{ mode: "manual", profile: formatRef(ref) },
		"session",
	);
	notify(ctx, `Selection: ${formatRef(ref)}.`);
}

async function handleDefault(
	runtime: Runtime,
	ctx: ExtensionCommandContext,
	args: ParsedArgs,
): Promise<void> {
	const input = args.positional[0];
	if (!input) {
		notify(
			ctx,
			"Usage: /sp default <profile> --scope global|project",
			"warning",
		);
		return;
	}
	const scopeFlag = scopeFromFlag(args.flags);
	const explicit = parseRef(input);
	const scope: Scope = scopeFlag ?? explicit?.scope ?? "global";
	const id = explicit?.id ?? input;
	if (!isSafeId(id)) {
		notify(ctx, `"${input}" is not a valid profile id.`, "error");
		return;
	}
	const value =
		scopeFlag === undefined && explicit
			? formatRef(explicit)
			: `${scope}:${id}`;
	try {
		editConfig(runtime, ctx, scope, (config) => {
			config.defaultProfile = value;
		});
		runtime.reload();
		runtime.ensure(ctx);
		notify(ctx, `defaultProfile set to ${value} in the ${scope} config.`);
	} catch (cause) {
		notify(ctx, messageOf(cause), "error");
	}
}

async function handleNew(
	runtime: Runtime,
	ctx: ExtensionCommandContext,
	args: ParsedArgs,
): Promise<void> {
	const id = args.positional[0];
	if (!id || !isSafeId(id)) {
		notify(ctx, "Usage: /sp new <id> --scope global|project", "warning");
		return;
	}
	const scope = scopeFromFlag(args.flags) ?? "global";
	if (scope === "project" && !ctx.isProjectTrusted()) {
		notify(
			ctx,
			"This project is not trusted, so a project profile cannot be created.",
			"error",
		);
		return;
	}
	const root = configRootFor(runtime, ctx, scope);
	const filePath = path.join(root, "profiles", `${id}.md`);
	if (fs.existsSync(filePath)) {
		notify(ctx, `${filePath} already exists.`, "error");
		return;
	}
	try {
		atomicWriteFile(
			filePath,
			"<!-- Profile body. Replace this comment with the instructions for this profile. -->\n",
		);
		runtime.reload();
		runtime.ensure(ctx);
		notify(
			ctx,
			`Created ${scope}:${id} at ${filePath}. Reload with /sp reload if it does not appear.`,
		);
	} catch (cause) {
		notify(ctx, messageOf(cause), "error");
	}
}

async function handleEdit(
	runtime: Runtime,
	ctx: ExtensionCommandContext,
	args: ParsedArgs,
): Promise<void> {
	const input = args.positional[0];
	if (!input) {
		notify(ctx, "Usage: /sp edit <profile>", "warning");
		return;
	}
	const ref = findProfileRef(runtime, input);
	if (typeof ref === "string") {
		notify(ctx, ref, "error");
		return;
	}
	const loaded =
		ref.scope === "project"
			? runtime.loaded?.projectProfiles
			: runtime.loaded?.globalProfiles;
	const profile = loaded?.profiles.get(ref.id);
	if (!profile) {
		notify(ctx, `Profile ${formatRef(ref)} was not found.`, "error");
		return;
	}
	const updated = await ctx.ui.editor(
		`Edit ${formatRef(ref)}`,
		profile.content,
	);
	if (updated === undefined) {
		return;
	}
	try {
		atomicWriteFile(profile.path, updated);
		runtime.reload();
		runtime.ensure(ctx);
		notify(ctx, `Saved ${formatRef(ref)}.`);
	} catch (cause) {
		notify(ctx, messageOf(cause), "error");
	}
}

async function handleBind(
	runtime: Runtime,
	ctx: ExtensionCommandContext,
	args: ParsedArgs,
): Promise<void> {
	const input = args.positional[0];
	if (!input) {
		notify(
			ctx,
			"Usage: /sp bind <profile> [--provider <p>] [--model <m>] [--scope global|project] [--priority <n>] [--id <id>]",
			"warning",
		);
		return;
	}
	const ref = findProfileRef(runtime, input);
	if (typeof ref === "string") {
		notify(ctx, ref, "error");
		return;
	}
	const scope = scopeFromFlag(args.flags) ?? "global";

	let provider = flagString(args.flags, "provider") ?? "*";
	let model = flagString(args.flags, "model") ?? "*";
	if (
		flagString(args.flags, "provider") === undefined &&
		flagString(args.flags, "model") === undefined
	) {
		if (!ctx.hasUI) {
			notify(
				ctx,
				"Provide --provider and/or --model, or run interactively.",
				"error",
			);
			return;
		}
		const models = ctx.modelRegistry.getAvailable();
		if (models.length === 0) {
			notify(ctx, "No models are available to bind.", "error");
			return;
		}
		const labels = models.map(
			(candidate) => `${candidate.provider}/${candidate.id}`,
		);
		const choice = await ctx.ui.select("Bind this profile to a model", labels);
		if (choice === undefined) {
			return;
		}
		const index = labels.indexOf(choice);
		const chosen = models[index];
		if (!chosen) {
			return;
		}
		provider = String(chosen.provider);
		model = String(chosen.id);
	}

	const priority = flagNumber(args.flags, "priority") ?? 0;
	const bindingId =
		flagString(args.flags, "id") ??
		`${ref.id}-${provider}-${model}`.replace(/[^A-Za-z0-9._-]/g, "-");
	if (!isSafeId(bindingId)) {
		notify(ctx, `Binding id "${bindingId}" is not valid; pass --id.`, "error");
		return;
	}
	const binding: Binding = {
		id: bindingId,
		profile: formatRef(ref),
		priority,
		match: [{ provider, model }],
	};
	try {
		editConfig(runtime, ctx, scope, (config) => {
			const existing = Array.isArray(config.bindings)
				? (config.bindings as unknown[])
				: [];
			const filtered = existing.filter(
				(entry) =>
					!(
						typeof entry === "object" &&
						entry !== null &&
						(entry as { id?: unknown }).id === bindingId
					),
			);
			config.bindings = [...filtered, binding];
		});
		runtime.reload();
		runtime.ensure(ctx);
		notify(
			ctx,
			`Bound ${formatRef(ref)} to ${provider}/${model} (priority ${priority}) in the ${scope} config.`,
		);
	} catch (cause) {
		notify(ctx, messageOf(cause), "error");
	}
}

async function handleUnbind(
	runtime: Runtime,
	ctx: ExtensionCommandContext,
	args: ParsedArgs,
): Promise<void> {
	const id = args.positional[0];
	if (!id) {
		notify(
			ctx,
			"Usage: /sp unbind <binding-id> [--scope global|project]",
			"warning",
		);
		return;
	}
	const scope = scopeFromFlag(args.flags) ?? "global";
	try {
		let removed = 0;
		editConfig(runtime, ctx, scope, (config) => {
			const current = config.bindings;
			if (!Array.isArray(current)) {
				return;
			}
			const before = current.length;
			config.bindings = current.filter(
				(entry) =>
					!(
						typeof entry === "object" &&
						entry !== null &&
						(entry as { id?: unknown }).id === id
					),
			);
			removed = before - (config.bindings as unknown[]).length;
		});
		runtime.reload();
		runtime.ensure(ctx);
		notify(
			ctx,
			removed > 0
				? `Removed ${removed} binding(s) named "${id}".`
				: `No binding named "${id}" was found in the ${scope} config.`,
		);
	} catch (cause) {
		notify(ctx, messageOf(cause), "error");
	}
}

function handleValidate(runtime: Runtime, ctx: ExtensionCommandContext): void {
	const diagnostics = runtime.diagnostics();
	const resolution = runtime.resolve(ctx);
	const lines: string[] = [];
	lines.push(
		`global config: ${runtime.loaded?.globalConfig.exists ? "present" : "absent"}`,
	);
	lines.push(`project trusted: ${ctx.isProjectTrusted() ? "yes" : "no"}`);
	lines.push(
		`global profiles: ${runtime.loaded?.globalProfiles.profiles.size ?? 0}`,
	);
	lines.push(
		`project profiles: ${runtime.loaded?.projectTrusted ? (runtime.loaded.projectProfiles.profiles.size ?? 0) : "not applied (untrusted)"}`,
	);
	lines.push(
		`resolved: ${resolution.profile ? formatRef(resolution.profile.ref) : "none"}`,
	);
	lines.push(`diagnostics: ${diagnostics.length}`);
	if (diagnostics.length > 0) {
		lines.push(formatDiagnostics(diagnostics));
	}
	notify(ctx, lines.join("\n"));
}

function handlePreview(runtime: Runtime, ctx: ExtensionCommandContext): void {
	const resolution = runtime.resolve(ctx);
	if (!resolution.profile) {
		notify(
			ctx,
			"No active profile to preview. Pi will use its native prompt.",
			"warning",
		);
		return;
	}
	const block = composeManagedBlock(resolution.profile);
	const base = ctx.getSystemPrompt();
	const stripped = stripManagedBlocks(base);
	const lines = [
		`profile: ${formatRef(resolution.profile.ref)} (${resolution.profile.layers.length} layer(s))`,
		`managed block: ${Buffer.byteLength(block, "utf8")} bytes`,
		`current system prompt: ${Buffer.byteLength(base, "utf8")} bytes (${stripped.removed} managed block(s) already present)`,
		`block hash: ${resolution.profile.layers.map((layer) => layer.hash.slice(0, 12)).join(", ")}`,
		`last provider payload: ${runtime.observed ? (runtime.observed.blockPresent ? "block present" : "block not found") : "not observed yet"}`,
		"This preview may contain private instructions from your profiles.",
		"",
		block.slice(0, 800),
	];
	if (block.length > 800) {
		lines.push(`... (${block.length - 800} more characters)`);
	}
	notify(ctx, lines.join("\n"), "warning");
}

async function handleReload(
	runtime: Runtime,
	ctx: ExtensionCommandContext,
): Promise<void> {
	runtime.reload();
	runtime.ensure(ctx);
	if (!runtime.hasSessionSelection()) {
		runtime.applyConfigSelection();
	}
	runtime.updateStatus(ctx);
	notify(ctx, "Reloaded config and profiles from disk.");
}

export function registerCommands(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerCommand(COMMAND_NAME, {
		description:
			"Manage system prompt profiles (list, use, auto, off, status, why, preview, bind, reload, validate, new, edit, default).",
		getArgumentCompletions(argumentPrefix: string) {
			const subcommands = [
				"list",
				"use",
				"auto",
				"off",
				"status",
				"why",
				"preview",
				"bind",
				"unbind",
				"reload",
				"validate",
				"new",
				"edit",
				"default",
				"help",
			];
			const parts = argumentPrefix.split(/\s+/);
			if (parts.length <= 1) {
				return subcommands
					.filter((name) => name.startsWith(parts[0] ?? ""))
					.map((name) => ({ value: name, label: name }));
			}
			if (
				parts[0] === "use" ||
				parts[0] === "edit" ||
				parts[0] === "bind" ||
				parts[0] === "default"
			) {
				const profiles = listProfiles(runtime, undefined).map(
					(line) => line.split(" —")[0] ?? line,
				);
				return profiles.map((value) => ({
					value: `${parts[0]} ${value}`,
					label: value,
				}));
			}
			return null;
		},
		async handler(args: string, ctx: ExtensionCommandContext): Promise<void> {
			try {
				runtime.ensure(ctx);
				const parsed = parseArgs(args);
				const subcommand = parsed.positional[0] ?? "interactive";
				const operands: ParsedArgs = {
					positional: parsed.positional.slice(1),
					flags: parsed.flags,
				};
				switch (subcommand) {
					case "interactive":
						if (runtime.hasSessionSelection()) {
							runtime.applyConfigSelection();
						}
						if (ctx.hasUI) {
							await interactiveSelect(runtime, ctx);
						} else {
							notify(
								ctx,
								"Usage: /sp <list|use|auto|off|status|why|preview|bind|unbind|reload|validate|new|edit|default>",
							);
						}
						break;
					case "help":
						notify(
							ctx,
							[
								"/sp                     interactive selector",
								"/sp list [--scope ...]  list profiles",
								"/sp use <profile>       pin a profile for this session",
								"/sp auto                clear the pin and resolve from rules",
								"/sp off                 disable the manager for this session",
								"/sp status              show the effective selection",
								"/sp why                 explain the resolution",
								"/sp preview             show the managed block",
								"/sp bind <profile>      add a model binding",
								"/sp unbind <id>         remove a binding",
								"/sp reload              re-read config and profiles",
								"/sp validate            report configuration problems",
								"/sp new <id>            create a profile file",
								"/sp edit <profile>      edit a profile",
								"/sp default <profile>   set defaultProfile",
							].join("\n"),
						);
						break;
					case "list":
						await handleList(runtime, ctx, operands);
						break;
					case "use":
						await handleUse(runtime, ctx, operands);
						break;
					case "auto":
						runtime.setSessionSelection(ctx, { mode: "auto" }, "session");
						notify(ctx, "Selection: auto.");
						break;
					case "off":
						runtime.setSessionSelection(ctx, { mode: "off" }, "session");
						notify(ctx, "Selection: off.");
						break;
					case "status":
						notify(ctx, statusText(runtime, ctx));
						break;
					case "why": {
						const lines = [statusText(runtime, ctx)];
						const resolution = runtime.resolve(ctx);
						if (resolution.ignored.length > 0) {
							lines.push(
								`discarded rules: ${resolution.ignored.map((match) => `${match.scope}:${match.binding.id}`).join(", ")}`,
							);
						}
						if (resolution.diagnostics.length > 0) {
							lines.push(formatDiagnostics(resolution.diagnostics));
						}
						notify(ctx, lines.join("\n"));
						break;
					}
					case "preview":
						handlePreview(runtime, ctx);
						break;
					case "bind":
						await handleBind(runtime, ctx, operands);
						break;
					case "unbind":
						await handleUnbind(runtime, ctx, operands);
						break;
					case "reload":
						await handleReload(runtime, ctx);
						break;
					case "validate":
						handleValidate(runtime, ctx);
						break;
					case "new":
						await handleNew(runtime, ctx, operands);
						break;
					case "edit":
						await handleEdit(runtime, ctx, operands);
						break;
					case "default":
						await handleDefault(runtime, ctx, operands);
						break;
					default:
						notify(
							ctx,
							`Unknown subcommand "${subcommand}". Try /sp help.`,
							"error",
						);
				}
			} catch (cause) {
				notify(ctx, `pi-prompt-profiles: ${messageOf(cause)}`, "error");
			}
		},
	});
}
