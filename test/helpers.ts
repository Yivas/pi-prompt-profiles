import type {
	ConfigV1,
	LoadedProfile,
	ProfileCatalog,
	ProfileMeta,
	Scope,
	SourceConfig,
} from "../src/core/types.js";

export interface ProfileSpec {
	id: string;
	content: string;
	description?: string;
}

export function sourceConfig(
	scope: Scope,
	config?: ConfigV1,
	meta?: Record<string, ProfileMeta>,
): SourceConfig {
	const merged: ConfigV1 | undefined = config
		? {
				...config,
				...(meta ? { profiles: { ...(config.profiles ?? {}), ...meta } } : {}),
			}
		: meta
			? { version: 1, profiles: meta }
			: undefined;
	return {
		scope,
		path: `/virtual/${scope}/config.json`,
		exists: merged !== undefined,
		config: merged,
		diagnostics: [],
	};
}

export function catalog(scope: Scope, profiles: ProfileSpec[]): ProfileCatalog {
	const map = new Map<string, LoadedProfile>();
	for (const profile of profiles) {
		const loaded: LoadedProfile = {
			id: profile.id,
			scope,
			path: `/virtual/${scope}/profiles/${profile.id}.md`,
			content: profile.content,
			hash: `hash-${scope}-${profile.id}`,
		};
		if (profile.description !== undefined) {
			loaded.description = profile.description;
		}
		map.set(profile.id, loaded);
	}
	return { scope, profiles: map, createDiagnostics: [] };
}
