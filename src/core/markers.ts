/**
 * Delimiters for the managed block. They include the product name and a
 * version so only blocks emitted by this extension are recognized.
 *
 * Profile bodies are rejected when they contain them (see `loadProfiles`), so a
 * profile can never forge or truncate a block.
 */
export const MANAGED_BEGIN = "<!-- pi-prompt-profiles:begin v1 -->";
export const MANAGED_END = "<!-- pi-prompt-profiles:end -->";

export function containsManagedMarkers(text: string): boolean {
	return text.includes(MANAGED_BEGIN) || text.includes(MANAGED_END);
}
