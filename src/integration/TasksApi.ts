// See NOTICE.md: the cache-subscription technique in this directory is derived from
// Djiit/obsidian-tasks-kanban (MIT).
import type { App } from 'obsidian';

export const TASKS_PLUGIN_ID = 'obsidian-tasks-plugin';

interface TasksApiV1 {
	createTaskLineModal(): Promise<string>;
	editTaskLineModal(taskLine: string): Promise<string>;
	executeToggleTaskDoneCommand(line: string, path: string): string;
}

interface TasksPluginLike {
	apiV1?: TasksApiV1;
	settings?: unknown;
}

function getTasksPlugin(app: App): TasksPluginLike | null {
	const plugin = app.plugins.getPlugin(TASKS_PLUGIN_ID);
	return (plugin as TasksPluginLike | null) ?? null;
}

export function isTasksPluginEnabled(app: App): boolean {
	return getTasksPlugin(app) !== null;
}

/**
 * Typed wrapper around the Tasks plugin's apiV1. Every method returns null instead of throwing
 * when the API is unavailable (Tasks disabled mid-session).
 */
export class TasksApi {
	constructor(private app: App) {}

	private api(): TasksApiV1 | null {
		return getTasksPlugin(this.app)?.apiV1 ?? null;
	}

	isAvailable(): boolean {
		return this.api() !== null;
	}

	/** Opens the "create task" modal. Returns the new line, or null if cancelled/unavailable. */
	async createTaskLineModal(): Promise<string | null> {
		const api = this.api();
		if (!api) return null;
		const line = await api.createTaskLineModal();
		return line === '' ? null : line;
	}

	/** Opens the "edit task" modal seeded with `taskLine`. Returns the edited line, or null. */
	async editTaskLineModal(taskLine: string): Promise<string | null> {
		const api = this.api();
		if (!api) return null;
		const line = await api.editTaskLineModal(taskLine);
		return line === '' ? null : line;
	}

	/**
	 * Toggles a line into its DONE-type status via the Tasks API, which owns recurrence,
	 * On Completion, and done-date formatting. May return two newline-joined lines when a
	 * recurring task spawns its next instance.
	 */
	executeToggleTaskDoneCommand(line: string, path: string): string[] | null {
		const api = this.api();
		if (!api) return null;
		const result = api.executeToggleTaskDoneCommand(line, path);
		return result.split('\n');
	}
}
