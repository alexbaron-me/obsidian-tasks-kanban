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

export function defaultGlobalSettings(seedFormat: TaskFormat = 'tasksPluginEmoji'): GlobalSettings {
	return {
		version: 1,
		format: seedFormat === 'dataview' ? 'dataview' : 'emoji',
		accentRules: [],
		idConfirmDismissed: false,
		defaultQuickAddTarget: null,
		cascade: { ...DEFAULT_CASCADE_SETTINGS },
	};
}

/** Merge persisted data over defaults; never trust the persisted shape blindly. */
export function loadGlobalSettings(raw: unknown, seedFormat: TaskFormat): GlobalSettings {
	const defaults = defaultGlobalSettings(seedFormat);
	if (typeof raw !== 'object' || raw === null) return defaults;
	const r = raw as Partial<GlobalSettings>;
	return {
		version: 1,
		format: r.format === 'dataview' || r.format === 'emoji' ? r.format : defaults.format,
		accentRules: Array.isArray(r.accentRules) ? r.accentRules : defaults.accentRules,
		idConfirmDismissed: typeof r.idConfirmDismissed === 'boolean' ? r.idConfirmDismissed : defaults.idConfirmDismissed,
		defaultQuickAddTarget:
			typeof r.defaultQuickAddTarget === 'string' ? r.defaultQuickAddTarget : defaults.defaultQuickAddTarget,
		cascade: { ...defaults.cascade, ...(typeof r.cascade === 'object' && r.cascade ? r.cascade : {}) },
	};
}
