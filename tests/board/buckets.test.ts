import { describe, expect, it } from 'vitest';
import { moment } from 'obsidian';
import { generateBuckets } from '../../src/board/buckets';
import { makeTask, todayStr } from '../fixtures/tasks';
import type { ColumnSpec } from '../../src/types/board';

const TODAY = moment('2026-08-05');

describe('generateBuckets — explicit', () => {
	const spec: ColumnSpec = {
		field: 'status',
		generator: 'explicit',
		buckets: [
			{ name: 'To Do', match: [' '] },
			{ name: 'Doing', match: ['/'] },
			{ name: 'Done', match: ['x'] },
		],
		overrides: { Doing: { wip: { max: 2 } } },
	};

	it('creates one bucket per BucketDef with id === name', () => {
		const { buckets } = generateBuckets(spec, [], TODAY);
		expect(buckets.map((b) => b.id)).toEqual(['To Do', 'Doing', 'Done']);
	});

	it('assigns each task to the first matching bucket', () => {
		const todo = makeTask({ status: ' ' });
		const doing = makeTask({ status: '/' });
		const { assignment } = generateBuckets(spec, [todo, doing], TODAY);
		expect(assignment.get('To Do')).toEqual([todo]);
		expect(assignment.get('Doing')).toEqual([doing]);
	});

	it('derives a status writeValue from the bucket\'s first match value', () => {
		const { buckets } = generateBuckets(spec, [], TODAY);
		expect(buckets[1]!.writeValue).toEqual({ kind: 'status', symbol: '/' });
	});

	it('carries the bucket override through', () => {
		const { buckets } = generateBuckets(spec, [], TODAY);
		expect(buckets[1]!.override).toEqual({ wip: { max: 2 } });
	});

	it('hides a task matching no bucket', () => {
		const twoBucketSpec: ColumnSpec = {
			field: 'status',
			generator: 'explicit',
			buckets: [{ name: 'To Do', match: [' '] }],
			overrides: {},
		};
		const orphan = makeTask({ status: 'x' });
		const { hidden, assignment } = generateBuckets(twoBucketSpec, [orphan], TODAY);
		expect(hidden).toEqual([orphan]);
		for (const list of assignment.values()) expect(list).not.toContain(orphan);
	});

	it('derives a tags writeValue that removes every other bucket\'s tag on drop', () => {
		const tagSpec: ColumnSpec = {
			field: 'tags',
			generator: 'explicit',
			buckets: [
				{ name: 'Work', match: ['#work'] },
				{ name: 'Home', match: ['#home'] },
			],
			overrides: {},
		};
		const { buckets } = generateBuckets(tagSpec, [], TODAY);
		expect(buckets[0]!.writeValue).toEqual({ kind: 'tags', add: '#work', removeOthers: ['#home'] });
	});

	it('a multi-tag task claims only the first matching bucket, never both', () => {
		const tagSpec: ColumnSpec = {
			field: 'tags',
			generator: 'explicit',
			buckets: [
				{ name: 'Work', match: ['#work'] },
				{ name: 'Home', match: ['#home'] },
			],
			overrides: {},
		};
		const task = makeTask({ tags: ['#work', '#home'] });
		const { assignment } = generateBuckets(tagSpec, [task], TODAY);
		expect(assignment.get('Work')).toEqual([task]);
		expect(assignment.get('Home')).toEqual([]);
	});
});

describe('generateBuckets — rolling', () => {
	const spec: ColumnSpec = {
		field: 'due',
		generator: 'rolling',
		span: { from: -1, to: 2 },
		edges: ['overdue', 'later', 'undated'],
		overrides: {},
	};

	it('emits overdue, day buckets, later, undated in order with stable ids', () => {
		const { buckets } = generateBuckets(spec, [], TODAY);
		expect(buckets.map((b) => b.id)).toEqual(['overdue', 'd-1', 'd0', 'd+1', 'd+2', 'later', 'undated']);
	});

	it('labels today/tomorrow/yesterday specially, others as weekday+day', () => {
		const { buckets } = generateBuckets(spec, [], TODAY);
		const byId = new Map(buckets.map((b) => [b.id, b.label]));
		expect(byId.get('d0')).toBe('Today');
		expect(byId.get('d+1')).toBe('Tomorrow');
		expect(byId.get('d-1')).toBe('Yesterday');
		expect(byId.get('d+2')).toBe(TODAY.clone().add(2, 'day').format('ddd DD'));
	});

	it('assigns a task before the window to overdue', () => {
		const task = makeTask({ due: TODAY.clone().subtract(5, 'day').format('YYYY-MM-DD') });
		const { assignment } = generateBuckets(spec, [task], TODAY);
		expect(assignment.get('overdue')).toEqual([task]);
	});

	it('assigns a task after the window to later', () => {
		const task = makeTask({ due: TODAY.clone().add(10, 'day').format('YYYY-MM-DD') });
		const { assignment } = generateBuckets(spec, [task], TODAY);
		expect(assignment.get('later')).toEqual([task]);
	});

	it('assigns an undated task to undated', () => {
		const task = makeTask({ due: null });
		const { assignment } = generateBuckets(spec, [task], TODAY);
		expect(assignment.get('undated')).toEqual([task]);
	});

	it('assigns a task within the window to its exact day bucket', () => {
		const task = makeTask({ due: TODAY.clone().add(1, 'day').format('YYYY-MM-DD') });
		const { assignment } = generateBuckets(spec, [task], TODAY);
		expect(assignment.get('d+1')).toEqual([task]);
	});

	it('hides an out-of-window task when the edge bucket is not configured', () => {
		const noEdges: ColumnSpec = { field: 'due', generator: 'rolling', span: { from: 0, to: 1 }, edges: [], overrides: {} };
		const overdue = makeTask({ due: TODAY.clone().subtract(3, 'day').format('YYYY-MM-DD') });
		const { hidden, assignment } = generateBuckets(noEdges, [overdue], TODAY);
		expect(hidden).toEqual([overdue]);
		expect(assignment.has('overdue')).toBe(false);
	});

	it('gives day buckets a date writeValue equal to today + offset', () => {
		const { buckets } = generateBuckets(spec, [], TODAY);
		const d1 = buckets.find((b) => b.id === 'd+1')!;
		expect(d1.writeValue).toMatchObject({ kind: 'date', field: 'due' });
		if (d1.writeValue?.kind === 'date') {
			expect(d1.writeValue.value?.format('YYYY-MM-DD')).toBe(TODAY.clone().add(1, 'day').format('YYYY-MM-DD'));
		}
	});

	it('rejects drops on overdue/later (writeValue null) but allows undated (clears the field)', () => {
		const { buckets } = generateBuckets(spec, [], TODAY);
		expect(buckets.find((b) => b.id === 'overdue')!.writeValue).toBeNull();
		expect(buckets.find((b) => b.id === 'later')!.writeValue).toBeNull();
		const undated = buckets.find((b) => b.id === 'undated')!;
		expect(undated.writeValue).toEqual({ kind: 'date', field: 'due', value: null });
	});

	it('stays stable across a day boundary crossing: d0 always means today', () => {
		const laterToday = TODAY.clone().add(1, 'day');
		const { buckets } = generateBuckets(spec, [], laterToday);
		expect(buckets.find((b) => b.id === 'd0')!.label).toBe('Today');
	});
});

describe('generateBuckets — auto', () => {
	it('generates one bucket per distinct value, sorted', () => {
		const spec: ColumnSpec = { field: 'tags', generator: 'auto', overrides: {} };
		const tasks = [makeTask({ tags: ['#zeta'] }), makeTask({ tags: ['#alpha'] }), makeTask({ tags: ['#alpha'] })];
		const { buckets } = generateBuckets(spec, tasks, TODAY);
		expect(buckets.map((b) => b.id)).toEqual(['#alpha', '#zeta']);
	});

	it('caps at 30 buckets and warns beyond that', () => {
		const spec: ColumnSpec = { field: 'tags', generator: 'auto', overrides: {} };
		const tasks = Array.from({ length: 35 }, (_, i) => makeTask({ tags: [`#tag${i}`] }));
		const { buckets, warnings } = generateBuckets(spec, tasks, TODAY);
		expect(buckets).toHaveLength(30);
		expect(warnings.some((w) => w.includes('35'))).toBe(true);
	});

	it('read-only fields (path/folder/filename/urgency/recurrence) never produce a writeValue', () => {
		const spec: ColumnSpec = { field: 'folder', generator: 'auto', overrides: {} };
		const tasks = [makeTask({ path: 'A/x.md' })];
		const { buckets } = generateBuckets(spec, tasks, TODAY);
		expect(buckets[0]!.writeValue).toBeNull();
	});

	it('tags is writable via auto buckets', () => {
		const spec: ColumnSpec = { field: 'tags', generator: 'auto', overrides: {} };
		const tasks = [makeTask({ tags: ['#work'] })];
		const { buckets } = generateBuckets(spec, tasks, TODAY);
		expect(buckets[0]!.writeValue).toEqual({ kind: 'tags', add: '#work', removeOthers: [] });
	});
});

describe('generator inference', () => {
	it('infers rolling when generator is unset but span is present', () => {
		const spec: ColumnSpec = { field: 'due', span: { from: 0, to: 0 }, overrides: {} };
		const { buckets } = generateBuckets(spec, [], TODAY);
		expect(buckets.map((b) => b.id)).toEqual(['d0']);
	});

	it('infers explicit when generator is unset but buckets is present', () => {
		const spec: ColumnSpec = { field: 'status', buckets: [{ name: 'A', match: [' '] }], overrides: {} };
		const { buckets } = generateBuckets(spec, [], TODAY);
		expect(buckets.map((b) => b.id)).toEqual(['A']);
	});
});

it('todayStr fixture helper matches moment formatting used by the bucket generator', () => {
	expect(todayStr(0)).toBe(moment().format('YYYY-MM-DD'));
});
