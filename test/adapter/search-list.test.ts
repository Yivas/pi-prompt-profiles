import type {
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { displayWidth, SearchList } from "../../src/adapter/picker.js";
import type { PickerItem } from "../../src/core/picker.js";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as unknown as Theme;

const KEYS: Record<string, string[]> = {
	"tui.select.up": ["\x1b[A"],
	"tui.select.down": ["\x1b[B"],
	"tui.select.pageUp": ["\x1b[5~"],
	"tui.select.pageDown": ["\x1b[6~"],
	"tui.select.confirm": ["\r"],
	"tui.select.cancel": ["\x1b"],
};

const keybindings = {
	matches: (data: string, action: string) =>
		(KEYS[action] ?? []).includes(data),
} as unknown as KeybindingsManager;

function items(count: number): PickerItem[] {
	return Array.from({ length: count }, (_value, index) => ({
		value: `value-${index}`,
		label: `model-${String(index).padStart(2, "0")}`,
	}));
}

function build(
	options: { items: PickerItem[]; subtitle?: string } = { items: items(15) },
) {
	let result: string | undefined | symbol = Symbol("pending");
	const list = new SearchList(
		"Bind global:base",
		options.subtitle,
		options.items,
		theme,
		keybindings,
		(value) => {
			result = value;
		},
	);
	return { list, selected: () => result };
}

function rows(list: SearchList): string[] {
	return list.render(80).filter((line) => /^(→ | {2})model-/.test(line));
}

describe("SearchList", () => {
	it("shows ten rows at most and never the whole catalog", () => {
		const { list } = build();
		expect(rows(list)).toHaveLength(10);
		expect(list.render(80).some((line) => line.includes("1-10 of 15"))).toBe(
			true,
		);
	});

	it("filters as the user types", () => {
		const { list } = build();
		for (const character of "model-14") {
			list.handleInput(character);
		}
		const filtered = rows(list);
		expect(filtered).toHaveLength(1);
		expect(filtered[0]).toContain("model-14");
	});

	it("removes the last character on backspace", () => {
		const { list } = build({
			items: [
				{ value: "1", label: "ax" },
				{ value: "2", label: "bx" },
			],
		});
		list.handleInput("a");
		const filtered = list.render(80).join("\n");
		expect(filtered).toContain("ax");
		expect(filtered).not.toContain("bx");
		list.handleInput("\x7f");
		const restored = list.render(80).join("\n");
		expect(restored).toContain("ax");
		expect(restored).toContain("bx");
	});

	it("moves the selection with the arrow keys", () => {
		const { list, selected } = build();
		list.handleInput("\x1b[B");
		list.handleInput("\r");
		expect(selected()).toBe("value-1");
	});

	it("confirms the highlighted item", () => {
		const { list, selected } = build();
		list.handleInput("\r");
		expect(selected()).toBe("value-0");
	});

	it("returns undefined when cancelled", () => {
		const { list, selected } = build();
		list.handleInput("\x1b");
		expect(selected()).toBeUndefined();
	});

	it("keeps the selection inside the filtered list", () => {
		const { list, selected } = build({ items: items(3) });
		list.handleInput("\x1b[6~");
		list.handleInput("\r");
		expect(selected()).toBe("value-2");
	});

	it("never renders a line wider than the terminal", () => {
		const { list } = build({
			subtitle: "perfil — descripción con caracteres anchos 📁📁📁📁",
			items: [
				{ value: "1", label: `模型-${"宽".repeat(60)}` },
				{
					value: "2",
					label: "C:\\Usuarios\\日本語\\proyecto — descripción larga 📁",
				},
				{ value: "3", label: "tab\there\tand\there" },
			],
		});
		for (const width of [40, 20, 12]) {
			for (const line of list.render(width)) {
				expect(displayWidth(line)).toBeLessThanOrEqual(width);
			}
		}
	});

	it("counts wide characters and tabs conservatively", () => {
		expect(displayWidth("模型")).toBe(4);
		expect(displayWidth("a\tb")).toBe(5);
	});

	it("fits the empty state and the search prefix in narrow terminals", () => {
		const { list } = build({ items: [] });
		list.handleInput("z");
		for (const width of [12, 11, 8, 4, 1]) {
			for (const line of list.render(width)) {
				expect(displayWidth(line)).toBeLessThanOrEqual(width);
			}
		}
	});
});
