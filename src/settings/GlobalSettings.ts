import type { SettingsBlock } from '../types/board';
import type { TaskFormat } from '../integration/TasksConfig';

export interface AccentRule {
	name: string;
	/** Any query expression, including `filter by function`. */
	filter: string;
	/** e.g. "--color-red" */
	cssVar: string;
}

/** Global-only settings (§14), plus the cascaded defaults (global level of the 3-level cascade). */
export interface GlobalSettings {
	version: 1;
	format: 'emoji' | 'dataview';
	accentRules: AccentRule[];
	idConfirmDismissed: boolean;
	defaultQuickAddTarget: string | null;
	/** Whether to strip the Tasks global filter tag from card descriptions and tag chips. It's
	 * never touched in the file — this only affects how the card renders. */
	hideGlobalFilterTag: boolean;
	/** Seeded once from the Tasks plugin's own global filter, then user-owned. Empty string when
	 * there's nothing to strip. */
	globalFilterTag: string;
	cascade: SettingsBlock;
}

export const DEFAULT_CASCADE_SETTINGS: Required<
	Pick<
		SettingsBlock,
		'hideDoneAfterDays' | 'clickAction' | 'density' | 'wipMode' | 'blockedDropMode' | 'postponeField' | 'laneCollapseDefault'
	>
> = {
	hideDoneAfterDays: 14,
	clickAction: 'file',
	density: 'comfortable',
	wipMode: 'soft',
	blockedDropMode: 'soft',
	postponeField: 'due',
	laneCollapseDefault: false,
};

export function defaultGlobalSettings(seedFormat: TaskFormat = 'tasksPluginEmoji', seedGlobalFilterTag = ''): GlobalSettings {
	return {
		version: 1,
		format: seedFormat === 'dataview' ? 'dataview' : 'emoji',
		accentRules: [],
		idConfirmDismissed: false,
		defaultQuickAddTarget: null,
		hideGlobalFilterTag: true,
		globalFilterTag: seedGlobalFilterTag,
		cascade: { ...DEFAULT_CASCADE_SETTINGS },
	};
}

/** Merge persisted data over defaults; never trust the persisted shape blindly. */
export function loadGlobalSettings(raw: unknown, seedFormat: TaskFormat, seedGlobalFilterTag = ''): GlobalSettings {
	const defaults = defaultGlobalSettings(seedFormat, seedGlobalFilterTag);
	if (typeof raw !== 'object' || raw === null) return defaults;
	const r = raw as Partial<GlobalSettings>;
	return {
		version: 1,
		format: r.format === 'dataview' || r.format === 'emoji' ? r.format : defaults.format,
		accentRules: Array.isArray(r.accentRules) ? r.accentRules : defaults.accentRules,
		idConfirmDismissed: typeof r.idConfirmDismissed === 'boolean' ? r.idConfirmDismissed : defaults.idConfirmDismissed,
		defaultQuickAddTarget:
			typeof r.defaultQuickAddTarget === 'string' ? r.defaultQuickAddTarget : defaults.defaultQuickAddTarget,
		hideGlobalFilterTag:
			typeof r.hideGlobalFilterTag === 'boolean' ? r.hideGlobalFilterTag : defaults.hideGlobalFilterTag,
		// Once the user has ever persisted settings, their globalFilterTag (even if blank) wins —
		// it's only ever seeded from Tasks on the very first load, same as `format`.
		globalFilterTag: typeof r.globalFilterTag === 'string' ? r.globalFilterTag : defaults.globalFilterTag,
		cascade: { ...defaults.cascade, ...(typeof r.cascade === 'object' && r.cascade ? r.cascade : {}) },
	};
}
