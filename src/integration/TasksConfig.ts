import type { App } from 'obsidian';
import { DEFAULT_STATUSES, type StatusType, type TaskStatus } from '../types/tasks';
import { TASKS_PLUGIN_ID } from './TasksApi';

export type TaskFormat = 'tasksPluginEmoji' | 'dataview';

export interface TasksPluginConfig {
	statuses: TaskStatus[];
	taskFormat: TaskFormat;
	setDoneDate: boolean;
	setCancelledDate: boolean;
	/** Tasks' "global filter" — a string (often a tag like "#task") every recognised task line
	 * must contain. Empty string when unset. */
	globalFilter: string;
}

const DEFAULT_CONFIG: TasksPluginConfig = {
	statuses: DEFAULT_STATUSES,
	taskFormat: 'tasksPluginEmoji',
	setDoneDate: true,
	setCancelledDate: false,
	globalFilter: '',
};

interface RawStatus {
	symbol?: string;
	name?: string;
	nextStatusSymbol?: string;
	availableAsCommand?: boolean;
	type?: string;
}

function isValidStatusType(value: unknown): value is StatusType {
	return value === 'TODO' || value === 'IN_PROGRESS' || value === 'DONE' || value === 'CANCELLED' || value === 'NON_TASK';
}

function toTaskStatus(raw: unknown): TaskStatus | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as RawStatus;
	if (typeof r.symbol !== 'string' || typeof r.name !== 'string') return null;
	return {
		symbol: r.symbol,
		name: r.name,
		type: isValidStatusType(r.type) ? r.type : 'TODO',
		nextStatusSymbol: typeof r.nextStatusSymbol === 'string' ? r.nextStatusSymbol : ' ',
	};
}

function parseStatuses(raw: unknown): TaskStatus[] | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const settings = raw as { coreStatuses?: unknown; customStatuses?: unknown };
	const core: unknown[] = Array.isArray(settings.coreStatuses) ? settings.coreStatuses : [];
	const custom: unknown[] = Array.isArray(settings.customStatuses) ? settings.customStatuses : [];
	const combined = [...core, ...custom].map(toTaskStatus).filter((s): s is TaskStatus => s !== null);
	return combined.length > 0 ? combined : null;
}

function parseSettingsObject(settings: unknown): TasksPluginConfig {
	if (typeof settings !== 'object' || settings === null) return DEFAULT_CONFIG;
	const s = settings as {
		statusSettings?: unknown;
		taskFormat?: unknown;
		setDoneDate?: unknown;
		setCancelledDate?: unknown;
		globalFilter?: unknown;
	};
	const statuses = parseStatuses(s.statusSettings) ?? DEFAULT_STATUSES;
	const taskFormat: TaskFormat = s.taskFormat === 'dataview' ? 'dataview' : 'tasksPluginEmoji';
	return {
		statuses,
		taskFormat,
		setDoneDate: typeof s.setDoneDate === 'boolean' ? s.setDoneDate : DEFAULT_CONFIG.setDoneDate,
		setCancelledDate:
			typeof s.setCancelledDate === 'boolean' ? s.setCancelledDate : DEFAULT_CONFIG.setCancelledDate,
		globalFilter: typeof s.globalFilter === 'string' ? s.globalFilter : DEFAULT_CONFIG.globalFilter,
	};
}

/**
 * Dual-read of the Tasks plugin's configuration: in-memory (reflects unsaved changes) first,
 * persisted data.json second. Re-read on layout-change and when Tasks is re-enabled.
 */
export class TasksConfig {
	private config: TasksPluginConfig = DEFAULT_CONFIG;

	constructor(private app: App) {}

	get(): TasksPluginConfig {
		return this.config;
	}

	async refresh(): Promise<TasksPluginConfig> {
		const inMemory = (this.app.plugins.getPlugin(TASKS_PLUGIN_ID) as { settings?: unknown } | null)?.settings;
		if (inMemory) {
			this.config = parseSettingsObject(inMemory);
			return this.config;
		}
		try {
			const raw = await this.app.vault.adapter.read(
				`${this.app.vault.configDir}/plugins/${TASKS_PLUGIN_ID}/data.json`,
			);
			this.config = parseSettingsObject(JSON.parse(raw));
		} catch {
			this.config = DEFAULT_CONFIG;
		}
		return this.config;
	}
}
