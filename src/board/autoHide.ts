import type { Moment } from 'moment';
import type { Task } from '../types/tasks';

/**
 * Drops DONE/CANCELLED tasks completed more than `hideDoneAfterDays` days before `today`.
 * `hideDoneAfterDays <= 0` disables auto-hide entirely. A completed task with no completion
 * date is never hidden. Applied after filtering, before bucketing (§9).
 */
export function applyAutoHide(tasks: readonly Task[], hideDoneAfterDays: number, today: Moment): Task[] {
	if (hideDoneAfterDays <= 0) return [...tasks];
	return tasks.filter((task) => {
		const isCompleted = task.status.type === 'DONE' || task.status.type === 'CANCELLED';
		if (!isCompleted) return true;
		const completion = task.status.type === 'DONE' ? task.done.moment : task.cancelled.moment;
		if (!completion) return true;
		const daysAgo = today.clone().startOf('day').diff(completion.clone().startOf('day'), 'day');
		return daysAgo <= hideDoneAfterDays;
	});
}
