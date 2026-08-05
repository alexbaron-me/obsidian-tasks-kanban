import 'obsidian';
import type { Task } from './tasks';

export interface TasksCacheUpdatePayload {
	tasks: Task[];
	state: string;
}

declare module 'obsidian' {
	interface Workspace {
		on(
			name: 'obsidian-tasks-plugin:cache-update',
			callback: (data: TasksCacheUpdatePayload) => void,
		): EventRef;
		on(
			name: 'obsidian-tasks-plugin:request-cache-update',
			callback: (data: TasksCacheUpdatePayload) => void,
		): EventRef;
		trigger(
			name: 'obsidian-tasks-plugin:request-cache-update',
			callback: (data: TasksCacheUpdatePayload) => void,
		): void;
	}

	interface App {
		plugins: {
			plugins: Record<string, unknown>;
			getPlugin(id: string): unknown;
			enabledPlugins: Set<string>;
		};
		embedRegistry?: {
			registerExtension(extension: string, creator: unknown): void;
			unregisterExtension(extension: string): void;
		};
	}
}
