import { describe, expect, it } from 'vitest';
import { moment } from 'obsidian';
import { computeBoardData } from '../../src/board/renderPipeline';
import { makeTask, todayStr } from '../fixtures/tasks';
import type { BoardFile, ViewConfig } from '../../src/types/board';
import type { QueryContext } from '../../src/query/context';
import { resolveSettings } from '../../src/settings/cascade';
import { defaultGlobalSettings } from '../../src/settings/GlobalSettings';

function ctx(): QueryContext {
	return {
		file: { path: 'board.md', root: '/', folder: '', filename: 'board.md', filenameWithoutExtension: 'board', frontmatter: {} },
		allTasks: [],
		boardId: 'board.md',
		viewName: 'Test',
		today: moment(todayStr()),
	};
}

function view(overrides: Partial<ViewConfig> = {}): ViewConfig {
	return {
		name: 'Status',
		filters: '',
		sort: '',
		settings: {},
		columns: {
			field: 'status',
			generator: 'explicit',
			buckets: [
				{ name: 'To Do', match: [' '] },
				{ name: 'Done', match: ['x'] },
			],
			overrides: {},
		},
		lanes: null,
		card: { chips: ['due', 'priority', 'tags'] },
		order: {},
		...overrides,
	};
}

function board(overrides: Partial<BoardFile> = {}): BoardFile {
	return { version: 1, filters: '', settings: {}, views: [], ...overrides };
}

const resolved = resolveSettings(defaultGlobalSettings(), {}, {});

describe('computeBoardData', () => {
	it('composes board and view filters with AND', () => {
		const b = board({ filters: 'not done' });
		const v = view({ filters: 'priority is high' });
		const high = makeTask({ status: ' ', priorityName: 'high' });
		const low = makeTask({ status: ' ', priorityName: 'low' });
		const data = computeBoardData(b, v, [high, low], ctx(), resolved);
		const toDo = data.lanes[0]!.columns.find((c) => c.bucket.id === 'To Do')!;
		expect(toDo.tasks).toEqual([high]);
	});

	it('applies auto-hide before bucketing', () => {
		const b = board();
		const v = view();
		const oldDone = makeTask({ status: 'x', done: todayStr(-30) });
		const resolvedHide = resolveSettings(defaultGlobalSettings(), { hideDoneAfterDays: 14 }, {});
		const data = computeBoardData(b, v, [oldDone], ctx(), resolvedHide);
		expect(data.lanes[0]!.columns.find((c) => c.bucket.id === 'Done')!.tasks).toEqual([]);
	});

	it('produces one lane per swimlane group', () => {
		const b = board();
		const v = view({ lanes: { groupBy: 'group by priority' } });
		const high = makeTask({ status: ' ', priorityName: 'high' });
		const low = makeTask({ status: ' ', priorityName: 'low' });
		const data = computeBoardData(b, v, [high, low], ctx(), resolved);
		expect(data.lanes.map((l) => l.id).sort()).toEqual(['high', 'low']);
	});

	it('sorts each bucket using the bucket override, falling back to view sort, falling back to urgency', () => {
		const b = board();
		const v = view({
			sort: 'sort by description',
			columns: {
				field: 'status',
				generator: 'explicit',
				buckets: [{ name: 'To Do', match: [' '] }],
				overrides: {},
			},
		});
		const taskB = makeTask({ status: ' ', description: 'B task' });
		const taskA = makeTask({ status: ' ', description: 'A task' });
		const data = computeBoardData(b, v, [taskB, taskA], ctx(), resolved);
		expect(data.lanes[0]!.columns[0]!.tasks.map((t) => t.description)).toEqual(['A task', 'B task']);
	});

	it('applies manual order overrides within a bucket', () => {
		const b = board();
		const v = view({ order: { 'To Do': [{ id: 'zz', first: true }] } });
		const a = makeTask({ status: ' ', id: 'aa', description: 'A' });
		const z = makeTask({ status: ' ', id: 'zz', description: 'Z' });
		const data = computeBoardData(b, v, [a, z], ctx(), resolved);
		expect(data.lanes[0]!.columns[0]!.tasks.map((t) => t.id)).toEqual(['zz', 'aa']);
	});

	it('prunes order overrides referencing tasks not currently visible in the bucket', () => {
		const b = board();
		const v = view({ order: { 'To Do': [{ id: 'ghost', first: true }] } });
		const a = makeTask({ status: ' ', id: 'aa' });
		const data = computeBoardData(b, v, [a], ctx(), resolved);
		expect(data.prunedOrder['To Do']).toEqual([]);
	});

	it('counts hidden tasks that match no bucket', () => {
		const b = board();
		const v = view({
			columns: { field: 'status', generator: 'explicit', buckets: [{ name: 'To Do', match: [' '] }], overrides: {} },
		});
		const done = makeTask({ status: 'x' });
		const data = computeBoardData(b, v, [done], ctx(), resolved);
		expect(data.hiddenCount).toBe(1);
	});

	it('surfaces filter parse errors as warnings without crashing', () => {
		const b = board({ filters: 'bogus nonsense' });
		const data = computeBoardData(b, view(), [makeTask()], ctx(), resolved);
		expect(data.warnings.some((w) => w.includes('Filter error'))).toBe(true);
	});
});
