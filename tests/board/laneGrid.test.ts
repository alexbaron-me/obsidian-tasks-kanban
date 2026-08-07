import { describe, expect, it } from 'vitest';
import { canonicalColumns, columnTasksAcrossRows, columnTotal, flattenLanes, laneHue, laneInitials, laneTotal } from '../../src/board/laneGrid';
import type { RenderedColumn, RenderedLane } from '../../src/board/renderPipeline';
import { makeTask } from '../fixtures/tasks';

function column(id: string, label: string, tasks: ReturnType<typeof makeTask>[], wip?: { max: number }): RenderedColumn {
	return { bucket: { id, label, writeValue: null, override: { wip } }, tasks };
}

function lane(id: string, label: string, columns: RenderedColumn[], nested: RenderedLane[] | null = null): RenderedLane {
	return { id, label, columns, nested };
}

describe('flattenLanes', () => {
	it('flattens a flat list of lanes at depth 0', () => {
		const a = lane('a', 'A', [column('todo', 'To Do', [])]);
		const b = lane('b', 'B', [column('todo', 'To Do', [])]);
		const rows = flattenLanes([a, b]);
		expect(rows).toEqual([
			{ lane: a, depth: 0, isGroupHeading: false },
			{ lane: b, depth: 0, isGroupHeading: false },
		]);
	});

	it('marks a lane with nested children as a group heading and flattens the children beneath it', () => {
		const child1 = lane('high', 'High', [column('todo', 'To Do', [])]);
		const child2 = lane('low', 'Low', [column('todo', 'To Do', [])]);
		const parent = lane('alice', 'Alice', [column('todo', 'To Do', [])], [child1, child2]);
		const rows = flattenLanes([parent]);
		expect(rows).toEqual([
			{ lane: parent, depth: 0, isGroupHeading: true },
			{ lane: child1, depth: 1, isGroupHeading: false },
			{ lane: child2, depth: 1, isGroupHeading: false },
		]);
	});

	it('treats a lane with an empty nested array as a leaf, not a heading', () => {
		const l = lane('a', 'A', [column('todo', 'To Do', [])], []);
		expect(flattenLanes([l])).toEqual([{ lane: l, depth: 0, isGroupHeading: false }]);
	});
});

describe('canonicalColumns', () => {
	it('collects the union of bucket ids in first-seen order, skipping group headings', () => {
		const a = lane('a', 'A', [column('todo', 'To Do', []), column('done', 'Done', [])]);
		const b = lane('b', 'B', [column('done', 'Done', []), column('doing', 'Doing', [])]);
		const rows = flattenLanes([a, b]);
		expect(canonicalColumns(rows).map((c) => c.id)).toEqual(['todo', 'done', 'doing']);
	});

	it('does not pull columns from a group-heading lane (its own column set is the pre-split union, not real cells)', () => {
		const child = lane('high', 'High', [column('todo', 'To Do', [])]);
		const parent = lane('alice', 'Alice', [column('todo', 'To Do', []), column('phantom', 'Phantom', [])], [child]);
		const rows = flattenLanes([parent]);
		expect(canonicalColumns(rows).map((c) => c.id)).toEqual(['todo']);
	});

	it('carries the wip override through', () => {
		const a = lane('a', 'A', [column('todo', 'To Do', [], { max: 3 })]);
		expect(canonicalColumns(flattenLanes([a]))[0]!.wip).toEqual({ max: 3 });
	});
});

describe('columnTotal', () => {
	it('sums task counts for one bucket across leaf lanes only', () => {
		const t1 = makeTask({ id: 't1' });
		const t2 = makeTask({ id: 't2' });
		const t3 = makeTask({ id: 't3' });
		const child = lane('high', 'High', [column('todo', 'To Do', [t2])]);
		// The parent carries the full pre-split set (t1, t2) — must not be double-counted with
		// the child's (t2).
		const parent = lane('alice', 'Alice', [column('todo', 'To Do', [t1, t2])], [child]);
		const bob = lane('bob', 'Bob', [column('todo', 'To Do', [t3])]);
		const rows = flattenLanes([parent, bob]);
		expect(columnTotal(rows, 'todo')).toBe(2); // t2 (via child) + t3 (via bob), not t1
	});

	it('is zero for a bucket id no row has', () => {
		const a = lane('a', 'A', [column('todo', 'To Do', [makeTask()])]);
		expect(columnTotal(flattenLanes([a]), 'missing')).toBe(0);
	});
});

describe('laneTotal', () => {
	it('sums task counts across all of one lane\'s columns', () => {
		const l = lane('a', 'A', [column('todo', 'To Do', [makeTask(), makeTask()]), column('done', 'Done', [makeTask()])]);
		expect(laneTotal(l)).toBe(3);
	});
});

describe('columnTasksAcrossRows', () => {
	it('gathers every task for one bucket across leaf rows, skipping group headings', () => {
		const t1 = makeTask({ id: 't1' });
		const t2 = makeTask({ id: 't2' });
		const child = lane('high', 'High', [column('todo', 'To Do', [t1])]);
		const parent = lane('alice', 'Alice', [column('todo', 'To Do', [t1])], [child]);
		const bob = lane('bob', 'Bob', [column('todo', 'To Do', [t2])]);
		const tasks = columnTasksAcrossRows(flattenLanes([parent, bob]), 'todo');
		expect(tasks).toEqual([t1, t2]);
	});
});

describe('laneInitials', () => {
	it('takes the first letter of the first two words', () => {
		expect(laneInitials('Emiliano Sala')).toBe('ES');
	});

	it('takes the first two letters of a single word', () => {
		expect(laneInitials('urgent')).toBe('UR');
	});

	it('is empty for an empty label', () => {
		expect(laneInitials('')).toBe('');
		expect(laneInitials('   ')).toBe('');
	});
});

describe('laneHue', () => {
	it('is deterministic for the same label', () => {
		expect(laneHue('Alice')).toBe(laneHue('Alice'));
	});

	it('is in [0, 360)', () => {
		const hue = laneHue('Some lane label');
		expect(hue).toBeGreaterThanOrEqual(0);
		expect(hue).toBeLessThan(360);
	});

	it('is 0 for an empty label', () => {
		expect(laneHue('')).toBe(0);
	});
});
