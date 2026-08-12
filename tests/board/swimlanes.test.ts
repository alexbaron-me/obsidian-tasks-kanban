import { describe, expect, it } from 'vitest';
import { moment } from 'obsidian';
import { buildSwimlanes, laneGroupField, laneWriteValueFor, UNGROUPED_LANE_ID } from '../../src/board/swimlanes';
import { makeTask } from '../fixtures/tasks';
import type { QueryContext } from '../../src/query/context';

function ctx(): QueryContext {
	return {
		file: { path: 'board.md', root: '/', folder: '', filename: 'board.md', filenameWithoutExtension: 'board', frontmatter: {} },
		allTasks: [],
		boardId: 'board.md',
		viewName: 'Test',
		today: moment(),
	};
}

describe('buildSwimlanes', () => {
	it('returns a single unlabelled lane when the view has no lane spec', () => {
		const tasks = [makeTask(), makeTask()];
		const { lanes } = buildSwimlanes(null, tasks, ctx());
		expect(lanes).toHaveLength(1);
		expect(lanes[0]!.id).toBe(UNGROUPED_LANE_ID);
		expect(lanes[0]!.label).toBe('');
		expect(lanes[0]!.tasks).toHaveLength(2);
		expect(lanes[0]!.children).toBeNull();
	});

	it('groups into one lane per distinct key', () => {
		const high = makeTask({ priorityName: 'high' });
		const low = makeTask({ priorityName: 'low' });
		const { lanes } = buildSwimlanes({ groupBy: 'group by priority' }, [high, low], ctx());
		expect(lanes.map((l) => l.id).sort()).toEqual(['high', 'low']);
	});

	it('duplicates a card across lanes when its group key is multi-valued', () => {
		const task = makeTask({ tags: ['#work', '#home'] });
		const { lanes } = buildSwimlanes({ groupBy: 'group by tags' }, [task], ctx());
		expect(lanes).toHaveLength(2);
		for (const lane of lanes) expect(lane.tasks).toContain(task);
	});

	it('reverses lane order when the group instruction says reverse', () => {
		const a = makeTask({ priorityName: 'high' });
		const b = makeTask({ priorityName: 'low' });
		const forward = buildSwimlanes({ groupBy: 'group by priority' }, [a, b], ctx()).lanes.map((l) => l.id);
		const reversed = buildSwimlanes({ groupBy: 'group by priority reverse' }, [a, b], ctx()).lanes.map((l) => l.id);
		expect(reversed).toEqual([...forward].reverse());
	});

	it('builds a nested second level, and never a third', () => {
		const a = makeTask({ priorityName: 'high', tags: ['#work'] });
		const b = makeTask({ priorityName: 'high', tags: ['#home'] });
		const { lanes } = buildSwimlanes({ groupBy: 'group by priority', nested: 'group by tags' }, [a, b], ctx());
		const high = lanes.find((l) => l.id === 'high')!;
		expect(high.children).not.toBeNull();
		expect(high.children!.map((l) => l.id).sort()).toEqual(['#home', '#work']);
		expect(high.children![0]!.children).toBeNull();
	});

	it('keeps the parent lane\'s own full task set alongside its children', () => {
		const a = makeTask({ priorityName: 'high', tags: ['#work'] });
		const b = makeTask({ priorityName: 'high', tags: ['#home'] });
		const { lanes } = buildSwimlanes({ groupBy: 'group by priority', nested: 'group by tags' }, [a, b], ctx());
		expect(lanes.find((l) => l.id === 'high')!.tasks).toHaveLength(2);
	});

	it('surfaces a compile error from a malformed groupBy instruction as a warning', () => {
		const { warnings } = buildSwimlanes({ groupBy: 'group by nonsense' }, [makeTask()], ctx());
		expect(warnings.length).toBeGreaterThan(0);
	});
});

describe('laneGroupField', () => {
	it('extracts the field from a plain group by instruction', () => {
		expect(laneGroupField('group by priority')).toBe('priority');
	});

	it('returns null for group by function', () => {
		expect(laneGroupField('group by function task.file.folder')).toBeNull();
	});

	it('returns null for a malformed instruction', () => {
		expect(laneGroupField('not an instruction')).toBeNull();
	});
});

describe('laneWriteValueFor', () => {
	it('inverts a priority lane key', () => {
		expect(laneWriteValueFor('priority', 'high')).toEqual({ kind: 'priority', value: 'high' });
	});

	it('inverts a tags lane key', () => {
		expect(laneWriteValueFor('tags', '#work')).toEqual({ kind: 'tags', add: '#work', removeOthers: [] });
	});

	it('inverts a due-date lane key', () => {
		const value = laneWriteValueFor('due', '2026-08-14');
		expect(value?.kind).toBe('date');
		if (value?.kind === 'date') expect(value.value?.format('YYYY-MM-DD')).toBe('2026-08-14');
	});

	it('inverts the "(no date)" lane key to clearing the field', () => {
		expect(laneWriteValueFor('due', '(no date)')).toEqual({ kind: 'date', field: 'due', value: null });
	});

	it('returns null for a non-date lane key on a date field', () => {
		expect(laneWriteValueFor('due', 'Next week')).toBeNull();
	});

	it('returns null for a status lane (its key is the display name, not the symbol)', () => {
		expect(laneWriteValueFor('status', 'Done')).toBeNull();
	});

	it('returns null for structural fields', () => {
		expect(laneWriteValueFor('folder', 'Projects')).toBeNull();
		expect(laneWriteValueFor('path', 'a.md')).toBeNull();
		expect(laneWriteValueFor('filename', 'a.md')).toBeNull();
		expect(laneWriteValueFor('heading', 'Backlog')).toBeNull();
	});
});
