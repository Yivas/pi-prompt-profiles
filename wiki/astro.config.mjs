import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://yivas.github.io",
	base: "/pi-prompt-profiles/",
	integrations: [
		starlight({
			title: "pi-prompt-profiles",
			description:
				"Model-aware system prompt profiles for Pi, written in Markdown.",
			logo: {
				src: "./src/assets/logo.svg",
				alt: "pi-prompt-profiles",
			},
			customCss: ["./src/styles/custom.css"],
			social: [
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/Yivas/pi-prompt-profiles",
				},
			],
			sidebar: [
				{
					label: "Start",
					items: [
						{ slug: "index" },
						{ slug: "guides/install" },
						{ slug: "guides/first-profile" },
					],
				},
				{
					label: "Reference",
					items: [
						{ slug: "reference/commands" },
						{ slug: "reference/configuration" },
						{ slug: "reference/resolution" },
						{ slug: "reference/compatibility" },
					],
				},
				{
					label: "Help",
					items: [{ slug: "help/troubleshooting" }],
				},
			],
		}),
	],
});
