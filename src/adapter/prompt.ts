import {
	type ExtensionAPI,
	type ExtensionContext,
	VERSION,
} from "@earendil-works/pi-coding-agent";
import { contentText, type TextContent } from "@earendil-works/pi-ai";
import { composeManagedBlock, stripManagedBlocks } from "../core/compose.js";
import { messageOf, type Runtime } from "./runtime.js";

interface TranscriptMessage {
	role: string;
	content: unknown;
}

// The package still typechecks against 0.85.1, which predates this public hook.
// Register it only on Pi versions with the structured transcript API.
type SystemContextRegistration = (
	event: "context_with_system",
	handler: (event: {
		messages: TranscriptMessage[];
	}) => { messages: TranscriptMessage[] } | undefined,
) => unknown;

function hasSystemContext(): boolean {
	const [major = 0, minor = 0] = VERSION.split(".").map(Number);
	return major > 1 || (major === 1 && minor >= 4);
}

export function registerPromptHooks(pi: ExtensionAPI, runtime: Runtime): void {
	const structured = hasSystemContext();
	let block: string | undefined;
	let warned = false;

	pi.on("before_agent_start", async (event, ctx) => {
		block = undefined;
		warned = false;
		try {
			runtime.ensure(ctx);
			const resolution = runtime.resolve(ctx);
			if (resolution.mode !== "off" && resolution.profile) {
				block = composeManagedBlock(resolution.profile);
			}
			runtime.markApplied(
				ctx,
				block ? resolution.profile?.layers[0]?.hash : undefined,
			);
			runtime.observed = undefined;
			runtime.updateStatus(ctx);
			if (structured || !block) {
				return undefined;
			}
			// Legacy Pi has no transcript hook or native system-section deltas.
			const { systemPrompt } = runtime.compose(event.systemPrompt, ctx);
			return systemPrompt === undefined ? undefined : { systemPrompt };
		} catch (cause) {
			block = undefined;
			ctx.ui.notify(
				`pi-prompt-profiles: ${messageOf(cause)}; Pi keeps its native prompt.`,
				"error",
			);
			return undefined;
		}
	});

	if (structured) {
		const onSystemContext = pi.on as unknown as SystemContextRegistration;
		onSystemContext("context_with_system", (event) => {
			const head = event.messages[0];
			if (head?.role !== "system") {
				return undefined;
			}
			const text =
				typeof head.content === "string"
					? head.content
					: contentText(head.content as TextContent[]);
			const stripped = stripManagedBlocks(text);
			if (!block && stripped.removed === 0) {
				return undefined;
			}
			const content = block
				? `${block}${stripped.text ? `\n\n${stripped.text}` : ""}`
				: stripped.text;
			return {
				messages: [{ ...head, content }, ...event.messages.slice(1)],
			};
		});
	}

	pi.on("before_provider_request", async (event, ctx: ExtensionContext) => {
		// Read only: a foreign forceSystemPrompt runs after context_with_system
		// and can discard our projection. Never repair it by rewriting a payload.
		runtime.observe(event.payload, block);
		if (!block) {
			return undefined;
		}
		runtime.updateStatus(ctx);
		if (!warned && !runtime.observed?.blockPresent) {
			warned = true;
			ctx.ui.notify(
				runtime.observed?.systemFound
					? "pi-prompt-profiles: the selected profile is missing from this request. Another extension may have replaced the complete system prompt."
					: "pi-prompt-profiles: this provider payload format could not be checked; the selected profile is not confirmed in this request.",
				"warning",
			);
		}
		return undefined;
	});
}
