import { describe, expect, it } from 'vitest';
import {
	columnCount,
	columnTasks,
	flattenSwimlanes,
	gridColumns,
	laneColumnCount,
	laneCount,
	laneHue,
} from '../../src/board/boardGrid';
import type { RenderedColumn, RenderedLane } from '../../src/board/renderPipeline';
import { makeTask } from '../fixtures/tasks';

function column(id: string, label: string, tasks: ReturnType<typeof makeTask>[], wip?: { max: number }): RenderedColumn {
	return { bucket: { id, label, writeValue: null, override: { wip } }, tasks };
}

function lane(id: string, label: string, columns: RenderedColumn[], children: RenderedLane[] | null = null): RenderedLane {
	return { id, label, columns, children };
}

describe('flattenSwimlanes', () => {
	it('flattens a flat list of lanes at depth 0', () => {
		const a = lane('a', 'A', [column('todo', 'To Do', [])]);
		const b = lane('b', 'B', [column('todo', 'To Do', [])]);
		expect(flattenSwimlanes([a, b])).toEqual([
			{ lane: a, depth: 0, kind: 'lane' },
			{ lane: b, depth: 0, kind: 'lane' },
		]);
	});

	it('marks a split lane as a section and flattens its children beneath it', () => {
		const high = lane('high', 'High', [column('todo', 'To Do', [])]);
		const low = lane('low', 'Low', [column('todo', 'To Do', [])]);
		const parent = lane('alice', 'Alice', [column('todo', 'To Do', [])], [high, low]);
		expect(flattenSwimlanes([parent])).toEqual([
			{ lane: parent, depth: 0, kind: 'section' },
			{ lane: high, depth: 1, kind: 'lane' },
			{ lane: low, depth: 1, kind: 'lane' },
		]);
	});

	it('treats a lane with an empty children array as a leaf, not a section', () => {
		const l = lane('a', 'A', [column('todo', 'To Do', [])], []);
		expect(flattenSwimlanes([l])).toEqual([{ lane: l, depth: 0, kind: 'lane' }]);
	});
});

describe('gridColumns', () => {
	it('collects the union of bucket ids in first-seen order', () => {
		const a = lane('a', 'A', [column('todo', 'To Do', []), column('done', 'Done', [])]);
		const b = lane('b', 'B', [column('done', 'Done', []), column('doing', 'Doing', [])]);
		const columns = gridColumns(flattenSwimlanes([a, b]));
		expect(columns.map((c) => c.id)).toEqual(['todo', 'done', 'doing']);
	});

	it('ignores a section row, whose column set is the pre-split union rather than real cells', () => {
		const child = lane('high', 'High', [column('todo', 'To Do', [])]);
		const parent = lane('alice', 'Alice', [column('todo', 'To Do', []), column('phantom', 'Phantom', [])], [child]);
		expect(gridColumns(flattenSwimlanes([parent])).map((c) => c.id)).toEqual(['todo']);
	});

	it('carries the wip override through', () => {
		const a = lane('a', 'A', [column('todo', 'To Do', [], { max: 3 })]);
		expect(gridColumns(flattenSwimlanes([a]))[0]!.wip).toEqual({ max: 3 });
	});
});

describe('columnCount', () => {
	it('sums one column across leaf lanes only, never double-counting a section', () => {
		const t1 = makeTask({ id: 't1' });
		const t2 = makeTask({ id: 't2' });
		const t3 = makeTask({ id: 't3' });
		const child = lane('high', 'High', [column('todo', 'To Do', [t2])]);
		// The parent still carries its full pre-split set (t1, t2) — counting it as well as the
		// child would report t2 twice.
		const parent = lane('alice', 'Alice', [column('todo', 'To Do', [t1, t2])], [child]);
		const bob = lane('bob', 'Bob', [column('todo', 'To Do', [t3])]);
		expect(columnCount(flattenSwimlanes([parent, bob]), 'todo')).toBe(2);
	});

	it('is zero for a bucket id no row has', () => {
		const a = lane('a', 'A', [column('todo', 'To Do', [makeTask()])]);
		expect(columnCount(flattenSwimlanes([a]), 'missing')).toBe(0);
	});
});

describe('columnTasks', () => {
	it('gathers every task for one column across leaf rows, skipping sections', () => {
		const t1 = makeTask({ id: 't1' });
		const t2 = makeTask({ id: 't2' });
		const child = lane('high', 'High', [column('todo', 'To Do', [t1])]);
		const parent = lane('alice', 'Alice', [column('todo', 'To Do', [t1])], [child]);
		const bob = lane('bob', 'Bob', [column('todo', 'To Do', [t2])]);
		expect(columnTasks(flattenSwimlanes([parent, bob]), 'todo')).toEqual([t1, t2]);
	});
});

describe('laneCount', () => {
	it('sums task counts across all of one lane\'s columns', () => {
		const l = lane('a', 'A', [column('todo', 'To Do', [makeTask(), makeTask()]), column('done', 'Done', [makeTask()])]);
		expect(laneCount(l)).toBe(3);
	});
});

describe('laneColumnCount', () => {
	it('counts one lane\'s tasks in one column', () => {
		const l = lane('a', 'A', [column('todo', 'To Do', [makeTask(), makeTask()]), column('done', 'Done', [makeTask()])]);
		expect(laneColumnCount(l, 'todo')).toBe(2);
		expect(laneColumnCount(l, 'done')).toBe(1);
	});

	it('is zero for a column the lane has no bucket for', () => {
		const l = lane('a', 'A', [column('todo', 'To Do', [makeTask()])]);
		expect(laneColumnCount(l, 'done')).toBe(0);
	});
});

describe('laneHue', () => {
	it('is deterministic for the same label', () => {
		expect(laneHue('Alice')).toBe(laneHue('Alice'));
	});

	it('always lands on the curated palette rather than an arbitrary hue', () => {
		const palette = [210, 265, 320, 355, 25, 45, 145, 185];
		for (const label of ['Alice', 'Bob', '#work', 'high', '', 'a much longer lane label']) {
			expect(palette).toContain(laneHue(label));
		}
	});

	it('separates labels that differ only slightly', () => {
		expect(laneHue('Alice')).not.toBe(laneHue('Alicf'));
	});
});
