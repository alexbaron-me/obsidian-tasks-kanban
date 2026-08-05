import type { Moment } from 'moment';
import { moment } from 'obsidian';
import type { Task } from '../types/tasks';
import type { Bucket, BucketWriteValue, ColumnSpec, FieldRef } from '../types/board';
import { WRITABLE_FIELDS } from '../types/board';

export interface BucketResult {
	buckets: Bucket[];
	assignment: Map<string, Task[]>;
	hidden: Task[];
	warnings: string[];
}

function isWritable(field: FieldRef): boolean {
	return (WRITABLE_FIELDS as readonly FieldRef[]).includes(field);
}

function resolveGenerator(spec: ColumnSpec): 'explicit' | 'rolling' | 'auto' {
	if (spec.generator) return spec.generator;
	if (spec.buckets !== undefined) return 'explicit';
	if (spec.span !== undefined) return 'rolling';
	return 'auto';
}

function dateFieldOf(field: FieldRef): 'due' | 'scheduled' | 'start' | null {
	return field === 'due' || field === 'scheduled' || field === 'start' ? field : null;
}

/** The raw string value(s) a task carries for `field`, used for explicit/auto matching. */
function getFieldValues(task: Task, field: FieldRef): string[] {
	switch (field) {
		case 'status':
			return [task.status.symbol];
		case 'due':
		case 'scheduled':
		case 'start': {
			const m = task[field].moment;
			return m ? [m.format('YYYY-MM-DD')] : [];
		}
		case 'priority':
			return [task.priorityName];
		case 'tags':
			return task.tags;
		case 'path':
			return [task.file.path];
		case 'folder':
			return [task.file.folder];
		case 'filename':
			return [task.file.filename];
		case 'urgency':
			return [task.urgency.toFixed(2)];
		case 'recurrence':
			return [task.isRecurring ? 'recurring' : 'not recurring'];
	}
}

function writeValueFor(field: FieldRef, value: string): BucketWriteValue | null {
	if (!isWritable(field)) return null;
	switch (field) {
		case 'status':
			return { kind: 'status', symbol: value };
		case 'priority':
			return { kind: 'priority', value };
		case 'tags':
			return { kind: 'tags', add: value, removeOthers: [] };
		case 'due':
		case 'scheduled':
		case 'start':
			return { kind: 'date', field, value: moment(value, 'YYYY-MM-DD') };
		default:
			return null;
	}
}

function buildExplicit(spec: ColumnSpec, warnings: string[]): Bucket[] {
	const defs = spec.buckets ?? [];
	if (spec.buckets !== undefined && spec.span !== undefined) {
		warnings.push('Both "buckets" and "span" are set; explicit buckets win.');
	}
	return defs.map((def) => {
		let writeValue: BucketWriteValue | null = null;
		if (isWritable(spec.field) && def.match.length > 0) {
			if (spec.field === 'tags') {
				const others = defs.filter((d) => d !== def).flatMap((d) => d.match);
				writeValue = { kind: 'tags', add: def.match[0]!, removeOthers: others };
			} else {
				writeValue = writeValueFor(spec.field, def.match[0]!);
			}
		}
		return { id: def.name, label: def.name, writeValue, override: spec.overrides[def.name] ?? {} };
	});
}

const DAY_LABELS: Record<number, string> = { 0: 'Today', 1: 'Tomorrow', [-1]: 'Yesterday' };

function rollingDayLabel(offset: number, date: Moment): string {
	return DAY_LABELS[offset] ?? date.format('ddd DD');
}

function rollingDayId(offset: number): string {
	if (offset === 0) return 'd0';
	return offset > 0 ? `d+${offset}` : `d${offset}`;
}

function buildRolling(spec: ColumnSpec, today: Moment, warnings: string[]): Bucket[] {
	const field = dateFieldOf(spec.field);
	if (!field) {
		warnings.push(`Rolling columns require a date field (due/scheduled/start); got "${spec.field}".`);
		return [];
	}
	const span = spec.span ?? { from: 0, to: 0 };
	const edges = new Set(spec.edges ?? []);
	const buckets: Bucket[] = [];

	if (edges.has('overdue')) {
		buckets.push({ id: 'overdue', label: 'Overdue', writeValue: null, override: spec.overrides['overdue'] ?? {} });
	}
	for (let offset = span.from; offset <= span.to; offset++) {
		const date = today.clone().add(offset, 'day');
		const id = rollingDayId(offset);
		buckets.push({
			id,
			label: rollingDayLabel(offset, date),
			writeValue: { kind: 'date', field, value: date },
			override: spec.overrides[id] ?? {},
		});
	}
	if (edges.has('later')) {
		buckets.push({ id: 'later', label: 'Later', writeValue: null, override: spec.overrides['later'] ?? {} });
	}
	if (edges.has('undated')) {
		buckets.push({
			id: 'undated',
			label: 'No date',
			writeValue: { kind: 'date', field, value: null },
			override: spec.overrides['undated'] ?? {},
		});
	}
	return buckets;
}

const AUTO_BUCKET_CAP = 30;

function buildAuto(spec: ColumnSpec, tasks: readonly Task[], warnings: string[]): Bucket[] {
	const values = new Set<string>();
	for (const task of tasks) {
		for (const v of getFieldValues(task, spec.field)) values.add(v);
	}
	const sorted = [...values].sort((a, b) => a.localeCompare(b));
	const capped = sorted.slice(0, AUTO_BUCKET_CAP);
	if (sorted.length > AUTO_BUCKET_CAP) {
		warnings.push(`"${spec.field}" has ${sorted.length} distinct values; showing the first ${AUTO_BUCKET_CAP}.`);
	}
	return capped.map((value) => ({
		id: value,
		label: value,
		writeValue: writeValueFor(spec.field, value),
		override: spec.overrides[value] ?? {},
	}));
}

function assignRolling(task: Task, spec: ColumnSpec, buckets: Bucket[], today: Moment): string | null {
	const field = dateFieldOf(spec.field);
	if (!field) return null;
	const m = task[field].moment;
	const hasBucket = (id: string) => buckets.some((b) => b.id === id);

	if (!m) return hasBucket('undated') ? 'undated' : null;

	const span = spec.span ?? { from: 0, to: 0 };
	const offset = m.clone().startOf('day').diff(today.clone().startOf('day'), 'day');
	if (offset < span.from) return hasBucket('overdue') ? 'overdue' : null;
	if (offset > span.to) return hasBucket('later') ? 'later' : null;
	const id = rollingDayId(offset);
	return hasBucket(id) ? id : null;
}

function assignAuto(task: Task, spec: ColumnSpec, buckets: Bucket[]): string | null {
	const taskValues = getFieldValues(task, spec.field);
	for (const bucket of buckets) {
		if (taskValues.includes(bucket.id)) return bucket.id;
	}
	return null;
}

function assignExplicit(task: Task, spec: ColumnSpec, buckets: Bucket[]): string | null {
	const defs = spec.buckets ?? [];
	const taskValues = getFieldValues(task, spec.field);
	for (let i = 0; i < defs.length; i++) {
		const def = defs[i]!;
		if (def.match.some((m) => taskValues.includes(m))) return buckets[i]?.id ?? null;
	}
	return null;
}

/** Generates the buckets for a column spec over an already-filtered task set, and assigns each
 * task to exactly one bucket (first match wins). Unmatched tasks are collected in `hidden`. */
export function generateBuckets(spec: ColumnSpec, tasks: readonly Task[], today: Moment): BucketResult {
	const warnings: string[] = [];
	const generator = resolveGenerator(spec);

	let buckets: Bucket[];
	if (generator === 'explicit') buckets = buildExplicit(spec, warnings);
	else if (generator === 'rolling') buckets = buildRolling(spec, today, warnings);
	else buckets = buildAuto(spec, tasks, warnings);

	const assignment = new Map<string, Task[]>();
	for (const bucket of buckets) assignment.set(bucket.id, []);
	const hidden: Task[] = [];

	for (const task of tasks) {
		let bucketId: string | null;
		if (generator === 'rolling') bucketId = assignRolling(task, spec, buckets, today);
		else if (generator === 'explicit') bucketId = assignExplicit(task, spec, buckets);
		else bucketId = assignAuto(task, spec, buckets);

		if (bucketId && assignment.has(bucketId)) {
			assignment.get(bucketId)!.push(task);
		} else {
			hidden.push(task);
		}
	}

	return { buckets, assignment, hidden, warnings };
}
