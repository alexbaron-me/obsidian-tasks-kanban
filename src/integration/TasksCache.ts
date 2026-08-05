// See NOTICE.md: the cache-subscription technique here is derived from
// Djiit/obsidian-tasks-kanban (MIT).
import type { App } from 'obsidian';
import type { Task } from '../types/tasks';

type Listener = (tasks: readonly Task[]) => void;

/**
 * Subscribes to the Tasks plugin's cache-update events and exposes the current task list.
 * There is no supported alternative to these two undocumented events; the Tasks API cannot
 * search (see upstream issue #2459).
 */
export class TasksCache {
	private tasks: Task[] = [];
	private ready = false;
	private listeners = new Set<Listener>();
	private unsubEvent: (() => void) | null = null;

	constructor(private app: App) {}

	start(): void {
		const ref = this.app.workspace.on('obsidian-tasks-plugin:cache-update', (data) => {
			this.tasks = data.tasks ?? [];
			this.ready = true;
			this.notify();
		});
		this.unsubEvent = () => this.app.workspace.offref(ref);
		this.requestBootstrap();
	}

	stop(): void {
		this.unsubEvent?.();
		this.unsubEvent = null;
	}

	/** Re-triggers the bootstrap request. Safe to call repeatedly (e.g. from a retry button). */
	requestBootstrap(): void {
		this.app.workspace.trigger('obsidian-tasks-plugin:request-cache-update', (data) => {
			this.tasks = data.tasks ?? [];
			this.ready = true;
			this.notify();
		});
	}

	getTasks(): readonly Task[] {
		return this.tasks;
	}

	isReady(): boolean {
		return this.ready;
	}

	/** Fires immediately with the current task list, then on every update. Returns an unsubscribe fn. */
	subscribe(fn: Listener): () => void {
		this.listeners.add(fn);
		fn(this.tasks);
		return () => this.listeners.delete(fn);
	}

	private notify(): void {
		for (const fn of this.listeners) fn(this.tasks);
	}
}
