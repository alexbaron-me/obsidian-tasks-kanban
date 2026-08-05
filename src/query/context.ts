import type { Moment } from 'moment';
import type { Task, TasksFile } from '../types/tasks';

/** Exposed to user functions as `query`. Mirrors Tasks' own context shape. */
export interface QueryContext {
	file: TasksFile;
	allTasks: readonly Task[];
	boardId: string;
	viewName: string;
	/** Frozen for the render pass. */
	today: Moment;
}

/**
 * `task.urgency` is a computed getter on the real Tasks class and can be expensive. Memoise
 * per render pass into a WeakMap so repeated reads (filter, sort, chip, rollup) cost one
 * evaluation per task.
 */
export class UrgencyCache {
	private cache = new WeakMap<Task, number>();

	get(task: Task): number {
		let value = this.cache.get(task);
		if (value === undefined) {
			value = task.urgency;
			this.cache.set(task, value);
		}
		return value;
	}
}
