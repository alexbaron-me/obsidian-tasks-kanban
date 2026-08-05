import * as chrono from 'chrono-node';
import moment from 'moment';
import type { Moment } from 'moment';
import type { Task, TasksDate } from '../types/tasks';

export type DateFieldName = 'due' | 'scheduled' | 'start' | 'created' | 'done' | 'cancelled' | 'happens';

export const DATE_FIELDS: readonly DateFieldName[] = [
	'due',
	'scheduled',
	'start',
	'created',
	'done',
	'cancelled',
	'happens',
];

export function getDateField(task: Task, field: DateFieldName): TasksDate {
	return task[field];
}

/**
 * Parses an absolute (`2026-08-14`) or natural-language (`today`, `tomorrow`, `next friday`,
 * `in 3 days`) date string relative to `referenceDate`. Returns null when unparseable.
 */
export function parseQueryDate(text: string, referenceDate: Moment): Moment | null {
	const trimmed = text.trim();
	if (trimmed === '') return null;

	const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
	if (isoMatch) {
		const m = moment(trimmed, 'YYYY-MM-DD', true);
		return m.isValid() ? m.startOf('day') : null;
	}

	const parsed = chrono.parseDate(trimmed, referenceDate.toDate(), { forwardDate: true });
	if (!parsed) return null;
	return moment(parsed).startOf('day');
}

export function compareDates(a: Moment | null, b: Moment | null): number {
	if (a === null && b === null) return 0;
	if (a === null) return 1; // undated sorts after dated, matching Tasks' default
	if (b === null) return -1;
	return a.valueOf() - b.valueOf();
}
